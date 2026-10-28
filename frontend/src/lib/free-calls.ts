import type { WelcomeBenefit } from "./types";

// Wording for the welcome free minutes. The numbers (minutes per week, the lengths a free call can
// be) are set by Astrorize in the admin Config console and come from the API (GET /wallet → welcome).

/** Length of a free call: "5 min", "30 min", "1 hour", "1 h 30 min". */
export function freeLength(secs: number): string {
  const m = Math.max(1, Math.round(secs / 60));
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return m === 60 ? "1 hour" : `${m / 60} hours`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Same, spelled out for a sentence: "5 minutes", "1 hour". */
export function freeLengthLong(secs: number): string {
  const m = Math.max(1, Math.round(secs / 60));
  if (m < 60) return m === 1 ? "1 minute" : `${m} minutes`;
  return freeLength(secs);
}

/** "Mon 27 Oct" (IST). */
export function resetDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** "Mon" — the weekday the free minutes reset (IST). */
export function resetWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Kolkata" });
}

/** "25 of 30 left this week · resets Mon". */
export function minutesLeft(w: WelcomeBenefit): string {
  return `${w.weekly.remaining} of ${w.weekly.total} left this week · resets ${resetWeekday(w.weekly.resetsAt)}`;
}

/** "Free minutes: 25 of 30 left this week · resets Mon". */
export function minutesHeadline(w: WelcomeBenefit): string {
  return `Free minutes: ${minutesLeft(w)}`;
}

/** Where a customer finds the astrologers taking free calls (the directory's "Free call" filter). */
export const FREE_CALL_DIRECTORY = "/astrologers?availability=Free%20call";

/** The lengths that fit in this week's minutes (minutes, smallest first). */
export function fittingLengths(w: WelcomeBenefit): number[] {
  return w.lengths.filter((l) => l.fits).map((l) => l.minutes);
}

/** Longest free call that fits this week, in minutes (0 when none). */
export function longestFit(w: WelcomeBenefit): number {
  return Math.max(0, ...fittingLengths(w));
}

/** "5, 10 or 30 min" — the lengths that fit (or all lengths). */
export function lengthsLabel(minutes: number[]): string {
  if (!minutes.length) return "";
  if (minutes.length === 1) return `${minutes[0]} min`;
  return `${minutes.slice(0, -1).join(", ")} or ${minutes[minutes.length - 1]} min`;
}
