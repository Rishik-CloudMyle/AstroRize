import { db } from "../db.ts";
import { badRequest, conflict, notFound } from "./errors.ts";
import { rupee } from "./format.ts";
import { hdfcFile, type BankRow } from "./payout-bank-file.ts";
import { open } from "./secret-box.ts";

// Manual payouts: Finance downloads the bank file for finalised payouts, pays from the company
// account and records each result. A payout goes into one bank file only (it leaves the queue), a
// paid one can't be paid, exported or retried again, and a bank reference (UTR) is used once.

const istDay = (at: Date) => new Date(at.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const referenceOf = (payoutId: string) => `AR${payoutId.slice(-14).toUpperCase()}`;

/**
 * The HDFC file. Without `ref`: every finalised payout waiting to be paid by bank transfer (they
 * move to "in bank file"). With `ref`: that earlier file again, less anything since recorded as paid
 * or failed.
 */
export async function bankFile(ref?: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payout:manual'))`;
    const waiting = await tx.payout.findMany({
      where: ref ? { provider: "manual", exportRef: ref, state: "PROCESSING" } : { provider: "manual", state: "QUEUED" },
      orderBy: { createdAt: "asc" },
      include: { astrologer: { select: { name: true } } },
    });
    const accounts = new Map((await tx.payoutAccount.findMany({ where: { astrologerId: { in: waiting.map((p) => p.astrologerId) } } })).map((a) => [a.astrologerId, a]));
    const [y, m, d] = istDay(now).split("-");
    const rows: BankRow[] = [];
    const ids: string[] = [];
    const skipped: { astrologer: string; reason: string }[] = [];
    for (const p of waiting) {
      const a = accounts.get(p.astrologerId);
      if (!a || a.kind !== "BANK") {
        skipped.push({ astrologer: p.astrologer.name, reason: a ? "UPI id only — pay it separately, then record it" : "no bank details on file" });
        continue;
      }
      ids.push(p.id);
      rows.push({ reference: referenceOf(p.id), beneficiaryCode: p.astrologerId, holderName: a.holderName, accountNumber: open(a.accountNumberEnc!), ifsc: a.ifsc!, amount: p.amount, date: `${d}/${m}/${y}` });
    }
    if (!rows.length) throw conflict(ref ? "Nothing in that file is still waiting to be recorded." : "No finalised payouts to bank accounts are waiting for a bank file.");
    const fileRef = ref ?? `HDFC-${y}${m}${d}-${now.getTime().toString(36).toUpperCase()}`;
    if (!ref) {
      await tx.payout.updateMany({ where: { id: { in: ids }, state: "QUEUED" }, data: { state: "PROCESSING", exportRef: fileRef, exportedAt: now, failureReason: null } });
    }
    return { ref: fileRef, fileName: `${fileRef}.csv`, content: hdfcFile(rows), count: rows.length, total: rows.reduce((s, r) => s + r.amount, 0), skipped };
  });
}

/** Finalised payouts with beneficiary bank details, for the Excel sheet. */
export async function payoutSheet() {
  const rows = await db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 1000, include: { astrologer: { select: { name: true } }, batch: { select: { cycle: true } } } });
  const accounts = new Map((await db.payoutAccount.findMany()).map((a) => [a.astrologerId, a]));
  return rows.map((p) => {
    const a = accounts.get(p.astrologerId);
    return {
      batch: p.batchId,
      cycle: p.batch.cycle,
      astrologer: p.astrologer.name,
      beneficiary: a?.holderName ?? "",
      accountNumber: a?.kind === "BANK" ? open(a.accountNumberEnc!) : "",
      ifsc: a?.ifsc ?? "",
      upiId: a?.upiId ?? "",
      earned: p.gross,
      tds: p.tds,
      amount: p.amount,
      state: p.state,
      reference: p.provider === "manual" ? referenceOf(p.id) : (p.razorpayPayoutId ?? ""),
      utr: p.utr ?? "",
      paidOn: p.paidAt ? istDay(p.paidAt) : "",
    };
  });
}

export type ManualUpdate = { status: "PAID"; utr: string; paidOn: string } | { status: "FAILED" | "RETURNED"; reason: string };

/** Finance records what the bank did with one transfer. */
export async function recordManualPayout(id: string, u: ManualUpdate, by: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payout:manual'))`;
    const p = await tx.payout.findUnique({ where: { id }, include: { astrologer: { select: { name: true } } } });
    if (!p) throw notFound("That payout doesn't exist.");
    if (p.provider !== "manual") throw conflict("This payout is sent automatically; its status comes from the payment provider.");
    const what = `${p.batchId} · ${p.astrologer.name} · ${rupee(p.amount)}`;
    const open_ = p.state === "QUEUED" || p.state === "PROCESSING";
    if (u.status === "RETURNED") {
      if (p.state !== "PROCESSED") throw conflict("Only a paid transfer can be marked as returned by the bank.");
    } else if (!open_) {
      throw conflict(p.state === "PROCESSED" ? `Already paid (UTR ${p.utr}). It can't be recorded or paid again.` : "This one failed or was returned: use Retry first.");
    }
    if (u.status !== "PAID") {
      const state = u.status === "FAILED" ? "FAILED" : "REVERSED";
      await tx.payout.update({ where: { id }, data: { state, failureReason: u.reason, markedByName: by } });
      return { state, diff: `${what} · ${p.state} → ${state} — ${u.reason}` };
    }
    const utr = u.utr.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{6,35}$/.test(utr)) throw badRequest("Enter the bank's reference (UTR): 6 to 35 letters and numbers.");
    const paidAt = new Date(`${u.paidOn}T12:00:00+05:30`);
    if (Number.isNaN(paidAt.getTime()) || u.paidOn > istDay(new Date())) throw badRequest("Enter the payment date (today or earlier).");
    if (u.paidOn < istDay(p.createdAt)) throw badRequest("The payment date can't be before the payout was finalised.");
    const used = await tx.payout.findFirst({ where: { utr, id: { not: id } }, include: { astrologer: { select: { name: true } } } });
    if (used) throw conflict(`UTR ${utr} is already recorded for ${used.astrologer.name} (${used.batchId}). Check the bank statement.`);
    await tx.payout.update({ where: { id }, data: { state: "PROCESSED", utr, paidAt, mode: "BANK", failureReason: null, markedByName: by } });
    return { state: "PROCESSED", diff: `${what} · paid ${u.paidOn} · UTR ${utr}` };
  });
}
