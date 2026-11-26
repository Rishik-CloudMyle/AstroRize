// What astrologers earn, and how it is batched for payout.
//
// The split (client decision, Oct 2026): an astrologer keeps a share of what customers pay —
// `earnings.share_pct.new` (50%) for their first `earnings.new_period_days` (90) days after they
// were activated, then `earnings.share_pct.standard` (70%). AstroRize keeps the rest. Gifts follow
// the same split. Free (complimentary) minutes cost the customer nothing; AstroRize pays the
// astrologer for them at the session's own rate × their share, on a separate PLATFORM-funded line
// that is paid in its own FREE_CALLS batch (monthly, or weekly — `payout.free_calls.weekly`).
// A claimed campaign discount (lib/campaigns.ts) is paid by AstroRize too: the consultation's line
// has the full-price gross, `discount` is the part the customer didn't pay, and it stays CUSTOMER-
// funded (paid with the regular earnings).
//
// Every line stores its gross, the share fixed when it was written and the astrologer's amount,
// so a later change to the shares never rewrites past earnings. Lines written before the split
// existed have no amount: they are valued on read as before (100%, minutes × session rate) and
// are never put in a payout batch (they were paid outside these batches).

import { db } from "../db.ts";
import { payoutSchedule } from "./payout-schedule.ts";
import type { Astrologer, EarningsLine, Prisma } from "../generated/prisma/client.ts";
import { badRequest, conflict } from "./errors.ts";
import { istDate, istDateKey, istDayMonth, rupee } from "./format.ts";
import { configNumber, getSetting } from "./settings.ts";
import { loadTdsContext, type TdsContext, type TdsLine } from "./tds.ts";

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── The split ──

export interface SharePolicy {
  /** Percent a new astrologer keeps. */
  newPct: number;
  /** Percent an established astrologer keeps. */
  standardPct: number;
  /** Days after activation an astrologer counts as new. */
  newDays: number;
  /** Own shares agreed with particular astrologers (id → percent): they replace the two above. */
  custom?: Record<string, number>;
}

/** Setting holding the own shares (admin: Config console → Revenue share). */
export const CUSTOM_SHARE_SETTING = "earnings.custom_share";

const pct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** The shares in force (Config console). Read before a transaction, not inside one. */
export async function sharePolicy(): Promise<SharePolicy> {
  const [newPct, standardPct, newDays, custom] = await Promise.all([
    configNumber("earnings.share_pct.new", 50),
    configNumber("earnings.share_pct.standard", 70),
    configNumber("earnings.new_period_days", 90),
    getSetting<Record<string, number>>(CUSTOM_SHARE_SETTING, {}),
  ]);
  return { newPct: pct(newPct), standardPct: pct(standardPct), newDays: Math.max(0, Math.round(newDays)), custom };
}

type Activation = Pick<Astrologer, "activatedAt" | "createdAt"> & { id?: string };

const ownShare = (a: Activation, p: SharePolicy) => (a.id ? p.custom?.[a.id] : undefined);

/** When the astrologer started (activation; older accounts without one count from sign-up). */
export const activationOf = (a: Activation) => a.activatedAt ?? a.createdAt;

/** When the astrologer stops counting as new. */
export const newPeriodEnd = (a: Activation, p: SharePolicy) => new Date(activationOf(a).getTime() + p.newDays * DAY_MS);

/** The share (percent) the astrologer keeps of money earned at `at`. */
export function sharePctFor(a: Activation, at: Date, p: SharePolicy): number {
  const own = ownShare(a, p);
  if (own !== undefined) return pct(own);
  return at < newPeriodEnd(a, p) ? p.newPct : p.standardPct;
}

/** The astrologer's share now and, while they are new, when and to what it changes. */
export function shareStatus(a: Activation, p: SharePolicy, now = new Date()) {
  const current = sharePctFor(a, now, p);
  const end = newPeriodEnd(a, p);
  const changes = ownShare(a, p) === undefined && now < end && p.newPct !== p.standardPct;
  return { pct: current, nextPct: changes ? p.standardPct : null, changesOn: changes ? istDate(end) : null };
}

