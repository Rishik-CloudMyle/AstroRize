import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istDate, istDateKey, istDayMonth, istTime, makeRef, rupee } from "../../lib/format.ts";
import { makeGoodPolicy } from "../../lib/makegood.ts";
import { notify } from "../../lib/notifications.ts";
import { displayName } from "../../lib/profile.ts";
import { actorName, adminOf, capabilitiesOf, pagesOf, requireCapability, requirePage, secondPerson } from "../../lib/rbac.ts";
import {
  categoryLabel,
  CREDIT_PROPOSED,
  customerOf,
  CUSTOMER_TEAM,
  forwardTargets,
  hasSession,
  isOpen,
  isTeam,
  OPEN_TICKET,
  staffTimeline,
  suggestedTeam,
  teamLabel,
  ticketAccess,
  ticketScope,
  WALLET_CREDIT,
} from "../../lib/tickets.ts";
import { configNumber, getSetting, putSetting } from "../../lib/settings.ts";
import { staffForwarded, staffRemedyDecided, staffRemedyProposed } from "../../lib/staff-notifications.ts";
import type { Consultation, Prisma } from "../../generated/prisma/client.ts";

// Support & disputes: tickets, the metering evidence, and maker-checker remedies. On a complaint
// Support or Finance proposes one remedy and a second person (Finance — someone other than the
// proposer — or a Super Admin) approves it. A Super Admin may approve their own proposal (client
// decision, Nov 2026); the audit entry then says "self-approved by Super Admin".
//  · a REFUND to the customer's wallet (up to what was billed). The astrologer's share of the refunded
//    amount is taken back with a negative "refund_adjustment" earnings line that nets in their next
//    payout batch (lib/earnings.ts), or
//  · a free replacement call (MAKE_GOOD): N free minutes with the same astrologer instead of money back.
//    The astrologer keeps their original earnings and isn't paid for the free minutes (lib/makegood.ts).
// Client decision (Oct 2026): a make-good goes through the same second approver as a refund — it
// replaces a refund and costs the astrologer unpaid minutes, so it is a money decision too.
//  · a WALLET CREDIT, on any ticket (with or without a session, e.g. a recharge that never arrived, or
//    goodwill): a set amount to the customer's Service balance (real money, refundable) or Promotional
//    balance (goodwill), with a reason the customer sees. No astrologer earnings change — for a
//    session's charge the session refund above is the tool, as it takes the astrologer's share back.
//    Same two people: proposed by a team with dispute.refund.propose, approved by someone else with
//    dispute.refund.approve (or a Super Admin, who may self-approve); capped by Config support.wallet_credit_max.
//
// Ticket fields: refundState tracks the remedy (NONE → PROPOSED → INITIATED = approved), `state`
// says which is proposed (REFUND_PROPOSED | MAKEGOOD_PROPOSED | CREDIT_PROPOSED), and `resolution`
// records what was granted (REFUND | MAKE_GOOD | WALLET_CREDIT). The proposed make-good length is kept
// in Setting `support.makegood.<ticket>`; a credit's balance, reason and linked recharge in `support.credit.<ticket>`.
export const supportRouter = Router();

const MAKEGOOD_PROPOSED = "MAKEGOOD_PROPOSED";

// Open / closed, and who may see or act on a ticket, live in lib/tickets.ts (shared with the customer side).
export { OPEN_TICKET };

/** The audit actions that close a ticket (their entry says when, by whom and why). */
const CLOSING_ACTIONS = ["dispute.refund.approve", "dispute.makegood.approve", "dispute.credit.approve", "dispute.reject", "dispute.close.covered", "support.ticket.resolve", "support.ticket.close"];

