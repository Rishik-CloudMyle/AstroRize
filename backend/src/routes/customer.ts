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
  captionQuery,
  chatFileBody,
  checkChatFile,
  checkSendRate,
  directText,
  directThreadFor,
  isMessageable,
  lastDelivered,
  messageText,
  messageView,
  postAttachment,
  postMessage,
  previewOf,
  replyDirect,
  teamConversations,
  teamThreadView,
  unreadFrom,
  visibleTo,
} from "../lib/messaging.ts";
import {
  acceptBy,
  billedElapsed,
  endIfNeverJoined,
  endConsultation,
  expireStaleRequests,
  extendHold,
  freeWindow,
  joinTimeoutSeconds,
  joinView,
  lockKey,
  markJoined,
  openConsultationOf,
  sessionCapSeconds,
  settlementView,
  startsFree,
} from "../lib/consultations.ts";
import { MAKE_GOOD, reserveMakeGood, usableMakeGood } from "../lib/makegood.ts";
import {
  COMPLIMENTARY,
  WELCOME_MODES,
  freeCallRefusal,
  reserveWelcome,
  welcomeAvailability,
  welcomePolicy,
  welcomeView,
} from "../lib/welcome.ts";
import { effectivePresence, syncPresence } from "../lib/presence.ts";
import { cashbackQuotes, discountQuote, discountedRate } from "../lib/campaigns.ts";
import { NOT_CONNECTED, createRecharge, customAmountPolicy, paymentReceipt, paymentRefsFor, paymentResult, reconcile, settle, type Settled } from "../lib/payments.ts";
import { RazorpayError, checkoutSignatureValid, fetchPayment, razorpayConfigured } from "../lib/razorpay.ts";
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
  // Recharge lines (and their bonus/cashback) open that payment's page.
  const paymentOf = await paymentRefsFor(userId, transactions);
  return {
    /** The welcome free call (null when this account never had one). */
    welcome,
    service: wallet.service,
    promo: wallet.promo,
    held: wallet.held,
    promoExpires: wallet.promoExpiresAt ? istDate(wallet.promoExpiresAt) : null,
    transactions: transactions.map((t) => ({
      date: istDate(t.createdAt),
      type: t.type,
      ref: t.ref,
      bucket: t.bucket,
      amount: t.amount,
      /** The Razorpay order id of the recharge this line came from (its page: /wallet/payment/<id>), else null. */
      payment: paymentOf.get(t.ref) ?? null,
    })),
  };
}

customerRouter.get("/wallet", async (req, res) => {
  res.json({ wallet: await walletView(auth(req).user.id) });
});

customerRouter.get("/wallet/denominations", async (req, res) => {
  const list = await db.denomination.findMany({ where: { enabled: true }, orderBy: { amount: "asc" } });
  // The cashback a claimed offer adds to each amount, shown before paying.
  const quotes = await cashbackQuotes(auth(req).user.id, list.map((d) => d.amount));
  res.json({
    denominations: list.map((d, i) => ({
      amount: d.amount,
      bonus: d.bonus,
      cashback: quotes[i]?.cashback ?? 0,
      cashbackFrom: quotes[i]?.name ?? null,
    })),
    gstRate: GST_RATE,
    /** Any whole amount in this range can be recharged too (no bonus), while Finance has it on. */
    custom: await customAmountPolicy(),
    /** Razorpay is connected (otherwise the website says recharges aren't available yet). */
    payments: { available: razorpayConfigured(), provider: "razorpay" },
  });
});

/**
 * Step 1 of a recharge: a Razorpay order for the amount plus GST. The browser opens Razorpay
 * Checkout with it (only the key id is sent; the secret stays on this server).
 */