/** The astrologer's ₹ from a gross at a share: rounded down to whole rupees. */
export const shareOf = (gross: number, sharePct: number) => Math.floor((gross * sharePct) / 100);

/**
 * Free-call compensation minutes: partial minutes round up, exactly as paid minutes are billed
 * (billing.ts `settle`), so 61 free seconds pay 2 minutes like 61 paid seconds cost 2.
 */
export const freeMinutes = (freeSeconds: number) => Math.ceil(Math.max(0, freeSeconds) / 60);

export interface EarningsInput {
  astrologerId: string;
  date: Date;
  sessionRef: string;
  /** voice | chat | video | emergency | gift | free_call */
  kind: string;
  mode: string;
  minutes: number;
  /** Gift price (gift lines). */
  gifts?: number;
  /** ₹ before the split. */
  gross: number;
  sharePct: number;
  fundedBy?: "CUSTOMER" | "PLATFORM";
  freeSeconds?: number;
  /** ₹ of `gross` AstroRize paid because of a campaign discount (the customer paid gross − discount). */
  discount?: number;
}

/** Writes one earnings line with its share snapshotted. Lines worth ₹0 gross are not written. */
export async function writeEarnings(tx: Tx, e: EarningsInput) {
  if (e.gross <= 0 && e.minutes <= 0) return null;
  return tx.earningsLine.create({
    data: {
      astrologerId: e.astrologerId,
      date: e.date,
      sessionRef: e.sessionRef,
      kind: e.kind,
      mode: e.mode,
      minutes: e.minutes,
      gifts: e.gifts ?? 0,
      gross: e.gross,
      sharePct: e.sharePct,
      amount: shareOf(e.gross, e.sharePct),
      fundedBy: e.fundedBy ?? "CUSTOMER",
      freeSeconds: e.freeSeconds ?? 0,
      discount: e.discount ?? 0,
    },
  });
}

/** True for lines written before the split (no stored amount): valued on read at 100%. */
export const isLegacy = (l: Pick<EarningsLine, "amount">) => l.amount === null;

// ── Payout cycles ──

export type BatchKind = "EARNINGS" | "FREE_CALLS";
export interface PayoutCycle {
  kind: BatchKind;
  /** Batch id for the cycle: "PB-2026-10" (monthly earnings) or "PB-2026-10-A" (half-monthly) or "FC-2026-10" / "FC-2026-W43" (free calls). */
  id: string;
  /** "1–15 Oct 2026", "Oct 2026", "19–25 Oct 2026" */
  label: string;
  start: Date;
  /** Last millisecond of the cycle. */
  end: Date;
}

