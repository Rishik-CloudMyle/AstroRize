import { Router } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { audit } from "../lib/audit.ts";
import { conflict, notFound } from "../lib/errors.ts";
import { istDate, istTime, makeRef, rupee } from "../lib/format.ts";
import { rateLimit } from "../lib/safety.ts";
import { configNumber } from "../lib/settings.ts";
import { requireRole } from "../middleware/auth.ts";

// A customer raises a billing issue about one of their paid consultations (Wallet → a consultation
// line → "Raise a billing issue", as in the app prototype APP-DSP-001). It becomes a Support ticket
// on that session: Support reviews it and may propose a refund (to the wallet) or a free replacement
// call, which a second person approves (routes/admin/support.ts). A refund is never automatic.
//
// Client decisions (Nov 2026): an issue can be raised only within `support.dispute_window_days` (default
// 7) days after the session ended, and once an issue about a session was reviewed and rejected, that
// session's dispute is closed for good — no new request can be raised about it. Free sessions (₹0
// charged) never qualify.
export const supportRequestsRouter = Router();

/** Days after a session ends that a customer may raise a billing issue about it. */
export async function disputeWindowDays(): Promise<number> {
  return Math.max(1, Math.round(await configNumber("support.dispute_window_days", 7)));
}

/** The last moment an issue can be raised about a session that ended at `endedAt`. */
export const disputeDeadline = (endedAt: Date, days: number) => new Date(endedAt.getTime() + days * 86_400_000);

/** "10 Nov 2026, 14:05" — the deadline as customers see it (IST). */
const deadlineLabel = (d: Date) => `${istDate(d)}, ${istTime(d)}`;

const REVIEWED_AND_CLOSED = "This issue was reviewed and closed. A new request can't be raised for this session.";

/** The categories offered (prototype APP-DSP-001). */
const CATEGORIES = ["Session quality", "Charged incorrectly", "Duplicate charge", "Wallet"] as const;

const raiseBody = z.object({
  /** The consultation's reference, as on the wallet line (e.g. "SES-48213"). */
  ref: z.string().trim().min(1).max(40),
  category: z.enum(CATEGORIES, { error: "Choose what the issue is about." }),
  note: z
    .string({ error: "Tell us what happened." })
    .trim()
    .min(10, "Tell us what happened in a few words (at least 10 characters).")
    .max(500, "Keep it to 500 characters."),
});

const RAISE_ACTION = "support.ticket.raise";

/**
 * The requests this customer raised themselves (the audit entry written when they raised it says
 * who): reports an astrologer or staff opened about the same sessions are internal and not shown.
 */
async function ticketsOf(userId: string) {
  const raised = await db.auditLog.findMany({ where: { action: RAISE_ACTION, actorId: userId }, select: { object: true } });
  if (!raised.length) return [];
  const tickets = await db.supportTicket.findMany({ where: { id: { in: raised.map((r) => r.object) } }, orderBy: { createdAt: "desc" }, take: 50 });
  const sessions = await db.consultation.findMany({
    where: { customerId: userId, ref: { in: tickets.map((t) => t.sessionRef) } },
    select: { ref: true, mode: true, kind: true, total: true, astrologer: { select: { name: true } } },
  });
  const bySession = new Map(sessions.map((s) => [s.ref, s]));
  return tickets.flatMap((t) => {
    const s = bySession.get(t.sessionRef);
    return s ? [{ t, s }] : [];
  });
}

/** Where a request stands, in the customer's words (staff notes and who decided stay internal). */
function statusOf(t: { state: string; refundState: string; refundAmount: number; resolution: string | null }) {
  if (t.resolution === "MAKE_GOOD") return { label: "Free replacement call given", tone: "done", body: "Book it from the astrologer's profile — see your notifications for how long it is valid." };
  if (t.resolution === "REFUND" || t.refundState === "INITIATED") {
    return { label: t.refundAmount > 0 ? `${rupee(t.refundAmount)} refunded` : "Refunded", tone: "done", body: "The refund is back in your AstroRize wallet." };
  }
  if (t.state === "RESOLVED") return { label: "Reviewed and closed", tone: "fail", body: "This issue was reviewed and closed — the original charge stands. A new request can't be raised for this session." };
  return { label: "Under review", tone: "now", body: "Our support team is looking into it. A refund is reviewed — it is not automatic." };
}

