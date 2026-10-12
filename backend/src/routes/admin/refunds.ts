import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, notFound } from "../../lib/errors.ts";
import { rupee } from "../../lib/format.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";

// Customer wallet refunds (Finance page). Created when a customer deletes their account: the
// service balance goes back to the original payment method.
//
// ⚠ Until the Razorpay keys are configured, Finance pays these by hand and records the bank /
// gateway reference here. Once Razorpay is connected, refunds should be issued automatically
// through its Refunds API (against the original payment id) and confirmed by its webhook; this
// page then only handles the ones the gateway reports as failed.

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
  const pending = rows.filter((r) => r.status === "PENDING").reverse();
  const done = rows.filter((r) => r.status !== "PENDING");
  res.json({
    refunds: [...pending, ...done].map((r) => ({
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
    })),
    pendingTotal: pending.reduce((s, r) => s + r.amount, 0),
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
  const { count } = await db.walletRefund.updateMany({
    where: { id: r.id, status: r.status },
    data: { status: "PAID", providerRef, processedById: admin.user.id, processedBy: actorName(admin), processedAt: new Date() },
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