/** How a closed ticket ended, for the Resolved list and the case file. */
async function outcomes(tickets: { id: string; state: string; refundState: string; refundAmount: number; resolution: string | null; closedAs: string | null }[]) {
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
        : t.resolution === WALLET_CREDIT
          ? `Credited ${rupee(t.refundAmount)} to wallet`
          : t.resolution === "REFUND" || t.refundState === "INITIATED"
          ? t.refundAmount > 0
            ? `Refunded ${rupee(t.refundAmount)}`
            : "Refunded"
          : entry?.action === "dispute.close.covered"
            ? "Closed · already remedied"
            : t.closedAs === "RESOLVED"
              ? "Resolved"
              : t.closedAs === "CLOSED"
                ? "Closed"
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
const creditKey = (ticketId: string) => `support.credit.${ticketId}`;

/** The two wallet balances a support credit can go to (their Transaction.bucket names). */
const CREDIT_BUCKETS = { SERVICE: "Service", PROMO: "Promotional" } as const;
type CreditBucket = keyof typeof CREDIT_BUCKETS;

/** A proposed (or, once approved, given) wallet credit's details; the amount is on the ticket (refundAmount). */
interface CreditProposal {
  bucket: CreditBucket;
  /** Shown to the customer (in the reply and the notification). */
  reason: string;
  /** The recharge on the ticket it is about, when the proposer linked it. */
  paymentId: string | null;
  /** The wallet ledger line, once approved. */
  txnRef?: string;
}

export async function creditProposal(ticketId: string): Promise<CreditProposal | null> {
  return getSetting<CreditProposal | null>(creditKey(ticketId), null);
}

/** The largest wallet credit one ticket may give (₹). */
const creditMax = () => configNumber("support.wallet_credit_max", 5000);

/** Payment and wallet issues are about real money: their credit defaults to the Service balance. */
const MONEY_CATEGORIES = ["PAYMENT_REFUND", "WALLET"];

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
    where: { action: { in: ["dispute.refund.propose", "dispute.makegood.propose", "dispute.credit.propose"] }, object: ticketId },
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

/**
 * How much of the astrologer's earnings a refund takes back (client decision, Nov 2026: "exact money
 * should be cut" — a small refund must never reverse ₹0): their share of the refund, rounded UP to
 * whole rupees (₹1 at 50% → ₹1), capped so all reversals on the session never exceed what they
 * earned on it. Never negative.
 */
async function reversalFor(tx: Prisma.TransactionClient, c: Pick<Consultation, "ref" | "astrologerId">, ticketId: string, amount: number) {
  const lines = await tx.earningsLine.findMany({
    where: { astrologerId: c.astrologerId, sessionRef: c.ref, fundedBy: "CUSTOMER", kind: { not: "refund_adjustment" } },
    orderBy: { date: "asc" },
    select: { sharePct: true, amount: true },
  });
  if (!lines.length) return null;
  const sharePct = lines[0]!.sharePct ?? 100;
  const earned = lines.reduce((n, l) => n + (l.amount ?? 0), 0);
  // What refunds approved on this session through other tickets already took back.
  const others = await tx.supportTicket.findMany({ where: { sessionRef: c.ref, id: { not: ticketId }, resolution: "REFUND" }, select: { id: true } });
  const earlier = others.length
    ? await tx.earningsLine.aggregate({
        where: { astrologerId: c.astrologerId, kind: "refund_adjustment", sessionRef: { in: others.map((t) => t.id) } },
        _sum: { amount: true },
      })
    : null;
  const stillHeld = Math.max(0, earned - Math.abs(earlier?._sum.amount ?? 0));
  return { taken: Math.min(stillHeld, Math.max(0, Math.ceil((amount * sharePct) / 100))), sharePct };
}

/** Another ticket on the same session that already has a remedy proposed or granted. */
function otherRemedy(t: { id: string; sessionRef: string }) {
  if (!hasSession(t)) return null;
  return db.supportTicket.findFirst({ where: { sessionRef: t.sessionRef, id: { not: t.id }, refundState: { in: ["PROPOSED", "INITIATED"] } } });
}

const isCredit = (t: { state: string; resolution: string | null }) => t.state === CREDIT_PROPOSED || t.resolution === WALLET_CREDIT;

const remedyWord = (t: { state: string; resolution: string | null }) =>
  t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? "free replacement call" : isCredit(t) ? "wallet credit" : "refund";

supportRouter.get("/support", async (req, res) => {
  const admin = requirePage(req, "support");
  const now = new Date();
  const tickets = await db.supportTicket.findMany({ where: ticketScope(admin), orderBy: { createdAt: "desc" } });
  const closed = await outcomes(tickets);
  const replied = await customerWaiting(tickets.map((t) => t.id));
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
        /** The team working it now. */
        team: t.assignedTeam,
        teamLabel: teamLabel(t.assignedTeam),
        category: categoryLabel(t.category),
        /** Staff asked the customer something and are waiting for the answer. */
        awaitingCustomer: !outcome && t.awaitingCustomer,
        /** The customer wrote after the team last replied (open tickets only). */
        customerReplied: !outcome && replied.has(t.id),
        lastActivityAt: t.lastActivityAt.toISOString(),
        /** This person can reply, forward and resolve it (the team it is with, or a Super Admin). */
        mine: ticketAccess(admin, t).act,
      };
    }),
  });
});

/** Tickets whose latest message is from the customer (they wrote after the team last replied). */
async function customerWaiting(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db.supportTicketMessage.findMany({
    where: { ticketId: { in: ids }, internal: false },
    orderBy: { createdAt: "desc" },
    distinct: ["ticketId"],
    select: { ticketId: true, author: true },
  });
  return new Set(rows.filter((r) => r.author === "CUSTOMER").map((r) => r.ticketId));
}

/** The ticket, if this person may see it (others get the same "not found" as a missing ticket). */
async function visibleTicket(req: Request) {
  const admin = requirePage(req, "support");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t || !ticketAccess(admin, t).view) throw notFound("Ticket not found.");
  return { admin, t, access: ticketAccess(admin, t) };
}

/** The ticket, if this person may work it now: the team it is with, or a Super Admin, while it is open. */
async function workableTicket(req: Request) {
  const v = await visibleTicket(req);
  if (!v.access.act) {
    throw isOpen(v.t)
      ? forbidden(`${v.t.id} is with ${teamLabel(v.t.assignedTeam)}. Only that team (or a Super Admin) can work it.`)
      : conflict(`${v.t.id} is already resolved.`);
  }
  return v;
}

