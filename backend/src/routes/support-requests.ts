import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { audit } from "../lib/audit.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { istDate, istDayMonth, istTime, makeRef, rupee } from "../lib/format.ts";
import { CHAT_MAX_PHOTO_BYTES, deletePrivateFiles, IMAGE_TYPES, savePrivateFile, sniffImage } from "../lib/media.ts";
import { displayName } from "../lib/profile.ts";
import { rateLimit } from "../lib/safety.ts";
import { configNumber } from "../lib/settings.ts";
import { staffCustomerReplied, staffNewIssue } from "../lib/staff-notifications.ts";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  categoryLabel,
  customerStatus,
  customerTicketWhere,
  customerTimeline,
  hasSession,
  isOpen,
  RAISE_ACTION,
  type Category,
} from "../lib/tickets.ts";
import { requireRole } from "../middleware/auth.ts";
import type { SupportTicket } from "../generated/prisma/client.ts";

// Customer support issues.
//
// 1. Billing issues (Wallet → a consultation line → "Raise a billing issue", as in the app prototype
//    APP-DSP-001): about one paid consultation. Support reviews it and may propose a refund (to the
//    wallet) or a free replacement call, which a second person approves (routes/admin/support.ts).
//    A refund is never automatic.
// 2. Help & support (/support): any issue — payments, wallet, a consultation, an astrologer's
//    behaviour, the account, a technical problem — optionally about one of the customer's recent
//    sessions or recharges, with a screenshot. It lands with Support, who may forward it to another
//    team (lib/tickets.ts). The customer follows it as a conversation and replies while it is open.
// Both are SupportTickets; both appear under "My issues".
//
// Client decisions (Nov 2026): an issue about a session can be raised only within
// `support.dispute_window_days` (default 7) days after the session ended, and once an issue about a
// session was reviewed and rejected, that session's dispute is closed for good — no new request can
// be raised about it. Free sessions (₹0 charged) never qualify for a billing issue.
// A customer whose account is blocked (contact sharing) can still raise and follow issues.
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

/** The wallet's billing categories (prototype APP-DSP-001), and the Help & support category each is. */
const BILLING_CATEGORIES = ["Session quality", "Charged incorrectly", "Duplicate charge", "Wallet"] as const;
const BILLING_AS: Record<(typeof BILLING_CATEGORIES)[number], Category> = {
  "Session quality": "CONSULTATION",
  "Charged incorrectly": "PAYMENT_REFUND",
  "Duplicate charge": "PAYMENT_REFUND",
  Wallet: "WALLET",
};

const raiseBody = z.object({
  /** The consultation's reference, as on the wallet line (e.g. "SES-48213"). */
  ref: z.string().trim().min(1).max(40),
  category: z.enum(BILLING_CATEGORIES, { error: "Choose what the issue is about." }),
  note: z
    .string({ error: "Tell us what happened." })
    .trim()
    .min(10, "Tell us what happened in a few words (at least 10 characters).")
    .max(500, "Keep it to 500 characters."),
});

/** A new ticket id (TKT-1234), unique. */
async function newTicketId() {
  let id = makeRef("TKT", 4);
  while (await db.supportTicket.findUnique({ where: { id } })) id = makeRef("TKT", 4);
  return id;
}

async function firstResponseDue() {
  const slaMins = await configNumber("support.sla.first_response_mins", 30);
  return new Date(Date.now() + Math.max(5, slaMins) * 60_000);
}

/**
 * The checks before an issue is raised about one of the customer's sessions: theirs, ended, inside
 * the window, not closed for good after a rejection, not already settled, and no other issue open
 * about it. `charged` = a billing issue (a free session has nothing to refund).
 */
async function sessionForIssue(userId: string, ref: string, charged: boolean) {
  const c = await db.consultation.findUnique({
    where: { ref },
    select: { ref: true, customerId: true, customerAlias: true, status: true, total: true, endedAt: true },
  });
  if (!c || c.customerId !== userId) throw notFound("We couldn't find that consultation on your account.");
  if (c.status !== "ENDED") throw conflict("You can raise an issue once the consultation has ended.");
  if (charged && c.total <= 0) throw conflict("Nothing was charged for this consultation, so there is nothing to refund.");
  const days = await disputeWindowDays();
  const until = c.endedAt ? disputeDeadline(c.endedAt, days) : null;
  if (!until || until.getTime() < Date.now()) {
    throw conflict(
      `Issues about a session can be raised within ${days} ${days === 1 ? "day" : "days"} after it ends${until ? ` — for ${c.ref} that was until ${deadlineLabel(until)}` : ""}.`,
    );
  }
  // A rejected dispute is final for the session, whichever ticket it came through.
  const rejected = await db.supportTicket.findFirst({ where: { sessionRef: c.ref, state: "RESOLVED", resolution: null } });
  if (rejected) throw conflict(REVIEWED_AND_CLOSED);
  const open = await db.supportTicket.findFirst({ where: { sessionRef: c.ref, state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, refundState: { not: "INITIATED" } } });
  if (open) throw conflict(`You already have a request open for ${c.ref} (${open.id}). We'll update you there.`);
  const granted = await db.supportTicket.findFirst({ where: { sessionRef: c.ref, refundState: "INITIATED" } });
  if (granted) throw conflict(`${c.ref} was already settled on ${granted.id}.`);
  return c;
}

