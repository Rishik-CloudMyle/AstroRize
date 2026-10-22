import { db } from "../db.ts";
import type { Astrologer, PriceChange } from "../generated/prisma/client.ts";
import { instantRate, rateFor } from "./billing.ts";
import { istDate, rupee } from "./format.ts";
import { configNumber } from "./settings.ts";

// Astrologers set their own chat/voice per-minute price from the portal (client decision, Oct
// 2026). Each increase is limited and needs approval (below), decreases are not, and there is a
// cooldown between changes.
// A new price applies to consultations requested after it; running ones keep the rate fixed
// when they were requested (Consultation.rate). Video = price + the video premium; Instant Call
// = price × the astrologer's multiplier. `was` (the struck-through original) is never touched.

/** Rules from the Config console. */
export async function pricingPolicy() {
  const [maxIncrease, cooldownDays, minRate, maxRate] = await Promise.all([
    configNumber("pricing.max_increase_rupees", 15),
    configNumber("pricing.change_cooldown_days", 7),
    configNumber("pricing.min_rate", 5),
    configNumber("pricing.max_rate", 500),
  ]);
  return {
    maxIncrease: Math.max(0, Math.floor(maxIncrease)),
    cooldownDays: Math.max(0, cooldownDays),
    minRate: Math.max(1, Math.floor(minRate)),
    maxRate: Math.max(1, Math.floor(maxRate)),
  };
}

type Policy = Awaited<ReturnType<typeof pricingPolicy>>;
type Priced = Pick<Astrologer, "price" | "was" | "instantMultiplier" | "priceChangedAt" | "lifecycle">;

/** When the astrologer may change their price again, or null when they may now. */
export function nextChangeAt(a: Pick<Astrologer, "priceChangedAt">, policy: Policy, now = new Date()): Date | null {
  if (!a.priceChangedAt) return null;
  const at = new Date(a.priceChangedAt.getTime() + policy.cooldownDays * 86400000);
  return at > now ? at : null;
}

/** The lowest and highest price the next change may set (whole rupees). */
export function allowedRange(a: Pick<Astrologer, "price">, policy: Policy) {
  return { min: policy.minRate, max: Math.max(policy.minRate, Math.min(policy.maxRate, a.price + policy.maxIncrease)) };
}

/** Why the astrologer can't set `price` now, or null. */
export function priceProblem(a: Priced, price: number, policy: Policy, now = new Date()): { status: 400 | 409; message: string } | null {
  if (a.lifecycle !== "active" || a.price <= 0) {
    return { status: 409, message: "Your price is set by Astrorize during onboarding. You can change it yourself once your profile is live." };
  }
  const next = nextChangeAt(a, policy, now);
  if (next) return { status: 409, message: `You can change your price once every ${policy.cooldownDays} days. Your next change is possible from ${istDate(next)}.` };
  if (!Number.isInteger(price)) return { status: 400, message: "Enter your price in whole rupees." };
  if (price === a.price) return { status: 400, message: `${rupee(price)}/min is already your price.` };
  if (price < policy.minRate) return { status: 400, message: `Your price can't be below ${rupee(policy.minRate)}/min.` };
  if (price > policy.maxRate) return { status: 400, message: `Your price can't be above ${rupee(policy.maxRate)}/min.` };
  if (price - a.price > policy.maxIncrease) {
    return { status: 400, message: `You can raise your price by at most ${rupee(policy.maxIncrease)} at a time — up to ${rupee(a.price + policy.maxIncrease)}/min.` };
  }
  return null;
}

