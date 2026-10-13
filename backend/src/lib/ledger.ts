import { db } from "../db.ts";
import { istDateKey } from "./format.ts";

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** Midnight IST on the 1st of the month `back` months before `now`'s IST month. */
function monthStart(now: Date, back: number): Date {
  const [y, m] = istDateKey(now).split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00+05:30`);
}

/**
 * Recharges received this month so far (PAID payments, before GST), against the same number of
 * days last month, e.g. "1–13 Oct" vs "1–13 Sep".
 */
export async function grossVolume(now = new Date()) {
  const start = monthStart(now, 0);
  const prevStart = monthStart(now, 1);
  const prevSameDay = new Date(prevStart.getTime() + (now.getTime() - start.getTime()));
  const [cur, prev] = await Promise.all([
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: start, lte: now } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: prevStart, lt: prevSameDay } }, _sum: { amount: true } }),
  ]);
  // "Sep", not en-GB's "Sept".
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Kolkata" }).slice(0, 3);
  return { amount: cur._sum.amount ?? 0, previous: prev._sum.amount ?? 0, month: month(now), previousMonth: month(prevStart) };
}

/** Two PAID payments by the same customer for the same amount within 10 minutes (last 30 days). */
export async function duplicatePayments(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * 86400000);
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "Payment" a JOIN "Payment" b
      ON a."userId" = b."userId" AND a."amount" = b."amount" AND a."id" <> b."id"
     AND b."paidAt" > a."paidAt" AND b."paidAt" <= a."paidAt" + interval '10 minutes'
    WHERE a."status" = 'PAID' AND b."status" = 'PAID' AND a."paidAt" >= ${since}`;
  return num(row?.n);
}

/**
 * The wallet trial balance: every customer wallet (service + promotional) must equal the sum of
 * its ledger lines (recharges, cashback, consultations, gifts, refunds). Returns how far out the
 * wallets are in total and how many disagree.
 */
export async function walletTrialBalance() {
  const [out, checked] = await Promise.all([
    db.$queryRaw<{ userId: string; diff: bigint }[]>`
      SELECT w."userId", (w."service" + w."promo") - coalesce(sum(t."amount"), 0) AS diff
      FROM "Wallet" w LEFT JOIN "Transaction" t ON t."userId" = w."userId"
      GROUP BY w."userId", w."service", w."promo"
      HAVING (w."service" + w."promo") <> coalesce(sum(t."amount"), 0)`,
    db.wallet.count(),
  ]);
  return { off: out.reduce((s, r) => s + Math.abs(num(r.diff)), 0), walletsOut: out.length, checked };
}
