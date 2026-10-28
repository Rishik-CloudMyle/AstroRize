import { db } from "../db.ts";
import type { Prisma, WalletRefund } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { lockKey } from "./consultations.ts";
import { conflict, notFound } from "./errors.ts";
import { rupee } from "./format.ts";
import type { AuthContext } from "../middleware/auth.ts";
import { actorName } from "./rbac.ts";
import {
  RazorpayError,
  createRefund,
  fetchPaymentRefunds,
  fetchRefund,
  noteOf,
  razorpayConfigured,
  toPaise,
  type RzpRefund,
} from "./razorpay.ts";

// Wallet refunds (account deletion → service balance back to the customer) paid through Razorpay.
//
// When Finance clicks "Refund via Razorpay", the amount is split over the customer's captured
// Razorpay recharges, newest first, up to what each can still give back: its recharge amount
// (GST excluded — see REFUNDS_GST below) minus what was already refunded from it. One Razorpay
// refund is made per payment. The WalletRefund is PROCESSING while any is pending at Razorpay,
// PAID once all are processed and they cover the whole amount. Whatever Razorpay can't cover
// (balance from old pre-Razorpay recharges, or a refund Razorpay reports as failed) stays for
// Finance to pay by hand, as before.
//
// The parts (payment, refund id, amount, status) are kept as one Setting per refund
// ("walletRefund.razorpay.<ref>") — there is no table for them — and the refund ids are also
// written to WalletRefund.providerRef and the audit log.
//
// ⚠ Client decision: GST collected on a recharge is NOT refunded (only the wallet service balance
// the customer still has, which never included GST). Change REFUNDS_GST only once they decide.

type Tx = Prisma.TransactionClient;

/** Whether the GST paid on a recharge goes back with a refund (client decision; off). */
export const REFUNDS_GST = false;

export type PartStatus = "creating" | "pending" | "processed" | "failed";

export interface RefundPart {
  /** Our Payment.id and Razorpay's payment id (pay_…). */
  paymentId: string;
  rzpPaymentId: string;
  /** ₹ */
  amount: number;
  /** Sent to Razorpay as the refund's receipt, so a lost answer can be found again. */
  receipt: string;
  refundId: string | null;
  status: PartStatus;
  error?: string;
  at: string;
}

interface RefundRecord {
  parts: RefundPart[];
}

const recordKey = (ref: string) => `walletRefund.razorpay.${ref}`;

async function readRecord(client: Tx | typeof db, ref: string): Promise<RefundRecord> {
  const row = await client.setting.findUnique({ where: { key: recordKey(ref) } });
  const value = row?.value as RefundRecord | undefined;
  return { parts: Array.isArray(value?.parts) ? value.parts : [] };
}

async function writeRecord(tx: Tx, ref: string, record: RefundRecord) {
  const value = record as unknown as Prisma.InputJsonValue;
  await tx.setting.upsert({ where: { key: recordKey(ref) }, create: { key: recordKey(ref), value }, update: { value } });
}

/** Parts per refund ref, for the Finance list. */
export async function refundRecords(refs: string[]): Promise<Map<string, RefundPart[]>> {
  if (!refs.length) return new Map();
  const rows = await db.setting.findMany({ where: { key: { in: refs.map(recordKey) } } });
  return new Map(rows.map((r) => [r.key.slice(recordKey("").length), ((r.value as unknown as RefundRecord).parts ?? []) as RefundPart[]]));
}

const live = (p: RefundPart) => p.status !== "failed";
const sum = (parts: RefundPart[]) => parts.reduce((s, p) => s + p.amount, 0);

/** What Razorpay has given back (processed), has in hand (pending) and what is left for this refund. */
export function refundProgress(amount: number, parts: RefundPart[]) {
  const processed = sum(parts.filter((p) => p.status === "processed"));
  const inFlight = sum(parts.filter((p) => p.status === "pending" || p.status === "creating"));
  return { processed, inFlight, remaining: Math.max(0, amount - processed - inFlight) };
}

/** The customer's captured Razorpay recharges that can still be refunded, newest first. */
async function refundablePayments(client: Tx | typeof db, userId: string) {
  const payments = await client.payment.findMany({
    where: { userId, provider: "razorpay", status: "PAID", providerPaymentId: { not: null } },
    orderBy: { paidAt: "desc" },
  });
  return payments
    .map((p) => ({ payment: p, refundable: (REFUNDS_GST ? p.total : p.amount) - p.refundedAmount }))
    .filter((x) => x.refundable > 0);
}

/** How much of `amount` Razorpay can still refund for this customer. */
export async function razorpayCoverable(userId: string, amount: number): Promise<number> {
  const list = await refundablePayments(db, userId);
  return Math.min(amount, list.reduce((s, x) => s + x.refundable, 0));
}

