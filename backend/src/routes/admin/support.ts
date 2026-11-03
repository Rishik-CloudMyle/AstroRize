import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istDate, istDateKey, istDayMonth, istTime, makeRef, rupee } from "../../lib/format.ts";
import { makeGoodPolicy } from "../../lib/makegood.ts";
import { notify } from "../../lib/notifications.ts";
import { displayName } from "../../lib/profile.ts";
import { actorName, adminOf, pagesOf, requireCapability, requirePage } from "../../lib/rbac.ts";
import { getSetting, putSetting } from "../../lib/settings.ts";
import type { Consultation, Prisma } from "../../generated/prisma/client.ts";

// Support & disputes: tickets, the metering evidence, and maker-checker remedies. On a complaint
// Support proposes one remedy and a second person (Finance or a Super Admin) approves it:
//  · a REFUND to the customer's wallet (up to what was billed). The astrologer's share of the refunded
//    amount is taken back with a negative "refund_adjustment" earnings line that nets in their next
//    payout batch (lib/earnings.ts), or
//  · a free replacement call (MAKE_GOOD): N free minutes with the same astrologer instead of money back.
//    The astrologer keeps their original earnings and isn't paid for the free minutes (lib/makegood.ts).
// Client decision (Oct 2026): a make-good goes through the same second approver as a refund — it
// replaces a refund and costs the astrologer unpaid minutes, so it is a money decision too.
//
// Ticket fields: refundState tracks the remedy (NONE → PROPOSED → INITIATED = approved), `state`
// says which is proposed (REFUND_PROPOSED | MAKEGOOD_PROPOSED), and `resolution` records what was
// granted (REFUND | MAKE_GOOD). The proposed make-good length is kept in Setting `support.makegood.<ticket>`.
export const supportRouter = Router();

const MAKEGOOD_PROPOSED = "MAKEGOOD_PROPOSED";

/**
 * A ticket is closed once it is resolved (rejected, closed, or a free replacement call given) or a
 * refund was approved. An approved remedy closes it whatever older rows say about `state`.
 */
const CLOSED_STATES = ["RESOLVED", "REFUND_INITIATED"];
export const OPEN_TICKET = { state: { notIn: CLOSED_STATES }, refundState: { not: "INITIATED" } } satisfies Prisma.SupportTicketWhereInput;
const isOpen = (t: { state: string; refundState: string }) => !CLOSED_STATES.includes(t.state) && t.refundState !== "INITIATED";

/** The audit actions that close a ticket (their entry says when, by whom and why). */
const CLOSING_ACTIONS = ["dispute.refund.approve", "dispute.makegood.approve", "dispute.reject", "dispute.close.covered"];

/** How a closed ticket ended, for the Resolved list and the case file. */
async function outcomes(tickets: { id: string; state: string; refundState: string; refundAmount: number; resolution: string | null }[]) {
  const closed = tickets.filter((t) => !isOpen(t));
  const entries = closed.length
    ? await db.auditLog.findMany({ where: { object: { in: closed.map((t) => t.id) }, action: { in: CLOSING_ACTIONS } }, orderBy: { at: "desc" } })
    : [];
  const out = new Map<string, { label: string; note: string | null; on: string | null; by: string | null }>();
  for (const t of closed) {
    const entry = entries.find((e) => e.object === t.id);
    const label =
      t.resolution === "MAKE_GOOD"
        ? "Free call given"
        : t.resolution === "REFUND" || t.refundState === "INITIATED"
          ? t.refundAmount > 0
            ? `Refunded ${rupee(t.refundAmount)}`
            : "Refunded"
          : entry?.action === "dispute.close.covered"
            ? "Closed · already remedied"
            : "Rejected";
    // The written reason (or what was given), after the state change in the audit entry.
    const note = entry ? entry.diff.split(" · ").slice(1).join(" · ") || null : null;
    out.set(t.id, { label, note, on: entry ? istDayMonth(entry.at) : null, by: entry?.actorName ?? null });
  }
  return out;
}

