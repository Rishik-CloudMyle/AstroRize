import { getSetting, putSetting } from "./settings.ts";

// When astrologers are paid: the payout day (1st–10th of the month after a cycle ends) and how long
// an earnings cycle is (a month, or half a month). Finance changes both on the Payouts page.

export interface PayoutSchedule {
  /** Day of the month (1–10) payouts are due. */
  day: number;
  /** Earnings cycle: 30 = monthly, 15 = 1–15 and 16–end. */
  cycleDays: 15 | 30;
}

export const SCHEDULE_SETTING = "payout.schedule";

export async function payoutSchedule(): Promise<PayoutSchedule> {
  const s = await getSetting<Partial<PayoutSchedule>>(SCHEDULE_SETTING, {});
  return { day: Math.min(10, Math.max(1, Math.round(s.day ?? 5))), cycleDays: s.cycleDays === 15 ? 15 : 30 };
}

export const savePayoutSchedule = (s: PayoutSchedule) => putSetting(SCHEDULE_SETTING, { day: s.day, cycleDays: s.cycleDays });

const IST_MS = 5.5 * 3_600_000;

/** Midnight IST on the payout day of the month after the month the cycle ended in. */
export function dueDateOf(periodEnd: Date, day: number): Date {
  const ist = new Date(periodEnd.getTime() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, day) - IST_MS);
}
