import { randomUUID } from "node:crypto";
import { db } from "../db.ts";
import type { Payment, Prisma } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { GST_RATE } from "./billing.ts";
import { cashbackQuotes, useClaim } from "./campaigns.ts";
import { HttpError, badRequest } from "./errors.ts";
import { istDate, istTime, makeRef, rupee } from "./format.ts";
import {
  RazorpayError,
  capturePayment,
  createOrder,
  fetchOrderPayments,
  fetchPaymentDetail,
  razorpayConfigured,
  toPaise,
  type RzpPayment,
} from "./razorpay.ts";

// Wallet recharges through Razorpay.
//
//   1. createRecharge: a Payment (CREATED) and a Razorpay order for the total incl. GST.
//   2. The browser opens Razorpay Checkout for that order; the customer pays there.
//   3. settle: whatever tells us about a payment (the checkout's signed answer, a "Check status",
//      the webhook, or the sweep) fetches the payment from Razorpay itself and checks order,
//      amount and currency. Captured → the wallet is credited once; failed → FAILED, nothing credited.
//
// Crediting is idempotent: only a CREATED or FAILED Payment can become PAID (a customer may
// retry inside the same checkout after a failed attempt), inside one database transaction, and
// providerPaymentId is unique. Old "mock" payments from before Razorpay stay in history as they are.

type Tx = Prisma.TransactionClient;

export const NOT_CONNECTED = "Payments aren't connected yet, so recharges aren't available. Please try again later.";

const uniqueTxnRef = async (tx: Tx, prefix: string) => {
  for (;;) {
    const ref = makeRef(prefix);
    if (!(await tx.transaction.findUnique({ where: { ref }, select: { id: true } }))) return ref;
  }
};