/** Sessions ended inside the window that already had their dispute rejected (closed) or a remedy given (settled). */
async function decidedSessions(refs: string[]) {
  const decided = refs.length
    ? await db.supportTicket.findMany({
        where: { sessionRef: { in: refs }, OR: [{ state: "RESOLVED", resolution: null }, { refundState: "INITIATED" }] },
        select: { sessionRef: true, refundState: true },
      })
    : [];
  return {
    closed: new Set(decided.filter((t) => t.refundState !== "INITIATED").map((t) => t.sessionRef)),
    settled: new Set(decided.filter((t) => t.refundState === "INITIATED").map((t) => t.sessionRef)),
  };
}

const modeLabel = (s: { kind: string; mode: string }) =>
  s.kind === "INSTANT" ? "Instant Call" : s.mode === "VIDEO" ? "Video" : s.mode === "VOICE" ? "Voice" : "Chat";

/** Where a billing request stands, in the customer's words (staff notes and who decided stay internal). */
function statusOf(t: SupportTicket) {
  const s = customerStatus(t);
  // The wallet keeps its own wording while a billing issue is being worked on.
  if (s.tone === "now") return { label: "Under review", tone: "now" as const, body: "Our Support team is looking into it. A refund is reviewed — it is not automatic." };
  if (s.tone === "wait") return { ...s, tone: "now" as const };
  if (s.tone === "fail") return { ...s, label: "Reviewed and closed" };
  return s as { label: string; tone: "now" | "done" | "fail"; body: string };
}