supportRouter.get("/support/:id", async (req, res) => {
  const { admin, t, access } = await visibleTicket(req);
  const [file, proposedById, other, policy, minutes, credit, adjustment, closed, timeline, customer, payment, proposal, maxCredit] = await Promise.all([
    caseFile(t),
    t.refundState === "NONE" ? null : refundProposerId(t.id),
    otherRemedy(t),
    makeGoodPolicy(),
    t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? proposedMinutes(t.id) : 0,
    t.resolution === "MAKE_GOOD" ? db.makeGoodCredit.findFirst({ where: { ticketId: t.id }, orderBy: { createdAt: "desc" } }) : null,
    t.resolution === "REFUND" ? db.earningsLine.findFirst({ where: { kind: "refund_adjustment", sessionRef: t.id } }) : null,
    outcomes([t]),
    staffTimeline(t),
    customerOf(t).then((id) => (id ? db.user.findUnique({ where: { id } }) : null)),
    t.paymentId ? db.payment.findUnique({ where: { id: t.paymentId } }) : null,
    isCredit(t) ? creditProposal(t.id) : null,
    creditMax(),
  ]);
  const c = file.consultation;
  const suggested = suggestedTeam(t.category);
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
  const caps = capabilitiesOf(admin.adminRole);
  // Money (a refund, a free call, a wallet credit) is proposed by a department with dispute.refund.propose
  // (Support, Finance and the Super Admin by default) while the ticket is with it; others forward it to Finance.
  const money = caps.includes("dispute.refund.propose");
  // Why no wallet credit can be proposed (the propose route refuses for the same reasons).
  const creditBlocked = !open ? null : (otherLine ?? (!customer && !c?.customerId ? "Only an issue a customer raised has a wallet to credit" : null));
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
      remedy: t.refundState === "NONE" ? null : t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" ? "MAKE_GOOD" : isCredit(t) ? WALLET_CREDIT : "REFUND",
      proposedBy: t.proposedBy,
      proposedById,
      approvedBy: t.approvedBy,
      team: t.assignedTeam,
      teamLabel: teamLabel(t.assignedTeam),
      category: categoryLabel(t.category),
      /** The team the category usually belongs with (a one-click forward), when it isn't there already. */
      suggestedTeam: access.act && suggested !== t.assignedTeam && forwardTargets(t.assignedTeam).includes(suggested) ? { key: suggested, label: teamLabel(suggested) } : null,
      subject: t.subject,
      description: t.description,
      customer: customer ? { name: displayName(customer), alias: t.customerAlias } : null,
      payment: payment
        ? {
            label: `${rupee(payment.amount)} recharge · ${istDate(payment.createdAt)} · ${payment.status}`,
            detail: [payment.method, payment.providerPaymentId ?? payment.providerOrderId, payment.failureReason].filter(Boolean).join(" · "),
          }
        : null,
      awaitingCustomer: t.awaitingCustomer,
      closedAs: t.closedAs,
      /** What this person may do on it (the API enforces the same). */
      can: {
        act: access.act,
        note: access.note,
        forwardTo: access.act ? forwardTargets(t.assignedTeam).map((k) => ({ key: k, label: teamLabel(k) })) : [],
        /** A proposed remedy must be decided or withdrawn (reject) before the ticket can be resolved. */
        resolve: access.act && t.refundState === "NONE",
        /** Only a ticket a customer raised has someone to reply to. */
        reply: access.act && !!customer,
        /** This department proposes money (refunds, free calls, wallet credits); without it, it forwards to Finance. */
        money,
        /** Propose a wallet credit now: the team it is with, nothing proposed yet, a customer to credit. */
        credit: access.act && money && open && !creditBlocked,
        /** Approve or decline someone else's proposal (their own only as a Super Admin). */
        approve: caps.includes("dispute.refund.approve"),
      },
      /** Why a wallet credit can't be proposed on this open ticket (another remedy, no customer), else null. */
      creditBlocked,
      /** Wallet credit: the limits for a new one, and the one proposed or given on this ticket. */
      walletCredit: {
        max: maxCredit,
        /** Payment and wallet issues (and older session disputes) default to the Service balance; the rest to Promotional. */
        defaultBucket: (t.category && MONEY_CATEGORIES.includes(t.category)) || (!t.category && hasSession(t)) ? "SERVICE" : "PROMO",
        /** The recharge on this ticket a credit can be linked to. */
        payment: payment ? `${rupee(payment.amount)} recharge · ${istDate(payment.createdAt)} · ${payment.status}` : null,
        proposed: proposal
          ? {
              amount: rupee(t.refundAmount),
              bucket: proposal.bucket,
              bucketLabel: `${CREDIT_BUCKETS[proposal.bucket]} balance`,
              reason: proposal.reason,
              linkedPayment: !!proposal.paymentId,
              /** The wallet ledger line, once given. */
              txnRef: proposal.txnRef ?? null,
              given: t.resolution === WALLET_CREDIT,
            }
          : null,
      },
      /** Every message, internal note and audited step, oldest first. */
      timeline,
      refundBlocked,
      makeGoodBlocked,
      metering: file.metering,
      evidence: file.evidence,
      refund: {
        billed: rupee(file.billed),
        billedValue: file.billed,
        /** The refund proposed or paid (may be less than billed). */
        amount: t.refundState === "NONE" || t.state === MAKEGOOD_PROPOSED || t.resolution === "MAKE_GOOD" || isCredit(t) ? null : rupee(t.refundAmount),
        buckets: [
          { label: "Service balance portion", value: rupee(file.buckets.service) },
          { label: "Promotional balance portion", value: rupee(file.buckets.promo) },
          { label: `Total refund — capped at billed ${rupee(file.billed)}`, value: rupee(file.billed), total: true },
        ],
        /** The astrologer's share that a refund takes back (percent), when known. */
        astrologerSharePct: share,
        /** The negative earnings line written when the refund was approved. */
        adjustment: adjustment
          ? `${rupee(Math.abs(adjustment.amount ?? 0)).replace("₹", "−₹")} from ${astrologer?.name ?? "the astrologer"}'s earnings for the ${rupee(Math.abs(adjustment.gross ?? 0))} refund (their ${adjustment.sharePct ?? 100}% share of it, rounded up to whole rupees so even a small refund is taken back), netted in their next payout`
          : t.resolution === "REFUND"
            ? "No earnings adjustment (the astrologer had no earnings left on this session to take back)"
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
  const { t } = await workableTicket(req);
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
    data: { refundState: "PROPOSED", state: "REFUND_PROPOSED", refundAmount: value, proposedBy: actorName(admin), lastActivityAt: new Date() },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "dispute.refund.propose", t.id, `${rupee(value)} proposed${value < file.billed ? ` (of ${rupee(file.billed)} billed)` : ""}`);
  await staffRemedyProposed(t, { refund: value }, { id: admin.user.id, name: actorName(admin) });
  res.json({ ok: true, billed: rupee(value) });
});

