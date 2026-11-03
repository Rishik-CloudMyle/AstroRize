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
  ["consult.join_timeout_seconds", true, "Seconds both sides have, once a consultation connects, to really join (voice/video: publishing and hearing each other; chat: both windows open). Billing starts only when both have joined; if they haven't in time, the session ends by itself at ₹0 and a free call is given back.", "90", "global", "30–600", "Lowering it ends more sessions where one side is slow to join; raising it keeps the astrologer waiting longer for a customer who never joins.", "consult"],
  ["live.queue.max_depth", false, "Maximum number of viewers who may hold a place in a live consult queue.", "20", "global", "5–50", "Raising it lets more viewers wait in a live room's queue; viewers beyond the cap can watch but not queue.", "live"],
  ["live.private.answer_seconds", false, "Seconds a customer has to join their private consultation once the astrologer accepts it from the live queue.", "60", "global", "20–300", "Longer gives customers time to come back to the tab; shorter keeps the queue moving.", "live"],
  ["live.turn_offer.timeout_s", false, "Seconds a viewer has to accept their turn before the offer expires and the queue advances.", "45", "global", "15–120", "Shortening it moves the queue faster but more viewers miss their turn.", "live"],
  ["risk.weights.session_abandon", true, "Weight applied to abandoned sessions in the astrologer risk score.", "0.35", "global", "0.0–1.0", "Changes how strongly abandoned sessions raise an astrologer's risk score. Requires dual control.", "compliance"],
  ["wallet.promo.validity_months", false, "How long promotional credit remains spendable before it expires.", "12", "global", "1–36", "Applies to promotional credit given after the change; existing credit keeps its expiry date.", "finance"],
  ["payout.batch.min_approvers", true, "Number of distinct approvers required before a payout batch can be released. Approver and releaser must differ.", "2", "global", "1–4", "Dropping to 1 removes the second signature on payout batches. Approver and releaser must still differ.", "finance"],
  ["payout.hold_days.new_astrologer", false, "Days a newly onboarded astrologer's earnings are held before entering a payout batch.", "14", "global", "0–45", "Cutting it pays newly onboarded astrologers sooner; their earnings join an earlier payout batch.", "finance"],
  ["earnings.share_pct.new", true, "Percent of what customers pay (consultations and gifts) a new astrologer keeps, for their first earnings.new_period_days days after activation. AstroRize keeps the rest.", "50", "global", "0–100", "Applies to earnings written after the change; past statement lines keep the share they were written with.", "finance"],
  ["earnings.share_pct.standard", true, "Percent of what customers pay (consultations and gifts) an astrologer keeps once they are past the new-astrologer period. AstroRize keeps the rest.", "70", "global", "0–100", "Applies to earnings written after the change; past statement lines keep the share they were written with.", "finance"],
  ["earnings.new_period_days", false, "Days after activation an astrologer keeps the new-astrologer share before moving to the standard share.", "90", "global", "0–365", "Lengthening it keeps astrologers on the new-astrologer share for longer; past lines are unchanged.", "finance"],
  ["payout.free_calls.weekly", false, "Free-call compensation (AstroRize pays the astrologer for complimentary minutes) is paid per calendar month (0) or per Monday–Sunday week (1), in its own payout batch.", "0", "global", "0–1", "Switching changes the next cycle to prepare; compensation not yet batched joins the first batch of the new cycle.", "finance"],
  ["payout.tds_pct", false, "TDS withheld, in percent, on what each astrologer is owed in a payout batch (earnings and free-call compensation).", "5", "global", "0–30", "Applies to batches prepared after the change; prepared batches keep their TDS.", "finance"],
  ["support.sla.first_response_mins", false, "Minutes a ticket may wait for its first human response before it is flagged as an SLA breach.", "30", "segment", "5–240", "Lowering it flags tickets as breached sooner on the Support queue.", "support"],
  ["support.refund.auto_approve_ceiling", true, "Refund value an agent may approve without a second reviewer.", "500", "global", "0–5000", "Raising it lets more refunds clear without a second reviewer.", "support"],
  ["support.makegood.max_minutes", false, "Longest free replacement call (minutes) Support may offer on a complaint instead of a refund, with the same astrologer. The astrologer is not paid for these minutes.", "15", "global", "1–60", "Raising it lets Support offer longer free replacement calls, which astrologers give unpaid.", "support"],
  ["support.makegood.valid_days", false, "Days a customer has to use a free replacement call once it is approved; unused ones expire after that.", "14", "global", "1–90", "Applies to replacement calls approved after the change; ones already offered keep their expiry date.", "support"],
  ["trust.review.removal_undo_mins", false, "Window in which a soft-hidden review can be restored before removal becomes permanent.", "30", "global", "5–120", "Lengthening it gives moderators longer to restore a soft-hidden review before removal is permanent.", "trust"],
  ["trust.rating.min_consults_to_publish", false, "Verified consultations an astrologer needs before a public rating is shown on the profile.", "25", "global", "5–200", "Lowering it shows ratings on profiles with fewer consultations, which are less reliable.", "trust"],
  ["trust.recommendation.min_consultations", false, "Completed consultations the platform needs before the recommendation engine may be switched on (its density gate).", "1000", "global", "100–100000", "Lowering it lets recommendations start on less data, which makes them less reliable.", "trust"],
  ["live.room.max_concurrent_per_astrologer", false, "Live rooms one astrologer may host at the same time.", "1", "global", "1–3", "No astrologer currently requests more than one. Raising this needs a provider capacity review.", "live"],
  ["marketing.gift.max_value", true, "Ceiling on a single gift in the catalogue. Anything above needs Admin approval before it goes ACTIVE.", "5100", "global", "100–10000", "Lowering it sends catalogue gifts above the new ceiling back for Admin approval.", "marketing"],
  ["marketing.campaign.max_discount_pct", false, "Largest discount a campaign may advertise before the cashback floor clamps it.", "40", "segment", "0–70", "Raising it allows bigger advertised discounts; the cashback floor still limits the effective price.", "marketing"],
  ["marketing.bonus_credit.max", false, "Largest flat promotional credit (₹) a Bonus credit campaign may give each customer who claims it.", "200", "global", "0–2000", "Raising it allows bigger bonus credits; campaigns already live keep their amount.", "marketing"],
  ["hr.application.review_sla_days", false, "Days an application may sit in review before it is flagged past SLA on the queue.", "5", "global", "1–21", "Lowering it flags applications as past SLA sooner on the lifecycle queue.", "hr"],
  ["profile.gallery.max", false, "Photos one astrologer may show in the gallery on their public profile.", "8", "global", "0–20", "Lowering it keeps photos already uploaded but blocks new ones until an astrologer is under the new limit.", "hr"],
  ["pricing.max_increase_rupees", true, "Largest increase, in rupees per minute, an astrologer may make to their own chat/voice price in one change from the portal. Decreases are not limited.", "15", "global", "0–100", "Raising it lets astrologers raise prices faster; changes already made are unaffected.", "hr"],
  ["pricing.change_cooldown_days", false, "Days an astrologer must wait after changing their own price before they can change it again.", "7", "global", "0–90", "Shortening it lets astrologers change prices more often; customers see prices move more.", "hr"],
  ["pricing.min_rate", false, "Lowest chat/voice price (₹/min) an astrologer may set for themselves in the portal.", "5", "global", "1–100", "Raising it stops astrologers going below the new floor; existing prices stay until their next change.", "hr"],
  ["pricing.max_rate", false, "Highest chat/voice price (₹/min) an astrologer may set for themselves in the portal.", "500", "global", "10–5000", "Lowering it stops astrologers going above the new ceiling; existing prices stay until their next change.", "hr"],
  ["welcome.enabled", true, "Turns the welcome campaign on (1) or off (0): free consultations for customers with a verified mobile number.", "1", "global", "0–1", "Turning it off stops new free calls; customers keep this week's free minutes for when it is back on.", "consult"],
  ["welcome.weekly_free_minutes", true, "Free minutes each customer (verified mobile number) gets per week (Monday–Sunday, IST; resets Monday 00:00 IST). Each free call takes the whole length the customer chose, once the conversation starts.", "30", "global", "0–600", "Raising it gives every customer more free minutes per week, paid for by the platform (astrologers are compensated monthly); 0 stops new free calls.", "consult"],
  ["welcome.joining_bonus_minutes", true, "One-time free minutes a new customer gets when their mobile number first joins (client: 5). Used for free calls after the week's free minutes; never resets. A number that joined before never gets it again, even on a new account.", "5", "global", "0–60", "Applies to numbers that join after the change; customers who already joined keep the bonus they got.", "consult"],
  ["welcome.free_call_length_1", true, "First free-call length the customer can choose, in minutes (0 = not offered).", "5", "global", "0–120", "Applies to calls requested after the change; calls already running keep their length.", "consult"],
  ["welcome.free_call_length_2", true, "Second free-call length the customer can choose, in minutes (0 = not offered).", "10", "global", "0–120", "Applies to calls requested after the change; calls already running keep their length.", "consult"],
  ["welcome.free_call_length_3", true, "Third free-call length the customer can choose, in minutes (0 = not offered).", "30", "global", "0–120", "Applies to calls requested after the change; calls already running keep their length.", "consult"],
  ["welcome.reminder_seconds", false, "How many seconds before the free time ends the customer is reminded to add money.", "120", "global", "30–300", "Earlier gives customers more time to recharge without the call dropping.", "consult"],
  ["welcome.daily_limit_default", false, "Free calls one astrologer takes per day (IST) unless they (or HR) set their own number. Never more than welcome.astrologer_max_per_day.", "5", "global", "0–50", "Raising it spreads fewer new customers across more astrologers' paid time.", "hr"],
  ["welcome.astrologer_max_per_day", false, "Most free calls an astrologer may offer per day (IST) when they set their capacity per day in the portal.", "10", "global", "0–100", "Lowering it caps astrologers above the new maximum straight away.", "hr"],
  ["welcome.astrologer_max_per_week", false, "Most free calls an astrologer may offer per week (Monday–Sunday, IST) when they set their capacity per week in the portal.", "50", "global", "0–500", "Lowering it caps astrologers above the new maximum straight away.", "hr"],
  ["welcome.min_meaningful_seconds", false, "A free call that drops before this many seconds through no fault of the customer gives its minutes back to the customer's weekly free minutes.", "30", "global", "10–120", "Raising it gives back more free minutes after early drops.", "consult"],
  ["welcome.max_fault_restores", false, "Most times one customer's free calls can be given back after early drops.", "2", "global", "0–5", "Raising it is kinder to customers on bad connections but easier to abuse.", "risk"],
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