/** Step 1: the Payment row and its Razorpay order. */
export async function createRecharge(userId: string, amount: number) {
  if (!razorpayConfigured()) throw new HttpError(503, NOT_CONNECTED, "payments_unavailable");
  const denom = await db.denomination.findUnique({ where: { amount } });
  if (!denom?.enabled) throw badRequest("That recharge amount isn't available.");
  const gst = Math.round(amount * GST_RATE);
  const total = amount + gst;
  // A claimed cashback offer that fits this amount (its use is taken when the payment succeeds).
  const [offer] = await cashbackQuotes(userId, [amount]);
  const id = `pay${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  let order;
  try {
    order = await createOrder({ amountPaise: toPaise(total), receipt: id, notes: { userId, paymentId: id, purpose: "wallet_recharge" } });
  } catch (e) {
    console.error("Razorpay order failed:", e instanceof RazorpayError ? e.message : e);
    throw new HttpError(502, "We couldn't start the payment. Please try again in a moment.", "payment_start_failed");
  }
  const payment = await db.payment.create({
    data: {
      id,
      userId,
      amount,
      gst,
      bonus: denom.bonus,
      cashback: offer?.cashback ?? 0,
      campaignClaimId: offer?.claimId ?? null,
      total,
      provider: "razorpay",
      providerOrderId: order.id,
    },
  });
  return { payment, offerName: offer?.name ?? null };
}

/** Credits the wallet for a paid Payment, exactly once. Returns the Payment as it ends up. */
export async function creditPayment(paymentId: string, paid: { providerPaymentId: string; method: string | null }) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    // Only one confirmation credits the wallet; a second one (retry, webhook, other tab) changes nothing.
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "FAILED"] } },
      data: { status: "PAID", paidAt: now, providerPaymentId: paid.providerPaymentId, method: paid.method, failureReason: null },
    });
    if (!count) return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const { userId } = payment;
    // The offer's cashback, if its use is still there (another recharge may have used it meanwhile).
    let extra = payment.cashback;
    if (extra > 0 && !(payment.campaignClaimId && (await useClaim(tx, payment.campaignClaimId, now)))) {
      extra = 0;
      await tx.payment.update({ where: { id: payment.id }, data: { cashback: 0 } });
    }
    await tx.wallet.upsert({
      where: { userId },
      create: { userId, service: payment.amount, promo: payment.bonus + extra },
      update: { service: { increment: payment.amount }, promo: { increment: payment.bonus + extra } },
    });
    await tx.transaction.create({ data: { userId, type: "Recharge", ref: await uniqueTxnRef(tx, "PAY"), bucket: "Service", amount: payment.amount } });
    if (payment.bonus > 0) {
      await tx.transaction.create({ data: { userId, type: "Cashback", ref: await uniqueTxnRef(tx, "CMP"), bucket: "Promotional", amount: payment.bonus } });
    }
    if (extra > 0) {
      await tx.transaction.create({ data: { userId, type: "Campaign cashback", ref: await uniqueTxnRef(tx, "CMC"), bucket: "Promotional", amount: extra } });
    }
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}

async function markFailed(payment: Payment, reason: string) {
  await db.payment.updateMany({ where: { id: payment.id, status: "CREATED" }, data: { status: "FAILED", failureReason: reason.slice(0, 300) } });
}

export type Settled =
  | { status: "PAID"; payment: Payment }
  | { status: "FAILED"; reason: string }
  | { status: "PENDING" };

const failureText = (p: RzpPayment) => p.error_description?.trim() || "The payment didn't go through.";

/**
 * Acts on what Razorpay says about one payment for this Payment's order. The payment object must
 * come from Razorpay (fetched with our keys, or a signed webhook), never from the browser.
 */
export async function settle(payment: Payment, rzp: RzpPayment): Promise<Settled> {
  if (rzp.order_id !== payment.providerOrderId || rzp.currency !== "INR" || rzp.amount !== toPaise(payment.total)) {
    // Someone posted a real payment from another order, or the amounts differ: never credit.
    console.error(`Razorpay payment ${rzp.id} doesn't match order ${payment.providerOrderId}; not credited.`);
    throw badRequest("That payment doesn't match this recharge.");
  }
  let p = rzp;
  if (p.status === "authorized") {
    // The Razorpay account doesn't capture automatically: capture it now (or see it already was).
    try {
      p = await capturePayment(p.id, p.amount);
    } catch (e) {
      if (!(e instanceof RazorpayError) || e.status === 0) throw e;
      const fresh = (await fetchOrderPayments(payment.providerOrderId)).find((x) => x.id === p.id);
      if (fresh) p = fresh;
    }
  }
  if (p.status === "captured" || p.status === "refunded") {
    const done = await creditPayment(payment.id, { providerPaymentId: p.id, method: p.method });
    if (done.providerPaymentId !== p.id) {
      // A second successful payment for an order that was already paid: the customer was charged
      // twice. Not credited again; flagged for Finance to refund.
      await audit(null, "payment.duplicate", p.id, `Second captured payment for ${payment.providerOrderId} (already paid by ${done.providerPaymentId}) · ${rupee(p.amount / 100)} · refund it from the Razorpay dashboard`);
    }
    return { status: "PAID", payment: done };
  }
  if (p.status === "failed") {
    await markFailed(payment, failureText(p));
    return { status: "FAILED", reason: failureText(p) };
  }
  return { status: "PENDING" };
}

/**
 * Asks Razorpay about every attempt on this Payment's order ("Check status", the sweep): a captured
 * or authorized one settles it; if every attempt failed it is FAILED; otherwise still PENDING.
 */
export async function reconcile(payment: Payment): Promise<Settled & { attempts?: number }> {
  if (payment.status === "PAID") return { status: "PAID", payment };
  const attempts = await fetchOrderPayments(payment.providerOrderId);
  const good = attempts.find((a) => a.status === "captured" || a.status === "refunded") ?? attempts.find((a) => a.status === "authorized");
  if (good) return settle(payment, good);
  if (attempts.length && attempts.every((a) => a.status === "failed")) {
    const latest = [...attempts].sort((a, b) => b.created_at - a.created_at)[0]!;
    await markFailed(payment, failureText(latest));
    return { status: "FAILED", reason: failureText(latest), attempts: attempts.length };
  }
  return { status: "PENDING", attempts: attempts.length };
}

