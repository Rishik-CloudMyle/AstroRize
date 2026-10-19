import { randomUUID } from "node:crypto";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../config.ts";
import { db } from "../db.ts";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.ts";
import {
  ELIGIBILITY_MINUTES,
  GST_RATE,
  MAX_SESSION_SECONDS,
  affordableSeconds,
  instantRate,
  rateFor,
  type Mode,
} from "../lib/billing.ts";
import { byNameMatch, istDate, istDateKey, makeRef, rupee } from "../lib/format.ts";
import { IMAGE_TYPES, MAX_PHOTO_BYTES, deleteMedia, saveImage, sniffImage } from "../lib/media.ts";
import { GENDERS, ageOn, dateKey, initialsOf, ownProfileView } from "../lib/profile.ts";
import { rateLimit } from "../lib/safety.ts";
import { consultMessageBody, consultationFor, listMessages, mediaFor, sendMessage } from "../lib/consult-room.ts";
import {
  checkSendRate,
  directText,
  directThreadFor,
  isMessageable,
  lastDelivered,
  messageText,
  messageView,
  postMessage,
  replyDirect,
  teamConversations,
  teamThreadView,
  unreadFrom,
  visibleTo,
} from "../lib/messaging.ts";
import {
  acceptBy,
  endConsultation,
  expireStaleRequests,
  extendHold,
  freeWindow,
  lockKey,
  openConsultationOf,
  sessionCapSeconds,
  settlementView,
} from "../lib/consultations.ts";
import { COMPLIMENTARY, WELCOME_MODES, consumeWelcome, freeCallRefusal, reserveWelcome, welcomePolicy, welcomeView } from "../lib/welcome.ts";
import { effectivePresence, syncPresence } from "../lib/presence.ts";
import { astrologerView } from "./catalog.ts";
import { configNumber } from "../lib/settings.ts";
import { roleGuard, type AuthContext } from "../middleware/auth.ts";
import { accountStatus, deactivateAccount, deleteAccount } from "../lib/account.ts";
import { verifyPassword } from "../lib/password.ts";
import { clearSessionCookie } from "../lib/session.ts";
import { consumeOtp, issueOtp } from "./auth.ts";
import type { Astrologer, Consultation, Prisma } from "../generated/prisma/client.ts";

// Everything here belongs to a signed-in customer.
export const customerRouter = Router();
customerRouter.use(["/wallet", "/consultations", "/instant-calls", "/me", "/messages"], roleGuard("customer"));

const auth = (req: Request) => req.auth as AuthContext;

async function uniqueRef(prefix: string, exists: (ref: string) => Promise<boolean>): Promise<string> {
  for (;;) {
    const ref = makeRef(prefix);
    if (!(await exists(ref))) return ref;
  }
}
const txRef = (prefix: string) => uniqueRef(prefix, async (ref) => !!(await db.transaction.findUnique({ where: { ref } })));

async function walletOf(userId: string) {
  return db.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
}

// ── Wallet ──

async function walletView(userId: string) {
  const [wallet, transactions, welcome] = await Promise.all([
    walletOf(userId),
    db.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    welcomeView(userId),
  ]);
  return {
    /** The welcome free call (null when this account never had one). */
    welcome,
    service: wallet.service,
    promo: wallet.promo,
    held: wallet.held,
    promoExpires: wallet.promoExpiresAt ? istDate(wallet.promoExpiresAt) : null,
    transactions: transactions.map((t) => ({ date: istDate(t.createdAt), type: t.type, ref: t.ref, bucket: t.bucket, amount: t.amount })),
  };
}

customerRouter.get("/wallet", async (req, res) => {
  res.json({ wallet: await walletView(auth(req).user.id) });
});

customerRouter.get("/wallet/denominations", async (_req, res) => {
  const list = await db.denomination.findMany({ where: { enabled: true }, orderBy: { amount: "asc" } });
  res.json({ denominations: list.map((d) => ({ amount: d.amount, bonus: d.bonus })), gstRate: GST_RATE });
});

/**
 * Step 1 of a recharge: create a payment order. With the real gateway (Razorpay) the
 * browser opens its checkout with this order id; until the keys exist a stand-in
 * provider ("mock") is used and step 2 confirms the payment.
 */
