import type { Astrologer, AvailabilityKey, ConsultMode, RecognitionKey } from "./types";

/** ₹1,240 — Indian digit grouping */
export function rupee(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

export function signedRupee(n: number): string {
  return (n < 0 ? "−" : "+") + rupee(Math.abs(n));
}

/** "4 min 12 s" */
export function duration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

/** "07:42" */
export function clock(secs: number): string {
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

/**
 * Discount badge text. Pricing rule from the prototype: show the struck-through
 * original, the effective price and the discount badge only — never "0% OFF".
 */
export function discountLabel(price: number, was: number | null): string | null {
  if (!was || was <= price) return null;
  const pct = Math.round((1 - price / was) * 100);
  return pct > 0 ? `${pct}% OFF` : null;
}

export function skillLine(a: Astrologer): string {
  return `${a.skills.join(" · ")} · ${a.years} yrs`;
}

export function languageLine(a: Astrologer): string {
  return a.languages.join(", ");
}

export function ratingLabel(a: Astrologer): string {
  return a.rating === null ? "—" : a.rating.toFixed(1);
}

/** Video calls carry a ₹12/min premium over the base rate. */
export function rateFor(baseRate: number, mode: ConsultMode | null): number {
  return baseRate + (mode === "video" ? 12 : 0);
}

/** "3× standard" — Instant Call multiplier shown before dialling. */
export function instantMultiplier(a: Astrologer): string {
  const m = Math.round((a.instant / a.price) * 10) / 10;
  return `${m}×`;
}

export const RECOGNITION: Record<RecognitionKey, { label: string; bg: string; border: string; fg: string }> = {
  premium: { label: "Premium", bg: "linear-gradient(180deg,#fffaf0,#f6edd6)", border: "#ead7a8", fg: "#6b5420" },
  trusted: { label: "Trusted", bg: "linear-gradient(180deg,#f7f3ff,#efe8fc)", border: "#d9c8f4", fg: "#6d28d9" },
  proven: { label: "Proven Expert", bg: "linear-gradient(180deg,#f3f7ff,#e8f0ff)", border: "#c5d8f6", fg: "#2563eb" },
  rising: { label: "Rising", bg: "linear-gradient(180deg,#fff7ee,#ffebd6)", border: "#f2c196", fg: "#c2410c" },
  fresh: { label: "New", bg: "linear-gradient(180deg,#fff4f7,#fde8ef)", border: "#f3c2d2", fg: "#db2777" },
};

export const AVAILABILITY: Record<AvailabilityKey, { label: string; bg: string; fg: string; dot: string }> = {
  on: { label: "Available", bg: "#e7f8ee", fg: "#147a45", dot: "#059669" },
  busy: { label: "In consultation", bg: "#fde8ee", fg: "#c81e4a", dot: "#be123c" },
  live: { label: "Live now", bg: "#ffedd5", fg: "#c2410c", dot: "#ea580c" },
  off: { label: "Offline", bg: "#f3f1ef", fg: "#7a736c", dot: "#a8a29e" },
};

/** Trust card values on the profile page. */
export function trustMetrics(a: Astrologer) {
  const none = a.rating === null;
  const r = a.rating ?? 0;
  return [
    { label: "Overall rating", value: none ? "Insufficient data" : `${r.toFixed(1)} ★`, fg: none ? "#78716c" : "#1c1917" },
    { label: "Verified consults", value: a.consults.toLocaleString("en-IN"), fg: "#1c1917" },
    { label: "Would consult again", value: none ? "Insufficient data" : `${Math.round(r * 18.8)}%`, fg: none ? "#78716c" : "#047857" },
    { label: "Satisfaction", value: none ? "Insufficient data" : r >= 4.8 ? "Excellent" : "Very good", fg: "#1c1917" },
    { label: "Trust trend", value: none ? "Insufficient data" : r >= 4.8 ? "Consistently High" : "Improving", fg: "#b45309" },
  ];
}

export function trustJourney(a: Astrologer) {
  return [
    { label: "Joined", when: "Mar 2024", done: false },
    { label: "Verified", when: "Apr 2024", done: false },
    { label: "100 consults", when: "Sep 2024", done: false },
    { label: RECOGNITION[a.recognition].label, when: "Feb 2026", done: true },
  ];
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
