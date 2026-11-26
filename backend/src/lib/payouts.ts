import { db } from "../db.ts";
import type { PayoutAccount } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { loadTdsContext, type TdsLine } from "./tds.ts";
import { badRequest, conflict, notFound } from "./errors.ts";
import { rupee } from "./format.ts";
import { PayoutProviderError, fingerprintOf, payoutProvider, type Outcome } from "./payout-providers/index.ts";
import { open, seal } from "./secret-box.ts";

// Paying astrologers: when Finance releases (finalises) a payout batch, one Payout row per astrologer
// is made for what they are owed minus TDS. It moves QUEUED → PROCESSING → PROCESSED, or FAILED
// (retry from Finance) / REVERSED. Who moves the money is the payout provider's business
// (lib/payout-providers): by default Finance pays from the company bank account and records it
// (lib/payout-manual.ts); an automatic provider sends it from here. Money is never sent twice: one
// row per astrologer per batch, every attempt has its own idempotency key, and only a human retries.

// ── Payout details ──

export interface AccountInput {
  kind: "BANK" | "UPI";
  holderName: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  pan: string;
}

const NO_DETAILS = "No payout details on file — the astrologer adds them under Earnings → Payout details. Then retry.";
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/;

/** Checks and tidies what an astrologer typed; throws a plain message when something is wrong. */
export function checkAccountInput(i: AccountInput): AccountInput {
  const holderName = i.holderName.trim().replace(/\s+/g, " ");
  if (holderName.length < 2 || holderName.length > 60) throw badRequest("Enter the account holder's name as it appears at the bank.");
  const pan = i.pan.trim().toUpperCase();
  if (!PAN.test(pan)) throw badRequest("Enter a valid PAN, like ABCDE1234F — it is needed to deduct TDS.");
  if (i.kind === "UPI") {
    const upiId = (i.upiId ?? "").trim().toLowerCase();
    if (!UPI.test(upiId)) throw badRequest("Enter a valid UPI id, like name@bank.");
    return { kind: "UPI", holderName, upiId, pan };
  }
  const accountNumber = (i.accountNumber ?? "").replace(/\s+/g, "");
  if (!/^\d{9,18}$/.test(accountNumber)) throw badRequest("Enter the bank account number: 9 to 18 digits.");
  const ifsc = (i.ifsc ?? "").trim().toUpperCase();
  if (!IFSC.test(ifsc)) throw badRequest("Enter a valid IFSC code, like HDFC0001234.");
  return { kind: "BANK", holderName, accountNumber, ifsc, pan };
}

export async function saveAccount(astrologerId: string, raw: AccountInput, opts: { isTest?: boolean } = {}) {
  const v = checkAccountInput(raw);
  const target = v.kind === "UPI" ? v.upiId! : v.accountNumber!;
  const data = {
    kind: v.kind,
    holderName: v.holderName,
    accountNumberEnc: v.kind === "BANK" ? seal(v.accountNumber!) : null,
    ifsc: v.kind === "BANK" ? v.ifsc! : null,
    upiId: v.kind === "UPI" ? v.upiId! : null,
    panEnc: seal(v.pan),
    last4: v.kind === "BANK" ? target.slice(-4) : target.split("@")[0]!.slice(-4),
    isTest: opts.isTest ?? false,
  };
  const before = await db.payoutAccount.findUnique({ where: { astrologerId } });
  const changed = !before || fingerprintOf(before.kind, before.holderName, before.kind === "BANK" ? open(before.accountNumberEnc!) : before.upiId!) !== fingerprintOf(v.kind, v.holderName, target);
  return db.payoutAccount.upsert({
    where: { astrologerId },
    create: { astrologerId, ...data },
    update: { ...data, ...(changed ? { razorpayContactId: null, razorpayFundAccountId: null, fundFingerprint: null } : {}) },
  });
}