/** A refund or free replacement call already given for this ticket's session on another ticket. */
function grantedElsewhere(t: { id: string; sessionRef: string }) {
  if (!hasSession(t)) return null;
  return db.supportTicket.findFirst({ where: { sessionRef: t.sessionRef, id: { not: t.id }, refundState: "INITIATED" }, orderBy: { createdAt: "asc" } });
}

const minutesKey = (ticketId: string) => `support.makegood.${ticketId}`;

function slaLabel(due: Date, now: Date) {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return { label: "Breached", tone: "breached" };
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return { label: `${Math.max(1, hours)}h left`, tone: "urgent" };
  const days = Math.floor(hours / 24);
  return { label: `${days}d left`, tone: days <= 1 ? "soon" : "ok" };
}

/** Billing facts for a ticket: from the real consultation when there is one, else the case file. */
async function caseFile(ticket: { id: string; sessionRef: string }) {
  const c = await db.consultation.findUnique({ where: { ref: ticket.sessionRef } });
  if (c && c.status === "ENDED") {
    return {
      metering: [
        { label: "Billed seconds", value: String(c.billedSeconds) },
        { label: "Billed minutes", value: String(c.billedMinutes) },
        { label: "Rate at connect", value: `${rupee(c.rate)}/min` },
        { label: "Amount billed", value: rupee(c.total) },
      ],
      evidence: [
        {
          rank: "PLATFORM",
          label: `Server metering log · connect ${c.connectedAt ? istTime(c.connectedAt) : "—"}, end ${c.endedAt ? istTime(c.endedAt) : "—"}`,
          when: "auto",
        },
        { rank: "PLATFORM", label: `Wallet ledger entry · hold ${rupee(c.heldAmount)}, debit ${rupee(c.total)}`, when: "auto" },
      ],
      billed: c.total,
      buckets: { service: c.serviceUsed, promo: c.promoUsed },
      consultation: c,
    };
  }
  const stored = await getSetting<{
    metering: { label: string; value: string }[];
    evidence: { rank: string; label: string; when: string }[];
    billed: number;
    buckets: { service: number; promo: number };
  } | null>(`support.case.${ticket.sessionRef}`, null);
  return { ...(stored ?? { metering: [], evidence: [], billed: 0, buckets: { service: 0, promo: 0 } }), consultation: null as Consultation | null };
}

/**
 * Who proposed the open remedy (refund or make-good) on a ticket, as a user id. The ticket only
 * stores the proposer's short name (two people can share one), so the id comes from the audit entry
 * written in the same request as the proposal.
 */
export async function refundProposerId(ticketId: string): Promise<string | null> {
  const entry = await db.auditLog.findFirst({
    where: { action: { in: ["dispute.refund.propose", "dispute.makegood.propose"] }, object: ticketId },
    orderBy: { at: "desc" },
    select: { actorId: true },
  });
  return entry?.actorId ?? null;
}

/** Minutes of the make-good proposed on a ticket (0 when none is recorded). */
export async function proposedMinutes(ticketId: string): Promise<number> {
  return (await getSetting<{ minutes?: number } | null>(minutesKey(ticketId), null))?.minutes ?? 0;
}

/** The astrologer's share of a refund: the original session's line share (lines from before the split: 100%). */
async function shareOfSession(c: Pick<Consultation, "ref" | "astrologerId">) {
  const line = await db.earningsLine.findFirst({
    where: { astrologerId: c.astrologerId, sessionRef: c.ref, fundedBy: "CUSTOMER", kind: { not: "refund_adjustment" } },
    orderBy: { date: "asc" },
    select: { sharePct: true },
  });
  return line ? (line.sharePct ?? 100) : null;
}

/** Reports raised without a session say "—": they share no session with anything. */
const hasSession = (t: { sessionRef: string }) => t.sessionRef !== "—" && t.sessionRef.trim() !== "";

/** Another ticket on the same session that already has a remedy proposed or granted. */
function otherRemedy(t: { id: string; sessionRef: string }) {
  if (!hasSession(t)) return null;
  return db.supportTicket.findFirst({ where: { sessionRef: t.sessionRef, id: { not: t.id }, refundState: { in: ["PROPOSED", "INITIATED"] } } });
}