supportRequestsRouter.get("/support/requests", async (req, res) => {
  const auth = requireRole(req, "customer");
  const now = new Date();
  const days = await disputeWindowDays();
  const [rows, recent] = await Promise.all([
    ticketsOf(auth.user.id),
    // Charged sessions that ended inside the window: the ones an issue can still be raised about.
    db.consultation.findMany({
      where: { customerId: auth.user.id, status: "ENDED", total: { gt: 0 }, endedAt: { gt: new Date(now.getTime() - days * 86_400_000) } },
      select: { ref: true, endedAt: true },
      orderBy: { endedAt: "desc" },
      take: 200,
    }),
  ]);
  // Sessions whose dispute was rejected (on any ticket, however it was raised) stay closed; sessions
  // that already had a refund or free replacement call approved are settled.
  const decided = recent.length
    ? await db.supportTicket.findMany({
        where: { sessionRef: { in: recent.map((c) => c.ref) }, OR: [{ state: "RESOLVED", resolution: null }, { refundState: "INITIATED" }] },
        select: { sessionRef: true, refundState: true },
      })
    : [];
  const closed = new Set(decided.filter((t) => t.refundState !== "INITIATED").map((t) => t.sessionRef));
  const settled = new Set(decided.filter((t) => t.refundState === "INITIATED").map((t) => t.sessionRef));
  res.json({
    /** How many days after a session ends an issue can be raised (Config support.dispute_window_days). */
    windowDays: days,
    /** Sessions an issue can still be raised about, with the deadline (sessions not listed: too late or closed). */
    raisable: recent
      .filter((c) => c.endedAt && !closed.has(c.ref) && !settled.has(c.ref))
      .map((c) => {
        const until = disputeDeadline(c.endedAt!, days);
        return { ref: c.ref, until: until.toISOString(), untilLabel: deadlineLabel(until) };
      }),
    /** Recent sessions whose dispute was reviewed and rejected: closed for good. */
    closed: [...closed],
    /** Recent sessions already settled with a refund or free replacement call. */
    settled: [...settled],
    requests: rows.map(({ t, s }) => ({
      id: t.id,
      sessionRef: t.sessionRef,
      subject: t.subject,
      astrologer: s.astrologer.name,
      mode: s.kind === "INSTANT" ? "Instant Call" : s.mode === "VIDEO" ? "Video" : s.mode === "VOICE" ? "Voice" : "Chat",
      billed: s.total,
      raisedOn: istDate(t.createdAt),
      status: statusOf(t),
    })),
  });
});

supportRequestsRouter.post("/support/requests", async (req, res) => {
  const auth = requireRole(req, "customer");
  const { ref, category, note } = raiseBody.parse(req.body);
  rateLimit(`support-request:${auth.user.id}`, 5, 60 * 60_000, "You've raised several requests in the last hour. Wait a little, or message us from an open one.");
  const c = await db.consultation.findUnique({
    where: { ref },
    select: { ref: true, customerId: true, customerAlias: true, status: true, total: true, endedAt: true },
  });
  if (!c || c.customerId !== auth.user.id) throw notFound("We couldn't find that consultation on your account.");
  if (c.status !== "ENDED") throw conflict("You can raise an issue once the consultation has ended.");
  if (c.total <= 0) throw conflict("Nothing was charged for this consultation, so there is nothing to refund.");
  const days = await disputeWindowDays();
  const until = c.endedAt ? disputeDeadline(c.endedAt, days) : null;
  if (!until || until.getTime() < Date.now()) {
    throw conflict(
      `Billing issues can be raised within ${days} ${days === 1 ? "day" : "days"} after a session ends${until ? ` — for ${c.ref} that was until ${deadlineLabel(until)}` : ""}.`,
    );
  }
  // A rejected dispute is final for the session, whichever ticket it came through.
  const rejected = await db.supportTicket.findFirst({ where: { sessionRef: c.ref, state: "RESOLVED", resolution: null } });
  if (rejected) throw conflict(REVIEWED_AND_CLOSED);
  const open = await db.supportTicket.findFirst({ where: { sessionRef: c.ref, state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, refundState: { not: "INITIATED" } } });
  if (open) throw conflict(`You already have a request open for ${c.ref} (${open.id}). We'll update you there.`);
  const granted = await db.supportTicket.findFirst({ where: { sessionRef: c.ref, refundState: "INITIATED" } });
  if (granted) throw conflict(`${c.ref} was already settled on ${granted.id}.`);

  let id = makeRef("TKT", 4);
  while (await db.supportTicket.findUnique({ where: { id } })) id = makeRef("TKT", 4);
  const slaMins = await configNumber("support.sla.first_response_mins", 30);
  await db.supportTicket.create({
    data: {
      id,
      subject: `${category} — ${note}`,
      state: "INVESTIGATING",
      slaDueAt: new Date(Date.now() + Math.max(5, slaMins) * 60_000),
      customerAlias: c.customerAlias,
      sessionRef: c.ref,
    },
  });
  await audit(auth, RAISE_ACTION, id, `customer raised · ${category} · ${c.ref} (billed ${rupee(c.total)})`);
  res.status(201).json({ request: { id, sessionRef: c.ref } });
});