/** Live-room gift catalogue (client, Nov 2026: ₹5–₹5,001). `rank` is the list position. */
export const GIFTS: { icon: string; name: string; price: number; state: string }[] = [
  { icon: "🌼", name: "Marigold", price: 5, state: "ACTIVE" },
  { icon: "🪔", name: "Diya", price: 11, state: "ACTIVE" },
  { icon: "🥥", name: "Coconut", price: 21, state: "ACTIVE" },
  { icon: "🪷", name: "Lotus", price: 51, state: "ACTIVE" },
  { icon: "🌺", name: "Flower Garland", price: 101, state: "ACTIVE" },
  { icon: "🐚", name: "Shankh", price: 301, state: "ACTIVE" },
  { icon: "🔔", name: "Divine Bell", price: 501, state: "ACTIVE" },
  { icon: "👑", name: "Honour Crown", price: 1001, state: "ACTIVE" },
  { icon: "🕉️", name: "Om Blessing", price: 2001, state: "ACTIVE" },
  { icon: "✦", name: "Eternal Gratitude", price: 5001, state: "ACTIVE" },
];

/**
 * Settings the app reads, with their starting values. (Retention and the RBAC matrix are not here:
 * their defaults live in code, and a stored value means a Super Admin chose one.)
 */
export const REFERENCE_SETTINGS: Record<string, unknown> = {
  // Campaigns that breach the cashback floor are rejected (Finance can switch to "adjust").
  "finance.floorMode": "reject",
  // Custom recharge amounts on the wallet page (client, Nov 2026): Finance can switch them off or change the range.
  "wallet.customAmount": { enabled: true, min: 50, max: 50000 },
  // Astrologers whose payouts Finance has paused: none to begin with.
  "payout.paused": {},
  // Observer seats on the Live monitoring page (real leases are counted against it).
  "monitoring.observerCapacity": 25,
  // Categories an astrologer picks from when going live (client).
  "live.categories": ["Marriage", "Career", "Finance", "Health", "Spirituality", "Tarot", "Numerology", "Business", "Education", "Vastu"],
};
