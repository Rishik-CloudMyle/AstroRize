import { db } from "../db.ts";
import { configNumber, getSetting } from "./settings.ts";

// TDS on astrologer payouts. There is one global default (rates and thresholds, Setting "tds.global"), and
// each astrologer can differ: where they live (residential status), whether a PAN is on file, and a Finance
// override of their own rate, an exemption or their own threshold (TdsProfile). Changes to either go through
// TdsChange: Finance proposes, a Super Admin acknowledges.
//
// For one payout, in this order:
//   1. exempt → no TDS
//   2. the astrologer's own rate, if Finance set one
//   3. otherwise the higher of: no PAN on file → "no PAN" rate, non-resident → "non-resident" rate;
//      with neither, the default rate
//   4. thresholds: under the per-payout threshold, or still under the financial-year threshold → no TDS
// The result is worked out when a batch is prepared and kept with the batch, so a later change of rules
// never rewrites a batch already prepared.

export interface TdsGlobal {
  /** Percent for a resident astrologer with a PAN. */
  defaultPct: number;
  /** Percent when no PAN is on file. */
  noPanPct: number;
  /** Percent for a non-resident astrologer. */
  nonResidentPct: number;
  /** ₹: a payout below this carries no TDS (0 = no threshold). */
  thresholdPerPayout: number;
  /** ₹: no TDS until an astrologer's payouts this financial year (April–March) pass this (0 = no threshold). */
  thresholdPerYear: number;
}

export interface TdsOverride {
  residentialStatus: "RESIDENT" | "NON_RESIDENT";
  billingAddress: string | null;
  ratePct: number | null;
  exempt: boolean;
  thresholdPerPayout: number | null;
  note: string | null;
}

export const TDS_SETTING = "tds.global";
export const DEFAULT_OVERRIDE: TdsOverride = { residentialStatus: "RESIDENT", billingAddress: null, ratePct: null, exempt: false, thresholdPerPayout: null, note: null };

export type TdsLine = {
  earned: number;
  pct: number;
  amount: number;
  note: string;
};

const clampPct = (n: unknown, fallback: number) => (Number.isFinite(Number(n)) ? Math.min(100, Math.max(0, Math.round(Number(n)))) : fallback);
const clampRupee = (n: unknown, fallback: number) => (Number.isFinite(Number(n)) ? Math.max(0, Math.round(Number(n))) : fallback);

export async function loadTdsGlobal(): Promise<TdsGlobal> {
  const [saved, legacy] = await Promise.all([getSetting<Partial<TdsGlobal> | null>(TDS_SETTING, null), configNumber("payout.tds_pct", 5)]);
  const base = clampPct(legacy, 5);
  return {
    defaultPct: clampPct(saved?.defaultPct, base),
    noPanPct: clampPct(saved?.noPanPct, 20),
    nonResidentPct: clampPct(saved?.nonResidentPct, 20),
    thresholdPerPayout: clampRupee(saved?.thresholdPerPayout, 0),
    thresholdPerYear: clampRupee(saved?.thresholdPerYear, 0),
  };
}

/** Start of the Indian financial year (1 April, IST) that contains `now`. */
export function financialYearStart(now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return new Date(Date.UTC(y, 3, 1) - 5.5 * 3600_000);
}

export interface TdsContext {
  global: TdsGlobal;
  /** The rate that applies to this astrologer before thresholds, and why. */
  rateOf(astrologerId: string): { pct: number; note: string; exempt: boolean; thresholdPerPayout: number; hasPan: boolean; profile: TdsOverride };
  /** TDS on an amount owed to this astrologer in one payout, with thresholds applied. */
  compute(astrologerId: string, earned: number): TdsLine;
  /** Payouts already made to this astrologer this financial year (₹, before TDS). */
  yearToDate(astrologerId: string): number;
}

/**
 * Everything needed to work out TDS for any astrologer, read once (before a transaction: it uses its own
 * connection). `now` fixes the financial year.
 */