/** What may be shown: never the full account number or PAN. */
export function accountView(a: PayoutAccount) {
  const pan = open(a.panEnc ?? seal(""));
  return {
    kind: a.kind as "BANK" | "UPI",
    holderName: a.holderName,
    ifsc: a.ifsc,
    /** "••••3456" */
    accountMasked: a.kind === "BANK" ? `••••${a.last4}` : null,
    upiMasked: a.kind === "UPI" && a.upiId ? `${a.upiId.slice(0, 2)}•••@${a.upiId.split("@")[1]}` : null,
    panMasked: pan.length === 10 ? `${pan.slice(0, 3)}••••${pan.slice(-3)}` : "—",
    isTest: a.isTest,
    updatedAt: a.updatedAt.toISOString(),
  };
}

export const methodLabelOf = (a: PayoutAccount | null) =>
  !a ? "No payout details yet" : a.kind === "BANK" ? `${(a.ifsc ?? "").slice(0, 4)} ••••${a.last4}` : `UPI ${a.upiId ? `${a.upiId.slice(0, 2)}•••@${a.upiId.split("@")[1]}` : ""}`;

// ── Making and sending transfers ──

/**
 * One transfer per astrologer for a released batch: what they are owed minus TDS. Safe to run again
 * (an astrologer already has their transfer for this batch), so a failed release can be repeated.
 */
export async function createPayoutsForBatch(batchId: string) {
  const batch = await db.payoutBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound("Payout batch not found.");
  if (batch.state !== "RELEASED") throw conflict(`${batch.id} must be released before transfers are made.`);
  const [grouped, pct] = await Promise.all([
    db.earningsLine.groupBy({ by: ["astrologerId"], where: { payoutBatchId: batch.id }, _sum: { amount: true } }),
    loadTdsContext(),
  ]);
  const accounts = new Map((await db.payoutAccount.findMany({ where: { astrologerId: { in: grouped.map((g) => g.astrologerId) } } })).map((a) => [a.astrologerId, a]));
  const provider = payoutProvider();
  let created = 0;
  for (const g of grouped) {
    const gross = g._sum.amount ?? 0;
    // The TDS worked out when the batch was prepared (and why); a batch from before that is worked out now.
    const kept = (batch.tdsDetail as Record<string, TdsLine> | null)?.[g.astrologerId];
    const t = kept && kept.earned === gross ? kept : pct.compute(g.astrologerId, gross);
    const tds = t.amount;
    const amount = gross - tds;
    if (amount <= 0) continue;
    const exists = await db.payout.findUnique({ where: { batchId_astrologerId: { batchId: batch.id, astrologerId: g.astrologerId } }, select: { id: true } });
    if (exists) continue;
    const account = accounts.get(g.astrologerId) ?? null;
    // Without bank details there is nothing to transfer to: Finance sees it as needing attention.
    const noDetails = !provider.automatic && !account;
    await db.payout.create({
      data: {
        batchId: batch.id,
        astrologerId: g.astrologerId,
        gross,
        tds,
        tdsPct: t.pct,
        tdsNote: t.note,
        amount,
        state: noDetails ? "FAILED" : "QUEUED",
        provider: provider.id,
        failureReason: noDetails ? NO_DETAILS : null,
        idempotencyKey: `${batch.id}:${g.astrologerId}:1`,
        methodLabel: methodLabelOf(account),
      },
    });
    created++;
  }
  const queued = await db.payout.findMany({ where: { batchId: batch.id, state: "QUEUED" }, select: { id: true } });
  for (const p of queued) await dispatchPayout(p.id);
  return { created, ...(await summaryOf(batch.id)) };
}

export async function summaryOf(batchId: string) {
  const rows = await db.payout.groupBy({ by: ["state"], where: { batchId }, _count: true, _sum: { amount: true } });
  const n = (s: string) => rows.find((r) => r.state === s)?._count ?? 0;
  return {
    transfers: rows.reduce((t, r) => t + r._count, 0),
    paid: n("PROCESSED"),
    processing: n("PROCESSING") + n("QUEUED"),
    failed: n("FAILED") + n("REVERSED"),
    sent: rows.reduce((t, r) => t + (r._sum.amount ?? 0), 0),
  };
}

async function fail(id: string, reason: string) {
  const p = await db.payout.update({ where: { id }, data: { state: "FAILED", failureReason: reason } });
  await audit(null, "payout.transfer.failed", id, `${p.batchId} · ${p.astrologerId} · ${rupee(p.amount)} — ${reason}`);
  return p;
}

