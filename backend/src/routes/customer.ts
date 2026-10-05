import { randomUUID } from "node:crypto";
import { Router } from "express";
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
import { istDate, makeRef, rupee } from "../lib/format.ts";
import { endConsultation, settlementView } from "../lib/consultations.ts";
import { configNumber } from "../lib/settings.ts";
import { roleGuard, type AuthContext } from "../middleware/auth.ts";
import type { Prisma } from "../generated/prisma/client.ts";

// Everything here belongs to a signed-in customer.
export const customerRouter = Router();
customerRouter.use(["/wallet", "/consultations", "/instant-calls", "/me"], roleGuard("customer"));

const auth = (req: import("express").Request) => req.auth as AuthContext;

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
  const [wallet, transactions] = await Promise.all([
    walletOf(userId),
    db.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
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
  res.json({ credited: payment.amount, bonus: payment.bonus, wallet: await walletView(userId) });
});

// ── Consultations ──

const modeSchema = z.enum(["CHAT", "VOICE", "VIDEO"]);

customerRouter.post("/consultations", async (req, res) => {
  const me = auth(req);
  const { astrologerId, mode } = z.object({ astrologerId: z.string(), mode: modeSchema }).parse(req.body);
  const astrologer = await db.astrologer.findUnique({ where: { id: astrologerId } });
  if (!astrologer || astrologer.lifecycle !== "active") throw notFound("This astrologer isn't available.");
  if (astrologer.presence === "OFF" || astrologer.suspension !== "none") throw conflict(`${astrologer.name} is offline right now.`);

  const open = await db.consultation.findFirst({ where: { customerId: me.user.id, status: { in: ["CONNECTING", "ACTIVE"] } } });
  if (open) throw conflict("You already have a consultation in progress. End it before starting another.");

  const wallet = await walletOf(me.user.id);
  const spendable = wallet.service + wallet.promo - wallet.held;
  const rate = rateFor(astrologer.price, mode as Mode);
  const needed = rate * ELIGIBILITY_MINUTES;
  if (spendable < needed) {
    throw badRequest(`Your balance is ${rupee(spendable)}. You need ${rupee(needed)} for five minutes at ${rupee(rate)}/min.`);
  }

  const ref = await uniqueRef("SES", async (r) => !!(await db.consultation.findUnique({ where: { ref: r } })));
  const alias = `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(1000 + Math.random() * 8999)}`;
  // Hold the available balance for the length of the session; one debit is taken at the end.
  const [consultation] = await db.$transaction([
    db.consultation.create({
      data: { ref, customerId: me.user.id, customerAlias: alias, astrologerId, mode, rate, status: "CONNECTING", heldAmount: spendable },
    }),
    db.wallet.update({ where: { userId: me.user.id }, data: { held: { increment: spendable } } }),
  ]);
  res.status(201).json({ consultation: { id: consultation.id, ref, rate, held: spendable, status: consultation.status } });
});

async function ownConsultation(userId: string, id: string) {
  const c = await db.consultation.findUnique({ where: { id } });
  if (!c || c.customerId !== userId) throw notFound("Consultation not found.");
  return c;
}

/** The astrologer picked up. (Until the calling provider is integrated, connection is immediate.) */
customerRouter.post("/consultations/:id/connect", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  if (c.status !== "CONNECTING") throw conflict("This consultation can no longer connect.");
  const updated = await db.consultation.update({ where: { id: c.id }, data: { status: "ACTIVE", connectedAt: new Date() } });
  const freeSeconds = await configNumber("consult.free_seconds", 60);
  res.json({
    consultation: { id: updated.id, status: updated.status, connectedAt: updated.connectedAt },
    freeSeconds,
    maxSeconds: Math.min(MAX_SESSION_SECONDS, affordableSeconds(c.heldAmount, c.rate, freeSeconds)),
  });
});

/** Ends the consultation and takes the single debit, metered by the server clock. */
customerRouter.post("/consultations/:id/end", async (req, res) => {
  const c = await ownConsultation(auth(req).user.id, String(req.params.id));
  const ended = await endConsultation(c, "user");
  res.json({ settlement: settlementView(ended) });
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

/** Instant Call: a first-come request at the instant rate. Nothing is charged until it connects. */
customerRouter.post("/instant-calls", async (req, res) => {
  const me = auth(req);
  const { astrologerId } = z.object({ astrologerId: z.string() }).parse(req.body);
  const astrologer = await db.astrologer.findUnique({ where: { id: astrologerId } });
  if (!astrologer || astrologer.presence === "OFF") throw conflict("This astrologer is offline — Instant Call isn't available.");
  const rate = instantRate(astrologer.price, astrologer.instantMultiplier);
  const wallet = await walletOf(me.user.id);
  const spendable = wallet.service + wallet.promo - wallet.held;
  if (spendable < rate * ELIGIBILITY_MINUTES) {
    throw badRequest(`Instant Call needs ${rupee(rate * ELIGIBILITY_MINUTES)} for five minutes at ${rupee(rate)}/min. Your balance is ${rupee(spendable)}.`);
  }
  const ref = await uniqueRef("SES", async (r) => !!(await db.consultation.findUnique({ where: { ref: r } })));
  const alias = `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(1000 + Math.random() * 8999)}`;
  await db.consultation.create({
    data: { ref, customerId: me.user.id, customerAlias: alias, astrologerId, mode: "VOICE", kind: "INSTANT", rate, status: "REQUESTED" },
  });
  res.status(201).json({ ref, rate, message: `Ringing ${astrologer.name} at ${rupee(rate)}/min. Billing starts only once the call connects.` });
});

// ── Data rights (DPDP) ──

customerRouter.post("/me/data-requests", async (req, res) => {
  const { kind } = z.object({ kind: z.enum(["download", "correct", "consent", "nominee", "delete"]) }).parse(req.body);
  const request = await db.dataRequest.create({ data: { userId: auth(req).user.id, kind } });
  res.status(201).json({ request: { id: request.id, kind, status: request.status } });
});