/** Common checks before a second person decides on a proposed remedy. */
async function decider(req: Request, verb: string) {
  // Decided on the Support page or, for Finance (who can't open Support), on the Finance page.
  const pages = pagesOf(adminOf(req).adminRole);
  if (!pages.includes("support") && !pages.includes("finance")) throw forbidden("You don't have access to this page.");
  const admin = requireCapability(req, "dispute.refund.approve", `Blocked — Support may propose but not ${verb} a refund, wallet credit or free replacement call.`);
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  return { admin, t };
}

/**
 * The two-person rule: whoever proposed it can't decide it — except a Super Admin, who may. Returns
 * the note for the audit entry (" · self-approved by Super Admin", or "").
 */
async function blockSelf(t: { id: string; proposedBy: string | null }, admin: ReturnType<typeof requireCapability>, verb: string) {
  // Compare people, not names. A proposal with no audit entry (older data) falls back to the name, which can only over-block.
  const proposerId = await refundProposerId(t.id);
  const samePerson = proposerId ? proposerId === admin.user.id : t.proposedBy === actorName(admin);
  return secondPerson(admin, samePerson, `Blocked — you proposed this. A second person ${verb}s it.`);
}

/**
 * A second person approves; the refund goes back to the customer's wallet in the same buckets it
 * was paid from (a partial refund in proportion), never more than was billed. The astrologer's share
 * of the refunded amount is taken back with a negative earnings line.
 */