/** The portal's "Your price" card. */
export function priceView(
  a: Priced,
  policy: Policy,
  now = new Date(),
  requests: Awaited<ReturnType<typeof priceRequestState>> = { pending: null, lastDecision: null },
) {
  const next = nextChangeAt(a, policy, now);
  return {
    price: a.price,
    was: a.was,
    /** What customers pay per minute for each way of consulting. */
    rates: {
      chat: rateFor(a.price, "CHAT"),
      voice: rateFor(a.price, "VOICE"),
      video: rateFor(a.price, "VIDEO"),
      instant: instantRate(a.price, a.instantMultiplier),
    },
    /** The astrologer can change it themselves (live profile with a price set). */
    editable: a.lifecycle === "active" && a.price > 0,
    allowed: allowedRange(a, policy),
    maxIncrease: policy.maxIncrease,
    cooldownDays: policy.cooldownDays,
    changedAt: a.priceChangedAt ? istDate(a.priceChangedAt) : null,
    /** "29 Oct 2026" while in the cooldown, else null. */
    nextChangeOn: next ? istDate(next) : null,
    /** An increase waiting for the Astrorize team (customers still pay `price`), or null. */
    pending: requests.pending,
    /** The team's latest decision on an increase (approved or rejected, with the reason), or null. */
    lastDecision: requests.lastDecision,
  };
}

// ── Approvals (client decision, Oct 2026) ──
// A decrease goes live at once (PriceChange APPLIED). An increase waits as a PENDING request
// until staff with `price.approve` (Astrologer lifecycle page) approve or reject it; customers
// keep paying the current price meanwhile. One open request per astrologer; the astrologer can
// withdraw it. The cooldown runs from the last price that actually changed (priceChangedAt), so
// a rejected or withdrawn request doesn't start one.

export type PriceChangeStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "WITHDRAWN";

type ChangeRow = Pick<PriceChange, "id" | "fromPrice" | "toPrice" | "status" | "requestedAt" | "decidedAt" | "decidedByName" | "reason">;

/** One change as the portal and the console show it. */
export function priceChangeView(c: ChangeRow) {
  return {
    id: c.id,
    from: c.fromPrice,
    to: c.toPrice,
    kind: c.toPrice > c.fromPrice ? ("increase" as const) : ("decrease" as const),
    status: c.status as PriceChangeStatus,
    requestedAt: c.requestedAt.toISOString(),
    requestedOn: istDate(c.requestedAt),
    decidedAt: c.decidedAt?.toISOString() ?? null,
    decidedOn: c.decidedAt ? istDate(c.decidedAt) : null,
    decidedBy: c.decidedByName,
    reason: c.reason,
  };
}

/** The astrologer's open request and the latest staff decision in the last 30 days (for the portal card). */
export async function priceRequestState(astrologerId: string) {
  const [pending, decided] = await Promise.all([
    db.priceChange.findFirst({ where: { astrologerId, status: "PENDING" }, orderBy: { requestedAt: "desc" } }),
    // Only recent news: a decision from more than 30 days ago is no longer shown.
    db.priceChange.findFirst({
      where: { astrologerId, status: { in: ["APPROVED", "REJECTED"] }, decidedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { decidedAt: "desc" },
    }),
  ]);
  return { pending: pending ? priceChangeView(pending) : null, lastDecision: decided ? priceChangeView(decided) : null };
}

/**
 * Why staff can't approve this increase now, or null. Measured against the price in force now:
 * the result may be at most the largest increase above it, within the range, and still an increase.
 */
export function approvalProblem(a: Pick<Astrologer, "price" | "lifecycle">, toPrice: number, policy: Policy): string | null {
  if (a.lifecycle !== "active" || a.price <= 0) return "This astrologer's profile isn't live, so their price can't change from the portal. Reject the request.";
  if (toPrice <= a.price) return `This is no longer an increase — the price is ${rupee(a.price)}/min now. Reject the request.`;
  if (toPrice > policy.maxRate) return `${rupee(toPrice)}/min is above the highest price allowed (${rupee(policy.maxRate)}/min). Reject the request.`;
  if (toPrice - a.price > policy.maxIncrease) {
    return `${rupee(toPrice)}/min is more than ${rupee(policy.maxIncrease)} above the current ${rupee(a.price)}/min. Reject the request.`;
  }
  return null;
}