customerRouter.post("/wallet/recharge", async (req, res) => {
  // ⚠ Until Razorpay is connected, recharges only work outside production.
  if (!config.mockPayments) throw new HttpError(503, "Recharges aren't available yet. Please try again later.", "unavailable");
  const { amount } = z.object({ amount: z.number().int().positive() }).parse(req.body);
  const denom = await db.denomination.findUnique({ where: { amount } });
  if (!denom?.enabled) throw badRequest("That recharge amount isn't available.");
  const gst = Math.round(amount * GST_RATE);
  const payment = await db.payment.create({
    data: {
      userId: auth(req).user.id,
      amount,
      gst,
      bonus: denom.bonus,
      total: amount + gst,
      provider: "mock",
      providerOrderId: `order_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
    },
  });
  res.status(201).json({ orderId: payment.providerOrderId, amount, gst, bonus: denom.bonus, total: payment.total, provider: payment.provider });
});

/** Step 2: the payment succeeded. Credits the wallet exactly once (safe to retry). */
customerRouter.post("/wallet/recharge/:orderId/confirm", async (req, res) => {
  const userId = auth(req).user.id;
  const payment = await db.payment.findUnique({ where: { providerOrderId: String(req.params.orderId) } });
  if (!payment || payment.userId !== userId) throw notFound("Payment not found.");
  // The real gateway confirms payments through its signed webhook, never this route.
  if (payment.provider === "mock" && !config.mockPayments) throw new HttpError(503, "Recharges aren't available yet.", "unavailable");

  if (payment.status !== "PAID") {
    const [payRef, bonusRef] = await Promise.all([txRef("PAY"), txRef("CMP")]);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      db.payment.update({ where: { id: payment.id, status: "CREATED" }, data: { status: "PAID", paidAt: new Date() } }),
      db.wallet.update({
        where: { userId },
        data: { service: { increment: payment.amount }, promo: { increment: payment.bonus } },
      }),
      db.transaction.create({ data: { userId, type: "Recharge", ref: payRef, bucket: "Service", amount: payment.amount } }),
    ];
    if (payment.bonus > 0) {
      ops.push(db.transaction.create({ data: { userId, type: "Cashback", ref: bonusRef, bucket: "Promotional", amount: payment.bonus } }));
    }
    try {
      await db.$transaction(ops);
    } catch {
      // Another request confirmed it first — the wallet was credited once.
    }
  }
  // Recharged during a consultation: the new money is held for it, so it carries on without disconnecting.
  await extendHold(userId);
  res.json({ credited: payment.amount, bonus: payment.bonus, wallet: await walletView(userId) });
});

// ── Consultations ──
// A customer has at most one open consultation (requested, connecting or in session) at a
// time, across all astrologers. The website freezes every other consult button meanwhile,
// and these routes refuse a second one even if two tabs try at the same moment.

const modeSchema = z.enum(["CHAT", "VOICE", "VIDEO"]);

const newRef = () => uniqueRef("SES", async (r) => !!(await db.consultation.findUnique({ where: { ref: r } })));
const newAlias = () => `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(1000 + Math.random() * 8999)}`;

/** 409 that also tells the website which consultation is still open, so it can take the customer back to it. */
function inProgress(res: Response, open: { id: string; ref: string }) {
  res.status(409).json({
    error: {
      code: "consultation_in_progress",
      message: "You already have a consultation in progress. End or cancel it before starting another.",
      consultationId: open.id,
      ref: open.ref,
    },
  });
}

/**
 * An astrologer who can take a new consultation right now (online and available), or a clear
 * reason why not. Only "Available" (ON) astrologers can be consulted: offline, in another
 * session, or hosting a live room (consults then go through the room's queue) are refused.
 */
async function availableAstrologer(astrologerId: string) {
  const astrologer = await db.astrologer.findUnique({ where: { id: astrologerId } });
  if (!astrologer || astrologer.lifecycle !== "active" || astrologer.suspension === "full") throw notFound("This astrologer isn't available.");
  if (astrologer.suspension !== "none") throw conflict(`${astrologer.name} isn't taking consultations right now.`);
  const presence = effectivePresence(astrologer);
  if (presence === "OFF") throw conflict(`${astrologer.name} is offline right now. You can consult them once they come online — you have not been charged.`);
  if (presence === "BUSY") throw conflict(`${astrologer.name} is in another consultation right now. Try again in a few minutes — you have not been charged.`);
  if (presence === "LIVE") throw conflict(`${astrologer.name} is hosting a live room right now. Join the room's consult queue to talk to them.`);
  return astrologer;
}

/**
 * 409 when the rate the customer was shown is no longer the astrologer's rate: they confirm the
 * new one before anything starts. A consultation always runs at the rate it was started at.
 */
function rateChanged(res: Response, quoted: number, rate: number) {
  res.status(409).json({
    error: {
      code: "rate_changed",
      message: `The rate changed from ${rupee(quoted)} to ${rupee(rate)}/min. Continue at ${rupee(rate)}/min?`,
      quotedRate: quoted,
      rate,
    },
  });
}

/** The free call can only be used for Chat and Voice; Video and Instant Call stay paid. */
const modalityDenied = () =>
  new HttpError(400, "Your free call can be used for Chat or Voice. Video and Instant Call are paid.", "WEL_MODALITY_DENIED");

const astrologerBusy = async (astrologerId: string) =>
  !!(await db.consultation.findFirst({ where: { astrologerId, status: "ACTIVE" }, select: { id: true } }));

async function ownConsultation(userId: string, id: string) {
  const c = await db.consultation.findUnique({ where: { id } });
  if (!c || c.customerId !== userId) throw notFound("Consultation not found.");
  return c;
}

/** What the website needs to show (or resume) a consultation: waiting, connecting, in session or finished. */
async function consultationView(c: Consultation & { astrologer: Astrologer }) {
  const now = new Date();
  const [standardFree, policy] = await Promise.all([configNumber("consult.free_seconds", 60), welcomePolicy()]);
  const ahead =
    c.status === "REQUESTED"
      ? await db.consultation.count({ where: { astrologerId: c.astrologerId, status: "REQUESTED", requestedAt: { lt: c.requestedAt } } })
      : 0;
  const by = acceptBy(c);
  return {
    id: c.id,
    ref: c.ref,
    status: c.status.toLowerCase(),
    kind: c.kind === "INSTANT" ? "instant" : "standard",
    /** "live": a private consultation taken from a live room (it runs on that room's page). */
    origin: c.origin === "LIVE" ? "live" : "direct",
    liveRoomId: c.liveRoomId,
    mode: c.mode.toLowerCase(),
    rate: c.rate,
    held: c.heldAmount,
    astrologer: astrologerView(c.astrologer),
    requestedAt: c.requestedAt.toISOString(),
    /** Requests ahead of this one in the astrologer's queue (0 = the astrologer is being asked now). */
    ahead,
    acceptBy: by?.toISOString() ?? null,
    secondsToAccept: by ? Math.max(0, Math.ceil((by.getTime() - now.getTime()) / 1000)) : null,
    connectedAt: c.connectedAt?.toISOString() ?? null,
    elapsedSeconds: c.status === "ACTIVE" && c.connectedAt ? Math.max(0, Math.floor((now.getTime() - c.connectedAt.getTime()) / 1000)) : 0,
    /** Seconds not billed at the start: the standard free minute, or a free call's complimentary time. */
    freeSeconds: freeWindow(c, standardFree),
    /** A welcome free call (complimentary, then the same session continues at `rate`). */
    complimentary: c.billingMode === COMPLIMENTARY,
    /** When to remind the customer, before the free time ends, to add money to continue. */
    reminderSeconds: c.billingMode === COMPLIMENTARY ? policy.reminderSeconds : 0,
    maxSeconds: sessionCapSeconds(c, standardFree),
    endReason: c.endReason,
    settlement: c.status === "ENDED" ? settlementView(c) : null,
  };
}

async function viewOf(id: string) {
  return consultationView(await db.consultation.findUniqueOrThrow({ where: { id }, include: { astrologer: true } }));
}

/** The signed-in customer's open consultation, or null. Polled by the website to freeze the consult buttons. */
customerRouter.get("/consultations/active", async (req, res) => {
  const userId = auth(req).user.id;
  let open = await openConsultationOf(db, userId);
  if (open?.status === "REQUESTED") {
    // Time the request out on schedule even if the astrologer isn't looking at the portal.
    await expireStaleRequests(open.astrologerId);
    open = await openConsultationOf(db, userId);
  }
  res.json({ consultation: open ? await viewOf(open.id) : null });
});

/** One of the customer's own consultations, in any state (the waiting screen and the session poll this). */
customerRouter.get("/consultations/:id", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  if (c.status === "REQUESTED") await expireStaleRequests(c.astrologerId);
  res.json({ consultation: await viewOf(c.id) });
});

const quotedRateSchema = z.number().int().nonnegative().optional();

customerRouter.post("/consultations", async (req, res) => {
  const me = auth(req);
  const { astrologerId, mode, quotedRate, welcome } = z
    .object({ astrologerId: z.string(), mode: modeSchema, quotedRate: quotedRateSchema, welcome: z.boolean().optional() })
    .parse(req.body);
  if (welcome && !(WELCOME_MODES as readonly string[]).includes(mode)) throw modalityDenied();
  const astrologer = await availableAstrologer(astrologerId);
  // The rate is fixed now and the whole session is billed at it.
  const rate = rateFor(astrologer.price, mode as Mode);
  if (quotedRate !== undefined && quotedRate !== rate) return rateChanged(res, quotedRate, rate);
  const needed = rate * ELIGIBILITY_MINUTES;
  const policy = welcome ? await welcomePolicy() : null;
  await walletOf(me.user.id);
  const ref = await newRef();

  const result = await db.$transaction(async (tx) => {
    await lockKey(tx, `consult:${me.user.id}`);
    // One free call request at a time per astrologer, so their daily quota can't be overshot.
    if (policy) await lockKey(tx, `welcome:${astrologerId}`);
    const open = await openConsultationOf(tx, me.user.id);
    if (open) return { kind: "open" as const, open };
    if (await tx.consultation.findFirst({ where: { astrologerId, status: "ACTIVE" }, select: { id: true } })) return { kind: "busy" as const };
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: me.user.id } });
    const spendable = Math.max(0, wallet.service + wallet.promo - wallet.held);
    if (policy) {
      // The customer's own free call first: "you've used it" is the answer that matters to them.
      const benefit = await tx.welcomeBenefit.findUnique({ where: { userId: me.user.id }, select: { status: true } });
      if (benefit?.status !== "GRANTED") {
        return { kind: "refused" as const, code: "WEL_NOT_AVAILABLE", message: "You don't have a free call to use. You can still consult at the normal rate." };
      }
      const refusal = await freeCallRefusal(astrologer, policy, tx);
      if (refusal) return { kind: "refused" as const, ...refusal };
    } else if (spendable < needed) {
      return { kind: "short" as const, spendable };
    }
    // Hold the available balance for the length of the session; one debit is taken at the end.
    // A free call needs no balance: what is held only lets it continue once the free time is over.
    const consultation = await tx.consultation.create({
      data: {
        ref,
        customerId: me.user.id,
        customerAlias: newAlias(),
        astrologerId,
        mode,
        rate,
        status: "CONNECTING",
        heldAmount: spendable,
        ...(policy ? { billingMode: COMPLIMENTARY, complimentarySeconds: policy.complimentarySeconds } : {}),
      },
    });
    if (policy && !(await reserveWelcome(tx, me.user.id, consultation.id))) {
      // Undo everything above: the free call isn't there to use.
      throw new HttpError(409, "You don't have a free call to use. You can still consult at the normal rate.", "WEL_NOT_AVAILABLE");
    }
    if (spendable > 0) await tx.wallet.update({ where: { userId: me.user.id }, data: { held: { increment: spendable } } });
    return { kind: "ok" as const, consultation };
  });

  if (result.kind === "open") return inProgress(res, result.open);
  if (result.kind === "busy") throw conflict(`${astrologer.name} is in another consultation right now. Try again in a few minutes — you have not been charged.`);
  if (result.kind === "refused") throw new HttpError(409, result.message, result.code);
  if (result.kind === "short") {
    throw badRequest(`Your balance is ${rupee(result.spendable)}. You need ${rupee(needed)} for five minutes at ${rupee(rate)}/min.`);
  }
  const c = result.consultation;
  res.status(201).json({
    consultation: { id: c.id, ref, rate, held: c.heldAmount, status: c.status, complimentary: c.billingMode === COMPLIMENTARY },
  });
});

