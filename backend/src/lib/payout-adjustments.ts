import { db } from "../db.ts";
import { badRequest, notFound } from "./errors.ts";

// Incentives and deductions Finance adds by hand. Each is an earnings line, so it joins the next
// batch whose cycle covers its date, counts for TDS and shows on the astrologer's statement.

export const isManualAdjustment = (kind: string) => kind === "incentive" || kind === "deduction";

const DAY_MS = 86_400_000;
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export interface AdjustmentInput {
  astrologerId: string;
  /** ₹: above 0 an incentive, below 0 a deduction. */
  amount: number;
  reason: string;
  /** "YYYY-MM-DD" the adjustment belongs to (today when left out). */
  date?: string;
}

export async function addAdjustment(input: AdjustmentInput) {
  const astrologer = await db.astrologer.findUnique({ where: { id: input.astrologerId }, select: { id: true, name: true } });
  if (!astrologer) throw notFound("That astrologer doesn't exist.");
  const today = istToday();
  const date = input.date || today;
  const at = date === today ? new Date() : new Date(`${date}T12:00:00+05:30`);
  if (Number.isNaN(at.getTime()) || date > today || at.getTime() < Date.now() - 92 * DAY_MS) throw badRequest("Choose a date from the last three months, not in the future.");
  const kind = input.amount > 0 ? "incentive" : "deduction";
  const ref = `ADJ-${Date.now().toString(36).toUpperCase()}`;
  const line = await db.earningsLine.create({
    data: {
      astrologerId: astrologer.id,
      date: at,
      sessionRef: ref,
      kind,
      mode: `${kind === "incentive" ? "Incentive" : "Deduction"} · ${input.reason}`,
      minutes: 0,
      gross: 0,
      amount: input.amount,
      fundedBy: "CUSTOMER",
    },
  });
  return { line, astrologer: astrologer.name };
}

export async function recentAdjustments() {
  const rows = await db.earningsLine.findMany({
    where: { kind: { in: ["incentive", "deduction"] } },
    orderBy: { date: "desc" },
    take: 50,
    include: { astrologer: { select: { name: true } } },
  });
  return rows.map((l) => ({ id: l.id, ref: l.sessionRef, astrologer: l.astrologer.name, date: l.date.toISOString(), amount: l.amount ?? 0, reason: l.mode, batchId: l.payoutBatchId }));
}