supportRouter.post("/support/:id/refund/approve", async (req, res) => {
  const { admin, t } = await decider(req, "approve");
  if (t.refundState !== "PROPOSED" || t.state === MAKEGOOD_PROPOSED || t.state === CREDIT_PROPOSED) throw conflict("There is no proposed refund to approve.");
  const self = await blockSelf(t, admin, "approve");

  const c = await db.consultation.findUnique({ where: { ref: t.sessionRef } });
  let ref = makeRef("RFD");
  while (await db.transaction.findUnique({ where: { ref } })) ref = makeRef("RFD");
  const now = new Date();
  const outcome = await db.$transaction(async (tx) => {
    // Only while it is still proposed: a decline, a rejection or a second approver at the same moment wins once.
    const { count } = await tx.supportTicket.updateMany({
      where: { id: t.id, refundState: "PROPOSED", state: "REFUND_PROPOSED" },
      data: { refundState: "INITIATED", state: "REFUND_INITIATED", approvedBy: actorName(admin), resolution: "REFUND", awaitingCustomer: false, lastActivityAt: now },
    });
    if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
    if (!c?.customerId || c.total <= 0) return { refunded: 0, taken: 0, sharePct: null as number | null };
    const amount = Math.min(t.refundAmount || c.total, c.total);
    // The whole charge goes back in the buckets it came from; part of it, in the same proportion.
    const promo = amount >= c.total ? c.promoUsed : Math.round((amount * c.promoUsed) / c.total);
    const service = amount - promo;
    await tx.wallet.update({ where: { userId: c.customerId }, data: { service: { increment: service }, promo: { increment: promo } } });
    await tx.transaction.create({ data: { userId: c.customerId, type: "Refund", ref, bucket: `${t.id} · ${istDayMonth(now)}`, amount } });
    // The astrologer's share of what was refunded comes back out of their earnings (customer-funded,
    // so it nets in their next regular payout batch), rounded up so a small refund is never lost (reversalFor).
    const reversal = await reversalFor(tx, c, t.id, amount);
    const taken = reversal?.taken ?? 0;
    const sharePct = reversal?.sharePct ?? null;
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
    return { refunded: amount, taken, sharePct };
  });
  const sharePct = outcome.sharePct;
  await audit(
    admin,
    "dispute.refund.approve",
    t.id,
    `REFUND_PROPOSED → REFUND_INITIATED (${rupee(outcome.refunded)})${outcome.taken ? ` · astrologer adjustment −${rupee(outcome.taken)} (${sharePct}% share)` : ""}${self}`,
  );
  await staffRemedyDecided(t, await refundProposerId(t.id), { approved: true, makeGood: false }, { id: admin.user.id, name: actorName(admin) });
  if (c?.customerId && outcome.refunded > 0) {
    await notify(c.customerId, {
      kind: "refund.approved",
      title: `${rupee(outcome.refunded)} refunded to your wallet`,
      body: `We've refunded ${rupee(outcome.refunded)} for session ${c.ref} (issue ${t.id}). It's back in your AstroRize wallet.`,
      href: `/support/${t.id}`,
    });
    const astro = outcome.taken ? await db.astrologer.findUnique({ where: { id: c.astrologerId }, select: { userId: true } }) : null;
    if (astro?.userId) {
      await notify(astro.userId, {
        kind: "earnings.refund_adjustment",
        title: `Refund adjustment −${rupee(outcome.taken)}`,
        body: `A customer was refunded ${rupee(outcome.refunded)} for session ${c.ref} after a complaint (${t.id}). Your ${sharePct}% share of the refund, ${rupee(outcome.taken)} (rounded up to whole rupees), is deducted from your next payout.`,
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
  const { t } = await workableTicket(req);
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
  await staffRemedyProposed(t, { minutes }, { id: admin.user.id, name: actorName(admin) });
  res.json({ ok: true, minutes });
});

/**
 * A second person approves the make-good: the customer gets a credit for `minutes` free with the same
 * astrologer, valid `support.makegood.valid_days` (to the end of that IST day), and the ticket is resolved.
 */
supportRouter.post("/support/:id/makegood/approve", async (req, res) => {
  const { admin, t } = await decider(req, "approve");
  if (t.refundState !== "PROPOSED" || t.state !== MAKEGOOD_PROPOSED) throw conflict("There is no proposed free replacement call to approve.");
  const self = await blockSelf(t, admin, "approve");
  const [c, minutes, policy] = await Promise.all([db.consultation.findUnique({ where: { ref: t.sessionRef }, include: { astrologer: true, customer: true } }), proposedMinutes(t.id), makeGoodPolicy()]);
  if (!c?.customerId || !c.customer) throw conflict("The customer of this session no longer has an account.");
  if (minutes < 1) throw conflict("The proposed length is missing. Decline it and ask Support to propose it again.");
  const lastDay = istDateKey(new Date(Date.now() + policy.validDays * 86_400_000));
  const expiresAt = new Date(`${lastDay}T23:59:59.999+05:30`);
  const credit = await db.$transaction(async (tx) => {
    const { count } = await tx.supportTicket.updateMany({
      where: { id: t.id, refundState: "PROPOSED", state: MAKEGOOD_PROPOSED },
      data: { refundState: "INITIATED", state: "RESOLVED", approvedBy: actorName(admin), resolution: "MAKE_GOOD", awaitingCustomer: false, lastActivityAt: new Date() },
    });
    if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
    return tx.makeGoodCredit.create({
      data: { userId: c.customerId!, astrologerId: c.astrologerId, ticketId: t.id, sessionRef: c.ref, minutes, expiresAt },
    });
  });
  await audit(admin, "dispute.makegood.approve", t.id, `MAKEGOOD_PROPOSED → RESOLVED · ${minutes} min free with ${c.astrologer.name} until ${istDate(expiresAt)} (credit ${credit.id})${self}`);
  await staffRemedyDecided(t, await refundProposerId(t.id), { approved: true, makeGood: true }, { id: admin.user.id, name: actorName(admin) });
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

// ── Wallet credit (any ticket) ──

const creditBody = z.object({
  amount: z.number({ error: "Enter the amount to credit." }).int("Credits are in whole rupees.").min(1, "Credit at least ₹1."),
  bucket: z.enum(["SERVICE", "PROMO"], { error: "Choose the Service or the Promotional balance." }),
  reason: z
    .string({ error: "Write the reason the customer will see." })
    .trim()
    .min(5, "Write the reason the customer will see (at least 5 characters).")
    .max(300, "Keep the reason to 300 characters."),
  /** Link the credit to the recharge this ticket is about. */
  linkPayment: z.boolean().default(false),
});

/** Whose wallet a credit goes to: the customer who raised the ticket, else the session's customer. */
async function creditCustomer(t: { id: string; customerId: string | null; sessionRef: string }) {
  const raised = await customerOf(t);
  if (raised) return raised;
  if (!hasSession(t)) return null;
  return (await db.consultation.findUnique({ where: { ref: t.sessionRef }, select: { customerId: true } }))?.customerId ?? null;
}

/**
 * The team the ticket is with (a department with dispute.refund.propose, or a Super Admin) proposes a
 * credit to the customer's wallet: whole rupees up to Config support.wallet_credit_max, the balance it
 * goes to, and the reason the customer will see. Nothing moves until a second person approves it,
 * whatever the amount (support.refund.auto_approve_ceiling doesn't skip the second person).
 */
supportRouter.post("/support/:id/credit/propose", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose", "Your department can't propose money. Forward the ticket to the Finance team.");
  const body = creditBody.parse(req.body ?? {});
  const { t } = await workableTicket(req);
  if (t.refundState !== "NONE") throw conflict(`A ${remedyWord(t)} has already been proposed for this ticket.`);
  const other = await otherRemedy(t);
  if (other) throw conflict(`${t.sessionRef} already has a ${remedyWord(other)} ${other.refundState === "INITIATED" ? "approved" : "proposed"} on ${other.id}.`);
  if (!(await creditCustomer(t))) throw conflict(`${t.id} wasn't raised by a customer, so there is no wallet to credit.`);
  const max = await creditMax();
  if (body.amount > max) throw conflict(`A wallet credit can be at most ${rupee(max)} on one ticket.`);
  if (body.linkPayment && !t.paymentId) throw conflict(`${t.id} isn't about a recharge, so there is nothing to link the credit to.`);
  // Only if nobody proposed, forwarded or closed it meanwhile.
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "NONE", state: t.state, assignedTeam: t.assignedTeam },
    data: { refundState: "PROPOSED", state: CREDIT_PROPOSED, refundAmount: body.amount, proposedBy: actorName(admin), lastActivityAt: new Date() },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  const proposal: CreditProposal = { bucket: body.bucket, reason: body.reason, paymentId: body.linkPayment ? t.paymentId : null };
  await putSetting(creditKey(t.id), proposal);
  const bucket = CREDIT_BUCKETS[body.bucket];
  await audit(
    admin,
    "dispute.credit.propose",
    t.id,
    `${rupee(body.amount)} to the customer's ${bucket} balance proposed${proposal.paymentId ? " (for the recharge on this ticket)" : ""} · ${body.reason}`,
  );
  await staffRemedyProposed(t, { credit: body.amount, bucket }, { id: admin.user.id, name: actorName(admin) });
  res.json({ ok: true, amount: rupee(body.amount), bucket });
});

/**
 * A second person (Finance, not the proposer — or a Super Admin, who may approve their own) approves:
 * the amount goes into the customer's wallet together with its ledger line ("Credit from support ·
 * TKT-…"), so the wallet still equals its ledger. The customer gets a reply with the reason and a
 * notification, and the ticket is resolved.
 */
supportRouter.post("/support/:id/credit/approve", async (req, res) => {
  const { admin, t } = await decider(req, "approve");
  if (t.refundState !== "PROPOSED" || t.state !== CREDIT_PROPOSED) throw conflict("There is no proposed wallet credit to approve.");
  const self = await blockSelf(t, admin, "approve");
  const [proposal, userId, max] = await Promise.all([creditProposal(t.id), creditCustomer(t), creditMax()]);
  if (!proposal) throw conflict("The proposed credit's details are missing. Decline it and propose it again.");
  if (!userId) throw conflict("The customer of this ticket no longer has an account.");
  const amount = t.refundAmount;
  if (amount < 1) throw conflict("The proposed amount is missing. Decline it and propose it again.");
  if (amount > max) throw conflict(`${rupee(amount)} is more than the ${rupee(max)} one ticket may credit now. Decline it and propose it again.`);
  const bucket = CREDIT_BUCKETS[proposal.bucket];
  let ref = makeRef("SCR");
  while (await db.transaction.findUnique({ where: { ref } })) ref = makeRef("SCR");
  const now = new Date();
  const text = `We've credited ${rupee(amount)} to your AstroRize wallet (${bucket} balance). ${proposal.reason}`;
  await db.$transaction(async (tx) => {
    // Only while it is still proposed: a decline, a rejection or a second approver at the same moment wins once.
    const { count } = await tx.supportTicket.updateMany({
      where: { id: t.id, refundState: "PROPOSED", state: CREDIT_PROPOSED },
      data: {
        refundState: "INITIATED",
        state: "RESOLVED",
        closedAs: "RESOLVED",
        approvedBy: actorName(admin),
        resolution: WALLET_CREDIT,
        awaitingCustomer: false,
        lastActivityAt: now,
      },
    });
    if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
    const service = proposal.bucket === "SERVICE" ? amount : 0;
    const promo = amount - service;
    await tx.wallet.upsert({
      where: { userId },
      create: { userId, service, promo },
      update: { service: { increment: service }, promo: { increment: promo } },
    });
    // The wallet moves only together with its ledger line (Finance's wallet trial balance checks it).
    await tx.transaction.create({ data: { userId, type: `Credit from support · ${t.id}`, ref, bucket, amount, createdAt: now } });
    await tx.supportTicketMessage.create({
      data: { ticketId: t.id, author: "STAFF", authorId: admin.user.id, authorName: actorName(admin), team: admin.adminRole, internal: false, text, createdAt: now },
    });
  });
  await putSetting(creditKey(t.id), { ...proposal, txnRef: ref } satisfies CreditProposal);
  await audit(admin, "dispute.credit.approve", t.id, `CREDIT_PROPOSED → RESOLVED · ${rupee(amount)} credited to the customer's ${bucket} balance (${ref}) · ${proposal.reason}${self}`);
  await staffRemedyDecided(t, await refundProposerId(t.id), { approved: true, makeGood: false, credit: true }, { id: admin.user.id, name: actorName(admin) });
  await notify(userId, {
    kind: "wallet.credit",
    title: `${rupee(amount)} credited to your wallet`,
    body: `Issue ${t.id}: ${proposal.reason} It's in your ${bucket} balance.`,
    href: "/wallet",
  });
  res.json({ ok: true, actor: actorName(admin), amount: rupee(amount), bucket, ref });
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
  await workableTicket(req);
  const withdrawn = t.refundState === "PROPOSED";
  const what =
    t.state === MAKEGOOD_PROPOSED ? "free replacement call" : t.state === CREDIT_PROPOSED ? `wallet credit of ${rupee(t.refundAmount)}` : `refund of ${rupee(t.refundAmount)}`;
  // Only if nobody approved it meanwhile.
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: t.refundState, state: t.state },
    data: { state: "RESOLVED", awaitingCustomer: false, lastActivityAt: new Date(), ...(withdrawn ? { refundState: "NONE", refundAmount: 0, proposedBy: null } : {}) },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "dispute.reject", t.id, `${t.state} → RESOLVED${withdrawn ? ` · proposed ${what} withdrawn` : ""} · ${reason}`);
  await tellCustomer(t, "support.status", `Issue ${t.id} was reviewed and closed`, "We reviewed your issue and closed it. Open it to see the details.");
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
  await workableTicket(req);
  if (t.refundState !== "NONE") throw conflict(`A ${remedyWord(t)} is proposed on ${t.id}. Approve, decline or reject it instead.`);
  const granted = await grantedElsewhere(t);
  if (!granted) throw conflict(`Nothing has been given for ${t.sessionRef} on another ticket, so ${t.id} can't be closed as covered.`);
  // Only if nobody proposed something or closed it meanwhile.
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "NONE", state: t.state },
    data: { state: "RESOLVED", awaitingCustomer: false, lastActivityAt: new Date() },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "dispute.close.covered", t.id, `${t.state} → RESOLVED · ${remedyWord(granted)} already given for ${t.sessionRef} on ${granted.id}`);
  await tellCustomer(t, "support.status", `Issue ${t.id} was closed`, `This session was already settled on ${granted.id}, so we've closed this issue.`);
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
  const self = await blockSelf(t, admin, "decide");
  const makeGood = t.state === MAKEGOOD_PROPOSED;
  const credit = t.state === CREDIT_PROPOSED;
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "PROPOSED", state: t.state },
    data: { refundState: "NONE", state: "INVESTIGATING", refundAmount: 0, proposedBy: null },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(
    admin,
    makeGood ? "dispute.makegood.decline" : credit ? "dispute.credit.decline" : "dispute.refund.decline",
    t.id,
    `${t.state} → INVESTIGATING · ${makeGood ? "free replacement call not given" : credit ? `${rupee(t.refundAmount)} wallet credit not given` : `${rupee(t.refundAmount)} not refunded`} · ${reason}${self}`,
  );
  await staffRemedyDecided(t, await refundProposerId(t.id), { approved: false, makeGood, credit, reason }, { id: admin.user.id, name: actorName(admin) });
  res.json({ ok: true });
});