const remedyWord = (t: { state: string; resolution: string | null }) =>
  t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? "free replacement call" : "refund";

supportRouter.get("/support", async (req, res) => {
  requirePage(req, "support");
  const now = new Date();
  const tickets = await db.supportTicket.findMany({ orderBy: { createdAt: "desc" } });
  const closed = await outcomes(tickets);
  res.json({
    tickets: tickets.map((t) => {
      const outcome = closed.get(t.id) ?? null;
      // A closed ticket has no SLA left to meet: its row says how it ended instead.
      const sla = outcome ? { label: outcome.label, tone: "closed" } : slaLabel(t.slaDueAt, now);
      return {
        id: t.id,
        subject: t.subject,
        state: t.state,
        /** False once resolved or a remedy was approved: it leaves the open queue and the nav badge. */
        open: !outcome,
        outcome,
        sla: sla.label,
        slaTone: sla.tone,
        slaDueAt: t.slaDueAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        alias: t.customerAlias,
        session: t.sessionRef,
        refundState: t.refundState,
        resolution: t.resolution,
        proposedBy: t.proposedBy,
      };
    }),
  });
});

supportRouter.get("/support/:id", async (req, res) => {
  requirePage(req, "support");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  const [file, proposedById, other, policy, minutes, credit, adjustment, closed] = await Promise.all([
    caseFile(t),
    t.refundState === "NONE" ? null : refundProposerId(t.id),
    otherRemedy(t),
    makeGoodPolicy(),
    t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? proposedMinutes(t.id) : 0,
    t.resolution === "MAKE_GOOD" ? db.makeGoodCredit.findFirst({ where: { ticketId: t.id }, orderBy: { createdAt: "desc" } }) : null,
    t.resolution === "REFUND" ? db.earningsLine.findFirst({ where: { kind: "refund_adjustment", sessionRef: t.id } }) : null,
    outcomes([t]),
  ]);
  const c = file.consultation;
  const astrologer = c ? await db.astrologer.findUnique({ where: { id: c.astrologerId }, select: { name: true } }) : null;
  const open = t.refundState === "NONE" && isOpen(t);
  const granted = open ? await grantedElsewhere(t) : null;
  const otherLine = other ? `${other.resolution === "MAKE_GOOD" || other.state === MAKEGOOD_PROPOSED ? "A free replacement call" : "A refund"} is already ${other.refundState === "INITIATED" ? "approved" : "proposed"} for this session on ${other.id}` : null;
  // Why no refund can be proposed on this ticket (the propose route refuses for the same reasons).
  const refundBlocked = !open ? null : otherLine ?? (file.billed <= 0 ? "Nothing was billed for this session" : null);
  // A make-good needs a real session with a customer that connected (someone to call back).
  const makeGoodBlocked = !open
    ? null
    : (otherLine ?? (!c?.customerId || !c.connectedAt ? "A free replacement call needs a real session with a customer that connected" : null));
  const share = c && t.resolution !== "MAKE_GOOD" ? await shareOfSession(c) : null;
  res.json({
    case: {
      id: t.id,
      state: t.state,
      refundState: t.refundState,
      /** REFUND | MAKE_GOOD once approved, else null. */
      resolution: t.resolution,
      /** How it ended, once closed (label, the written reason or what was given, when, by whom). */
      outcome: closed.get(t.id) ?? null,
      /** Open with nothing proposed, and the session already had a remedy approved on another ticket: it can be closed as covered. */
      coveredBy: granted ? { id: granted.id, remedy: remedyWord(granted) } : null,
      /** What is proposed (or was granted): a refund or a free replacement call. */
      remedy: t.refundState === "NONE" ? null : t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? "MAKE_GOOD" : "REFUND",
      proposedBy: t.proposedBy,
      proposedById,
      approvedBy: t.approvedBy,
      refundBlocked,
      makeGoodBlocked,
      metering: file.metering,
      evidence: file.evidence,
      refund: {
        billed: rupee(file.billed),
        billedValue: file.billed,
        /** The refund proposed or paid (may be less than billed). */
        amount: t.refundState === "NONE" || t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? null : rupee(t.refundAmount),
        buckets: [
          { label: "Service balance portion", value: rupee(file.buckets.service) },
          { label: "Promotional balance portion", value: rupee(file.buckets.promo) },
          { label: `Total refund — capped at billed ${rupee(file.billed)}`, value: rupee(file.billed), total: true },
        ],
        /** The astrologer's share that a refund takes back (percent), when known. */
        astrologerSharePct: share,
        /** The negative earnings line written when the refund was approved. */
        adjustment: adjustment
          ? `${rupee(Math.abs(adjustment.amount ?? 0)).replace("₹", "−₹")} from ${astrologer?.name ?? "the astrologer"}'s earnings (${adjustment.sharePct ?? 100}% share of ${rupee(Math.abs(adjustment.gross ?? 0))}), netted in their next payout`
          : t.resolution === "REFUND"
            ? "No earnings adjustment (the astrologer had no earnings on this session, or their share rounds to ₹0)"
            : null,
      },
      makeGood: {
        maxMinutes: policy.maxMinutes,
        validDays: policy.validDays,
        /** Suggested length: the original session's length, within the maximum. */
        suggestedMinutes: Math.min(policy.maxMinutes, Math.max(1, c ? Math.ceil(c.billedSeconds / 60) || policy.maxMinutes : policy.maxMinutes)),
        astrologer: astrologer?.name ?? null,
        minutes: minutes || null,
        credit: credit
          ? { status: credit.status, minutes: credit.minutes, validUntil: istDate(credit.expiresAt), used: credit.status === "USED" }
          : null,
      },
    },
  });
});

