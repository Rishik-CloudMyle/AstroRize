import { randomInt } from "node:crypto";

// Display helpers. All dates are shown in Indian Standard Time.

const IST = "Asia/Kolkata";

/** ₹1,240 */
export function rupee(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

// Fixed month names: Node's "en-GB" short month for September is "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Aug" */
export function istDayMonth(d: Date): string {
  const [, m, day] = istDateKey(d).split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]}`;
}

/** "11 Aug 2026" */
export function istDate(d: Date): string {
  return `${istDayMonth(d)} ${istDateKey(d).slice(0, 4)}`;
}

/** "09:38" */
export function istTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
}

/** "15 Sep 09:38:12" (audit log) */
export function istStamp(d: Date): string {
  const dm = istDayMonth(d);
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: IST });
  return `${dm} ${t}`;
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
export function istDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

/** "Mon 14" for an IST date key. */
export function weekdayLabel(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00Z");
  const wd = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${wd} ${d.getUTCDate()}`;
}

/** Human age like "4 min", "6h", "2d". */
export function ageLabel(from: Date, now = new Date(), style: "short" | "long" = "short"): string {
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
  if (mins < 60) return style === "long" ? `${mins} min` : `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** A random reference like "SES-48213" that is checked for uniqueness by the caller. */
export function makeRef(prefix: string, digits = 5): string {
  return `${prefix}-${randomInt(10 ** (digits - 1), 10 ** digits)}`;
}

/** Short random hex id, e.g. for audit correlation. */
export function shortId(): string {
  return randomInt(0, 0xfffffff).toString(16).padStart(7, "0");
}

/**
 * Whole-number percentages that always add up to exactly 100 (largest remainder method).
 * Rounding each share separately can give 99 or 101, e.g. 48.6 + 29.6 + 21.8.
 */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const result = exact.map(Math.floor);
  let left = 100 - result.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    result[i]! += 1;
    left -= 1;
  }
  return result;
}