/** The astrologer picked up. (Until the calling provider is integrated, connection is immediate.) */
customerRouter.post("/consultations/:id/connect", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  if (c.status !== "CONNECTING") throw conflict("This consultation can no longer connect.");
  if (await astrologerBusy(c.astrologerId)) throw conflict("The astrologer is in another consultation right now.");
  const connectedAt = new Date();
  const count = await db.$transaction(async (tx) => {
    const { count } = await tx.consultation.updateMany({ where: { id: c.id, status: "CONNECTING" }, data: { status: "ACTIVE", connectedAt } });
    // A free call is used up once it connects.
    if (count && c.billingMode === COMPLIMENTARY) await consumeWelcome(tx, c.id, connectedAt);
    return count;
  });
  if (!count) throw conflict("This consultation can no longer connect.");
  await syncPresence(c.astrologerId); // the astrologer is now in a session → BUSY
  const updated = await db.consultation.findUniqueOrThrow({ where: { id: c.id } });
  const standardFree = await configNumber("consult.free_seconds", 60);
  res.json({
    consultation: { id: updated.id, status: updated.status, connectedAt: updated.connectedAt },
    freeSeconds: freeWindow(updated, standardFree),
    maxSeconds: sessionCapSeconds(updated, standardFree),
  });
});

/**
 * Ends the consultation and takes the single debit, metered by the server clock. Before it
 * connects (still waiting for the astrologer, or connecting) this cancels it: the hold is
 * released and nothing is charged.
 */