customerRouter.post("/wallet/recharge", async (req, res) => {
  const user = auth(req).user;
  rateLimit(`recharge:${user.id}`, 20, 10 * 60_000, "Too many payment attempts. Please wait a few minutes and try again.");
  const { amount } = z.object({ amount: z.number().int().positive() }).parse(req.body);
  const { payment, offerName } = await createRecharge(user.id, amount);
  const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true } });
  res.status(201).json({
    provider: "razorpay",
    keyId: config.razorpayKeyId,
    orderId: payment.providerOrderId,
    currency: "INR",
    /** What Checkout charges, in paise. */
    totalPaise: payment.total * 100,
    amount: payment.amount,
    gst: payment.gst,
    bonus: payment.bonus,
    cashback: payment.cashback,
    cashbackFrom: offerName,
    total: payment.total,
    // Razorpay expects the 10-digit Indian number (it adds +91 itself).
    prefill: { name: profile.name, email: profile.email ?? "", contact: profile.phone ?? "" },
  });
});

async function ownPayment(req: Request) {
  const payment = await db.payment.findUnique({ where: { providerOrderId: String(req.params.orderId) } });
  if (!payment || payment.userId !== auth(req).user.id) throw notFound("Payment not found.");
  return payment;
}

/** The answer for a recharge after checking it: paid (with the new wallet), failed, or still pending. */
async function rechargeAnswer(res: Response, userId: string, settled: Settled) {
  if (settled.status === "PAID") {
    // Recharged during a consultation: the new money is held for it, so it carries on without disconnecting.
    await extendHold(userId);
    return res.json({ status: "PAID", ...paymentResult(settled.payment), wallet: await walletView(userId) });
  }
  if (settled.status === "FAILED") return res.json({ status: "FAILED", reason: settled.reason });
  res.json({ status: "PENDING" });
}

const gatewayDown = (e: unknown) => {
  if (e instanceof RazorpayError) {
    console.error("Razorpay check failed:", e.message);
    return new HttpError(502, "We couldn't reach the payment gateway to confirm this payment. Please check its status again in a moment.", "gateway_unreachable");
  }
  return e;
};

/**
 * Step 2: Checkout says the customer paid. Its signature is checked, then the payment is fetched
 * from Razorpay and only a captured payment for exactly this order and amount credits the wallet
 * (once; safe to retry).
 */
customerRouter.post("/wallet/recharge/:orderId/verify", async (req, res) => {
  const userId = auth(req).user.id;
  const body = z
    .object({
      razorpay_order_id: z.string().min(1).max(64),
      razorpay_payment_id: z.string().min(1).max(64),
      razorpay_signature: z.string().min(1).max(256),
    })
    .parse(req.body);
  const payment = await ownPayment(req);
  if (payment.provider !== "razorpay") throw badRequest("That isn't a Razorpay payment.");
  if (body.razorpay_order_id !== payment.providerOrderId || !checkoutSignatureValid(payment.providerOrderId, body.razorpay_payment_id, body.razorpay_signature)) {
    throw badRequest("We couldn't verify this payment. If money left your account, it will show up here within a few minutes or be refunded by your bank.");
  }
  let settled: Settled;
  try {
    settled = payment.status === "PAID" ? { status: "PAID", payment } : await settle(payment, await fetchPayment(body.razorpay_payment_id));
  } catch (e) {
    throw gatewayDown(e);
  }
  await rechargeAnswer(res, userId, settled);
});

/** One of the customer's own recharges, for its payment page (anyone else's is "not found"). */
customerRouter.get("/wallet/payments/:orderId", async (req, res) => {
  const userId = auth(req).user.id;
  rateLimit(`payment-page:${userId}`, 60, 60_000, "Please wait a moment and try again.");
  const payment = await ownPayment(req);
  const [receipt, wallet] = await Promise.all([paymentReceipt(payment), walletOf(userId)]);
  res.json({ payment: receipt, wallet: { service: wallet.service, promo: wallet.promo } });
});

