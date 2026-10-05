import { tooMany } from "./errors.ts";

// Contact details are not allowed in platform messages: both sides stay protected
// and consultations stay on the platform.
const PATTERNS = [
  /(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/, // Indian mobile numbers, with or without spaces
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email addresses
  /\b(?:whats\s?app|wa\.me|telegram|t\.me|insta(?:gram)?|snap(?:chat)?)\b/i, // off-platform apps
  /\b\d{2,5}[\s-]?•{3,}/, // partially masked numbers like "98765 •••••"
];

export function containsContactDetails(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}

export const CONTACT_BLOCKED_NOTICE =
  "Contact details cannot be shared through Astrorize. Keep the conversation on the platform so both of you stay protected.";

/**
 * Simple in-memory rate limiter (per process). Good enough for one server; move to
 * Redis when the API runs on several machines.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, message: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) throw tooMany(message);
  recent.push(now);
  hits.set(key, recent);
}
