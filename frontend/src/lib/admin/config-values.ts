import type { ConfigKey } from "./types";

/** Decimal keys take at most this many decimal places (the API applies the same rule). */
const MAX_DECIMALS = 2;
const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** "Whole number, 0–100" / "Up to 2 decimals, 1.0–6.0" — the hint under the value input. */
export function valueHint(c: ConfigKey): string {
  if (!c.range) return "This setting has no valid range, so it can't be changed here.";
  return `${c.range.integer ? "Whole number" : `Up to ${MAX_DECIMALS} decimals`} · allowed ${c.bounds}`;
}

/**
 * Checks a proposed value before it is sent, with the same rules and messages as the API
 * (which re-checks it). Returns the problem, or null when the value can be submitted.
 */
export function valueProblem(raw: string, c: ConfigKey): string | null {
  const value = raw.trim();
  if (!value) return "Enter the proposed value.";
  const range = c.range;
  if (!range) return "This setting has no valid range configured, so it can't be changed here.";
  if (!NUMBER.test(value)) return `Enter a number${range.integer ? "" : " (use a dot for decimals)"} — allowed ${c.bounds}.`;
  const places = (value.replace(/0+$/, "").replace(/\.$/, "").split(".")[1] ?? "").length;
  if (range.integer && places > 0) return `Use a whole number for this setting — allowed ${c.bounds}.`;
  if (!range.integer && places > MAX_DECIMALS) return `Use at most ${MAX_DECIMALS} decimal places — allowed ${c.bounds}.`;
  const n = Number(value);
  if (n < range.min || n > range.max) return `Out of range — allowed ${c.bounds}.`;
  if (n === Number(c.current)) return `${c.current} is already the current value. Enter a different one.`;
  return null;
}