/** Midnight IST on a calendar day (month/day may overflow, like Date.UTC). */
const istMidnight = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d) - IST_OFFSET_MS);
const istParts = (at: Date) => {
  const [y, m, d] = istDateKey(at).split("-").map(Number) as [number, number, number];
  return { y, m0: m - 1, d };
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Earnings (customer-paid) are paid half-monthly: 1–15 and 16–end of month, IST. */
function halfMonthOf(at: Date): PayoutCycle {
  const { y, m0, d } = istParts(at);
  const first = d <= 15;
  const start = istMidnight(y, m0, first ? 1 : 16);
  const next = first ? istMidnight(y, m0, 16) : istMidnight(y, m0 + 1, 1);
  const lastDay = first ? 15 : new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return {
    kind: "EARNINGS",
    id: `PB-${y}-${pad(m0 + 1)}-${first ? "A" : "B"}`,
    label: `${first ? 1 : 16}–${lastDay} ${MONTHS[m0]} ${y}`,
    start,
    end: new Date(next.getTime() - 1),
  };
}

function monthOf(at: Date): PayoutCycle {
  const { y, m0 } = istParts(at);
  const start = istMidnight(y, m0, 1);
  const next = istMidnight(y, m0 + 1, 1);
  return { kind: "FREE_CALLS", id: `FC-${y}-${pad(m0 + 1)}`, label: `${MONTHS[m0]} ${y}`, start, end: new Date(next.getTime() - 1) };
}

/** Earnings paid monthly: "PB-2026-10". */
const earningsMonthOf = (at: Date): PayoutCycle => ({ ...monthOf(at), kind: "EARNINGS", id: monthOf(at).id.replace(/^FC-/, "PB-") });

/** Monday–Sunday (IST) weeks, named by ISO week: "FC-2026-W43". */
function weekOf(at: Date): PayoutCycle {
  const { y, m0, d } = istParts(at);
  const dow = (new Date(Date.UTC(y, m0, d)).getUTCDay() + 6) % 7; // Monday = 0
  const mon = new Date(Date.UTC(y, m0, d - dow));
  const sun = new Date(mon.getTime() + 6 * DAY_MS);
  // ISO week: the week belongs to the year of its Thursday.
  const thu = new Date(mon.getTime() + 3 * DAY_MS);
  const isoYear = thu.getUTCFullYear();
  const week = Math.floor((thu.getTime() - Date.UTC(isoYear, 0, 1)) / (7 * DAY_MS)) + 1;
  const start = new Date(mon.getTime() - IST_OFFSET_MS);
  const sameMonth = mon.getUTCMonth() === sun.getUTCMonth();
  const label = sameMonth
    ? `${mon.getUTCDate()}–${sun.getUTCDate()} ${MONTHS[sun.getUTCMonth()]} ${sun.getUTCFullYear()}`
    : `${mon.getUTCDate()} ${MONTHS[mon.getUTCMonth()]} – ${sun.getUTCDate()} ${MONTHS[sun.getUTCMonth()]} ${sun.getUTCFullYear()}`;
  return { kind: "FREE_CALLS", id: `FC-${isoYear}-W${pad(week)}`, label, start, end: new Date(start.getTime() + 7 * DAY_MS - 1) };
}

export type RangeKey = "daily" | "weekly" | "fortnight" | "monthly";
export interface StatementPeriod {
  /** Stable id of the period, e.g. "D-20261123", "FC-2026-W48", "PB-2026-11-B", "FC-2026-11". */
  id: string;
  label: string;
  start: Date;
  /** Last millisecond of the period. */
  end: Date;
}
const RANGE_COUNT: Record<RangeKey, number> = { daily: 14, weekly: 8, fortnight: 8, monthly: 12 };
export const isRange = (v: unknown): v is RangeKey => v === "daily" || v === "weekly" || v === "fortnight" || v === "monthly";

function dayOf(at: Date): StatementPeriod {
  const { y, m0, d } = istParts(at);
  const start = istMidnight(y, m0, d);
  return { id: `D-${y}${pad(m0 + 1)}${pad(d)}`, label: `${d} ${MONTHS[m0]} ${y}`, start, end: new Date(start.getTime() + DAY_MS - 1) };
}

/** A payout period between two dates chosen by the admin (IST, both days included). */
export function customPeriod(from: string, to: string): StatementPeriod {
  const day = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    const at = istMidnight(y!, m! - 1, d!);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(at.getTime()) || istParts(at).d !== d) throw badRequest("Choose a real start and end date.");
    return at;
  };
  const start = day(from);
  const last = day(to);
  if (last < start) throw badRequest("The end date must be on or after the start date.");
  if (start > new Date()) throw badRequest("The start date can't be in the future.");
  if (last.getTime() - start.getTime() > 366 * DAY_MS) throw badRequest("Choose a period of one year or less.");
  const end = new Date(last.getTime() + DAY_MS - 1);
  return { id: `CU-${from.replaceAll("-", "")}-${to.replaceAll("-", "")}`, label: `${istDate(start)} – ${istDate(end)}`, start, end };
}