/**
 * Sets the WalletRefund's status from its parts (inside the caller's lock). Returns the new status.
 * PAID once the processed parts cover it; PROCESSING while any is pending; otherwise it waits for
 * Finance (PENDING when Razorpay paid part of it, FAILED when Razorpay paid none of it).
 */
async function resolveStatus(tx: Tx, r: WalletRefund, parts: RefundPart[]) {
  if (r.status === "PAID") return r.status;
  const { processed, inFlight, remaining } = refundProgress(r.amount, parts);
  const ids = parts.filter((p) => p.refundId && live(p)).map((p) => p.refundId);
  const failed = parts.filter((p) => p.status === "failed");
  let status: string;
  let note: string | null = r.note;
  if (inFlight > 0) status = "PROCESSING";
  else if (remaining === 0) {
    status = "PAID";
    note = `Refunded through Razorpay${parts.filter(live).length > 1 ? ` in ${parts.filter(live).length} parts` : ""}.`;
  } else if (processed > 0) {
    status = "PENDING";
    note = `${rupee(processed)} refunded through Razorpay. ${rupee(remaining)} left to pay by hand${failed.length ? ` (Razorpay: ${failed.at(-1)!.error ?? "refund failed"})` : ""}.`;
  } else if (failed.length) {
    status = "FAILED";
    note = `Razorpay refund failed: ${failed.at(-1)!.error ?? "no reason given"}. Refund again or pay by hand.`;
  } else status = r.status;
  await tx.walletRefund.update({
    where: { id: r.id },
    data: {
      status,
      note,
      providerRef: ids.length ? ids.join(", ") : r.providerRef,
      ...(status === "PAID" ? { processedAt: new Date() } : {}),
    },
  });
  return status;
}

/** Hands a part's reserved amount back to its payment (the refund didn't happen). */
const releasePart = (tx: Tx, part: RefundPart) =>
  tx.payment.update({ where: { id: part.paymentId }, data: { refundedAmount: { decrement: part.amount } } });

/**
 * Finance → "Refund via Razorpay". Refunds what is still owed over the customer's Razorpay
 * payments (newest first) and returns what happened. Safe against double clicks: the refund is
 * claimed (PROCESSING) and the amounts reserved on the payments before Razorpay is called.
 */
export async function refundViaRazorpay(admin: AuthContext, ref: string) {
  if (!razorpayConfigured()) throw conflict("Razorpay isn't connected, so this refund has to be paid by hand.");
  const claimed = await db.$transaction(async (tx) => {
    await lockKey(tx, `wrf:${ref}`);
    const r = await tx.walletRefund.findUnique({ where: { ref } });
    if (!r) throw notFound("Refund not found.");
    if (r.status !== "PENDING" && r.status !== "FAILED") throw conflict(`${r.ref} is already ${r.status.toLowerCase()}.`);
    // Two refunds of the same customer never split the same payments at once.
    await lockKey(tx, `wrf-user:${r.userId}`);
    const record = await readRecord(tx, ref);
    const { remaining } = refundProgress(r.amount, record.parts);
    if (remaining <= 0) throw conflict(`${r.ref} has nothing left to refund.`);
    const plan: RefundPart[] = [];
    let left = remaining;
    for (const { payment, refundable } of await refundablePayments(tx, r.userId)) {
      if (left <= 0) break;
      const amount = Math.min(left, refundable);
      left -= amount;
      plan.push({
        paymentId: payment.id,
        rzpPaymentId: payment.providerPaymentId!,
        amount,
        receipt: `${ref}-${record.parts.length + plan.length + 1}`,
        refundId: null,
        status: "creating",
        at: new Date().toISOString(),
      });
      await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount: { increment: amount } } });
    }
    if (!plan.length) {
      throw conflict(`This customer has no Razorpay payments left to refund to (their balance came from earlier recharges). Pay ${rupee(remaining)} by hand.`);
    }
    record.parts.push(...plan);
    await writeRecord(tx, ref, record);
    await tx.walletRefund.update({
      where: { id: r.id },
      data: { status: "PROCESSING", processedById: admin.user.id, processedBy: actorName(admin) },
    });
    return { r, plan, uncovered: left };
  });

  // Razorpay, one refund per payment. Each answer is saved as it comes.
  for (const part of claimed.plan) {
    let update: Partial<RefundPart>;
    try {
      const refund = await createRefund(part.rzpPaymentId, {
        amountPaise: toPaise(part.amount),
        receipt: part.receipt,
        notes: { walletRefund: ref, paymentId: part.paymentId },
      });
      update = { refundId: refund.id, status: refund.status === "processed" ? "processed" : refund.status === "failed" ? "failed" : "pending" };
    } catch (e) {
      // A refused refund (e.g. already fully refunded at Razorpay) didn't happen. If Razorpay
      // couldn't be reached it may have, so that part stays "creating" and the sweep looks it up.
      if (e instanceof RazorpayError && e.status !== 0) update = { status: "failed", error: e.description };
      else update = { status: "creating" };
    }
    await applyPart(ref, (p) => p.receipt === part.receipt, update);
  }

  const done = await db.walletRefund.findUniqueOrThrow({ where: { ref } });
  const parts = (await readRecord(db, ref)).parts;
  const sent = parts.filter((p) => claimed.plan.some((x) => x.receipt === p.receipt));
  await audit(
    admin,
    "wallet.refund.razorpay",
    ref,
    `${claimed.r.status} → ${done.status} · ${sent.map((p) => `${rupee(p.amount)} of ${p.rzpPaymentId} → ${p.refundId ?? "no refund id"} (${p.status}${p.error ? `: ${p.error}` : ""})`).join("; ")}` +
      (claimed.uncovered > 0 ? ` · ${rupee(claimed.uncovered)} not covered by Razorpay payments (pay by hand)` : ""),
  );
  return { status: done.status, parts: sent, uncovered: claimed.uncovered };
}