/** Automatic providers only: sends one QUEUED transfer. Never throws for a payout problem. */
export async function dispatchPayout(id: string) {
  const p = await db.payout.findUnique({ where: { id } });
  const provider = payoutProvider();
  if (!p || p.state !== "QUEUED" || !provider.send || p.provider !== provider.id) return p;
  const account = await db.payoutAccount.findUnique({ where: { astrologerId: p.astrologerId } });
  if (!account) return fail(id, NO_DETAILS);
  try {
    const sent = await provider.send({ amount: p.amount, idempotencyKey: p.idempotencyKey, account });
    await db.payout.update({ where: { id }, data: { state: "PROCESSING", mode: sent.mode, razorpayPayoutId: sent.reference, failureReason: null } });
    await audit(null, "payout.transfer.sent", id, `${p.batchId} · ${p.astrologerId} · ${rupee(p.amount)} · ${sent.mode} · ${provider.id} ${provider.environment()}`);
    if (sent.outcome.state !== "PROCESSING") await applyOutcome(id, sent.outcome);
  } catch (e) {
    if (e instanceof PayoutProviderError && e.transient) {
      // Left queued; the sweep repeats it with the same key.
      await db.payout.update({ where: { id }, data: { failureReason: e.message } });
    } else {
      await fail(id, e instanceof PayoutProviderError ? e.message : "The payout couldn't be sent.");
    }
  }
  return db.payout.findUnique({ where: { id } });
}

/** A result from the provider (webhook, polling or the simulation). Idempotent; a final answer is never undone except by a reversal. */
export async function applyOutcome(id: string, out: Outcome) {
  const p = await db.payout.findUnique({ where: { id } });
  if (!p || out.state === "PROCESSING") return p;
  if (p.state === out.state) return p;
  const allowed = (p.state === "QUEUED" || p.state === "PROCESSING") || (p.state === "PROCESSED" && out.state === "REVERSED");
  if (!allowed) return p;
  const { count } = await db.payout.updateMany({
    where: { id, state: p.state },
    data: { state: out.state, utr: out.utr ?? p.utr, failureReason: out.state === "PROCESSED" ? null : out.reason, ...(out.state === "PROCESSED" ? { paidAt: new Date() } : {}) },
  });
  if (count) await audit(null, `payout.transfer.${out.state.toLowerCase()}`, id, `${p.batchId} · ${p.astrologerId} · ${rupee(p.amount)}${out.utr ? ` · ${out.utr}` : ""}${out.reason ? ` — ${out.reason}` : ""}`);
  return db.payout.findUnique({ where: { id } });
}

/** Finance retries a failed or reversed transfer: a new attempt with a new idempotency key. */
export async function retryPayout(id: string, admin: Parameters<typeof audit>[0]) {
  const p = await db.payout.findUnique({ where: { id } });
  if (!p) throw notFound("That transfer doesn't exist.");
  if (p.state !== "FAILED" && p.state !== "REVERSED") throw conflict("Only a failed or returned transfer can be retried.");
  const provider = payoutProvider();
  const account = await db.payoutAccount.findUnique({ where: { astrologerId: p.astrologerId } });
  if (!provider.automatic && !account) throw conflict(NO_DETAILS);
  const attempts = p.attempts + 1;
  const { count } = await db.payout.updateMany({
    where: { id, state: p.state },
    data: { state: "QUEUED", attempts, idempotencyKey: `${p.batchId}:${p.astrologerId}:${attempts}`, razorpayPayoutId: null, utr: null, failureReason: null, provider: provider.id, mode: null, paidAt: null, exportedAt: null, exportRef: null, markedByName: null, methodLabel: methodLabelOf(account) },
  });
  if (!count) throw conflict("That transfer was just retried by someone else.");
  await audit(admin, "payout.transfer.retry", id, `${p.batchId} · ${p.astrologerId} · attempt ${attempts}`);
  return dispatchPayout(id);
}

// ── Sweep (automatic providers): repeat unsent transfers, check on ones on their way ──