/** The statement periods of a range (IST), the running one first, then the ones before it. */
export function statementPeriods(range: RangeKey, now = new Date()): StatementPeriod[] {
  const of = range === "daily" ? dayOf : range === "weekly" ? weekOf : range === "monthly" ? monthOf : halfMonthOf;
  const out: StatementPeriod[] = [];
  let p: StatementPeriod = of(now);
  for (let i = 0; i < RANGE_COUNT[range]; i++) {
    out.push(p);
    p = of(new Date(p.start.getTime() - 1));
  }
  return out;
}

/** Free-call compensation is paid per calendar month (`payout.free_calls.weekly` 0, the default) or per Monday–Sunday week (1). */
export async function freeCallsCycleDays(): Promise<7 | 30> {
  return (await configNumber("payout.free_calls.weekly", 0)) === 1 ? 7 : 30;
}

/** The cycle of `kind` that contains `at`. */
export function cycleOf(kind: BatchKind, at: Date, freeCycleDays: 7 | 30, earningsDays: 15 | 30 = 30): PayoutCycle {
  if (kind === "EARNINGS") return earningsDays === 15 ? halfMonthOf(at) : earningsMonthOf(at);
  return freeCycleDays === 7 ? weekOf(at) : monthOf(at);
}

/** The last `count` cycles of `kind` that have ended, newest first. */
export function closedCycles(kind: BatchKind, now: Date, freeCycleDays: 7 | 30, count: number, earningsDays: 15 | 30 = 30): PayoutCycle[] {
  const out: PayoutCycle[] = [];
  let c = cycleOf(kind, now, freeCycleDays, earningsDays);
  for (let i = 0; i < count; i++) {
    c = cycleOf(kind, new Date(c.start.getTime() - 1), freeCycleDays, earningsDays);
    out.push(c);
  }
  return out;
}

/** "after 31 Oct": the day a cycle closes, for "paid after …" copy. */
export const closesOn = (c: PayoutCycle) => istDayMonth(c.end);

// ── Payout batches ──

/** The default TDS rate, percent (the global TDS rules on the Finance → TDS page; 5 until Finance changes it). Each astrologer's own rate comes from lib/tds.ts. */
export async function tdsPct(): Promise<number> {
  return (await loadTdsContext()).global.defaultPct;
}

/** TDS on one astrologer's amount, rounded to the nearest rupee. */
export const tdsOn = (amount: number, pctValue: number) => Math.round((amount * pctValue) / 100);

const fundedByOf = (kind: BatchKind) => (kind === "EARNINGS" ? "CUSTOMER" : "PLATFORM");

type Candidate = Pick<EarningsLine, "id" | "astrologerId" | "amount" | "date"> & { astrologer: Activation };

/**
 * Who is held back from a batch right now: astrologers whose payouts Finance has paused (Setting
 * `payout.paused`), and new astrologers still inside `payout.hold_days.new_astrologer` of their
 * activation. Their lines stay unbatched and join the first batch prepared after the hold ends.
 */
export async function holdRules(now: Date) {
  const [paused, holdDays] = await Promise.all([
    getSetting<Record<string, boolean>>("payout.paused", {}),
    configNumber("payout.hold_days.new_astrologer", 14),
  ]);
  return (l: Candidate): "paused" | "new" | null =>
    paused[l.astrologerId] ? "paused" : activationOf(l.astrologer).getTime() + Math.max(0, holdDays) * DAY_MS > now.getTime() ? "new" : null;
}

/** Unbatched split lines of `kind` up to `until`, split into what a batch would take and what is held back. */
async function eligibleLines(client: Tx | typeof db, kind: BatchKind, until: Date, held: (l: Candidate) => "paused" | "new" | null) {
  const lines = await client.earningsLine.findMany({
    where: { payoutBatchId: null, amount: { not: null }, fundedBy: fundedByOf(kind), date: { lte: until } },
    select: { id: true, astrologerId: true, amount: true, date: true, astrologer: { select: { activatedAt: true, createdAt: true } } },
  });
  const take: Candidate[] = [];
  const holdBack = { paused: 0, new: 0 };
  for (const l of lines) {
    const why = held(l);
    if (why) holdBack[why]++;
    else take.push(l);
  }
  return { take, holdBack };
}

