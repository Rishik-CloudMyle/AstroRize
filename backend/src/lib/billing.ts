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

/**
 * A consultation's mode. Paid chat was withdrawn on 29 Oct 2026 and brought back (client, Nov
 * 2026) with its own optional per-minute price (Astrologer.chatPrice).
 */
export type Mode = "CHAT" | "VOICE" | "VIDEO";

/**
 * Per-minute rate by mode: chat at the astrologer's own chat price when they set one (else their
 * call price), voice at their price, video at their price + the video premium.
 */
export function rateFor(price: number, mode: Mode, chatPrice?: number | null): number {
  if (mode === "CHAT" && chatPrice) return chatPrice;
  return price + (mode === "VIDEO" ? VIDEO_PREMIUM : 0);
}

/** The astrologer's chat rate: their own chat price, or their call price when they haven't set one. */
export function chatRate(a: { price: number; chatPrice: number | null }): number {
  return rateFor(a.price, "CHAT", a.chatPrice);
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