// ── Working a customer issue: reply, internal note, forward, resolve ──

/** An in-app notification to the customer who raised the ticket (none for astrologer / staff reports). */
async function tellCustomer(t: { id: string; customerId: string | null }, kind: string, title: string, body: string) {
  const userId = await customerOf(t);
  if (userId) await notify(userId, { kind, title, body, href: `/support/${t.id}` });
}

const textBody = (what: string, max: number) =>
  z
    .string({ error: `Write the ${what}.` })
    .trim()
    .min(2, `Write the ${what}.`)
    .max(max, `Keep the ${what} to ${max.toLocaleString("en-IN")} characters.`);

/** Writes a staff message on a ticket (a reply the customer sees, or an internal note). */
async function staffMessage(admin: ReturnType<typeof requirePage>, ticketId: string, text: string, internal: boolean) {
  return db.supportTicketMessage.create({
    data: { ticketId, author: "STAFF", authorId: admin.user.id, authorName: actorName(admin), team: admin.adminRole, internal, text },
  });
}

/**
 * Reply to the customer (they see it, from the team — never the person's name). `waitForCustomer`
 * marks it "Waiting for you" until they answer.
 */
supportRouter.post("/support/:id/reply", async (req, res) => {
  const { admin, t } = await workableTicket(req);
  const { text, waitForCustomer } = z.object({ text: textBody("reply", 2000), waitForCustomer: z.boolean().default(false) }).parse(req.body);
  if (!(await customerOf(t))) throw conflict(`${t.id} wasn't raised by a customer, so there is no one to reply to. Add an internal note instead.`);
  await staffMessage(admin, t.id, text, false);
  await db.supportTicket.update({ where: { id: t.id }, data: { awaitingCustomer: waitForCustomer, lastActivityAt: new Date() } });
  await audit(admin, "support.ticket.reply", t.id, `replied to the customer${waitForCustomer ? " · waiting for their answer" : ""}`);
  await tellCustomer(t, "support.reply", `New reply on issue ${t.id}`, `${CUSTOMER_TEAM[isTeam(admin.adminRole) ? admin.adminRole : "support"]}: ${text}`);
  res.status(201).json({ ok: true });
});

