import { createHash } from "node:crypto";
import { db } from "../db.ts";
import type { PayoutAccount } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { loadTdsContext, type TdsLine } from "./tds.ts";
import { badRequest, conflict, notFound } from "./errors.ts";
import { rupee } from "./format.ts";
import {
  MOCK_SETTLE_MS,
  RazorpayXError,
  createFundAccount,
  fetchPayout,
  outcomeOf,
  payoutMode,
  sendPayout,
  settleMock,
  type Outcome,
} from "./razorpayx.ts";
import { open, seal } from "./secret-box.ts";

// Paying astrologers: when Finance releases a payout batch, one transfer per astrologer is made
// through RazorpayX (lib/razorpayx.ts) for what they are owed minus TDS. Each transfer is a Payout
// row that moves QUEUED → PROCESSING → PROCESSED, or FAILED (retry from Finance) / REVERSED.
// Money is never sent twice: every attempt carries its own idempotency key, a transfer that may or
// may not have reached RazorpayX is repeated with the same key, and only a human retries a failure.

// ── Payout details ──

export interface AccountInput {
  kind: "BANK" | "UPI";
  holderName: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  pan: string;
}

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

/** Anything that changes where money would go must make a new RazorpayX fund account. */
const fingerprintOf = (kind: string, holder: string, number: string) => createHash("sha256").update(`${kind}|${holder}|${number}`).digest("hex").slice(0, 32);

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