supportRequestsRouter.get("/support/requests", async (req, res) => {
  const auth = requireRole(req, "customer");
  const now = new Date();
  const days = await disputeWindowDays();
  const [tickets, recent] = await Promise.all([
    db.supportTicket.findMany({ where: { AND: [await customerTicketWhere(auth.user.id), { sessionRef: { not: "—" } }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    // Charged sessions that ended inside the window: the ones an issue can still be raised about.
    db.consultation.findMany({
      where: { customerId: auth.user.id, status: "ENDED", total: { gt: 0 }, endedAt: { gt: new Date(now.getTime() - days * 86_400_000) } },
      select: { ref: true, endedAt: true },
      orderBy: { endedAt: "desc" },
      take: 200,
    }),
  ]);
  const sessions = await db.consultation.findMany({
    where: { customerId: auth.user.id, ref: { in: tickets.map((t) => t.sessionRef) } },
    select: { ref: true, mode: true, kind: true, total: true, astrologer: { select: { name: true } } },
  });
  const bySession = new Map(sessions.map((s) => [s.ref, s]));
  // Sessions whose dispute was rejected (on any ticket, however it was raised) stay closed; sessions
  // that already had a refund or free replacement call approved are settled.
  const { closed, settled } = await decidedSessions(recent.map((c) => c.ref));
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
    requests: tickets.flatMap((t) => {
      const s = bySession.get(t.sessionRef);
      return s
        ? [
            {
              id: t.id,
              sessionRef: t.sessionRef,
              subject: t.subject,
              astrologer: s.astrologer.name,
              mode: modeLabel(s),
              billed: s.total,
              raisedOn: istDate(t.createdAt),
              status: statusOf(t),
            },
          ]
        : [];
    }),
  });
});

supportRequestsRouter.post("/support/requests", async (req, res) => {
  const auth = requireRole(req, "customer");
  const { ref, category, note } = raiseBody.parse(req.body);
  rateLimit(`support-request:${auth.user.id}`, 5, 60 * 60_000, "You've raised several requests in the last hour. Wait a little, or message us from an open one.");
  const c = await sessionForIssue(auth.user.id, ref, true);
  const id = await newTicketId();
  await db.supportTicket.create({
    data: {
      id,
      subject: `${category} — ${note}`,
      state: "INVESTIGATING",
      slaDueAt: await firstResponseDue(),
      customerAlias: c.customerAlias,
      sessionRef: c.ref,
      customerId: auth.user.id,
      category: BILLING_AS[category],
      description: note,
    },
  });
  await audit(auth, RAISE_ACTION, id, `customer raised · ${category} · ${c.ref} (billed ${rupee(c.total)})`);
  await staffNewIssue({ id, subject: `${category} · ${c.ref}: ${note}`, customerAlias: c.customerAlias }, CATEGORIES[BILLING_AS[category]].label);
  res.status(201).json({ request: { id, sessionRef: c.ref } });
});

// ── Help & support ──

const SUBJECT_MAX = 120;
const DESCRIPTION_MAX = 2000;
const MESSAGE_MAX = 2000;
/** How far back the "related recharge" picker lists payments. */
const PAYMENT_LOOKBACK_DAYS = 90;

const paymentLabel = (p: { amount: number; status: string; createdAt: Date }) =>
  `${rupee(p.amount)} recharge · ${istDayMonth(p.createdAt)} · ${p.status === "PAID" ? "paid" : p.status === "FAILED" ? "failed" : "not completed"}`;

const issueBody = z.object({
  category: z.enum(CATEGORY_KEYS, { error: "Choose what the issue is about." }),
  subject: z
    .string({ error: "Give your issue a short title." })
    .trim()
    .min(5, "Give your issue a short title (at least 5 characters).")
    .max(SUBJECT_MAX, `Keep the title to ${SUBJECT_MAX} characters.`),
  description: z
    .string({ error: "Tell us what happened." })
    .trim()
    .min(10, "Tell us what happened in a few words (at least 10 characters).")
    .max(DESCRIPTION_MAX, `Keep it to ${DESCRIPTION_MAX.toLocaleString("en-IN")} characters.`),
  /** One of their own sessions (e.g. "SES-48213"), or nothing. */
  sessionRef: z.string().trim().max(40).optional().nullable(),
  /** One of their own recharges (Payment id), or nothing. */
  paymentId: z.string().trim().max(40).optional().nullable(),
});

const OPEN_WHERE = { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, refundState: { not: "INITIATED" } };

/** What the form offers: categories, and the recent sessions and recharges an issue can be about. */
supportRequestsRouter.get("/support/issues/options", async (req, res) => {
  const auth = requireRole(req, "customer");
  const days = await disputeWindowDays();
  const now = Date.now();
  const [sessions, payments, openTickets] = await Promise.all([
    db.consultation.findMany({
      where: { customerId: auth.user.id, status: "ENDED", endedAt: { gt: new Date(now - days * 86_400_000) } },
      select: { ref: true, endedAt: true, total: true, mode: true, kind: true, astrologer: { select: { name: true } } },
      orderBy: { endedAt: "desc" },
      take: 30,
    }),
    db.payment.findMany({
      where: { userId: auth.user.id, createdAt: { gt: new Date(now - PAYMENT_LOOKBACK_DAYS * 86_400_000) } },
      select: { id: true, amount: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.supportTicket.findMany({ where: { AND: [await customerTicketWhere(auth.user.id), OPEN_WHERE] }, select: { id: true, sessionRef: true, paymentId: true } }),
  ]);
  const { closed, settled } = await decidedSessions(sessions.map((s) => s.ref));
  const openBySession = new Map(openTickets.filter(hasSession).map((t) => [t.sessionRef, t.id]));
  const openByPayment = new Map(openTickets.filter((t) => t.paymentId).map((t) => [t.paymentId!, t.id]));
  res.json({
    windowDays: days,
    categories: CATEGORY_KEYS.map((key) => ({ key, label: CATEGORIES[key].label })),
    sessions: sessions.map((s) => {
      const until = disputeDeadline(s.endedAt!, days);
      const blocked = closed.has(s.ref)
        ? "Reviewed and closed"
        : settled.has(s.ref)
          ? "Already settled"
          : openBySession.has(s.ref)
            ? `Issue ${openBySession.get(s.ref)} is open`
            : null;
      return {
        ref: s.ref,
        label: `${modeLabel(s)} with ${s.astrologer.name} · ${istDayMonth(s.endedAt!)} · ${s.total > 0 ? rupee(s.total) : "free"}`,
        charged: s.total > 0,
        untilLabel: deadlineLabel(until),
        /** Why an issue can't be raised about it now (null = it can). */
        blocked,
      };
    }),
    payments: payments.map((p) => ({ id: p.id, label: paymentLabel(p), blocked: openByPayment.has(p.id) ? `Issue ${openByPayment.get(p.id)} is open` : null })),
  });
});

/** Raise an issue from Help & support. It lands with Support. */
supportRequestsRouter.post("/support/issues", async (req, res) => {
  const auth = requireRole(req, "customer");
  const body = issueBody.parse(req.body);
  if (body.sessionRef && body.paymentId) throw badRequest("Choose either a session or a recharge, not both.");
  rateLimit(`support-issue:${auth.user.id}`, 5, 60 * 60_000, "You've raised several issues in the last hour. Wait a little, or reply on one you already raised.");
  const session = body.sessionRef ? await sessionForIssue(auth.user.id, body.sessionRef, body.category === "PAYMENT_REFUND") : null;
  let payment: { id: string; amount: number; status: string; createdAt: Date } | null = null;
  if (body.paymentId) {
    payment = await db.payment.findFirst({ where: { id: body.paymentId, userId: auth.user.id }, select: { id: true, amount: true, status: true, createdAt: true } });
    if (!payment) throw notFound("We couldn't find that recharge on your account.");
    const open = await db.supportTicket.findFirst({ where: { paymentId: payment.id, ...OPEN_WHERE } });
    if (open) throw conflict(`You already have an issue open about this recharge (${open.id}). We'll update you there.`);
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  const id = await newTicketId();
  await db.supportTicket.create({
    data: {
      id,
      subject: body.subject,
      description: body.description,
      category: body.category,
      state: "INVESTIGATING",
      slaDueAt: await firstResponseDue(),
      // Staff see who it is from; a session's alias when it is about one.
      customerAlias: session?.customerAlias ?? displayName(user),
      sessionRef: session?.ref ?? "—",
      paymentId: payment?.id ?? null,
      customerId: auth.user.id,
      customerReadAt: new Date(),
    },
  });
  await audit(
    auth,
    RAISE_ACTION,
    id,
    `customer raised · ${CATEGORIES[body.category].label}${session ? ` · ${session.ref}` : ""}${payment ? ` · ${paymentLabel(payment)}` : ""}`,
  );
  await staffNewIssue({ id, subject: body.subject, customerAlias: session?.customerAlias ?? displayName(user) }, CATEGORIES[body.category].label);
  res.status(201).json({ issue: { id } });
});

/** The customer's tickets in a list ("My issues"), newest activity first. */
supportRequestsRouter.get("/support/issues", async (req, res) => {
  const auth = requireRole(req, "customer");
  const tickets = await db.supportTicket.findMany({ where: await customerTicketWhere(auth.user.id), orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }], take: 100 });
  const lastReplies = tickets.length
    ? await db.supportTicketMessage.groupBy({ by: ["ticketId"], where: { ticketId: { in: tickets.map((t) => t.id) }, author: "STAFF", internal: false }, _max: { createdAt: true } })
    : [];
  const lastReply = new Map(lastReplies.map((r) => [r.ticketId, r._max.createdAt]));
  res.json({
    issues: tickets.map((t) => {
      const reply = lastReply.get(t.id);
      return {
        id: t.id,
        subject: t.description ? t.subject : t.subject.split(" — ")[0],
        category: categoryLabel(t.category),
        related: hasSession(t) ? `Session ${t.sessionRef}` : t.paymentId ? "A recharge" : null,
        raisedOn: istDate(t.createdAt),
        open: isOpen(t),
        status: customerStatus(t),
        /** A team reply the customer hasn't opened yet. */
        unread: !!reply && reply > (t.customerReadAt ?? t.createdAt),
      };
    }),
  });
});

async function myTicket(userId: string, id: string) {
  const t = await db.supportTicket.findFirst({ where: { AND: [{ id }, await customerTicketWhere(userId)] } });
  if (!t) throw notFound("We couldn't find that issue on your account.");
  return t;
}

/** One issue as a conversation. Opening it marks the team's replies read. Internal notes never leave the API. */
supportRequestsRouter.get("/support/issues/:id", async (req, res) => {
  const auth = requireRole(req, "customer");
  const t = await myTicket(auth.user.id, String(req.params.id));
  const [timeline, session, payment] = await Promise.all([
    customerTimeline(t),
    hasSession(t)
      ? db.consultation.findFirst({ where: { ref: t.sessionRef, customerId: auth.user.id }, select: { ref: true, total: true, mode: true, kind: true, endedAt: true, astrologer: { select: { name: true } } } })
      : null,
    t.paymentId ? db.payment.findFirst({ where: { id: t.paymentId, userId: auth.user.id }, select: { amount: true, status: true, createdAt: true } }) : null,
    db.supportTicket.update({ where: { id: t.id }, data: { customerReadAt: new Date() } }),
  ]);
  res.json({
    issue: {
      id: t.id,
      subject: t.description ? t.subject : t.subject.split(" — ")[0],
      category: categoryLabel(t.category),
      related: session
        ? `${modeLabel(session)} with ${session.astrologer.name} · ${session.ref} · ${session.total > 0 ? `billed ${rupee(session.total)}` : "free"}`
        : payment
          ? paymentLabel(payment)
          : hasSession(t)
            ? `Session ${t.sessionRef}`
            : null,
      raisedOn: istDate(t.createdAt),
      open: isOpen(t),
      status: customerStatus(t),
      timeline,
      maxMessage: MESSAGE_MAX,
    },
  });
});

const messageBody = z.object({
  text: z
    .string({ error: "Write your reply." })
    .trim()
    .min(1, "Write your reply.")
    .max(MESSAGE_MAX, `Keep it to ${MESSAGE_MAX.toLocaleString("en-IN")} characters.`),
});

async function addCustomerMessage(t: SupportTicket, userId: string, text: string, attachment: string | null) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();
  const [message] = await db.$transaction([
    db.supportTicketMessage.create({ data: { ticketId: t.id, author: "CUSTOMER", authorId: userId, authorName: displayName(user), text, attachment } }),
    // Their answer is in: the ticket is back with the team.
    db.supportTicket.update({ where: { id: t.id }, data: { awaitingCustomer: false, lastActivityAt: now, customerReadAt: now } }),
  ]);
  return message;
}

function assertCanReply(t: SupportTicket, userId: string) {
  if (!isOpen(t)) throw conflict("This issue is closed, so it can't take new replies. Raise a new issue if you still need help.");
  rateLimit(`support-reply:${userId}`, 20, 10 * 60_000, "You've sent a lot of replies just now. Give the team a moment to answer.");
}

/** The customer replies on an open issue. */
supportRequestsRouter.post("/support/issues/:id/messages", async (req, res) => {
  const auth = requireRole(req, "customer");
  const { text } = messageBody.parse(req.body);
  const t = await myTicket(auth.user.id, String(req.params.id));
  assertCanReply(t, auth.user.id);
  const m = await addCustomerMessage(t, auth.user.id, text, null);
  await staffCustomerReplied(t, text);
  res.status(201).json({ message: { id: m.id } });
});

const captionQuery = z.object({ caption: z.string().trim().max(MESSAGE_MAX).default("") });

/** Reads a raw image body; an oversized one gets a clear message. */
const readImage = express.raw({ type: Object.keys(IMAGE_TYPES), limit: CHAT_MAX_PHOTO_BYTES });
function imageBody(req: Request, res: Response, next: NextFunction) {
  readImage(req, res, (err?: unknown) => {
    if ((err as { status?: number } | undefined)?.status === 413) return next(badRequest(`Screenshots can be up to ${CHAT_MAX_PHOTO_BYTES / (1024 * 1024)} MB.`));
    next(err);
  });
}

/**
 * Attach a screenshot (JPEG, PNG or WebP, up to 5 MB, as the raw request body) to an open issue,
 * with an optional ?caption=. Kept private: only the customer and staff who can see the ticket open it.
 */
supportRequestsRouter.post(
  "/support/issues/:id/attachment",
  async (req, res, next) => {
    const auth = requireRole(req, "customer");
    const t = await myTicket(auth.user.id, String(req.params.id));
    assertCanReply(t, auth.user.id);
    res.locals.ticket = t;
    next();
  },
  imageBody,
  async (req, res) => {
    const auth = requireRole(req, "customer");
    const { caption } = captionQuery.parse(req.query);
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("Choose a screenshot (JPEG, PNG or WebP).");
    const type = sniffImage(body);
    if (!type) throw badRequest("That file isn't a picture (JPEG, PNG or WebP).");
    const name = await savePrivateFile(body, type);
    let m;
    try {
      m = await addCustomerMessage(res.locals.ticket as SupportTicket, auth.user.id, caption || "Screenshot", name);
    } catch (e) {
      await deletePrivateFiles([name]);
      throw e;
    }
    await staffCustomerReplied(res.locals.ticket as SupportTicket, caption ? `Screenshot · ${caption}` : "Sent a screenshot");
    res.status(201).json({ message: { id: m.id } });
  },
);