/** "Check status": asks Razorpay about the order (closed checkout, slow UPI approval, lost answer). */
customerRouter.post("/wallet/recharge/:orderId/status", async (req, res) => {
  const userId = auth(req).user.id;
  rateLimit(`recharge-status:${userId}`, 30, 60_000, "Please wait a moment before checking again.");
  const payment = await ownPayment(req);
  if (payment.status === "PAID") return rechargeAnswer(res, userId, { status: "PAID", payment });
  if (payment.provider !== "razorpay") return res.json({ status: payment.status === "FAILED" ? "FAILED" : "PENDING", reason: payment.failureReason ?? undefined });
  if (!razorpayConfigured()) throw new HttpError(503, NOT_CONNECTED, "payments_unavailable");
  let settled: Settled;
  try {
    settled = await reconcile(payment);
  } catch (e) {
    throw gatewayDown(e);
  }
  await rechargeAnswer(res, userId, settled);
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
function rateChanged(res: Response, quoted: number, rate: number, message?: string) {
  res.status(409).json({
    error: {
      code: "rate_changed",
      message: message ?? `The rate changed from ${rupee(quoted)} to ${rupee(rate)}/min. Continue at ${rupee(rate)}/min?`,
      quotedRate: quoted,
      rate,
    },
  });
}

/** The free call can only be used for Chat and Voice; Video and Instant Call stay paid. */
const modalityDenied = () =>
  new HttpError(400, "Free minutes can be used for Chat or Voice. Video and Instant Call are paid.", "WEL_MODALITY_DENIED");

async function ownConsultation(userId: string, id: string) {
  const c = await db.consultation.findUnique({ where: { id } });
  if (!c || c.customerId !== userId) throw notFound("Consultation not found.");
  return c;
}

/** What the website needs to show (or resume) a consultation: waiting, connecting, in session or finished. */
async function consultationView(c: Consultation & { astrologer: Astrologer }) {
  const now = new Date();
  const [standardFree, policy, joinTimeout] = await Promise.all([configNumber("consult.free_seconds", 60), welcomePolicy(), joinTimeoutSeconds()]);
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
    /** The price before a claimed offer's discount (null = no discount), and the percent off. */
    listRate: c.listRate,
    discountPct: c.discountPct,
    held: c.heldAmount,
    astrologer: astrologerView(c.astrologer),
    requestedAt: c.requestedAt.toISOString(),
    /** Requests ahead of this one in the astrologer's queue (0 = the astrologer is being asked now). */
    ahead,
    acceptBy: by?.toISOString() ?? null,
    secondsToAccept: by ? Math.max(0, Math.ceil((by.getTime() - now.getTime()) / 1000)) : null,
    connectedAt: c.connectedAt?.toISOString() ?? null,
    /** Billed seconds so far: counted from billingStartedAt (0 while waiting for a side to join). */
    elapsedSeconds: billedElapsed(c, now.getTime()),
    /** Billing starts only once both sides have really joined (see joinView). */
    ...joinView(c, joinTimeout),
    /** Seconds not billed at the start: the standard free minute, or a free call's complimentary time. */
    freeSeconds: freeWindow(c, standardFree),
    /** A welcome free call or a free replacement call (complimentary, then the same session continues at `rate`). */
    complimentary: startsFree(c),
    /** A free replacement call offered on a complaint (instead of a refund). */
    makeGood: c.billingMode === MAKE_GOOD,
    /** When to remind the customer, before the free time ends, to add money to continue. */
    reminderSeconds: startsFree(c) ? policy.reminderSeconds : 0,
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
  // Connected but a side never joined in time: ended (₹0) on schedule.
  if (open?.status === "ACTIVE" && (await endIfNeverJoined(open)).status !== "ACTIVE") open = null;
  res.json({ consultation: open ? await viewOf(open.id) : null });
});

/** One of the customer's own consultations, in any state (the waiting screen and the session poll this). */
customerRouter.get("/consultations/:id", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  if (c.status === "REQUESTED") await expireStaleRequests(c.astrologerId);
  if (c.status === "ACTIVE") await endIfNeverJoined(c);
  res.json({ consultation: await viewOf(c.id) });
});

