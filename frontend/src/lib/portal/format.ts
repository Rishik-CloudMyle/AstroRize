/** ₹1,240 — Indian digit grouping */
export function rupee(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

/**
 * Discount badge text, always computed from the two prices so the badge can
 * never disagree with the numbers beside it. Never "0% OFF".
 */
export function discountLabel(price: number, was: number | null): string | null {
  if (!was || was <= price) return null;
  const pct = Math.round((1 - price / was) * 100);
  return pct > 0 ? `${pct}% OFF` : null;
}

/** Instant Call / Emergency rate: the standard rate times the multiplier. */
export function instantRate(price: number, multiplier: number): number {
  return Math.round(price * multiplier);
}

export function ratingLabel(rating: number | null): string {
  return rating === null ? "—" : rating.toFixed(1);
}

export function skillLine(skills: string[], years: number): string {
  return `${skills.join(" · ")} · ${years} yrs`;
}

/** "2:41" */
export function countdown(secs: number): string {
  const s = Math.max(0, secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
