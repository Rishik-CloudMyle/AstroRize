// Money rules for consultations, kept in one place so the website, the portals
// and the mobile app all charge exactly the same way.

import { configNumber } from "./settings.ts";

// Commercial limits the admin sets in the Config console (read every few seconds, so a change
// applies without a restart). Defaults are the launch values.
const live = { videoPremium: 12, eligibilityMinutes: 1, maxSessionSeconds: 15 * 60, incomingWindowSecs: 180 };
/** Video costs this much more per minute than chat or voice (₹). Config consult.video_premium. */
export const videoPremium = () => live.videoPremium;
/** Minutes of balance a customer needs before a paid consultation can start. Config consult.min_balance_minutes. */
export const eligibilityMinutes = () => live.eligibilityMinutes;
/** Longest single consultation, in seconds. Config consult.max_session_minutes. */
export const maxSessionSeconds = () => live.maxSessionSeconds;
/** How long an astrologer has to accept a request, in seconds. Config consult.accept_window_seconds. */
export const incomingWindowSecs = () => live.incomingWindowSecs;

export async function refreshBillingConfig() {
  try {
    const [v, e, m, w] = await Promise.all([
      configNumber("consult.video_premium", 12),
      configNumber("consult.min_balance_minutes", 1),
      configNumber("consult.max_session_minutes", 15),
      configNumber("consult.accept_window_seconds", 180),
    ]);
    live.videoPremium = v;
    live.eligibilityMinutes = e;
    live.maxSessionSeconds = Math.round(m * 60);
    live.incomingWindowSecs = w;
  } catch {
    // Keep the last known values (database briefly unavailable).
  }
}
void refreshBillingConfig();
setInterval(() => void refreshBillingConfig(), 10_000).unref();
/** GST added on top of a recharge. None any more: GST is included in every per-minute rate (GST_PCT). */
export const GST_RATE = 0;

/** GST percent included in the per-minute rate a customer sees and pays. */
export const GST_PCT = 18;

/** An astrologer's own rate with GST included, rounded up to the next whole rupee: ₹20 + 18% = ₹23.60 → ₹24. */
export const withGst = (base: number) => Math.ceil((base * (100 + GST_PCT)) / 100);

/** The astrologer's own rate behind a customer rate (the largest rate whose GST-inclusive price is no more than it): ₹24 → ₹20. */
export const baseOfRate = (rate: number) => Math.floor((rate * 100) / (100 + GST_PCT));

/**
 * An amount a customer paid (GST included) without its GST, for the revenue split: the amount scaled by
 * base rate ÷ customer rate, so whole minutes at ₹24 count as exactly ₹20 each. `gstPct` 0 (older
 * sessions) leaves the amount as it is.
 */
export function withoutGst(amount: number, rate: number, gstPct: number): number {
  if (!gstPct || rate <= 0) return amount;
  return Math.round((amount * Math.floor((rate * 100) / (100 + gstPct))) / rate);
}

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
  return price + (mode === "VIDEO" ? videoPremium() : 0);
}

/** What a customer pays per minute: the astrologer's rate for the mode, with GST included. */
export function customerRate(price: number, mode: Mode, chatPrice?: number | null): number {
  return withGst(rateFor(price, mode, chatPrice));
}

/** The astrologer's chat rate: their own chat price, or their call price when they haven't set one. */
export function chatRate(a: { price: number; chatPrice: number | null }): number {
  return rateFor(a.price, "CHAT", a.chatPrice);
}

/** Instant Call rate: the standard rate × the astrologer's multiplier. */
export function instantRate(price: number, multiplier: number): number {
  return Math.round(price * multiplier);
}

/** Instant Call rate a customer pays: the standard rate × the multiplier, with GST included. */
export function customerInstantRate(price: number, multiplier: number): number {
  return withGst(instantRate(price, multiplier));
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
  /**
   * The standard free first minute: it only counts when the call runs PAST it. A call that ends inside it
   * (even at 59 seconds) is billed one minute, so the free minute can not be used over and over.
   * Refunds for a genuine reason go through the normal billing-issue flow.
   */
  shortCharge?: boolean;
}): Settlement {
  const billedSeconds = Math.max(0, input.connectedSeconds);
  const short = input.shortCharge && input.freeSeconds > 0 && billedSeconds > 0 && billedSeconds <= input.freeSeconds;
  const billable = short ? 60 : Math.max(0, billedSeconds - input.freeSeconds);
  const billedMinutes = Math.ceil(billable / 60);
  const total = Math.min(billedMinutes * input.rate, input.held);
  const promoUsed = Math.min(input.promo, total);
  return { billedSeconds, billedMinutes, total, promoUsed, serviceUsed: total - promoUsed };
}

/** Seconds a held balance can pay for: the free window plus whole affordable minutes. */
export function affordableSeconds(held: number, rate: number, freeSeconds: number): number {
  return freeSeconds + Math.floor(held / rate) * 60;
}