export async function sweepPayouts(now = new Date()) {
  const provider = payoutProvider();
  if (!provider.automatic || !provider.check) return;
  for (const q of await db.payout.findMany({ where: { provider: provider.id, state: "QUEUED", updatedAt: { lt: new Date(now.getTime() - 60_000) } }, select: { id: true }, take: 50 })) {
    await dispatchPayout(q.id);
  }
  const waiting = await db.payout.findMany({ where: { provider: provider.id, state: "PROCESSING", razorpayPayoutId: { not: null } }, take: 100 });
  for (const p of waiting) {
    try {
      const account = await db.payoutAccount.findUnique({ where: { astrologerId: p.astrologerId } });
      const out = await provider.check(p.razorpayPayoutId!, now.getTime() - p.updatedAt.getTime(), account);
      if (out) await applyOutcome(p.id, out);
    } catch (e) {
      console.error(`Payout ${p.id} status check:`, e instanceof Error ? e.message : e);
    }
  }
}

export function startPayoutSweep() {
  const run = () => void sweepPayouts().catch((e) => console.error("Payout sweep failed:", e instanceof Error ? e.message : e));
  setInterval(run, 5_000).unref();
}

// ── What the screens show ──

const stateOrder = ["FAILED", "REVERSED", "QUEUED", "PROCESSING", "PROCESSED"];

export async function transfersView(limit = 200) {
  const rows = await db.payout.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { astrologer: { select: { name: true } }, batch: { select: { cycle: true } } } });
  return rows
    .map((p) => ({
      id: p.id,
      batchId: p.batchId,
      cycle: p.batch.cycle,
      astrologerId: p.astrologerId,
      astrologer: p.astrologer.name,
      gross: p.gross,
      tds: p.tds,
      amount: p.amount,
      state: p.state,
      mode: p.mode,
      method: p.methodLabel,
      utr: p.utr,
      reference: p.razorpayPayoutId ?? p.exportRef,
      automatic: p.provider !== "manual",
      paidAt: p.paidAt?.toISOString() ?? null,
      markedBy: p.markedByName,
      reason: p.failureReason,
      attempts: p.attempts,
      at: p.updatedAt.toISOString(),
    }))
    .sort((a, b) => stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state) || b.at.localeCompare(a.at));
}

export async function accountsOverview() {
  const [astrologers, accounts] = await Promise.all([
    db.astrologer.findMany({ where: { lifecycle: "active" }, select: { id: true, name: true }, orderBy: { rank: "asc" } }),
    db.payoutAccount.findMany(),
  ]);
  const by = new Map(accounts.map((a) => [a.astrologerId, a]));
  return astrologers.map((a) => ({ astrologerId: a.id, name: a.name, account: by.get(a.id) ? accountView(by.get(a.id)!) : null }));
}

export async function astrologerPayoutsView(astrologerId: string) {
  const [account, recent] = await Promise.all([
    db.payoutAccount.findUnique({ where: { astrologerId } }),
    db.payout.findMany({ where: { astrologerId }, orderBy: { createdAt: "desc" }, take: 10, include: { batch: { select: { cycle: true } } } }),
  ]);
  return {
    account: account ? accountView(account) : null,
    payouts: recent.map((p) => ({ id: p.id, batchId: p.batchId, cycle: p.batch.cycle, amount: p.amount, tds: p.tds, state: p.state, utr: p.utr, reason: p.state === "FAILED" ? p.failureReason : null, at: p.updatedAt.toISOString() })),
  };
}

/** Once per closed cycle (earnings and free-call compensation each have their own): remind Finance to prepare the batch. */
export async function sweepPayoutReminders() {
  const { prepareCandidates } = await import("./earnings.ts");
  const { staffPayoutReminder } = await import("./staff-notifications.ts");
  for (const c of await prepareCandidates()) {
    const done = await db.auditLog.findFirst({ where: { action: "payout.reminder", object: c.id }, select: { id: true } });
    if (done) continue;
    await audit(null, "payout.reminder", c.id, `${c.kind} cycle ${c.label}: ${c.lines} lines waiting for a batch`);
    await staffPayoutReminder(c);
  }
}