const amountBody = z.object({ amount: z.number({ error: "Enter the refund amount." }).int("Refunds are in whole rupees.").min(1, "Refund at least ₹1.").optional() }).optional();

supportRouter.post("/support/:id/refund/propose", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose");
  // Optional: a partial refund (whole rupees, at most what was billed). Default: everything billed.
  const amount = amountBody.parse(req.body ?? {})?.amount;
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (t.refundState !== "NONE") throw conflict(`A ${remedyWord(t)} has already been proposed for this ticket.`);
  // One remedy per session, whichever ticket it comes through: never pay the same charge back twice.
  const other = await otherRemedy(t);
  if (other) throw conflict(`${t.sessionRef} already has a ${remedyWord(other)} ${other.refundState === "INITIATED" ? "approved" : "proposed"} on ${other.id}.`);
  if (t.state === "RESOLVED") throw conflict(`${t.id} is resolved. A refund can't be proposed on a closed ticket.`);
  const file = await caseFile(t);
  if (file.billed <= 0) throw conflict(`Nothing was billed for ${t.sessionRef}, so there is nothing to refund.`);
  if (amount !== undefined && amount > file.billed) throw conflict(`A refund can't be more than the ${rupee(file.billed)} billed for ${t.sessionRef}.`);
  const value = amount ?? file.billed;
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "NONE" },
    data: { refundState: "PROPOSED", state: "REFUND_PROPOSED", refundAmount: value, proposedBy: actorName(admin) },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "dispute.refund.propose", t.id, `${rupee(value)} proposed${value < file.billed ? ` (of ${rupee(file.billed)} billed)` : ""}`);
  res.json({ ok: true, billed: rupee(value) });
});

/** Common checks before a second person decides on a proposed remedy. */
async function decider(req: Request, verb: string) {
  // Decided on the Support page or, for Finance (who can't open Support), on the Finance page.
  const pages = pagesOf(adminOf(req).adminRole);
  if (!pages.includes("support") && !pages.includes("finance")) throw forbidden("You don't have access to this page.");
  const admin = requireCapability(req, "dispute.refund.approve", `Blocked — Support may propose but not ${verb} a refund or free replacement call.`);
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  return { admin, t };
}

async function blockSelf(t: { id: string; proposedBy: string | null }, admin: ReturnType<typeof requireCapability>, verb: string) {
  // Compare people, not names. A proposal with no audit entry (older data) falls back to the name, which can only over-block.
  const proposerId = await refundProposerId(t.id);
  const samePerson = proposerId ? proposerId === admin.user.id : t.proposedBy === actorName(admin);
  if (samePerson) throw forbidden(`Blocked — you proposed this. A second person ${verb}s it.`);
}