customerRouter.post("/consultations/:id/end", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  const ended = await endConsultation(c, "user");
  res.json({ settlement: settlementView(ended), status: ended.status.toLowerCase() });
});

customerRouter.post("/consultations/:id/rating", async (req, res) => {
  const me = auth(req);
  const { stars, review } = z.object({ stars: z.number().int().min(1).max(5), review: z.string().trim().max(1000).optional() }).parse(req.body);
  const c = await ownConsultation(me.user.id, String(req.params.id));
  if (c.status !== "ENDED") throw conflict("You can rate a consultation once it has ended.");
  if (c.stars) throw conflict("You have already rated this consultation.");

  const astrologer = await db.astrologer.findUniqueOrThrow({ where: { id: c.astrologerId } });
  const dist = [...astrologer.ratingDistribution];
  dist[5 - stars] = (dist[5 - stars] ?? 0) + 1;
  const count = dist.reduce((a, b) => a + b, 0);
  const average = dist.reduce((sum, n, i) => sum + n * (5 - i), 0) / count;
  const shortName = me.user.name.split(" ").length > 1 ? `${me.user.name[0]}. ${me.user.name.split(" ").slice(-1)[0]}` : me.user.name;

  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.consultation.update({ where: { id: c.id }, data: { stars, reviewText: review || null } }),
    db.astrologer.update({ where: { id: astrologer.id }, data: { ratingDistribution: dist, rating: Math.round(average * 10) / 10 } }),
  ];
  if (review) {
    ops.push(
      db.review.create({
        data: {
          id: await uniqueRef("REV", async (r) => !!(await db.review.findUnique({ where: { id: r } }))),
          astrologerId: astrologer.id,
          astrologerName: astrologer.name,
          customerName: shortName,
          stars,
          text: review,
          consultationId: c.id,
        },
      }),
    );
  }
  await db.$transaction(ops);
  res.json({ ok: true });
});