/** A checkout that was never paid (closed, or the customer walked away) is closed after this long. */
const ABANDONED_AFTER_MS = 30 * 60_000;

/**
 * Once a minute: payments still open after a few minutes (UPI collect waits, a closed tab, a lost
 * answer from the checkout) are checked with Razorpay; never-attempted ones are closed after 30
 * minutes. The webhook does the same in production, sooner.
 */
export async function sweepPendingPayments(now = new Date()) {
  if (!razorpayConfigured()) return;
  const open = await db.payment.findMany({
    where: { provider: "razorpay", status: "CREATED", createdAt: { lt: new Date(now.getTime() - 3 * 60_000), gt: new Date(now.getTime() - 3 * 86400_000) } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  for (const payment of open) {
    try {
      const r = await reconcile(payment);
      if (r.status === "PENDING" && !r.attempts && now.getTime() - payment.createdAt.getTime() > ABANDONED_AFTER_MS) {
        await markFailed(payment, "Payment wasn't completed.");
      }
    } catch (e) {
      console.error(`Payment check for ${payment.providerOrderId} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

/** What the website shows about a Payment. */
export function paymentResult(payment: Payment) {
  return {
    orderId: payment.providerOrderId,
    paymentId: payment.providerPaymentId,
    method: payment.method,
    amount: payment.amount,
    gst: payment.gst,
    total: payment.total,
    bonus: payment.bonus,
    cashback: payment.cashback,
  };
}

// ── The customer's payment page (/wallet/payment/<order id>) ──

/** The wallet ledger lines a paid recharge writes, and which of the Payment's amounts each one is. */
const LEDGER_PART: Record<string, "amount" | "bonus" | "cashback"> = { Recharge: "amount", Cashback: "bonus", "Campaign cashback": "cashback" };
/** creditPayment writes paidAt and those lines in one database transaction: they are seconds apart at most. */
const LINK_WINDOW_MS = 15_000;

type LedgerLine = { ref: string; type: string; amount: number; createdAt: Date };
type PaidPayment = Pick<Payment, "providerOrderId" | "paidAt" | "amount" | "bonus" | "cashback">;

/**
 * Pairs wallet ledger lines with the paid recharge that wrote them (a Transaction has no link to
 * its Payment): the same customer, the matching amount, written within seconds of paidAt; the
 * closest one wins and each Payment part is used once. Returns ledger ref → Razorpay order id.
 */
function pairLines(lines: LedgerLine[], payments: PaidPayment[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const t of lines) {
    const part = LEDGER_PART[t.type];
    if (!part) continue;
    let best: PaidPayment | null = null;
    let bestGap = LINK_WINDOW_MS + 1;
    for (const p of payments) {
      if (!p.paidAt || p[part] !== t.amount || taken.has(`${p.providerOrderId}:${part}`)) continue;
      const gap = Math.abs(p.paidAt.getTime() - t.createdAt.getTime());
      if (gap < bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    if (best) {
      taken.add(`${best.providerOrderId}:${part}`);
      out.set(t.ref, best.providerOrderId);
    }
  }
  return out;
}

/** For the wallet's transaction list: ledger ref → the order id of the recharge it came from. */
export async function paymentRefsFor(userId: string, lines: LedgerLine[]): Promise<Map<string, string>> {
  const linked = lines.filter((t) => LEDGER_PART[t.type] && t.amount > 0);
  if (!linked.length) return new Map();
  const times = linked.map((t) => t.createdAt.getTime());
  const payments = await db.payment.findMany({
    where: {
      userId,
      status: "PAID",
      paidAt: { gte: new Date(Math.min(...times) - LINK_WINDOW_MS), lte: new Date(Math.max(...times) + LINK_WINDOW_MS) },
    },
    select: { providerOrderId: true, paidAt: true, amount: true, bonus: true, cashback: true },
  });
  return pairLines(linked, payments);
}

const BANKS: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  PUNB_R: "Punjab National Bank",
  BARB_R: "Bank of Baroda",
  YESB: "Yes Bank",
  IDFB: "IDFC FIRST Bank",
  INDB: "IndusInd Bank",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  FDRL: "Federal Bank",
};
const METHODS: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Netbanking",
  wallet: "Wallet",
  emi: "EMI",
  cardless_emi: "Cardless EMI",
  paylater: "Pay Later",
  app: "App",
  mock: "Test recharge",
};
const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** "UPI", "Card", … (null when not known). */
export const methodLabel = (method: string | null) => (method ? (METHODS[method] ?? titleCase(method)) : null);

/** The detail Razorpay has about how it was paid: UPI ID, "Visa •••• 1111 · credit", the bank, the wallet. */
async function methodDetail(providerPaymentId: string): Promise<string | null> {
  try {
    const p = await fetchPaymentDetail(providerPaymentId, 4_000);
    if (p.method === "upi") return p.vpa || null;
    if ((p.method === "card" || p.method === "emi") && p.card?.last4) {
      return [p.card.network, `•••• ${p.card.last4}`, p.card.type].filter(Boolean).join(" · ");
    }
    if (p.method === "netbanking" && p.bank) return BANKS[p.bank] ?? p.bank;
    if (p.method === "wallet" && p.wallet) return titleCase(p.wallet);
    return null;
  } catch (e) {
    // Only extra detail: the page shows the method without it.
    console.error(`Payment detail for ${providerPaymentId} unavailable:`, e instanceof Error ? e.message : e);
    return null;
  }
}

const istWhen = (d: Date) => `${istDate(d)}, ${istTime(d)} IST`;

/** Everything the customer's payment page shows about one of their recharges. */
export async function paymentReceipt(payment: Payment) {
  const status = payment.status === "PAID" ? "PAID" : payment.status === "FAILED" ? "FAILED" : "PENDING";
  const [detail, claim, lines] = await Promise.all([
    status === "PAID" && payment.provider === "razorpay" && payment.providerPaymentId ? methodDetail(payment.providerPaymentId) : null,
    payment.campaignClaimId
      ? db.campaignClaim.findUnique({ where: { id: payment.campaignClaimId }, select: { campaign: { select: { name: true } } } })
      : null,
    payment.paidAt
      ? db.transaction.findMany({
          where: {
            userId: payment.userId,
            type: { in: Object.keys(LEDGER_PART) },
            createdAt: { gte: new Date(payment.paidAt.getTime() - LINK_WINDOW_MS), lte: new Date(payment.paidAt.getTime() + LINK_WINDOW_MS) },
          },
          select: { ref: true, type: true, amount: true, createdAt: true, bucket: true },
        })
      : [],
  ]);
  const mine = pairLines(lines, [payment]);
  return {
    orderId: payment.providerOrderId,
    /** Our receipt number (also the order's receipt at Razorpay). */
    receipt: payment.id,
    status,
    provider: payment.provider,
    amount: payment.amount,
    gst: payment.gst,
    total: payment.total,
    bonus: payment.bonus,
    cashback: payment.cashback,
    cashbackFrom: payment.cashback > 0 ? (claim?.campaign.name ?? null) : null,
    paymentId: payment.providerPaymentId,
    method: methodLabel(payment.method),
    methodDetail: detail,
    createdAt: istWhen(payment.createdAt),
    paidAt: payment.paidAt ? istWhen(payment.paidAt) : null,
    failureReason: status === "FAILED" ? (payment.failureReason ?? "The payment didn't go through.") : null,
    refundedAmount: payment.refundedAmount,
    /** The wallet lines this payment wrote (Recharge, bonus, campaign cashback). */
    ledger: lines.filter((t) => mine.has(t.ref)).map((t) => ({ ref: t.ref, type: t.type, bucket: t.bucket, amount: t.amount })),
  };
}
