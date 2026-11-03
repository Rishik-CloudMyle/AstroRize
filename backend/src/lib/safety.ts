import { tooMany } from "./errors.ts";

// Contact details in platform messages (client, Nov 2026): the free Messages chat and public
// live-room chat allow none (FREE); the chat inside a paid consultation blocks only phone numbers
// (PAID). The patterns live in contact-filter.ts, which the website runs too.
export { type ContactKind, type ContactPolicy, containsContactDetails, contactBlockedNotice, findContactDetails } from "./contact-filter.ts";

/** The general notice (FREE policy) where there is no specific finding to name, e.g. a live room's title. */
export const CONTACT_BLOCKED_NOTICE =
  "Contact details (phone numbers, email addresses, links, social media handles, UPI IDs, home addresses) can't be shared on AstroRize. Keep the conversation on the platform so both of you stay protected.";

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
