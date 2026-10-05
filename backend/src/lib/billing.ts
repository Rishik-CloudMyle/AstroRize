// Money rules for consultations, kept in one place so the website, the portals
// and the mobile app all charge exactly the same way.

/** Video costs this much more per minute than chat or voice (₹). */
export const VIDEO_PREMIUM = 12;
/** A customer needs this many minutes of balance before a consultation can start. */
export const ELIGIBILITY_MINUTES = 5;
/** Longest single consultation, in seconds. */
export const MAX_SESSION_SECONDS = 15 * 60;
/** GST charged on top of a recharge. */
export const GST_RATE = 0.18;

export type Mode = "CHAT" | "VOICE" | "VIDEO";

export function rateFor(price: number, mode: Mode): number {
  return price + (mode === "VIDEO" ? VIDEO_PREMIUM : 0);
}

/** Instant Call rate: the standard rate × the astrologer's multiplier. */
export function instantRate(price: number, multiplier: number): number {
  return Math.round(price * multiplier);
}

export interface Settlement {
  billedSeconds: number;
  billedMinutes: number;
  total: number;
  promoUsed: number;
  serviceUsed: number;
}

/**
 * The single debit after a consultation ends:
 * - the first `freeSeconds` are not billed,
 * - after that, partial minutes round up,
 * - never more than the amount that was held,
 * - promotional balance is used before service balance.
 */
export function settle(input: {
  connectedSeconds: number;
  rate: number;
  freeSeconds: number;
  held: number;
  promo: number;
}): Settlement {
  const billedSeconds = Math.max(0, input.connectedSeconds);
  const billable = Math.max(0, billedSeconds - input.freeSeconds);
  const billedMinutes = Math.ceil(billable / 60);
  const total = Math.min(billedMinutes * input.rate, input.held);
  const promoUsed = Math.min(input.promo, total);
  return { billedSeconds, billedMinutes, total, promoUsed, serviceUsed: total - promoUsed };
}

/** Seconds a held balance can pay for: the free window plus whole affordable minutes. */
export function affordableSeconds(held: number, rate: number, freeSeconds: number): number {
  return freeSeconds + Math.floor(held / rate) * 60;
}