const quotedRateSchema = z.number().int().nonnegative().optional();

customerRouter.post("/consultations", async (req, res) => {
  const me = auth(req);
  const { astrologerId, mode, quotedRate, welcome, freeMinutes, makeGoodCreditId } = z
    .object({
      astrologerId: z.string(),
      mode: modeSchema,
      quotedRate: quotedRateSchema,
      welcome: z.boolean().optional(),
      /** A free call's length, chosen by the customer (minutes; one of the Config lengths that fits this week). */
      freeMinutes: z.number().int().positive().max(600).optional(),
      /** Use a free replacement call (make-good) with this astrologer. */
      makeGoodCreditId: z.string().max(40).optional(),
    })
    .parse(req.body);
  if (welcome && !(WELCOME_MODES as readonly string[]).includes(mode)) throw modalityDenied();
  if (welcome && !freeMinutes) throw new HttpError(400, "Choose how long your free call should be.", "WEL_LENGTH_REQUIRED");
  // A free replacement call stands alone: never together with a welcome free call (or an offer).
  if (welcome && makeGoodCreditId) throw badRequest("Use either your free minutes or your free replacement call — not both at once.");
  const astrologer = await availableAstrologer(astrologerId);
  // The rate is fixed now and the whole session is billed at it. A claimed consultation offer
  // lowers it — never together with a free call or a free replacement call.
  const listRate = rateFor(astrologer.price, mode as Mode, astrologer.chatPrice);
  const offer = welcome || makeGoodCreditId ? null : await discountQuote(me.user.id);
  const rate = offer ? discountedRate(listRate, offer.pct) : listRate;
  if (quotedRate !== undefined && quotedRate !== rate) {
    return rateChanged(res, quotedRate, rate, offer && quotedRate === listRate
      ? `Your ${offer.pct}% offer (${offer.name}) applies: ${rupee(rate)}/min instead of ${rupee(listRate)}. Continue at ${rupee(rate)}/min?`
      : !offer && quotedRate < listRate
        ? `Your offer no longer applies (used or expired). The rate is ${rupee(rate)}/min. Continue at ${rupee(rate)}/min?`
        : undefined);
  }
  const needed = rate * ELIGIBILITY_MINUTES;
  const policy = welcome ? await welcomePolicy() : null;
  await walletOf(me.user.id);
  const ref = await newRef();

  const result = await db.$transaction(async (tx) => {
    // The astrologer first (same order as accepting a request), then the customer: requests for
    // one astrologer are decided one at a time, so their free-call capacity can't be overshot and
    // two free calls never overlap.
    await lockKey(tx, `astro:${astrologerId}`);
    await lockKey(tx, `consult:${me.user.id}`);
    const open = await openConsultationOf(tx, me.user.id);
    if (open) return { kind: "open" as const, open };
    if (await tx.consultation.findFirst({ where: { astrologerId, status: "ACTIVE" }, select: { id: true } })) return { kind: "busy" as const };
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: me.user.id } });
    const spendable = Math.max(0, wallet.service + wallet.promo - wallet.held);
    // The replacement call must be this customer's, with this astrologer, unused and not expired.
    const makeGood = makeGoodCreditId ? await usableMakeGood(tx, me.user.id, astrologerId) : null;
    if (makeGoodCreditId && (!makeGood || makeGood.credit.id !== makeGoodCreditId || makeGood.inUse)) {
      return { kind: "refused" as const, code: "MAKEGOOD_NOT_AVAILABLE", message: "This free replacement call isn't available any more. You can still consult at the normal rate." };
    }
    if (policy) {
      // The customer's own allowance first: "you've used it" is the answer that matters to them.
      const mine = await welcomeAvailability(tx, me.user.id, policy, freeMinutes ?? 0);
      if (!mine.ok) return { kind: "refused" as const, code: mine.code, message: mine.message };
      const refusal = await freeCallRefusal(astrologer, policy, tx);
      if (refusal) return { kind: "refused" as const, ...refusal };
    } else if (!makeGood && spendable < needed) {
      // (A free replacement call is free for its first minutes, so it needs no minimum balance.)
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
        // The chosen length, snapshotted: all of it is taken from the weekly minutes once the call starts.
        ...(policy ? { billingMode: COMPLIMENTARY, complimentarySeconds: (freeMinutes ?? 0) * 60 } : {}),
        ...(makeGood ? { billingMode: MAKE_GOOD, complimentarySeconds: makeGood.credit.minutes * 60, makeGoodCreditId: makeGood.credit.id } : {}),
        // The offer is only used up once the conversation starts (both sides joined).
        ...(offer ? { listRate, discountPct: offer.pct, campaignClaimId: offer.claimId } : {}),
      },
    });
    if (makeGood && !(await reserveMakeGood(tx, makeGood.credit.id, makeGood.credit.consultationId, consultation.id))) {
      throw new HttpError(409, "This free replacement call isn't available any more. You can still consult at the normal rate.", "MAKEGOOD_NOT_AVAILABLE");
    }
    if (policy && !(await reserveWelcome(tx, me.user.id, consultation.id))) {
      // Undo everything above: the free call isn't there to use.
      throw new HttpError(409, "You don't have free minutes to use right now. You can still consult at the normal rate.", "WEL_NOT_AVAILABLE");
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
    consultation: { id: c.id, ref, rate, held: c.heldAmount, status: c.status, complimentary: startsFree(c), makeGood: c.billingMode === MAKE_GOOD, listRate: c.listRate, discountPct: c.discountPct },
  });
});