// ── Inside a consultation: its chat, and its voice/video room ──

/** The consultation's chat so far (polled with ?after=<ISO time>). Readable after it ends. */
customerRouter.get("/consultations/:id/messages", async (req, res) => {
  const c = await consultationFor(String(req.params.id), "CUSTOMER", auth(req).user.id);
  res.json(await listMessages(c, "CUSTOMER", req.query.after));
});

/** Sends a message while the session is in progress. Contact details are never delivered. */
customerRouter.post("/consultations/:id/messages", async (req, res) => {
  const me = auth(req).user;
  const { text } = consultMessageBody.parse(req.body);
  const c = await consultationFor(String(req.params.id), "CUSTOMER", me.id);
  res.status(201).json(await sendMessage(c, "CUSTOMER", me.id, text));
});

/** Credentials for the session's voice/video room, or why there are none (chat, ended, not set up). */
customerRouter.get("/consultations/:id/media", async (req, res) => {
  const me = auth(req).user;
  const c = await consultationFor(String(req.params.id), "CUSTOMER", me.id);
  // The astrologer sees the customer's alias, so ZEGO never holds the customer's name either.
  res.json({ media: mediaFor(c, "CUSTOMER", me, c.customerAlias) });
});

/**
 * Instant Call: a first-come request at the instant rate. It waits for the astrologer to
 * accept (3 minutes once it reaches the front); the balance is held only when it connects.
 */
