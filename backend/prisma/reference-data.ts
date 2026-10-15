// Reference data the app needs to run: Config console keys, recharge amounts, the gift catalogue
// and the Settings with no safe default in code. Used by BOTH bootstrap.ts (production, every
// deploy: inserts only what is missing) and seed.ts (development demo data).
//
// ⚠ Values marked "client" are the prototype's figures; prices, bonuses and gift prices are the
// client's decisions (CLAUDE.md) — confirm them before launch. Admins change them afterwards in the
// admin console, and bootstrap never overwrites what they changed.

/** [key, flagged (needs a second approver), description, default value, scope, bounds, dry-run text, domain]. Order = console rank. */
export type ConfigKeyRow = [key: string, flagged: boolean, description: string, value: string, scope: string, bounds: string, dryRun: string, domain: string];

export const CONFIG_KEYS: ConfigKeyRow[] = [
  ["wallet.cashback.floor_pct", false, "Minimum share of the original price that must remain payable after any discount. Campaigns that breach it are rejected or clamped, per the floor mode.", "80", "global", "0–100", "Lowering it lets campaigns discount more before they are rejected or clamped; raising it clamps more campaign offers.", "finance"],
  ["consult.emergency.max_multiplier", true, "Upper bound on the Instant Call multiplier an astrologer may set from their dashboard.", "4.0", "global", "1.0–6.0", "Lowering it reprices every astrologer above the new ceiling at their next Instant Call.", "consult"],
  ["consult.free_seconds", false, "Seconds at the start of every consultation that are not metered.", "60", "global", "0–180", "Raising it gives every customer more unmetered time per consultation, paid for by the platform.", "consult"],
  ["live.queue.max_depth", false, "Maximum number of viewers who may hold a place in a live consult queue.", "20", "global", "5–50", "Raising it lets more viewers wait in a live room's queue; viewers beyond the cap can watch but not queue.", "live"],
  ["live.turn_offer.timeout_s", false, "Seconds a viewer has to accept their turn before the offer expires and the queue advances.", "45", "global", "15–120", "Shortening it moves the queue faster but more viewers miss their turn.", "live"],
  ["risk.weights.session_abandon", true, "Weight applied to abandoned sessions in the astrologer risk score.", "0.35", "global", "0.0–1.0", "Changes how strongly abandoned sessions raise an astrologer's risk score. Requires dual control.", "compliance"],
  ["wallet.promo.validity_months", false, "How long promotional credit remains spendable before it expires.", "12", "global", "1–36", "Applies to promotional credit given after the change; existing credit keeps its expiry date.", "finance"],
  ["payout.batch.min_approvers", true, "Number of distinct approvers required before a payout batch can be released. Approver and releaser must differ.", "2", "global", "1–4", "Dropping to 1 removes the second signature on payout batches. Approver and releaser must still differ.", "finance"],
  ["payout.hold_days.new_astrologer", false, "Days a newly onboarded astrologer's earnings are held before entering a payout batch.", "14", "global", "0–45", "Cutting it pays newly onboarded astrologers sooner; their earnings join an earlier payout batch.", "finance"],
  ["support.sla.first_response_mins", false, "Minutes a ticket may wait for its first human response before it is flagged as an SLA breach.", "30", "segment", "5–240", "Lowering it flags tickets as breached sooner on the Support queue.", "support"],
  ["support.refund.auto_approve_ceiling", true, "Refund value an agent may approve without a second reviewer.", "500", "global", "0–5000", "Raising it lets more refunds clear without a second reviewer.", "support"],
  ["trust.review.removal_undo_mins", false, "Window in which a soft-hidden review can be restored before removal becomes permanent.", "30", "global", "5–120", "Lengthening it gives moderators longer to restore a soft-hidden review before removal is permanent.", "trust"],
  ["trust.rating.min_consults_to_publish", false, "Verified consultations an astrologer needs before a public rating is shown on the profile.", "25", "global", "5–200", "Lowering it shows ratings on profiles with fewer consultations, which are less reliable.", "trust"],
  ["trust.recommendation.min_consultations", false, "Completed consultations the platform needs before the recommendation engine may be switched on (its density gate).", "1000", "global", "100–100000", "Lowering it lets recommendations start on less data, which makes them less reliable.", "trust"],
  ["live.room.max_concurrent_per_astrologer", false, "Live rooms one astrologer may host at the same time.", "1", "global", "1–3", "No astrologer currently requests more than one. Raising this needs a provider capacity review.", "live"],
  ["marketing.gift.max_value", true, "Ceiling on a single gift in the catalogue. Anything above needs Admin approval before it goes ACTIVE.", "5100", "global", "100–10000", "Lowering it sends catalogue gifts above the new ceiling back for Admin approval.", "marketing"],
  ["marketing.campaign.max_discount_pct", false, "Largest discount a campaign may advertise before the cashback floor clamps it.", "40", "segment", "0–70", "Raising it allows bigger advertised discounts; the cashback floor still limits the effective price.", "marketing"],
  ["hr.application.review_sla_days", false, "Days an application may sit in review before it is flagged past SLA on the queue.", "5", "global", "1–21", "Lowering it flags applications as past SLA sooner on the lifecycle queue.", "hr"],
  ["hr.pricing.max_increase_pct", true, "Largest per-minute price increase an astrologer may request in a single price version.", "25", "global", "0–50", "Lowering it sends more astrologer price-increase requests for a manual override.", "hr"],
  ["welcome.enabled", true, "Turns the welcome campaign on (1) or off (0): every new customer's one free consultation.", "1", "global", "0–1", "Turning it off stops new free calls; customers keep the free call they already hold.", "consult"],
  ["welcome.complimentary_seconds", true, "Length of the welcome free call, in seconds.", "300", "global", "60–900", "Applies to calls requested after the change; calls already running keep their length.", "consult"],
  ["welcome.reminder_seconds", false, "How many seconds before the free time ends the customer is reminded to add money.", "120", "global", "30–300", "Earlier gives customers more time to recharge without the call dropping.", "consult"],
  ["welcome.daily_limit_default", false, "Free calls one astrologer takes per day (IST) unless a different limit is set for them.", "5", "global", "0–50", "Raising it spreads fewer new customers across more astrologers' paid time.", "hr"],
  ["welcome.min_meaningful_seconds", false, "A free call that drops before this many seconds through no fault of the customer gives the free call back.", "30", "global", "10–120", "Raising it restores more free calls after early drops.", "consult"],
  ["welcome.max_fault_restores", false, "Most times one customer's free call can be given back after early drops.", "2", "global", "0–5", "Raising it is kinder to customers on bad connections but easier to abuse.", "risk"],
  ["presence.offline_after_mins", false, "Minutes without any sign of life from the astrologer portal before the astrologer is switched offline.", "15", "global", "3–60", "Shorter catches closed portals sooner; longer survives a laptop sleeping or a browser resting a background tab.", "consult"],
  ["rbac.session.step_up_validity_mins", true, "How long a step-up MFA verification stays valid before the next privileged action re-prompts.", "15", "global", "1–60", "Raising it means fewer MFA re-prompts but a longer window in which a privileged action needs no new check.", "rbac"],
];