/** A staff-only note (never shown to the customer). Anyone who can see the ticket may add one, even once closed. */
supportRouter.post("/support/:id/note", async (req, res) => {
  const { admin, t } = await visibleTicket(req);
  const { text } = z.object({ text: textBody("note", 2000) }).parse(req.body);
  await staffMessage(admin, t.id, text, true);
  await audit(admin, "support.ticket.note", t.id, "internal note added");
  res.status(201).json({ ok: true });
});

/**
 * Forward to another team (or send it back to Support) with an internal note saying why. The
 * receiving team sees it in its queue; the customer sees which team has it now.
 */
supportRouter.post("/support/:id/forward", async (req, res) => {
  const { admin, t } = await workableTicket(req);
  const { team, note } = z.object({ team: z.string().trim(), note: textBody("note for the team", 1000) }).parse(req.body);
  if (!isTeam(team) || !forwardTargets(t.assignedTeam).includes(team)) throw conflict(`${t.id} can't be forwarded there.`);
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, assignedTeam: t.assignedTeam, state: t.state },
    data: { assignedTeam: team, lastActivityAt: new Date() },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  await audit(admin, "support.ticket.forward", t.id, `${t.assignedTeam} → ${team} · ${note}`);
  await staffForwarded(t, team, note, { id: admin.user.id, name: actorName(admin) });
  await tellCustomer(t, "support.status", `Issue ${t.id} is with our ${CUSTOMER_TEAM[team]}`, `We've passed your issue to our ${CUSTOMER_TEAM[team]}. They'll reply on the issue.`);
  res.json({ ok: true, team, teamLabel: teamLabel(team) });
});

