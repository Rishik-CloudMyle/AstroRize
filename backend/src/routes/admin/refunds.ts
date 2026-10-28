import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { razorpayConfigured } from "../../lib/razorpay.ts";
import { checkRefund, razorpayCoverable, refundProgress, refundRecords, refundViaRazorpay } from "../../lib/wallet-refunds.ts";
import { rupee } from "../../lib/format.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";

// Customer wallet refunds (Finance page). Created when a customer deletes their account: the
// service balance goes back to the original payment method.
//
// With Razorpay connected, Finance clicks "Refund via Razorpay": the amount is refunded over the
// customer's Razorpay recharges (lib/wallet-refunds.ts) and Razorpay's answer (webhook, or the
// minute sweep) marks it paid. What Razorpay can't cover — balance from recharges made before
// Razorpay, or a refund it reports as failed — Finance still pays by hand and records the
// bank / gateway reference here.

export const refundsRouter = Router();

/** Short, stable customer reference for the list (the account's name is erased on deletion). */
const customerRef = (userId: string) => `CUS-${userId.slice(-6).toUpperCase()}`;

refundsRouter.get("/refunds", async (req, res) => {
  requirePage(req, "finance");
  const rows = await db.walletRefund.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } } },
  });
  // Waiting ones first (oldest first, so nobody waits longest), then the rest, newest first.
  const open = (st: string) => st === "PENDING" || st === "PROCESSING";
  const pending = rows.filter((r) => open(r.status)).reverse();
  const done = rows.filter((r) => !open(r.status));
  const records = await refundRecords(rows.map((r) => r.ref));
  const connected = razorpayConfigured();
  const list = await Promise.all(
    [...pending, ...done].map(async (r) => {
      const parts = records.get(r.ref) ?? [];
      const progress = refundProgress(r.amount, parts);
      // What a "Refund via Razorpay" click could still send (only while it waits for Finance).
      const coverable = connected && (r.status === "PENDING" || r.status === "FAILED") && progress.remaining > 0 ? await razorpayCoverable(r.userId, progress.remaining) : 0;
      return {
        ref: r.ref,
        amount: r.amount,
        customer: `${r.user.name} · ${customerRef(r.userId)}`,
        reason: r.reason === "ACCOUNT_DELETION" ? "Account deleted" : r.reason,
        method: r.method,
        status: r.status,
        requestedAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
        processedBy: r.processedBy,
        providerRef: r.providerRef,
        note: r.note,
        razorpay: {
          parts: parts.map((p) => ({ paymentId: p.rzpPaymentId, refundId: p.refundId, amount: p.amount, status: p.status, error: p.error ?? null })),
          processed: progress.processed,
          inFlight: progress.inFlight,
          /** Still owed after Razorpay's processed and pending refunds. */
          remaining: progress.remaining,
          /** How much of `remaining` Razorpay can refund now; the rest is paid by hand. */
          coverable,
        },
      };
    }),
  );
  res.json({
    refunds: list,
    pendingTotal: pending.reduce((s, r) => s + r.amount, 0),
    razorpayConnected: connected,
  });
});

async function refundOf(ref: string) {
  const r = await db.walletRefund.findUnique({ where: { ref } });
  if (!r) throw notFound("Refund not found.");
  return r;
}

/** Paid by hand (bank transfer or the gateway dashboard): needs the provider / bank reference. A failed one can be paid later. */
refundsRouter.post("/refunds/:ref/paid", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "wallet.refund.process", "Your role can't process wallet refunds.");
  const { providerRef } = z
    .object({ providerRef: z.string().trim().min(4, "Enter the payment or bank reference (at least 4 characters).").max(80, "References can be up to 80 characters.") })
    .parse(req.body);
  const r = await refundOf(String(req.params.ref));
  if (r.status === "PAID") throw conflict(`${r.ref} is already marked as paid.`);
  if (r.status === "PROCESSING") throw conflict(`${r.ref} is being refunded through Razorpay. Check its status first.`);
  // Part of it may already have gone back through Razorpay: keep those refund ids too.
  const reference = r.providerRef ? `${r.providerRef} · ${providerRef}` : providerRef;
  const { count } = await db.walletRefund.updateMany({
    where: { id: r.id, status: r.status },
    data: { status: "PAID", providerRef: reference.slice(0, 500), processedById: admin.user.id, processedBy: actorName(admin), processedAt: new Date() },
  });
  if (!count) throw conflict(`${r.ref} was just updated by someone else. Refresh and check it.`);
  await audit(admin, "wallet.refund.paid", r.ref, `${r.status} → PAID · ${rupee(r.amount)} · reference ${providerRef}`);
  res.json({ ok: true });
});

/** The payment could not be made (e.g. card closed): needs a note saying why and what happens next. */
refundsRouter.post("/refunds/:ref/failed", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "wallet.refund.process", "Your role can't process wallet refunds.");
  const { note } = z
    .object({ note: z.string().trim().min(5, "Say why it failed (at least 5 characters).").max(500, "Notes can be up to 500 characters.") })
    .parse(req.body);
  const r = await refundOf(String(req.params.ref));
  if (r.status !== "PENDING") throw conflict(`${r.ref} is already ${r.status.toLowerCase()}.`);
  const { count } = await db.walletRefund.updateMany({
    where: { id: r.id, status: "PENDING" },
    data: { status: "FAILED", note, processedById: admin.user.id, processedBy: actorName(admin), processedAt: new Date() },
  });
  if (!count) throw conflict(`${r.ref} was just updated by someone else. Refresh and check it.`);
  await audit(admin, "wallet.refund.failed", r.ref, `PENDING → FAILED · ${rupee(r.amount)} · ${note}`);
  res.json({ ok: true });
});

/** Refunds what is still owed through Razorpay, over the customer's Razorpay recharges (newest first). */
refundsRouter.post("/refunds/:ref/razorpay", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "wallet.refund.process", "Your role can't process wallet refunds.");
  const result = await refundViaRazorpay(admin, String(req.params.ref));
  res.json({ ok: true, ...result });
});

/** Asks Razorpay for the latest status of this refund's open parts. */
refundsRouter.post("/refunds/:ref/check", async (req, res) => {
  requirePage(req, "finance");
  requireCapability(req, "wallet.refund.process", "Your role can't process wallet refunds.");
  const r = await refundOf(String(req.params.ref));
  if (!razorpayConfigured()) throw conflict("Razorpay isn't connected.");
  const after = await checkRefund(r.ref);
  res.json({ ok: true, status: after.status });
});