/**
 * A second person approves; the refund goes back to the customer's wallet in the same buckets it
 * was paid from (a partial refund in proportion), never more than was billed. The astrologer's share
 * of the refunded amount is taken back with a negative earnings line.
 */
supportRouter.post("/support/:id/refund/approve", async (req, res) => {
  const { admin, t } = await decider(req, "approve");
  if (t.refundState !== "PROPOSED" || t.state === MAKEGOOD_PROPOSED) throw conflict("There is no proposed refund to approve.");
  await blockSelf(t, admin, "approve");

  const c = await db.consultation.findUnique({ where: { ref: t.sessionRef } });
  const sharePct = c ? await shareOfSession(c) : null;
  let ref = makeRef("RFD");
  while (await db.transaction.findUnique({ where: { ref } })) ref = makeRef("RFD");
  const now = new Date();
  const outcome = await db.$transaction(async (tx) => {
    // Only while it is still proposed: a decline, a rejection or a second approver at the same moment wins once.
    const { count } = await tx.supportTicket.updateMany({
      where: { id: t.id, refundState: "PROPOSED", state: "REFUND_PROPOSED" },
      data: { refundState: "INITIATED", state: "REFUND_INITIATED", approvedBy: actorName(admin), resolution: "REFUND" },
    });
    if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
    if (!c?.customerId || c.total <= 0) return { refunded: 0, taken: 0 };
    const amount = Math.min(t.refundAmount || c.total, c.total);
    // The whole charge goes back in the buckets it came from; part of it, in the same proportion.
    const promo = amount >= c.total ? c.promoUsed : Math.round((amount * c.promoUsed) / c.total);
    const service = amount - promo;
    await tx.wallet.update({ where: { userId: c.customerId }, data: { service: { increment: service }, promo: { increment: promo } } });
    await tx.transaction.create({ data: { userId: c.customerId, type: "Refund", ref, bucket: `${t.id} · ${istDayMonth(now)}`, amount } });
    // The astrologer's share of what was refunded comes back out of their earnings (customer-funded,
    // so it nets in their next regular payout batch). Rounded down like the share they were paid.
    const taken = sharePct === null ? 0 : Math.floor((amount * sharePct) / 100);
    if (taken > 0) {
      await tx.earningsLine.create({
        data: {
          astrologerId: c.astrologerId,
          date: now,
          sessionRef: t.id,
          kind: "refund_adjustment",
          mode: `Refund adjustment · ${t.id} · ${c.ref}`,
          minutes: 0,
          gross: -amount,
          sharePct,
          amount: -taken,
          fundedBy: "CUSTOMER",
        },
      });
    }
    return { refunded: amount, taken };
  });
  await audit(
    admin,
    "dispute.refund.approve",
    t.id,
    `REFUND_PROPOSED → REFUND_INITIATED (${rupee(outcome.refunded)})${outcome.taken ? ` · astrologer adjustment −${rupee(outcome.taken)} (${sharePct}% share)` : ""}`,
  );
  if (c?.customerId && outcome.refunded > 0) {
    await notify(c.customerId, {
      kind: "refund.approved",
      title: `${rupee(outcome.refunded)} refunded to your wallet`,
      body: `We've refunded ${rupee(outcome.refunded)} for session ${c.ref} (ticket ${t.id}). It's back in your AstroRize wallet.`,
      href: "/wallet",
    });
    const astro = outcome.taken ? await db.astrologer.findUnique({ where: { id: c.astrologerId }, select: { userId: true } }) : null;
    if (astro?.userId) {
      await notify(astro.userId, {
        kind: "earnings.refund_adjustment",
        title: `Refund adjustment −${rupee(outcome.taken)}`,
        body: `A customer was refunded ${rupee(outcome.refunded)} for session ${c.ref} after a complaint (${t.id}). Your ${sharePct}% share of it, ${rupee(outcome.taken)}, is deducted from your next payout.`,
        href: "/portal/earnings",
      });
    }
  }
  res.json({ ok: true, actor: actorName(admin), billed: rupee(outcome.refunded), adjustment: outcome.taken });
});