customerRouter.post("/instant-calls", async (req, res) => {
  const me = auth(req);
  const { astrologerId, quotedRate, welcome } = z
    .object({ astrologerId: z.string(), quotedRate: quotedRateSchema, welcome: z.boolean().optional() })
    .parse(req.body);
  if (welcome) throw modalityDenied();
  const astrologer = await availableAstrologer(astrologerId);
  const rate = instantRate(astrologer.price, astrologer.instantMultiplier);
  if (quotedRate !== undefined && quotedRate !== rate) return rateChanged(res, quotedRate, rate);
  const needed = rate * ELIGIBILITY_MINUTES;
  await walletOf(me.user.id);
  const ref = await newRef();

  const result = await db.$transaction(async (tx) => {
    await lockKey(tx, `consult:${me.user.id}`);
    const open = await openConsultationOf(tx, me.user.id);
    if (open) return { kind: "open" as const, open };
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: me.user.id } });
    const spendable = wallet.service + wallet.promo - wallet.held;
    if (spendable < needed) return { kind: "short" as const, spendable };
    const consultation = await tx.consultation.create({
      data: { ref, customerId: me.user.id, customerAlias: newAlias(), astrologerId, mode: "VOICE", kind: "INSTANT", rate, status: "REQUESTED" },
    });
    return { kind: "ok" as const, consultation };
  });

  if (result.kind === "open") return inProgress(res, result.open);
  if (result.kind === "short") {
    throw badRequest(`Instant Call needs ${rupee(needed)} for five minutes at ${rupee(rate)}/min. Your balance is ${rupee(result.spendable)}.`);
  }
  // Starts the 3-minute window straight away when nobody else is waiting.
  await expireStaleRequests(astrologerId);
  res.status(201).json({
    id: result.consultation.id,
    ref,
    rate,
    message: `Ringing ${astrologer.name} at ${rupee(rate)}/min. Billing starts only once the call connects.`,
    consultation: await viewOf(result.consultation.id),
  });
});

// ── Data rights (DPDP) ──

customerRouter.post("/me/data-requests", async (req, res) => {
  const { kind } = z.object({ kind: z.enum(["download", "correct", "consent", "nominee", "delete"]) }).parse(req.body);
  const request = await db.dataRequest.create({ data: { userId: auth(req).user.id, kind } });
  res.status(201).json({ request: { id: request.id, kind, status: request.status } });
});

// ── Deactivate or delete my account (see lib/account.ts) ──

/** Refund and forfeit amounts, how to confirm, and whether anything blocks it right now. */
customerRouter.get("/me/account", async (req, res) => {
  res.json({ account: await accountStatus(auth(req).user.id) });
});

