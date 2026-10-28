import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { rupee } from "../../lib/format.ts";
import { reconcile } from "../../lib/payments.ts";
import { RazorpayError, razorpayConfigured, razorpayMode } from "../../lib/razorpay.ts";
import { requirePage } from "../../lib/rbac.ts";

// Wallet recharges (Finance page → "Recharge payments"): every Payment with its Razorpay order and
// payment ids, method, status, failure reason and what has been refunded from it.

export const paymentsRouter = Router();

const STATUSES = ["CREATED", "PAID", "FAILED"] as const;

paymentsRouter.get("/payments", async (req, res) => {
  requirePage(req, "finance");
  const { status, q } = z
    .object({ status: z.enum(STATUSES).optional().catch(undefined), q: z.string().trim().max(80).optional().catch(undefined) })
    .parse(req.query);
  const rows = await db.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ providerOrderId: { contains: q } }, { providerPaymentId: { contains: q } }, { user: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true } } },
  });
  res.json({
    razorpay: { connected: razorpayConfigured(), mode: razorpayConfigured() ? razorpayMode() : null },
    payments: rows.map((p) => ({
      orderId: p.providerOrderId,
      paymentId: p.providerPaymentId,
      provider: p.provider,
      method: p.method,
      status: p.status,
      failureReason: p.failureReason,
      customer: `${p.user.name} · CUS-${p.userId.slice(-6).toUpperCase()}`,
      amount: p.amount,
      gst: p.gst,
      total: p.total,
      bonus: p.bonus,
      cashback: p.cashback,
      refunded: p.refundedAmount,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
  });
});

/** Asks Razorpay about an open (or failed) recharge and settles it: credits the wallet if it was paid. */
paymentsRouter.post("/payments/:orderId/check", async (req, res) => {
  requirePage(req, "finance");
  const payment = await db.payment.findUnique({ where: { providerOrderId: String(req.params.orderId) } });
  if (!payment) throw notFound("Payment not found.");
  if (payment.provider !== "razorpay") throw conflict("Only Razorpay payments can be checked.");
  if (payment.status === "PAID") return res.json({ ok: true, status: "PAID" });
  if (!razorpayConfigured()) throw conflict("Razorpay isn't connected.");
  let result;
  try {
    result = await reconcile(payment);
  } catch (e) {
    if (e instanceof RazorpayError) throw conflict(`Razorpay couldn't be asked: ${e.description}`);
    throw e;
  }
  if (result.status === "PAID") {
    await audit(req.auth ?? null, "payment.reconcile", payment.providerOrderId, `${payment.status} → PAID · ${rupee(payment.total)} · credited`);
  }
  res.json({ ok: true, status: result.status, reason: result.status === "FAILED" ? result.reason : null });
});