/**
 * Support proposes a free replacement call instead of a refund: `minutes` free with the same
 * astrologer, within `support.makegood.max_minutes`. Needs a second approver, like a refund.
 */
supportRouter.post("/support/:id/makegood/propose", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose");
  const policy = await makeGoodPolicy();
  const { minutes } = z
    .object({
      minutes: z
        .number({ error: "Enter the free minutes." })
        .int("Whole minutes only.")
        .min(1, "At least 1 free minute.")
        .max(policy.maxMinutes, `At most ${policy.maxMinutes} free minutes.`),
    })
    .parse(req.body ?? {});
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (t.refundState !== "NONE") throw conflict(`A ${remedyWord(t)} has already been proposed for this ticket.`);
  if (t.state === "RESOLVED") throw conflict(`${t.id} is resolved. Nothing can be offered on a closed ticket.`);
  const other = await otherRemedy(t);
  if (other) throw conflict(`${t.sessionRef} already has a ${remedyWord(other)} ${other.refundState === "INITIATED" ? "approved" : "proposed"} on ${other.id}.`);
  const c = await db.consultation.findUnique({ where: { ref: t.sessionRef } });
  if (!c?.customerId || !c.connectedAt) throw conflict("A free replacement call needs a real session with a customer that connected.");
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "NONE", state: { not: "RESOLVED" } },
    data: { refundState: "PROPOSED", state: MAKEGOOD_PROPOSED, refundAmount: 0, proposedBy: actorName(admin) },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await putSetting(minutesKey(t.id), { minutes });
  await audit(admin, "dispute.makegood.propose", t.id, `free replacement call of ${minutes} min proposed (session ${c.ref})`);
  res.json({ ok: true, minutes });
});

/**
 * A second person approves the make-good: the customer gets a credit for `minutes` free with the same
 * astrologer, valid `support.makegood.valid_days` (to the end of that IST day), and the ticket is resolved.
 */
supportRouter.post("/support/:id/makegood/approve", async (req, res) => {
  const { admin, t } = await decider(req, "approve");
  if (t.refundState !== "PROPOSED" || t.state !== MAKEGOOD_PROPOSED) throw conflict("There is no proposed free replacement call to approve.");
  await blockSelf(t, admin, "approve");
  const [c, minutes, policy] = await Promise.all([db.consultation.findUnique({ where: { ref: t.sessionRef }, include: { astrologer: true, customer: true } }), proposedMinutes(t.id), makeGoodPolicy()]);
  if (!c?.customerId || !c.customer) throw conflict("The customer of this session no longer has an account.");
  if (minutes < 1) throw conflict("The proposed length is missing. Decline it and ask Support to propose it again.");
  const lastDay = istDateKey(new Date(Date.now() + policy.validDays * 86_400_000));
  const expiresAt = new Date(`${lastDay}T23:59:59.999+05:30`);
  const credit = await db.$transaction(async (tx) => {
    const { count } = await tx.supportTicket.updateMany({
      where: { id: t.id, refundState: "PROPOSED", state: MAKEGOOD_PROPOSED },
      data: { refundState: "INITIATED", state: "RESOLVED", approvedBy: actorName(admin), resolution: "MAKE_GOOD" },
    });
    if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
    return tx.makeGoodCredit.create({
      data: { userId: c.customerId!, astrologerId: c.astrologerId, ticketId: t.id, sessionRef: c.ref, minutes, expiresAt },
    });
  });
  await audit(admin, "dispute.makegood.approve", t.id, `MAKEGOOD_PROPOSED → RESOLVED · ${minutes} min free with ${c.astrologer.name} until ${istDate(expiresAt)} (credit ${credit.id})`);
  const until = istDayMonth(expiresAt);
  await notify(c.customerId, {
    kind: "makegood.offered",
    title: `Free ${minutes}-minute call with ${c.astrologer.name}`,
    body: `We're sorry about session ${c.ref}. ${c.astrologer.name} will talk to you again for free — book your free ${minutes}-minute replacement call by ${until} from their profile when they're online.`,
    href: `/astrologer/${c.astrologer.slug}`,
  });
  if (c.astrologer.userId) {
    await notify(c.astrologer.userId, {
      kind: "makegood.astrologer",
      title: "Free replacement call for a customer",
      body: `${displayName(c.customer)} has a free ${minutes}-minute replacement call with you for session ${c.ref} (complaint ${t.id}), until ${until}. You keep your earnings from the original session; the free minutes aren't paid again.`,
      href: "/portal/consultations",
    });
  }
  res.json({ ok: true, actor: actorName(admin), minutes, validUntil: istDate(expiresAt) });
});