/** Pause: signs out everywhere. Signing in again re-activates the account. */
customerRouter.post("/me/account/deactivate", async (req, res) => {
  await deactivateAccount(auth(req).user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Texts a code to the customer's own mobile number to confirm a deletion. */
customerRouter.post("/me/account/delete/code", async (req, res) => {
  const user = auth(req).user;
  if (!user.phone) throw badRequest("There's no mobile number on this account. Confirm with your password instead.");
  const blocked = (await accountStatus(user.id)).deleteBlocked;
  if (blocked) throw conflict(blocked);
  res.json(await issueOtp(user.phone, req.ip));
});

/** Permanent deletion, confirmed with the mobile code or the account password. */
customerRouter.post("/me/account/delete", async (req, res) => {
  const user = auth(req).user;
  rateLimit(`account-delete:${user.id}`, 10, 10 * 60 * 1000, "Too many attempts. Try again in a few minutes.");
  const input = z
    .object({
      code: z.string().regex(/^\d{6}$/, "Enter the six-digit code.").optional(),
      password: z.string().min(1, "Enter your password.").optional(),
    })
    .parse(req.body ?? {});
  // Refuse before using up the code (checked again, under a lock, while deleting).
  const blocked = (await accountStatus(user.id)).deleteBlocked;
  if (blocked) throw conflict(blocked);
  if (input.code !== undefined) {
    if (!user.phone) throw badRequest("There's no mobile number on this account. Confirm with your password instead.");
    await consumeOtp(user.phone, input.code);
  } else if (input.password !== undefined) {
    if (!user.passwordHash || !user.email) throw badRequest("This account has no password. Confirm with the code sent to your mobile.");
    if (!(await verifyPassword(input.password, user.passwordHash))) throw badRequest("That password is not correct.");
  } else {
    throw badRequest("Confirm with the code sent to your mobile or your password.");
  }
  const result = await deleteAccount(user.id);
  clearSessionCookie(res);
  res.json(result);
});

// ── Profile ("A little about you" + "Birth details") ──
// Shared only with an astrologer whose live consult queue the customer joins.

/** Trimmed text; blank becomes null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be up to ${max} characters.`)
    .nullish()
    .transform((v) => v || null);

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60, "First name can be up to 60 characters."),
  lastName: optionalText(60, "Last name"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((v) => v || null)
    .pipe(z.email("Enter a valid email or leave it blank.").max(254, "Enter a valid email or leave it blank.").nullable()),
  gender: z.enum(GENDERS, "Choose one of the options.").nullish().transform((v) => v ?? null),
  birthDate: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a real date.")
    .transform((v, ctx) => {
      if (v === null) return null;
      const d = new Date(v + "T00:00:00Z");
      if (Number.isNaN(d.getTime()) || dateKey(d) !== v) {
        ctx.addIssue({ code: "custom", message: "Enter a real date." });
        return z.NEVER;
      }
      const today = istDateKey(new Date());
      if (v > today) {
        ctx.addIssue({ code: "custom", message: "Date of birth cannot be in the future." });
        return z.NEVER;
      }
      if (ageOn(d, today) > 120) {
        ctx.addIssue({ code: "custom", message: "Check the year — that's more than 120 years ago." });
        return z.NEVER;
      }
      return d;
    }),
  birthTime: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use HH:MM (24-hour)."),
  birthPlace: optionalText(100, "Place of birth"),
  city: optionalText(100, "City"),
  state: optionalText(100, "State"),
});

customerRouter.get("/me/profile", async (req, res) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: auth(req).user.id } });
  res.json({ profile: ownProfileView(user) });
});

customerRouter.put("/me/profile", async (req, res) => {
  const me = auth(req).user;
  const input = profileSchema.parse(req.body);
  const current = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!input.email && current.passwordHash && !current.phone) {
    throw new HttpError(400, "You sign in with this email, so it can't be removed.", "invalid_input");
  }
  if (input.email && input.email !== current.email) {
    const taken = await db.user.findFirst({ where: { email: input.email, id: { not: me.id } }, select: { id: true } });
    if (taken) throw conflict("That email is already used by another account.");
  }
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
  try {
    const user = await db.user.update({
      where: { id: me.id },
      data: { ...input, name, initials: initialsOf(input.firstName, input.lastName) },
    });
    res.json({ profile: ownProfileView(user) });
  } catch (e) {
    // Two accounts saving the same email at once: the unique index decides.
    if ((e as { code?: string }).code === "P2002") throw conflict("That email is already used by another account.");
    throw e;
  }
});

/** Reads the raw image body; a file over the limit gets a clear message instead of a generic one. */
const readImage = express.raw({ type: Object.keys(IMAGE_TYPES), limit: MAX_PHOTO_BYTES });
function photoBody(req: Request, res: Response, next: NextFunction) {
  readImage(req, res, (err?: unknown) => {
    if ((err as { status?: number } | undefined)?.status === 413) return next(badRequest("Photos can be up to 2 MB."));
    next(err);
  });
}

customerRouter.post("/me/photo", photoBody, async (req, res) => {
  const me = auth(req).user;
  rateLimit(`photo:${me.id}`, 10, 10 * 60 * 1000, "Too many photo uploads. Try again in a few minutes.");
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("Choose a JPEG, PNG or WebP photo.");
  // Trust the file's own bytes, not the name or Content-Type the browser sent.
  const type = sniffImage(body);
  if (!type) throw badRequest("That file isn't a JPEG, PNG or WebP photo.");
  const previous = (await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { photoUrl: true } })).photoUrl;
  const photoUrl = await saveImage(body, type);
  try {
    await db.user.update({ where: { id: me.id }, data: { photoUrl } });
  } catch (e) {
    await deleteMedia(photoUrl);
    throw e;
  }
  await deleteMedia(previous);
  res.status(201).json({ photoUrl });
});

customerRouter.delete("/me/photo", async (req, res) => {
  const me = auth(req).user;
  const previous = (await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { photoUrl: true } })).photoUrl;
  await db.user.update({ where: { id: me.id }, data: { photoUrl: null } });
  await deleteMedia(previous);
  res.json({ photoUrl: null });
});

// ── Astrologer Messenger ──
// Free, text-only direct messages with an astrologer. One conversation per astrologer; any
// listed astrologer can be messaged. Conversations started by the Astrorize team sit alongside.

const START_RULE = "This astrologer isn't taking new messages right now.";

const messengerAstrologer = (a: Pick<Astrologer, "id" | "slug" | "name" | "initials" | "photo">) => ({
  id: a.id,
  slug: a.slug,
  name: a.name,
  initials: a.initials,
  photo: a.photo,
});