/**
 * Refund adjustments are negative lines (a refunded customer's money taken back from the astrologer's
 * share, routes/admin/support.ts). They net against the same batch's lines. A batch never pays an
 * astrologer less than ₹0: when someone's lines in it add up below zero, none of their lines are taken
 * — they all stay unbatched, so the negative remainder is carried forward and nets against their next
 * earnings in a later batch.
 */
function withoutNegativeTotals<T extends Pick<Candidate, "astrologerId" | "amount">>(lines: T[]) {
  const per = new Map<string, number>();
  for (const l of lines) per.set(l.astrologerId, (per.get(l.astrologerId) ?? 0) + (l.amount ?? 0));
  const take = lines.filter((l) => (per.get(l.astrologerId) ?? 0) >= 0);
  return { take, carried: lines.length - take.length };
}

/** Owed per astrologer, the batch total and its TDS, worked out for each astrologer by their own rules (kept with the batch). */
function totals(lines: Candidate[], ctx: TdsContext) {
  const per = new Map<string, number>();
  for (const l of lines) per.set(l.astrologerId, (per.get(l.astrologerId) ?? 0) + (l.amount ?? 0));
  let gross = 0;
  let tdsTotal = 0;
  const detail: Record<string, TdsLine> = {};
  for (const [id, v] of per) {
    const t = ctx.compute(id, v);
    gross += v;
    tdsTotal += t.amount;
    detail[id] = t;
  }
  return { gross, tds: tdsTotal, astrologers: per.size, detail };
}

export interface PrepareCandidate {
  kind: BatchKind;
  id: string;
  label: string;
  /** Lines a batch would take (this cycle's plus older ones carried over). */
  lines: number;
  carriedOver: number;
  astrologers: number;
  /** ₹ owed to astrologers before TDS. */
  gross: number;
  tds: number;
  heldPaused: number;
  heldNew: number;
  /** Lines carried forward because an astrologer's total in the batch would be below ₹0 (refund adjustments). */
  heldNegative: number;
}

/**
 * Closed cycles that have no batch yet and have something to pay, newest first. A batch takes every
 * unbatched line of its kind up to the cycle's end, so lines held back earlier (paused, new-astrologer
 * hold, or a cycle whose id was already used) are carried into the next batch prepared.
 */
export async function prepareCandidates(now = new Date()): Promise<PrepareCandidate[]> {
  const [freeDays, tds, held, schedule] = await Promise.all([freeCallsCycleDays(), loadTdsContext(now), holdRules(now), payoutSchedule()]);
  const out: PrepareCandidate[] = [];
  for (const kind of ["EARNINGS", "FREE_CALLS"] as const) {
    const cycles = closedCycles(kind, now, freeDays, kind === "EARNINGS" ? 6 : freeDays === 7 ? 8 : 3, schedule.cycleDays);
    const existing = new Set((await db.payoutBatch.findMany({ where: { id: { in: cycles.map((c) => c.id) } }, select: { id: true } })).map((b) => b.id));
    const { take: all, holdBack } = await eligibleLines(db, kind, cycles[0]!.end, held);
    for (const [i, c] of cycles.entries()) {
      if (existing.has(c.id)) continue;
      const { take, carried } = withoutNegativeTotals(all.filter((l) => l.date <= c.end));
      const inCycle = take.filter((l) => l.date >= c.start).length;
      // Older cycles only when they have lines of their own; the latest also for carried-over lines.
      if (!take.length || (!inCycle && i > 0)) continue;
      out.push({
        kind,
        id: c.id,
        label: c.label,
        lines: take.length,
        carriedOver: take.length - inCycle,
        ...(({ detail: _detail, ...rest }) => rest)(totals(take, tds)),
        heldPaused: i === 0 ? holdBack.paused : 0,
        heldNew: i === 0 ? holdBack.new : 0,
        heldNegative: carried,
      });
    }
  }
  return out;
}