const reasonBody = z.object({
  reason: z
    .string({ error: "Write a reason." })
    .trim()
    .min(3, "Write a reason of at least 3 characters.")
    .max(200, "Keep the reason to 200 characters."),
});

/**
 * Rejects the dispute with a reason and closes the ticket. A refund or free replacement call still
 * waiting for its second approver is withdrawn with it (so it can't be approved on a closed ticket);
 * an approved one can't be undone here.
 */
supportRouter.post("/support/:id/reject", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose");
  const { reason } = reasonBody.parse(req.body);
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (t.refundState === "INITIATED") throw conflict(`A ${remedyWord(t)} was already approved on ${t.id}, so the dispute can't be rejected.`);
  if (!isOpen(t)) throw conflict(`${t.id} is already resolved.`);
  const withdrawn = t.refundState === "PROPOSED";
  const what = t.state === MAKEGOOD_PROPOSED ? "free replacement call" : `refund of ${rupee(t.refundAmount)}`;
  // Only if nobody approved it meanwhile.
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: t.refundState, state: t.state },
    data: { state: "RESOLVED", ...(withdrawn ? { refundState: "NONE", refundAmount: 0, proposedBy: null } : {}) },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "dispute.reject", t.id, `${t.state} → RESOLVED${withdrawn ? ` · proposed ${what} withdrawn` : ""} · ${reason}`);
  res.json({ ok: true, withdrawn });
});

/**
 * Closes a ticket whose session already had a refund or free replacement call approved on another
 * ticket (one remedy per session, so nothing more can be given here). Support decides it is covered;
 * the closing is audited with the ticket that covers it.
 */
supportRouter.post("/support/:id/close-covered", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (!isOpen(t)) throw conflict(`${t.id} is already resolved.`);
  if (t.refundState !== "NONE") throw conflict(`A ${remedyWord(t)} is proposed on ${t.id}. Approve, decline or reject it instead.`);
  const granted = await grantedElsewhere(t);
  if (!granted) throw conflict(`Nothing has been given for ${t.sessionRef} on another ticket, so ${t.id} can't be closed as covered.`);
  // Only if nobody proposed something or closed it meanwhile.
  const { count } = await db.supportTicket.updateMany({ where: { id: t.id, refundState: "NONE", state: t.state }, data: { state: "RESOLVED" } });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "dispute.close.covered", t.id, `${t.state} → RESOLVED · ${remedyWord(granted)} already given for ${t.sessionRef} on ${granted.id}`);
  res.json({ ok: true, coveredBy: granted.id });
});

/**
 * The second approver declines a proposed refund or free replacement call (with a reason): nothing
 * is granted and the ticket goes back to Support to investigate. Whoever may approve may decline,
 * except the proposer.
 */
supportRouter.post("/support/:id/refund/decline", async (req, res) => {
  const { admin, t } = await decider(req, "decline");
  const { reason } = reasonBody.parse(req.body);
  if (t.refundState !== "PROPOSED") throw conflict("There is nothing proposed to decline.");
  await blockSelf(t, admin, "decide");
  const makeGood = t.state === MAKEGOOD_PROPOSED;
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "PROPOSED", state: t.state },
    data: { refundState: "NONE", state: "INVESTIGATING", refundAmount: 0, proposedBy: null },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(
    admin,
    makeGood ? "dispute.makegood.decline" : "dispute.refund.decline",
    t.id,
    `${t.state} → INVESTIGATING · ${makeGood ? "free replacement call not given" : `${rupee(t.refundAmount)} not refunded`} · ${reason}`,
  );
  res.json({ ok: true });
});