export async function loadTdsContext(now = new Date()): Promise<TdsContext> {
  const fy = financialYearStart(now);
  const [global, profiles, accounts, paid] = await Promise.all([
    loadTdsGlobal(),
    db.tdsProfile.findMany(),
    db.payoutAccount.findMany({ select: { astrologerId: true, panEnc: true } }),
    db.payout.groupBy({ by: ["astrologerId"], where: { createdAt: { gte: fy } }, _sum: { gross: true } }),
  ]);
  const prof = new Map(profiles.map((p) => [p.astrologerId, p]));
  const pan = new Map(accounts.map((a) => [a.astrologerId, !!a.panEnc]));
  const ytd = new Map(paid.map((p) => [p.astrologerId, p._sum.gross ?? 0]));

  const rateOf: TdsContext["rateOf"] = (id) => {
    const p = prof.get(id);
    const profile: TdsOverride = p
      ? { residentialStatus: p.residentialStatus === "NON_RESIDENT" ? "NON_RESIDENT" : "RESIDENT", billingAddress: p.billingAddress, ratePct: p.ratePct, exempt: p.exempt, thresholdPerPayout: p.thresholdPerPayout, note: p.note }
      : DEFAULT_OVERRIDE;
    const hasPan = pan.get(id) ?? false;
    const thresholdPerPayout = profile.thresholdPerPayout ?? global.thresholdPerPayout;
    if (profile.exempt) return { pct: 0, note: "Exempt from TDS", exempt: true, thresholdPerPayout, hasPan, profile };
    if (profile.ratePct !== null) return { pct: profile.ratePct, note: `Custom rate ${profile.ratePct}%`, exempt: false, thresholdPerPayout, hasPan, profile };
    const reasons: { pct: number; note: string }[] = [];
    if (!hasPan) reasons.push({ pct: global.noPanPct, note: `No PAN on file: ${global.noPanPct}%` });
    if (profile.residentialStatus === "NON_RESIDENT") reasons.push({ pct: global.nonResidentPct, note: `Non-resident: ${global.nonResidentPct}%` });
    const top = reasons.sort((a, b) => b.pct - a.pct)[0];
    return { ...(top ?? { pct: global.defaultPct, note: `Standard rate ${global.defaultPct}%` }), exempt: false, thresholdPerPayout, hasPan, profile };
  };

  return {
    global,
    rateOf,
    yearToDate: (id) => ytd.get(id) ?? 0,
    compute(id, earned) {
      const r = rateOf(id);
      if (earned <= 0 || r.exempt || r.pct === 0) return { earned, pct: r.pct, amount: 0, note: r.exempt ? r.note : earned <= 0 ? "Nothing to deduct" : r.note };
      if (r.thresholdPerPayout > 0 && earned < r.thresholdPerPayout) return { earned, pct: r.pct, amount: 0, note: `No TDS: under the ₹${r.thresholdPerPayout.toLocaleString("en-IN")} per-payout threshold` };
      const before = ytd.get(id) ?? 0;
      if (global.thresholdPerYear > 0 && before + earned <= global.thresholdPerYear) {
        return { earned, pct: r.pct, amount: 0, note: `No TDS yet: ₹${(before + earned).toLocaleString("en-IN")} this financial year, under the ₹${global.thresholdPerYear.toLocaleString("en-IN")} threshold` };
      }
      return { earned, pct: r.pct, amount: Math.round((earned * r.pct) / 100), note: r.note };
    },
  };
}

/** TDS shown for a period on a statement: the astrologer's rate on what they earned, before any threshold (the payout applies those). */
export function estimateTds(ctx: TdsContext, astrologerId: string, earned: number): { pct: number; amount: number; note: string } {
  const r = ctx.rateOf(astrologerId);
  return { pct: r.pct, amount: r.exempt ? 0 : Math.round((Math.max(0, earned) * r.pct) / 100), note: r.note };
}