/** My conversations, latest first, and those with Astrorize support. */
customerRouter.get("/messages", async (req, res) => {
  const [threads, support] = await Promise.all([
    db.messageThread.findMany({
      where: { customerId: auth(req).user.id },
      orderBy: { updatedAt: "desc" },
      include: { astrologer: true, messages: { orderBy: { createdAt: "asc" } } },
    }),
    teamConversations(auth(req).user.id, "customer"),
  ]);
  res.json({
    support,
    conversations: threads.map((t) => {
      const last = lastDelivered(t.messages);
      return {
        id: t.id,
        astrologer: messengerAstrologer(t.astrologer),
        preview: last?.text.slice(0, 80) ?? "",
        lastAt: (last ?? t.messages.at(-1))?.createdAt.toISOString() ?? null,
        lastFrom: last ? (last.sender === "CUSTOMER" ? "me" : "astrologer") : null,
        // Astrologer replies since the customer last opened this conversation.
        unread: unreadFrom(t.messages, "ASTROLOGER", t.customerReadAt),
      };
    }),
  });
});

/** Who may be messaged at this address, and the conversation with them if there is one. */
async function conversationWith(customerId: string, slug: string) {
  const astrologer = await db.astrologer.findUnique({ where: { slug } });
  if (!astrologer) throw notFound("No astrologer at this address.");
  const thread = await db.messageThread.findUnique({
    where: { astrologerId_customerId: { astrologerId: astrologer.id, customerId } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  // Replying is always allowed; starting needs a listed astrologer.
  if (!thread && astrologer.lifecycle !== "active") throw notFound("No astrologer at this address.");
  const canMessage = !!thread || isMessageable(astrologer);
  return { astrologer, thread, canMessage };
}

/** Listed astrologers matching a name, for "Start a conversation" in the search box. */
customerRouter.get("/messages/search/astrologers", async (req, res) => {
  const q = z.string().trim().max(60).catch("").parse(req.query.q);
  if (!q) return void res.json({ astrologers: [] });
  const found = await db.astrologer.findMany({
    where: { lifecycle: "active", suspension: { not: "full" }, name: { contains: q, mode: "insensitive" } },
    orderBy: { rank: "asc" },
    take: 100,
  });
  const list = byNameMatch(found, q, (a) => a.name).slice(0, 20);
  res.json({
    astrologers: list.map((a) => ({
      ...messengerAstrologer(a),
      skills: a.skills.slice(0, 3),
      /** on | busy | live | off */
      presence: effectivePresence(a).toLowerCase(),
    })),
  });
});

// Conversations the Astrorize team started with this customer ("Astrorize support").

customerRouter.get("/messages/support/:id", async (req, res) => {
  const me = auth(req).user;
  const thread = await directThreadFor(String(req.params.id), me.id, true);
  res.json({ conversation: teamThreadView(thread, me.id, "customer") });
});

customerRouter.post("/messages/support/:id", async (req, res) => {
  const { text } = z.object({ text: directText }).parse(req.body);
  res.status(201).json({ message: await replyDirect(String(req.params.id), auth(req).user.id, text) });
});

customerRouter.get("/messages/:slug", async (req, res) => {
  const { astrologer, thread, canMessage } = await conversationWith(auth(req).user.id, String(req.params.slug));
  // The customer has the conversation open: everything in it counts as read (saved).
  if (thread) await db.messageThread.update({ where: { id: thread.id }, data: { customerReadAt: new Date() } });
  res.json({
    astrologer: messengerAstrologer(astrologer),
    conversation: thread
      ? { id: thread.id, messages: thread.messages.filter(visibleTo("CUSTOMER")).map((m) => messageView(m, "CUSTOMER")) }
      : null,
    canMessage,
    notice: canMessage ? null : START_RULE,
  });
});

/** Send a message; the first one starts the conversation. Contact details are never delivered. */
customerRouter.post("/messages/:slug", async (req, res) => {
  const me = auth(req).user;
  const { text } = z.object({ text: messageText }).parse(req.body);
  const { astrologer, thread, canMessage } = await conversationWith(me.id, String(req.params.slug));
  if (!canMessage) throw new HttpError(403, START_RULE, "forbidden");
  checkSendRate(me.id);
  // Upsert: two first messages sent at once still make one conversation.
  const threadId =
    thread?.id ??
    (
      await db.messageThread.upsert({
        where: { astrologerId_customerId: { astrologerId: astrologer.id, customerId: me.id } },
        create: { astrologerId: astrologer.id, customerId: me.id, customerAlias: newAlias() },
        update: {},
      })
    ).id;
  res.status(201).json({ conversationId: threadId, ...(await postMessage(threadId, "CUSTOMER", text)) });
});