/**
 * Applies a change to one part (found by `match`) under the refund's lock, releases the reserved
 * amount when a part turns failed, and re-resolves the refund's status.
 */
async function applyPart(ref: string, match: (p: RefundPart) => boolean, update: Partial<RefundPart>) {
  return db.$transaction(async (tx) => {
    await lockKey(tx, `wrf:${ref}`);
    const r = await tx.walletRefund.findUnique({ where: { ref } });
    if (!r) return null;
    const record = await readRecord(tx, ref);
    const part = record.parts.find(match);
    if (!part) return null;
    const before = part.status;
    // A part's outcome is final once processed or failed.
    if (before === "processed" || before === "failed") return { status: r.status, changed: false };
    Object.assign(part, update);
    if (part.status === "failed") await releasePart(tx, part);
    await writeRecord(tx, ref, record);
    const status = await resolveStatus(tx, r, record.parts);
    return { status, changed: part.status !== before, from: r.status };
  });
}

/** A refund's status from Razorpay (webhook or polling). Ignores refunds we didn't make. */
export async function syncRefund(refund: RzpRefund) {
  const ref = noteOf(refund, "walletRefund");
  if (!ref) return null;
  const status: PartStatus = refund.status === "processed" ? "processed" : refund.status === "failed" ? "failed" : "pending";
  const result = await applyPart(ref, (p) => p.refundId === refund.id || (!p.refundId && p.rzpPaymentId === refund.payment_id && p.status === "creating"), {
    refundId: refund.id,
    status,
    ...(status === "failed" ? { error: "Razorpay couldn't complete the refund." } : {}),
  });
  if (result?.changed && result.status !== result.from) {
    await audit(null, "wallet.refund.razorpay.status", ref, `${result.from} → ${result.status} · ${refund.id} ${refund.status}`);
  }
  return result;
}

/** Re-reads one refund's open parts from Razorpay (the sweep, and Finance's "Check status"). */
export async function checkRefund(ref: string) {
  const parts = (await readRecord(db, ref)).parts;
  for (const part of parts) {
    try {
      if (part.status === "pending" && part.refundId) await syncRefund(await fetchRefund(part.refundId));
      else if (part.status === "creating" && Date.now() - new Date(part.at).getTime() > 2 * 60_000) {
        // Our call to Razorpay never got an answer: find the refund by its receipt, or release it.
        const found = (await fetchPaymentRefunds(part.rzpPaymentId)).find((x) => x.receipt === part.receipt);
        if (found) await syncRefund({ ...found, notes: { walletRefund: ref } });
        else await applyPart(ref, (p) => p.receipt === part.receipt, { status: "failed", error: "The refund request didn't reach Razorpay." });
      }
    } catch (e) {
      if (!(e instanceof RazorpayError)) throw e;
      console.error(`Refund check for ${ref} failed:`, e.message);
    }
  }
  return db.walletRefund.findUniqueOrThrow({ where: { ref } });
}

/** Once a minute: refunds still processing at Razorpay are checked (the webhook does it sooner). */
export async function sweepProcessingRefunds() {
  if (!razorpayConfigured()) return;
  const open = await db.walletRefund.findMany({ where: { status: "PROCESSING" }, orderBy: { createdAt: "asc" }, take: 20 });
  for (const r of open) await checkRefund(r.ref);
}
