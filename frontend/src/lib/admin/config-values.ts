import type { ConfigKey } from "./types";

/**
 * Multiply a config value without float noise: at most 2 decimals, trailing zeros trimmed,
 * but never fewer decimals than the original ("4.0" × 1.1 → "4.4", "80" × 1.1 → "88", "2" × 0.95 → "1.9").
 */
export function scaleValue(value: string, factor: number): string {
  const minDecimals = value.includes(".") ? value.split(".")[1].length : 0;
  const rounded = Math.round(Number(value) * factor * 100) / 100;
  const decimals = Math.max(minDecimals, (String(rounded).split(".")[1] ?? "").length);
  return rounded.toFixed(decimals);
}

function inBounds(value: string, bounds: string): boolean {
  const [lo, hi] = bounds.split(/[–-]/).map(Number);
  const n = Number(value);
  return Number.isFinite(n) && n >= lo && n <= hi;
}

/**
 * The value the console proposes when drafting a change (the console has no free-text input,
 * as in the prototype): the multiplier drops 4.0 → 3.0, anything else moves 5% down, or
 * 5% up when down would leave the permitted range or not change the value.
 */
export function draftValue(c: ConfigKey): string {
  if (c.key === "consult.emergency.max_multiplier" && c.current === "4.0") return "3.0";
  // Whole-number keys (seconds, days, counts) stay whole numbers.
  const scale = (f: number) =>
    c.current.includes(".") ? scaleValue(c.current, f) : String(Math.round(Number(c.current) * f));
  const down = scale(0.95);
  if (down !== c.current && inBounds(down, c.bounds)) return down;
  const up = scale(1.05);
  if (up !== c.current && inBounds(up, c.bounds)) return up;
  // Small integers (e.g. "1", range 1–3): step by one.
  const step = String(Number(c.current) + 1);
  return inBounds(step, c.bounds) ? step : down;
}