/**
 * Prepares the DRAFT batch for one closed cycle: collects its unbatched lines (and older ones carried
 * over), owed = Σ amount, TDS per astrologer. Idempotent: the batch id is the cycle's, so preparing the
 * same cycle twice returns the existing batch and never collects a line twice. Approve and release
 * stay with Finance and a different releaser (routes/admin/finance.ts).
 */
export async function prepareBatch(kind: BatchKind, cycleId: string, now = new Date()) {
  const freeDays = await freeCallsCycleDays();
  const cycle = closedCycles(kind, now, freeDays, kind === "EARNINGS" ? 6 : freeDays === 7 ? 8 : 3, (await payoutSchedule()).cycleDays).find((c) => c.id === cycleId);
  if (!cycle) throw badRequest("That isn't a closed payout cycle. Only a cycle that has ended can be prepared.");
  const [tds, held] = await Promise.all([loadTdsContext(now), holdRules(now)]);
  return db.$transaction(async (tx) => {
    // One prepare at a time, so two clicks (or two people) can't collect the same lines.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payout:prepare'))`;
    const existing = await tx.payoutBatch.findUnique({ where: { id: cycle.id } });
    if (existing) return { batch: existing, already: true as const, lines: 0, carriedOver: 0, holdBack: { paused: 0, new: 0, negative: 0 } };
    const eligible = await eligibleLines(tx, kind, cycle.end, held);
    const { take, carried } = withoutNegativeTotals(eligible.take);
    const holdBack = { ...eligible.holdBack, negative: carried };
    if (!take.length) throw conflict(`Nothing to pay for ${cycle.label}: no unbatched ${kind === "EARNINGS" ? "earnings" : "free-call compensation"}.`);
    const t = totals(take, tds);
    const batch = await tx.payoutBatch.create({
      data: {
        id: cycle.id,
        kind,
        cycle: `${kind === "EARNINGS" ? "Earnings" : "Free-call compensation"} · ${cycle.label}`,
        periodStart: cycle.start,
        periodEnd: cycle.end,
        astrologers: t.astrologers,
        gross: t.gross,
        tds: t.tds,
        tdsDetail: t.detail,
        state: "DRAFT",
      },
    });
    const { count } = await tx.earningsLine.updateMany({ where: { id: { in: take.map((l) => l.id) }, payoutBatchId: null }, data: { payoutBatchId: batch.id } });
    if (count !== take.length) throw conflict("Earnings changed while the batch was being prepared. Try again.");
    const carriedOver = take.filter((l) => l.date < cycle.start).length;
    return { batch, already: false as const, lines: take.length, carriedOver, holdBack };
  });
}

/**
 * One astrologer's payout for one statement period (a day, week, 15 days or month): a batch of just their
 * unbatched customer-paid lines dated inside the period. The same rules as a cycle batch: a paused or
 * new astrologer's lines are held back, lines already in a batch are never taken twice, and someone whose
 * lines add up below ₹0 (refund adjustments) is carried forward. It starts as a DRAFT: approving and
 * releasing it needs a second person, exactly like any batch.
 */