/**
 * Resolve (sorted out) or close (no further action) with a message to the customer. A proposed
 * refund or free call has to be decided or withdrawn first. On a ticket about a session this closes
 * that session's dispute for good, like a rejection.
 */
supportRouter.post("/support/:id/resolve", async (req, res) => {
  const { admin, t } = await workableTicket(req);
  const { outcome, message } = z.object({ outcome: z.enum(["RESOLVED", "CLOSED"]), message: textBody("message to the customer", 2000) }).parse(req.body);
  if (t.refundState !== "NONE") throw conflict(`A ${remedyWord(t)} is proposed on ${t.id}. Approve, decline or reject it first.`);
  const hasCustomer = !!(await customerOf(t));
  const { count } = await db.supportTicket.updateMany({
    where: { id: t.id, refundState: "NONE", state: t.state },
    data: { state: "RESOLVED", closedAs: outcome, awaitingCustomer: false, lastActivityAt: new Date() },
  });
  if (!count) throw conflict(`${t.id} was just updated by someone else. Reload and check it.`);
  // Without a customer (an astrologer's report) the message is kept as an internal note.
  await staffMessage(admin, t.id, message, !hasCustomer);
  await audit(admin, outcome === "RESOLVED" ? "support.ticket.resolve" : "support.ticket.close", t.id, `${t.state} → RESOLVED (${outcome.toLowerCase()}) · ${message.slice(0, 160)}`);
  await tellCustomer(t, "support.status", `Issue ${t.id} ${outcome === "RESOLVED" ? "is resolved" : "was closed"}`, message);
  res.json({ ok: true });
});