/** The astrologer picked up. (Until the calling provider is integrated, connection is immediate.) */
customerRouter.post("/consultations/:id/connect", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  if (c.status !== "CONNECTING") throw conflict("This consultation can no longer connect.");
  const connectedAt = new Date();
  const result = await db.$transaction(async (tx) => {
    // Under the astrologer's lock (as when they accept a request), so two sessions that are both
    // connecting can never both go ACTIVE: an astrologer is in one consultation at a time.
    await lockKey(tx, `astro:${c.astrologerId}`);
    const busy = await tx.consultation.findFirst({ where: { astrologerId: c.astrologerId, status: "ACTIVE", id: { not: c.id } }, select: { id: true } });
    if (busy) return "busy" as const;
    // Connected, not yet billed: billing (and using up a free call, a free replacement call or an
    // offer) starts once both sides have really joined — POST /consultations/:id/joined.
    const { count } = await tx.consultation.updateMany({ where: { id: c.id, status: "CONNECTING" }, data: { status: "ACTIVE", connectedAt } });
    if (!count) return "gone" as const;
    return "ok" as const;
  });
  if (result === "busy") throw conflict("The astrologer is in another consultation right now.");
  if (result === "gone") throw conflict("This consultation can no longer connect.");
  await syncPresence(c.astrologerId); // the astrologer is now in a session → BUSY
  const updated = await db.consultation.findUniqueOrThrow({ where: { id: c.id } });
  const [standardFree, joinTimeout] = await Promise.all([configNumber("consult.free_seconds", 60), joinTimeoutSeconds()]);
  res.json({
    consultation: { id: updated.id, status: updated.status, connectedAt: updated.connectedAt, ...joinView(updated, joinTimeout) },
    freeSeconds: freeWindow(updated, standardFree),
    maxSeconds: sessionCapSeconds(updated, standardFree),
  });
});

/**
 * The customer's side has really joined: on a voice or video call its stream is being published and
 * it is playing the astrologer's; on a chat, its session window is open. Billing starts once the
 * astrologer has joined too. Idempotent; answers with the session as it now stands.
 */
