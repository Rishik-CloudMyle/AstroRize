import type { WelcomeBenefit } from "./types";

// Wording for the welcome free calls. The numbers (how many, per what period, how long) are set
// by Astrorize in the admin Config console and come from the API (GET /wallet → welcome).

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

const PER: Record<WelcomeBenefit["allowance"]["period"], string> = { once: "", day: " a day", week: " a week", month: " a month" };
const THIS: Record<WelcomeBenefit["allowance"]["period"], string> = { once: "", day: "today", week: "this week", month: "this month" };

/** "1 free call · 5 min", "2 free calls left this week · 30 min each". */
export function allowanceHeadline(w: WelcomeBenefit): string {
  const n = w.allowance.remaining;
  const calls = `${n} free call${n === 1 ? "" : "s"}`;
  const left = w.allowance.period === "once" ? calls : `${calls} left ${THIS[w.allowance.period]}`;
  return `${left} · ${freeLength(w.freeSeconds)}${n === 1 ? "" : " each"}`;
}

/** The rule in one line: "2 free calls a week · renews Mon 27 Oct" ("" for one free call, once ever). */
export function allowanceRule(w: WelcomeBenefit): string {
  const { count, period, resetsAt } = w.allowance;
  if (period === "once") return count === 1 ? "" : `${count} free calls in all`;
  const rule = `${count} free call${count === 1 ? "" : "s"}${PER[period]}`;
  return resetsAt ? `${rule} · renews ${resetDay(resetsAt)}` : rule;
}