/** Simulation only: the failing test accounts. */
function mockFails(a: PayoutAccount): boolean {
  return a.kind === "UPI" ? a.upiId === "failure@razorpay" : !!a.accountNumberEnc && open(a.accountNumberEnc).endsWith("0000");
}

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
    await db.payout.create({
      data: {
        batchId: batch.id,
        astrologerId: g.astrologerId,
        gross,
        tds,
        tdsPct: t.pct,
        tdsNote: t.note,
        amount,
        state: "QUEUED",
        idempotencyKey: `${batch.id}:${g.astrologerId}:1`,
        methodLabel: methodLabelOf(accounts.get(g.astrologerId) ?? null),
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

/** Sends one QUEUED transfer to RazorpayX (or the simulation). Never throws for a payout problem. */
export async function dispatchPayout(id: string) {
  const p = await db.payout.findUnique({ where: { id } });
  if (!p || p.state !== "QUEUED") return p;
  const acct = await db.payoutAccount.findUnique({ where: { astrologerId: p.astrologerId } });
  if (!acct) return fail(id, "No payout details on file — the astrologer adds them under Earnings → Payout details. Then retry.");
  try {
    const plainNumber = acct.kind === "BANK" ? open(acct.accountNumberEnc!) : acct.upiId!;
    const fp = fingerprintOf(acct.kind, acct.holderName, plainNumber);
    let fundAccountId = acct.razorpayFundAccountId;
    if (!fundAccountId || acct.fundFingerprint !== fp) {
      const made = await createFundAccount({
        name: acct.holderName,
        reference: acct.astrologerId,
        ...(acct.kind === "BANK" ? { bank: { accountNumber: plainNumber, ifsc: acct.ifsc! } } : { upi: acct.upiId! }),
      });
      fundAccountId = made.fundAccountId;
      await db.payoutAccount.update({
        where: { astrologerId: acct.astrologerId },
        data: { razorpayContactId: made.contactId, razorpayFundAccountId: made.fundAccountId, fundFingerprint: fp },
      });
    }
    const mode = acct.kind === "UPI" ? "UPI" : "IMPS";
    const sent = await sendPayout({
      fundAccountId,
      amount: p.amount,
      mode,
      reference: p.idempotencyKey.slice(0, 40),
      narration: "AstroRize payout",
      idempotencyKey: p.idempotencyKey,
      mockFails: mockFails(acct),
    });
    await db.payout.update({ where: { id }, data: { state: "PROCESSING", mode, razorpayPayoutId: sent.id, failureReason: null } });
    await audit(null, "payout.transfer.sent", id, `${p.batchId} · ${p.astrologerId} · ${rupee(p.amount)} · ${mode} · ${payoutMode()}`);
    const out = outcomeOf(sent);
    if (out.state !== "PROCESSING") await applyOutcome(id, out);
  } catch (e) {
    if (e instanceof RazorpayXError && e.transient) {
      // We can't tell whether RazorpayX got it: leave it queued; the sweep repeats it with the same key.
      await db.payout.update({ where: { id }, data: { failureReason: "Couldn't reach RazorpayX — trying again shortly." } });
    } else {
      await fail(id, e instanceof RazorpayXError ? e.description : "The payout couldn't be sent.");
    }
  }
  return db.payout.findUnique({ where: { id } });
}

/** A result from RazorpayX (webhook, polling or the simulation). Idempotent; a final answer is never undone except by a reversal. */
export async function applyOutcome(id: string, out: Outcome) {
  const p = await db.payout.findUnique({ where: { id } });
  if (!p || out.state === "PROCESSING") return p;
  if (p.state === out.state) return p;
  const allowed = (p.state === "QUEUED" || p.state === "PROCESSING") || (p.state === "PROCESSED" && out.state === "REVERSED");
  if (!allowed) return p;
  const { count } = await db.payout.updateMany({
    where: { id, state: p.state },
    data: { state: out.state, utr: out.utr ?? p.utr, failureReason: out.state === "PROCESSED" ? null : out.reason },
  });
  if (count) await audit(null, `payout.transfer.${out.state.toLowerCase()}`, id, `${p.batchId} · ${p.astrologerId} · ${rupee(p.amount)}${out.utr ? ` · ${out.utr}` : ""}${out.reason ? ` — ${out.reason}` : ""}`);
  return db.payout.findUnique({ where: { id } });
}

/** Finance retries a failed or reversed transfer: a new attempt with a new idempotency key. */
export async function retryPayout(id: string, admin: Parameters<typeof audit>[0]) {
  const p = await db.payout.findUnique({ where: { id } });
  if (!p) throw notFound("That transfer doesn't exist.");
  if (p.state !== "FAILED" && p.state !== "REVERSED") throw conflict("Only a failed or returned transfer can be retried.");
  const attempts = p.attempts + 1;
  const { count } = await db.payout.updateMany({
    where: { id, state: p.state },
    data: { state: "QUEUED", attempts, idempotencyKey: `${p.batchId}:${p.astrologerId}:${attempts}`, razorpayPayoutId: null, utr: null, failureReason: null, methodLabel: methodLabelOf(await db.payoutAccount.findUnique({ where: { astrologerId: p.astrologerId } })) },
  });
  if (!count) throw conflict("That transfer was just retried by someone else.");
  await audit(admin, "payout.transfer.retry", id, `${p.batchId} · ${p.astrologerId} · attempt ${attempts}`);
  return dispatchPayout(id);
}

// ── Sweep: settle simulated payouts, repeat unsent ones, check on slow real ones ──

export async function sweepPayouts(now = new Date()) {
  const mode = payoutMode();
  for (const q of await db.payout.findMany({ where: { state: "QUEUED", updatedAt: { lt: new Date(now.getTime() - 60_000) } }, select: { id: true }, take: 50 })) {
    await dispatchPayout(q.id);
  }
  const waiting = await db.payout.findMany({ where: { state: "PROCESSING", razorpayPayoutId: { not: null } }, take: 100 });
  for (const p of waiting) {
    const age = now.getTime() - p.updatedAt.getTime();
    try {
      if (p.razorpayPayoutId!.startsWith("pout_mock_")) {
        if (age < MOCK_SETTLE_MS) continue;
        const acct = await db.payoutAccount.findUnique({ where: { astrologerId: p.astrologerId } });
        await applyOutcome(p.id, outcomeOf(settleMock(!!acct && mockFails(acct), p.razorpayPayoutId!)));
      } else if (mode !== "mock" && age > 5 * 60_000) {
        await applyOutcome(p.id, outcomeOf(await fetchPayout(p.razorpayPayoutId!)));
      }
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
      reference: p.razorpayPayoutId,
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
    payouts: recent.map((p) => ({ id: p.id, cycle: p.batch.cycle, amount: p.amount, tds: p.tds, state: p.state, utr: p.utr, reason: p.state === "FAILED" ? p.failureReason : null, at: p.updatedAt.toISOString() })),
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