export async function prepareAstrologerBatch(astrologerId: string, period: StatementPeriod, now = new Date()) {
  const [tds, held] = await Promise.all([loadTdsContext(now), holdRules(now)]);
  const astrologer = await db.astrologer.findUnique({ where: { id: astrologerId }, select: { name: true } });
  if (!astrologer) throw badRequest("That astrologer doesn't exist.");
  const id = `PA-${astrologerId}-${period.id}`;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payout:prepare'))`;
    const existing = await tx.payoutBatch.findUnique({ where: { id } });
    if (existing) return { batch: existing, already: true as const, lines: 0, holdBack: { paused: 0, new: 0, negative: 0 } };
    const eligible = await eligibleLines(tx, "EARNINGS", period.end, held);
    const mine = eligible.take.filter((l) => l.astrologerId === astrologerId && l.date >= period.start);
    const { take, carried } = withoutNegativeTotals(mine);
    // Held back for this astrologer only (the eligibility pass counts everyone).
    const heldMine = await tx.earningsLine.findMany({
      where: { astrologerId, payoutBatchId: null, amount: { not: null }, fundedBy: "CUSTOMER", date: { gte: period.start, lte: period.end } },
      select: { id: true },
    });
    const heldBack = Math.max(0, heldMine.length - mine.length);
    if (!take.length) {
      const why = heldBack ? "their payouts are on hold (paused, or a new astrologer still in the hold period)" : carried ? "their refund adjustments are more than their earnings, so it is carried forward" : "there is nothing unpaid in it (no earnings, or already in a batch)";
      throw conflict(`Nothing to pay ${astrologer.name} for ${period.label}: ${why}.`);
    }
    const t = totals(take, tds);
    const batch = await tx.payoutBatch.create({
      data: {
        id,
        kind: "EARNINGS",
        cycle: `Earnings · ${period.label} · ${astrologer.name}`,
        periodStart: period.start,
        periodEnd: period.end,
        astrologers: 1,
        gross: t.gross,
        tds: t.tds,
        tdsDetail: t.detail,
        state: "DRAFT",
      },
    });
    const { count } = await tx.earningsLine.updateMany({ where: { id: { in: take.map((l) => l.id) }, payoutBatchId: null }, data: { payoutBatchId: batch.id } });
    if (count !== take.length) throw conflict("Earnings changed while the payout was being prepared. Try again.");
    return { batch, already: false as const, lines: take.length, holdBack: { paused: heldBack, new: 0, negative: carried } };
  });
}

/** One-line audit diff for a prepared batch. */
export function prepareDiff(r: Awaited<ReturnType<typeof prepareBatch>>) {
  const b = r.batch;
  const held = [
    r.holdBack.paused ? `${r.holdBack.paused} paused` : "",
    r.holdBack.new ? `${r.holdBack.new} new-astrologer hold` : "",
    r.holdBack.negative ? `${r.holdBack.negative} carried forward (refund adjustments above earnings)` : "",
  ].filter(Boolean);
  return [
    `— → DRAFT · ${r.lines} lines${r.carriedOver ? ` (${r.carriedOver} carried over)` : ""}`,
    `${b.astrologers} astrologers · owed ${rupee(b.gross)} · TDS ${rupee(b.tds)}`,
    held.length ? `held back: ${held.join(", ")} lines` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── Finance figures ──

/** Midnight IST on the 1st of `now`'s IST month. */
export const istMonthStart = (now: Date) => {
  const { y, m0 } = istParts(now);
  return istMidnight(y, m0, 1);
};

/**
 * This month (IST) so far, split lines only: what customers paid, what astrologers keep of it, the
 * platform's share, and the free-call compensation AstroRize owes.
 */
export async function splitThisMonth(now = new Date()) {
  const since = istMonthStart(now);
  const rows = await db.earningsLine.groupBy({
    by: ["fundedBy"],
    where: { date: { gte: since, lte: now }, amount: { not: null } },
    _sum: { gross: true, amount: true, minutes: true, discount: true },
  });
  const of = (f: string) => rows.find((r) => r.fundedBy === f)?._sum;
  const customer = of("CUSTOMER");
  const platform = of("PLATFORM");
  // What customers actually paid: a campaign discount is part of the gross but paid by AstroRize.
  const customerGross = (customer?.gross ?? 0) - (customer?.discount ?? 0);
  const astrologerShare = customer?.amount ?? 0;
  return {
    month: MONTHS[istParts(now).m0]!,
    customerGross,
    astrologerShare,
    platformRevenue: customerGross - astrologerShare,
    freeCallCost: platform?.amount ?? 0,
    freeCallMinutes: platform?.minutes ?? 0,
  };
}