customerRouter.post("/consultations/:id/joined", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  if (c.status !== "ACTIVE") throw conflict("This consultation isn't in progress.");
  await markJoined(c, "CUSTOMER");
  res.json({ consultation: await viewOf(c.id) });
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
/**
 * The customer's free replacement calls still to use (offered on a complaint instead of a refund):
 * which astrologer, how many free minutes, and the last day to book. Shown on that astrologer's
 * profile and consult sheet.
 */
customerRouter.get("/me/makegood", async (req, res) => {
  const now = new Date();
  const credits = await db.makeGoodCredit.findMany({
    where: { userId: auth(req).user.id, status: "AVAILABLE", expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
  });
  const astrologers = credits.length
    ? await db.astrologer.findMany({ where: { id: { in: [...new Set(credits.map((c) => c.astrologerId))] } }, select: { id: true, slug: true, name: true } })
    : [];
  const open = await openConsultationOf(db, auth(req).user.id);
  res.json({
    credits: credits.map((c) => {
      const a = astrologers.find((x) => x.id === c.astrologerId);
      return {
        id: c.id,
        astrologerId: c.astrologerId,
        astrologerSlug: a?.slug ?? null,
        astrologerName: a?.name ?? "",
        minutes: c.minutes,
        sessionRef: c.sessionRef,
        /** "5 Nov 2026": the last day it can be booked. */
        validUntil: istDate(c.expiresAt),
        /** A consultation using it is open right now. */
        inUse: !!open && c.consultationId === open.id,
      };
    }),
  });
});

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
// Free direct messages with an astrologer (text, photos and short videos). One conversation per astrologer; any
// listed astrologer can be messaged. Conversations started by the AstroRize team sit alongside.

const START_RULE = "This astrologer isn't taking new messages right now.";

const messengerAstrologer = (a: Pick<Astrologer, "id" | "slug" | "name" | "initials" | "photo">) => ({
  id: a.id,
  slug: a.slug,
  name: a.name,
  initials: a.initials,
  photo: a.photo,
});

/** My conversations, latest first, and those with AstroRize support. */
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
        preview: previewOf(last, 80),
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

// Conversations the AstroRize team started with this customer ("AstroRize support").

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
  const threadId = thread?.id ?? (await startThread(astrologer.id, me.id));
  res.status(201).json({ conversationId: threadId, ...(await postMessage(threadId, "CUSTOMER", text)) });
});

/** Upsert: two first messages sent at once still make one conversation. */
async function startThread(astrologerId: string, customerId: string): Promise<string> {
  const t = await db.messageThread.upsert({
    where: { astrologerId_customerId: { astrologerId, customerId } },
    create: { astrologerId, customerId, customerAlias: newAlias() },
    update: {},
  });
  return t.id;
}

/**
 * Send a photo (JPEG/PNG/WebP, up to 5 MB) or a video (MP4/WebM, up to 25 MB and 60 s) as the
 * raw request body, with an optional ?caption=. The first message may be one. Who may message,
 * the pace limit and the caption's contact-details check are the same as for text; they are
 * checked before the file is read.
 */
customerRouter.post(
  "/messages/:slug/attachment",
  async (req, res, next) => {
    const me = auth(req).user;
    const { caption } = captionQuery.parse(req.query);
    const { astrologer, thread, canMessage } = await conversationWith(me.id, String(req.params.slug));
    if (!canMessage) throw new HttpError(403, START_RULE, "forbidden");
    checkSendRate(me.id);
    res.locals.chat = { astrologerId: astrologer.id, threadId: thread?.id ?? null, caption };
    next();
  },
  chatFileBody,
  async (req, res) => {
    const me = auth(req).user;
    const { astrologerId, threadId: existing, caption } = res.locals.chat as { astrologerId: string; threadId: string | null; caption: string };
    const file = checkChatFile(req.body);
    const threadId = existing ?? (await startThread(astrologerId, me.id));
    res.status(201).json({ conversationId: threadId, ...(await postAttachment(threadId, "CUSTOMER", caption, file)) });
  },
);