/** Recharge amounts offered on the wallet page and the promotional bonus each adds (client). */
export const DENOMINATIONS: { amount: number; bonus: number; enabled?: boolean }[] = [
  { amount: 100, bonus: 0, enabled: false },
  { amount: 200, bonus: 10 },
  { amount: 500, bonus: 40 },
  { amount: 1000, bonus: 100 },
  { amount: 2000, bonus: 250 },
  { amount: 3000, bonus: 0, enabled: false },
  { amount: 5000, bonus: 700 },
  { amount: 10000, bonus: 0 },
];

/** Live-room gift catalogue (client). `rank` is the list position. */
export const GIFTS: { icon: string; name: string; price: number; state: string }[] = [
  { icon: "🪔", name: "Lotus", price: 51, state: "ACTIVE" },
  { icon: "🔔", name: "Divine Bell", price: 501, state: "ACTIVE" },
  { icon: "👑", name: "Honor Crown", price: 1001, state: "PENDING ADMIN" },
  { icon: "✦", name: "Eternal Gratitude", price: 5100, state: "ACTIVE" },
];

/**
 * Settings the app reads, with their starting values. (Retention and the RBAC matrix are not here:
 * their defaults live in code, and a stored value means a Super Admin chose one.)
 */
export const REFERENCE_SETTINGS: Record<string, unknown> = {
  // Campaigns that breach the cashback floor are rejected (Finance can switch to "adjust").
  "finance.floorMode": "reject",
  // Astrologers whose payouts Finance has paused: none to begin with.
  "payout.paused": {},
  // Observer seats on the Live monitoring page (real leases are counted against it).
  "monitoring.observerCapacity": 25,
  // Categories an astrologer picks from when going live (client).
  "live.categories": ["Marriage", "Career", "Finance", "Health", "Spirituality", "Tarot", "Numerology", "Business", "Education", "Vastu"],
};
