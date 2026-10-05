// Loads the prototype's demo data into the database. Safe to re-run: it empties every
// table first. Run with `npm run db:seed` (or `npm run db:reset` to rebuild from scratch).
//
// ⚠ Demo data and demo passwords only. Never run this against the production database.

import { db } from "../src/db.ts";
import { hashPassword } from "../src/lib/password.ts";
import { istDateKey } from "../src/lib/format.ts";

const DEMO_PASSWORD = "Astrorize@2026";
const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60000);
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => minutesAgo(d * 1440);
/** A fixed IST wall-clock time, e.g. ist("2026-08-11", "10:00"). */
const ist = (date: string, time = "12:00") => new Date(`${date}T${time.length === 5 ? time + ":00" : time}+05:30`);
/** Calendar date (stored as 00:00 UTC) `offset` days from today in IST. */
const dayKey = (offset: number) => {
  const d = new Date(istDateKey(new Date(now)) + "T00:00:00Z");
  return new Date(d.getTime() + offset * 86400000);
};

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  await wipe();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ── Accounts ──
  const customer = await db.user.create({
    data: {
      role: "CUSTOMER",
      name: "Sneha R",
      initials: "SR",
      phone: "9876543210",
      email: "customer@astrorize.com",
      passwordHash,
      wallet: { create: { service: 900, promo: 340, promoExpiresAt: ist("2026-09-12", "23:59") } },
    },
  });
  await db.transaction.createMany({
    data: [
      { userId: customer.id, type: "Consultation", ref: "SES-88214", bucket: "Promo ₹160 + Service ₹800", amount: -960, createdAt: ist("2026-08-11") },
      { userId: customer.id, type: "Recharge", ref: "PAY-77120", bucket: "Service", amount: 1000, createdAt: ist("2026-08-10", "11:00") },
      { userId: customer.id, type: "Cashback", ref: "CMP-14", bucket: "Promotional · exp 14 Oct", amount: 100, createdAt: ist("2026-08-10", "11:01") },
      { userId: customer.id, type: "Gift sent", ref: "GFT-2201", bucket: "Service", amount: -501, createdAt: ist("2026-08-04") },
    ],
  });

  const raghavUser = await db.user.create({
    data: { role: "ASTROLOGER", name: "Pt. Raghav Joshi", initials: "RJ", email: "raghav.joshi@email.com", phone: "9876543242", passwordHash },
  });

  const admins = {
    super: await db.user.create({ data: { role: "ADMIN", adminRole: "SUPER", name: "Kunal Prasad", initials: "KP", actorName: "K. Prasad", email: "admin@astrorize.com", passwordHash } }),
    finance: await db.user.create({ data: { role: "ADMIN", adminRole: "FINANCE", name: "A. Verma", initials: "AV", actorName: "A. Verma", email: "finance@astrorize.com", passwordHash } }),
    support: await db.user.create({ data: { role: "ADMIN", adminRole: "SUPPORT", name: "S. Banerjee", initials: "SB", actorName: "S. Banerjee", email: "support@astrorize.com", passwordHash } }),
    compliance: await db.user.create({ data: { role: "ADMIN", adminRole: "COMPLIANCE", name: "M. Rathore", initials: "MR", actorName: "M. Rathore", email: "compliance@astrorize.com", passwordHash } }),
  };

  // ── Astrologers (prices identical to the public website) ──
  const astrologers = [
    {
      id: "raghav", slug: "pt-raghav-joshi", userId: raghavUser.id, name: "Pt. Raghav Joshi", initials: "RJ", greeting: "Raghav",
      recognition: "PREMIUM", presence: "ON", skills: ["Vedic", "Face Reading"], languages: ["Hindi", "English"], years: 18, rating: 4.9, consults: 1204,
      price: 28, was: 35, eta: null, photo: "/assets/avatars/astro-raghav.jpg", ratingDistribution: [990, 168, 36, 8, 2],
      about: "Eighteen years reading career and dharma charts for working professionals. Sessions stay practical — timing, not fear.",
    },
    {
      id: "meera", slug: "acharya-meera-iyer", name: "Acharya Meera Iyer", initials: "MI", greeting: "Meera",
      recognition: "TRUSTED", presence: "BUSY", skills: ["Nadi", "Counseling"], languages: ["Tamil", "English", "Hindi"], years: 14, rating: 4.8, consults: 860,
      price: 32, was: null, eta: "~6–12 min", photo: "/assets/avatars/astro-meera.jpg", ratingDistribution: [666, 140, 40, 10, 4],
      about: "Relationship and family charts with a calm, specific style. She names what the chart can answer and what it cannot.",
    },
    {
      id: "arjun", slug: "pandit-arjun-deshmukh", name: "Pandit Arjun Deshmukh", initials: "AD", greeting: "Arjun",
      recognition: "PROVEN", presence: "ON", skills: ["KP", "Timing"], languages: ["Marathi", "Hindi", "English"], years: 9, rating: 4.7, consults: 412,
      price: 22, was: 28, eta: null, photo: "/assets/avatars/astro-arjun.jpg", ratingDistribution: [300, 80, 22, 7, 3],
      about: "KP timings for money decisions. Speaks plainly. Offers Fixed Sessions of 15, 30, 45 or 60 minutes.",
    },
    {
      id: "sneha", slug: "sneha-ramanathan", name: "Sneha Ramanathan", initials: "SR", greeting: "Sneha",
      recognition: "RISING", presence: "LIVE", skills: ["Tarot", "Numerology"], languages: ["English", "Tamil"], years: 6, rating: 4.6, consults: 188,
      price: 18, was: 24, eta: "~3–7 min", photo: "/assets/avatars/astro-ananya.jpg", ratingDistribution: [130, 38, 12, 5, 3],
      about: "Tarot with a counselling background. Best for people who want language for a decision they have already half-made.",
    },
    {
      id: "vikram", slug: "vikram-sethi", name: "Vikram Sethi", initials: "VS", greeting: "Vikram",
      recognition: "FRESH", presence: "OFF", skills: ["Vastu", "Palmistry"], languages: ["Hindi", "Punjabi"], years: 4, rating: null, consults: 24,
      price: 15, was: null, eta: null, photo: "/assets/avatars/astro-vikram.jpg", ratingDistribution: [16, 5, 2, 1, 0],
      about: "New on Astrorize. Vastu walkthroughs for homes and small commercial spaces.",
    },
    {
      id: "lalita", slug: "dr-lalita-bose", name: "Dr. Lalita Bose", initials: "LB", greeting: "Lalita",
      recognition: "PREMIUM", presence: "ON", skills: ["Vedic", "Prashna"], languages: ["Bengali", "English", "Hindi"], years: 22, rating: 4.9, consults: 2140,
      price: 45, was: 60, eta: null, photo: "/assets/avatars/astro-leela.jpg", ratingDistribution: [1800, 260, 58, 16, 6],
      about: "Twenty-two years, mostly Prashna. Answers the question you actually asked, in the time you actually have.",
    },
  ] as const;
  for (const [rank, a] of astrologers.entries()) {
    await db.astrologer.create({ data: { ...a, skills: [...a.skills], languages: [...a.languages], ratingDistribution: [...a.ratingDistribution], instantMultiplier: 3, rank } });
  }

  // ── Reviews: public ones, and the admin moderation queue ──
  const reviews: [string, string, string, number, string, Date][] = [
    ["REV-90011", "raghav", "A. Mehta", 5, "Asked about a resignation window. He gave two dates and told me what not to decide this week. No scare language.", ist("2026-08-11")],
    ["REV-90012", "raghav", "R. Shah", 5, "Clear on dasha vs transit. I came for a job offer and left with a sequence, not a slogan.", ist("2026-08-02")],
    ["REV-90013", "raghav", "S. Iyer", 4, "Useful, a little brisk. The 12 minutes were enough for one decision.", ist("2026-07-24")],
    ["REV-90021", "meera", "K. Rao", 5, "Asked about a marriage delay. She named what the chart can answer and what it cannot.", ist("2026-08-08")],
    ["REV-90022", "meera", "P. Nair", 5, "Soft voice, firm boundaries. I did not leave more anxious than I arrived.", ist("2026-07-29")],
    ["REV-90031", "arjun", "D. Kulkarni", 5, "Gave me a window for a property registration and explained why the week after was worse.", ist("2026-08-06")],
    ["REV-90032", "arjun", "M. Pawar", 4, "Straightforward. No upsell into a longer package.", ist("2026-07-21")],
    ["REV-90041", "sneha", "T. George", 5, "She asked better questions than I did. Worth the twelve minutes.", ist("2026-08-12")],
    ["REV-90061", "lalita", "N. Banerjee", 5, "Precise. She refused a question outside her scope instead of improvising.", ist("2026-08-09")],
  ];
  const names = Object.fromEntries(astrologers.map((a) => [a.id, a.name]));
  for (const [id, astrologerId, customerName, stars, text, createdAt] of reviews) {
    await db.review.create({ data: { id, astrologerId, astrologerName: names[astrologerId]!, customerName, stars, text, createdAt } });
  }
  await db.review.createMany({
    data: [
      { id: "REV-99131", astrologerId: "vikram", astrologerName: "Vikram Sethi", customerName: "Anonymous", stars: 1, text: "Told me I would definitely get the job. Nothing happened.", status: "FLAGGED", flag: "R-04 POLICY", createdAt: ist("2026-09-14") },
      { id: "REV-99127", astrologerId: "sneha", astrologerName: "Sneha Ramanathan", customerName: "Anonymous", stars: 5, text: "Best astrologer ever, contact her on her personal number.", status: "FLAGGED", flag: "R-07 UNVERIFIED", createdAt: ist("2026-09-13") },
      { id: "REV-99120", astrologerId: null, astrologerName: "Harish Menon", customerName: "Anonymous", stars: 2, text: "You clearly have no idea what you are doing.", status: "SOFT_HIDDEN", flag: "R-02 ABUSIVE", hiddenAt: minutesAgo(8), removedReason: "R-02 Abusive", moderatedBy: "S. Banerjee", createdAt: ist("2026-09-13") },
    ],
  });

  // ── Live rooms (no promo rates: consults use the astrologer's own price) ──
  const rooms = [
    {
      id: "sneha", astrologerId: "sneha", topic: "Tarot: career crossroads", viewers: 312, state: "private", thumb: "/assets/spotlight/spotlight-live.jpg", eta: "~3–7 min", waiting: 7,
      pollQuestion: "Which spread should I pull next?", pollOptions: ["Past · present · future", "Career crossroads", "Yes / no card"], pollCounts: [52, 33, 15],
      chat: [["Meghna", "the tower card scared me but this explanation helps"], ["Arvind", "watching from Kochi 👋"], ["Priya", "can you do a reading for job switch?"], ["Moderator", "Tap Consult now to start a private consultation."]],
    },
    {
      id: "raghav", astrologerId: "raghav", topic: "Saturn transit Q&A", viewers: 846, state: "normal", thumb: "/assets/gallery/gallery-live.jpg", eta: "~6–12 min", waiting: 12,
      pollQuestion: "Which house should I read next?", pollOptions: ["7th house — relationships", "10th house — career", "2nd house — money"], pollCounts: [46, 31, 23],
      chat: [["Ananya", "pranam 🙏 can you look at 7th house next"], ["Ravi", "joined from Pune, listening"], ["Deepa", "the timing point was useful, thank you"], ["Karthik", "can I book a one-to-one after this?"], ["Moderator", "Yes — tap Consult now to start a private consultation."]],
    },
    {
      id: "lalita", astrologerId: "lalita", topic: "Prashna hour", viewers: 204, state: "normal", thumb: "/assets/gallery/gallery-study.jpg", eta: "~10–18 min", waiting: 15,
      pollQuestion: "What should the next Prashna be about?", pollOptions: ["Health of a parent", "Property purchase", "Travel abroad"], pollCounts: [38, 41, 21],
      chat: [["Sourav", "namaskar didi 🙏"], ["Rina", "the clarity on timing was very helpful"], ["Moderator", "Tap Consult now to start a private consultation."]],
    },
    {
      id: "arjun", astrologerId: "arjun", topic: "KP timing clinic", viewers: 97, state: "normal", thumb: "/assets/gallery/gallery-desk.jpg", eta: "~4–9 min", waiting: 5,
      pollQuestion: "Which decision should we time next?", pollOptions: ["Job change", "Business launch", "Loan / investment"], pollCounts: [44, 35, 21],
      chat: [["Nikhil", "sub-lord explanation was excellent"], ["Swati", "joined late, is there a recording?"], ["Moderator", "Tap Consult now to start a private consultation."]],
    },
  ];
  for (const [rank, r] of rooms.entries()) {
    const { chat, waiting, ...room } = r;
    await db.liveRoom.create({ data: { ...room, rank, startedAt: r.id === "raghav" ? new Date(now - (42 * 60 + 10) * 1000) : minutesAgo(30 + rank * 7) } });
    await db.chatMessage.createMany({ data: chat.map(([author, text], i) => ({ roomId: r.id, author: author!, text: text!, createdAt: new Date(now - (chat.length - i) * 45000) })) });
    await db.liveQueueEntry.createMany({
      data: Array.from({ length: waiting }, (_, i) => ({
        roomId: r.id,
        alias: `${String.fromCharCode(65 + (i % 26))}-${1000 + ((i * 7919 + rank * 131) % 8999)}`,
        mode: i % 4 === 1 ? "PUBLIC" : "PRIVATE",
        consent: i % 4 === 1,
        createdAt: minutesAgo(30 - i),
      })),
    });
  }

  // ── Recharge amounts ──
  await db.denomination.createMany({
    data: [
      { amount: 100, bonus: 0, enabled: false },
      { amount: 200, bonus: 10 },
      { amount: 500, bonus: 40 },
      { amount: 1000, bonus: 100 },
      { amount: 2000, bonus: 250 },
      { amount: 3000, bonus: 0, enabled: false },
      { amount: 5000, bonus: 700 },
      { amount: 10000, bonus: 0 },
    ],
  });

  // ── Astrologer portal: Raghav ──
  // Today's schedule plus the rest of this week (relative to today, so the portal always has data).
  const todayDow = (dayKey(0).getUTCDay() + 6) % 7; // 0 = Monday
  const slots = [
    { date: dayKey(0), start: "10:00", end: "11:00", state: "OPEN" },
    { date: dayKey(0), start: "14:00", end: "14:30", state: "BOOKED", detail: "Fixed Session · customer C-5512" },
    { date: dayKey(0), start: "18:00", end: "19:00", state: "OPEN" },
  ];
  if (todayDow !== 0) slots.push({ date: dayKey(-todayDow), start: "10:00", end: "11:00", state: "OPEN" });
  if (todayDow !== 4) slots.push({ date: dayKey(4 - todayDow), start: "16:00", end: "17:00", state: "CANCELLED" });
  await db.availabilitySlot.createMany({ data: slots.map((s) => ({ astrologerId: "raghav", ...s })) });

  // Waiting requests and the session in progress.
  await db.consultation.createMany({
    data: [
      { ref: "SES-90001", astrologerId: "raghav", customerAlias: "A-8821", mode: "VOICE", rate: 28, status: "REQUESTED", requestedAt: minutesAgo(6), offeredAt: new Date(now - 19000) },
      { ref: "SES-90002", astrologerId: "raghav", customerAlias: "C-5512", mode: "VIDEO", rate: 40, status: "REQUESTED", requestedAt: minutesAgo(5) },
      { ref: "SES-90003", astrologerId: "raghav", customerAlias: "D-7703", mode: "CHAT", rate: 28, status: "REQUESTED", requestedAt: minutesAgo(3) },
      { ref: "SES-90004", astrologerId: "raghav", customerAlias: "E-4410", mode: "CHAT", rate: 28, status: "REQUESTED", requestedAt: minutesAgo(1) },
      { ref: "SES-90000", astrologerId: "raghav", customerAlias: "B-1290", mode: "CHAT", rate: 28, status: "ACTIVE", requestedAt: minutesAgo(15), connectedAt: new Date(now - (4 * 60 + 2) * 1000), heldAmount: 28 * 6 },
    ],
  });

  const threads: [string, [string, string, boolean?][]][] = [
    ["A-8821", [
      ["CUSTOMER", "Namaste. When is a good muhurat for registering property?"],
      ["ASTROLOGER", "Let us look at your chart properly. Book a 15-minute voice consult and I will give you two windows."],
      ["CUSTOMER", "Sure. Can I call you on 98765 •••••"],
      ["SYSTEM", "Contact details cannot be shared through Astrorize. Keep the conversation on the platform so both of you stay protected.", true],
    ]],
    ["B-1290", [["CUSTOMER", "thank you 🙏"]]],
    ["C-5512", [["CUSTOMER", "can we move the fixed session?"]]],
    ["D-7703", [["CUSTOMER", "about the reading last week"]]],
  ];
  for (const [i, [alias, messages]] of threads.entries()) {
    await db.messageThread.create({
      data: {
        astrologerId: "raghav",
        customerAlias: alias,
        updatedAt: minutesAgo(10 + i * 30),
        messages: { create: messages.map(([sender, text, blocked], j) => ({ sender, text, blocked: !!blocked, createdAt: minutesAgo(10 + i * 30 + (messages.length - j)) })) },
      },
    });
  }

  // Earnings statement: today, recent days and earlier in the period.
  const lines: [number, string, string, string, number, number][] = [
    [0, "SES-88301", "voice", "Voice", 22, 0],
    [0, "SES-88296", "chat", "Chat", 31, 111],
    [0, "SES-88290", "emergency", "Emergency voice", 9, 0],
    [0, "SES-88281", "voice", "Voice", 18, 501],
    [0, "SES-88276", "emergency", "Emergency voice", 6, 0],
    [0, "SES-88270", "video", "Video", 14, 0],
    [0, "SES-88262", "chat", "Chat", 12, 0],
    [1, "SES-88214", "voice", "Voice", 12, 0],
    [1, "SES-88190", "chat", "Chat", 25, 501],
    [2, "SES-88044", "emergency", "Emergency voice", 8, 0],
    [3, "SES-87766", "welcome", "Welcome minutes", 5, 0],
    [4, "ADJ-00412", "adjustment", "Dispute adjustment · TKT-3391", 0, 0],
    [5, "SES-87510", "video", "Video", 31, 111],
    [6, "SES-87402", "voice", "Voice", 40, 0],
    [7, "SES-87344", "chat", "Chat", 28, 51],
    [8, "SES-87201", "voice", "Voice", 35, 0],
    [9, "SES-87166", "video", "Video", 22, 0],
    [12, "SES-86900", "voice", "Voice", 30, 0],
    [16, "SES-86512", "chat", "Chat", 26, 101],
    [20, "SES-86140", "voice", "Voice", 44, 0],
  ];
  await db.earningsLine.createMany({
    data: lines.map(([d, sessionRef, kind, mode, minutes, gifts]) => ({ astrologerId: "raghav", date: new Date(now - d * 86400000 - 3600000), sessionRef, kind, mode, minutes, gifts })),
  });

  await db.trainingModule.createMany({
    data: [
      { astrologerId: "raghav", label: "Customer safety", done: false, dueAt: new Date(now + 3 * 86400000), rank: 0 },
      { astrologerId: "raghav", label: "Platform conduct", done: true, rank: 1 },
      { astrologerId: "raghav", label: "Trust & reviews policy", done: true, rank: 2 },
    ],
  });
  await db.profileSubmission.createMany({
    data: [
      { astrologerId: "raghav", bio: astrologers[0].about, skills: ["Vedic", "Face Reading", "Prashna"], createdAt: daysAgo(2) },
      { astrologerId: "raghav", bio: astrologers[0].about, skills: ["Vedic", "Face Reading", "Prashna"], createdAt: daysAgo(1) },
    ],
  });
  await db.complianceNotice.create({
    data: {
      id: "CMP-2214",
      astrologerId: "raghav",
      category: "Customer safety",
      summary:
        "Two customers reported that the session ended before the topic was addressed. We are asking for your account of both sessions and any supporting notes. This is a request for context, not a finding.",
      issuedAt: daysAgo(4),
      respondBy: new Date(now + (4 * 24 + 6) * 3600000),
    },
  });
  await db.applicationDraft.create({ data: { astrologerId: "raghav", currentStep: 10, values: {}, savedAt: minutesAgo(3) } });

  // ── Admin console ──
  const configKeys: [string, boolean, string, string, string, string, string, string][] = [
    ["wallet.cashback.floor_pct", false, "Minimum share of the original price that must remain payable after any discount. Campaigns that breach it are rejected or clamped, per the floor mode.", "80", "global", "0–100", "₹4.2 L of campaign spend would be clamped this month at 80%; at 75% the figure rises to ₹6.8 L.", "finance"],
    ["consult.emergency.max_multiplier", true, "Upper bound on the Instant Call multiplier an astrologer may set from their dashboard.", "4.0", "global", "1.0–6.0", "38 astrologers currently sit at the ceiling. Lowering to 3.0× would reprice 38 profiles at the next connect.", "consult"],
    ["consult.free_seconds", false, "Seconds at the start of every consultation that are not metered.", "60", "global", "0–180", "Raising to 90 s adds an estimated ₹1.9 L monthly cost against September volume.", "consult"],
    ["live.queue.max_depth", false, "Maximum number of viewers who may hold a place in a live consult queue.", "20", "global", "5–50", "Four rooms hit the cap yesterday. Raising to 30 would have admitted 47 more viewers.", "live"],
    ["live.turn_offer.timeout_s", false, "Seconds a viewer has to accept their turn before the offer expires and the queue advances.", "45", "global", "15–120", "Median accept time is 19 s. 6% of offers currently expire.", "live"],
    ["risk.weights.session_abandon", true, "Weight applied to abandoned sessions in the astrologer risk score.", "0.35", "global", "0.0–1.0", "Reclassifies 4 astrologers from Medium to High. Requires dual control.", "compliance"],
    ["wallet.promo.validity_months", false, "How long promotional credit remains spendable before it expires.", "12", "global", "1–36", "No lots expire within the next 60 days at the current value.", "finance"],
    ["payout.batch.min_approvers", true, "Number of distinct approvers required before a payout batch can be released. Approver and releaser must differ.", "2", "global", "1–4", "Dropping to 1 would remove the second signature on ₹18.4 L of pending batches. Finance co-approval still applies.", "finance"],
    ["payout.hold_days.new_astrologer", false, "Days a newly onboarded astrologer's earnings are held before entering a payout batch.", "14", "global", "0–45", "47 astrologers are inside the hold window today. Cutting to 7 releases ₹2.1 L in the next batch.", "finance"],
    ["support.sla.first_response_mins", false, "Minutes a ticket may wait for its first human response before it is flagged as an SLA breach.", "30", "segment", "5–240", "2 tickets breached yesterday at 30 min. At 20 min the figure would have been 9.", "support"],
    ["support.refund.auto_approve_ceiling", true, "Refund value an agent may approve without a second reviewer.", "500", "global", "0–5000", "82% of September refunds sit below ₹500. Raising to ₹1,000 would auto-clear a further 6%.", "support"],
    ["trust.review.removal_undo_mins", false, "Window in which a soft-hidden review can be restored before removal becomes permanent.", "30", "global", "5–120", "9 reviews are inside the undo window right now.", "trust"],
    ["trust.rating.min_consults_to_publish", false, "Verified consultations an astrologer needs before a public rating is shown on the profile.", "25", "global", "5–200", "Lowering to 10 would publish ratings for 34 more profiles, 6 of them below 4.0.", "trust"],
    ["live.room.max_concurrent_per_astrologer", false, "Live rooms one astrologer may host at the same time.", "1", "global", "1–3", "No astrologer currently requests more than one. Raising this needs a provider capacity review.", "live"],
    ["live.recording.retention_days", true, "Days a consultation recording is retained before scheduled deletion. Bounded by the recording capability.", "90", "country", "30–365", "Extending to 180 adds an estimated ₹68,000 a month in storage and needs a DPDP review.", "recording"],
    ["marketing.gift.max_value", true, "Ceiling on a single gift in the catalogue. Anything above needs Admin approval before it goes ACTIVE.", "5100", "global", "100–10000", "3 catalogue items sit at the ceiling. Lowering to ₹3,000 would pull them back to draft.", "marketing"],
    ["marketing.campaign.max_discount_pct", false, "Largest discount a campaign may advertise before the cashback floor clamps it.", "40", "segment", "0–70", "Two live campaigns are at 40%. The floor already clamps them to an effective 32%.", "marketing"],
    ["hr.application.review_sla_days", false, "Days an application may sit in review before it is flagged past SLA on the queue.", "5", "global", "1–21", "3 applications are past SLA today. At 7 days none would be flagged.", "hr"],
    ["hr.pricing.max_increase_pct", true, "Largest per-minute price increase an astrologer may request in a single price version.", "25", "global", "0–50", "11 pending requests exceed 25% and would need a manual override at the current value.", "hr"],
    ["rbac.session.step_up_validity_mins", true, "How long a step-up MFA verification stays valid before the next privileged action re-prompts.", "15", "global", "1–60", "Raising to 30 cuts re-prompts by about 40% and widens the window on privileged actions.", "rbac"],
  ];
  for (const [rank, [key, flagged, description, value, scope, bounds, dryRun, domain]] of configKeys.entries()) {
    await db.configKey.create({ data: { key, flagged, description, value, scope, bounds, dryRun, domain, rank, version: key === "wallet.cashback.floor_pct" ? 14 : 1, updatedAt: ist("2026-08-02") } });
  }
  await db.configChange.createMany({
    data: [
      { key: "wallet.cashback.floor_pct", fromValue: "—", toValue: "96", status: "APPROVED", version: 11, draftedByName: "System migration", approvedByName: "—", createdAt: ist("2026-01-01") },
      { key: "wallet.cashback.floor_pct", fromValue: "96", toValue: "96", status: "APPROVED", version: 12, draftedByName: "K. Prasad", approvedByName: "S. Banerjee", createdAt: ist("2026-04-05") },
      { key: "wallet.cashback.floor_pct", fromValue: "96", toValue: "88", status: "APPROVED", version: 13, draftedByName: "A. Verma", approvedByName: "K. Prasad", createdAt: ist("2026-06-14") },
      { key: "wallet.cashback.floor_pct", fromValue: "88", toValue: "80", status: "APPROVED", version: 14, draftedById: admins.super.id, draftedByName: "K. Prasad", approvedById: admins.finance.id, approvedByName: "A. Verma", createdAt: ist("2026-08-02") },
      { key: "consult.emergency.max_multiplier", fromValue: "4.0", toValue: "3.0", status: "SUBMITTED", draftedById: admins.super.id, draftedByName: "K. Prasad", effectiveAt: new Date(now + 3 * 86400000), createdAt: hoursAgo(4) },
    ],
  });

  await db.payoutBatch.createMany({
    data: [
      { id: "PB-2026-09-B", cycle: "Cycle 2026-09-B · closes 30 Sep", astrologers: 218, gross: 1840220, tds: 92011, state: "APPROVED", approvedById: admins.super.id, approvedByName: "K. Prasad", approvedRole: "SUPER", approvedAt: hoursAgo(6), createdAt: daysAgo(1) },
      { id: "PB-2026-09-A", cycle: "Cycle 2026-09-A", astrologers: 204, gross: 1612880, tds: 80644, state: "RELEASED", createdAt: daysAgo(15) },
      { id: "PB-2026-08-B", cycle: "Cycle 2026-08-B", astrologers: 196, gross: 1544110, tds: 77206, state: "RELEASED", createdAt: daysAgo(30) },
      { id: "PB-2026-09-C", cycle: "Cycle 2026-09-B · closes 30 Sep", astrologers: 12, gross: 104400, tds: 5220, state: "DRAFT", createdAt: hoursAgo(2) },
    ],
  });

  await db.supportTicket.createMany({
    data: [
      { id: "TKT-3391", subject: "Charged for a call that never connected", state: "EVIDENCE_REQUESTED", slaDueAt: hoursAgo(-2), customerAlias: "A-8821", sessionRef: "SES-88214", createdAt: hoursAgo(20) },
      { id: "TKT-3388", subject: "Fixed Session ended early", state: "INVESTIGATING", slaDueAt: hoursAgo(-26), customerAlias: "A-8821", sessionRef: "SES-88214", createdAt: daysAgo(1) },
      { id: "TKT-3384", subject: "Duplicate recharge on 12 Sep", state: "REFUND_PROPOSED", refundState: "PROPOSED", refundAmount: 960, proposedBy: "S. Banerjee", slaDueAt: hoursAgo(-74), customerAlias: "A-8821", sessionRef: "SES-88214", createdAt: daysAgo(2) },
      { id: "TKT-3379", subject: "Promotional credit expired early", state: "INVESTIGATING", slaDueAt: hoursAgo(-73), customerAlias: "A-8821", sessionRef: "SES-88214", createdAt: daysAgo(3) },
      { id: "TKT-3371", subject: "Astrologer shared contact details", state: "ESCALATED", slaDueAt: daysAgo(2), customerAlias: "A-8821", sessionRef: "SES-88214", createdAt: daysAgo(4) },
    ],
  });

  await db.applicant.createMany({
    data: [
      {
        id: "APP-2214", name: "Sunita Deshpande", skill: "Nadi", state: "Negotiation", submittedAt: daysAgo(7),
        negotiation: { round: 2, maxRounds: 3, rows: [{ mode: "Voice", requested: 100, proposed: 90 }, { mode: "Chat", requested: 80, proposed: 72 }, { mode: "Video", requested: 150, proposed: 135 }] },
      },
      { id: "APP-2209", name: "Harish Menon", skill: "KP", state: "Under review", submittedAt: daysAgo(6) },
      { id: "APP-2203", name: "Farida Sheikh", skill: "Tarot", state: "Docs pending", submittedAt: daysAgo(6) },
      { id: "APP-2198", name: "Neeraj Bhatt", skill: "Vedic", state: "Interview", submittedAt: daysAgo(3) },
      { id: "APP-2191", name: "Anjali Pillai", skill: "Numerology", state: "Pricing", submittedAt: daysAgo(2) },
      { id: "APP-2187", name: "Rohit Kamble", skill: "Vastu", state: "Training", submittedAt: daysAgo(1) },
    ],
  });

  await db.monitorTarget.createMany({
    data: [
      { id: "LIVE-8821", astroLabel: "Pt. Raghav Joshi · LIVE-8821", band: "CRITICAL", reason: "Two abuse reports in 10 minutes", startedAt: minutesAgo(4) },
      { id: "LIVE-8817", astroLabel: "Sneha Ramanathan · LIVE-8817", band: "HIGH", reason: "Outcome-guarantee language detected", startedAt: minutesAgo(12) },
      { id: "LIVE-8809", astroLabel: "Dr. Lalita Bose · LIVE-8809", band: "PROMOTED", reason: "Anti-starvation promotion — waited 48 min", startedAt: minutesAgo(48) },
      { id: "LIVE-8804", astroLabel: "Pandit Arjun Deshmukh · LIVE-8804", band: "PRIVATE", reason: "Private consultation in progress", startedAt: minutesAgo(6), denied: true },
      { id: "LIVE-8801", astroLabel: "Vikram Sethi · LIVE-8801", band: "SAMPLING", reason: "Routine sample — no signal", startedAt: minutesAgo(22) },
    ],
  });

  await db.campaign.createMany({
    data: [
      { id: "CMP-14", name: "Recharge more, get more", denoms: "₹200 – ₹5,000", cashback: "5–14%", state: "ACTIVE", rank: 0 },
      { id: "CMP-15", name: "Navratri welcome boost", denoms: "₹500 – ₹2,000", cashback: "12%", state: "UNDER_REVIEW", rank: 1 },
      { id: "CMP-16", name: "First recharge ×2", denoms: "₹100 – ₹1,000", cashback: "20%", state: "DRAFT", rank: 2 },
      { id: "CMP-12", name: "Independence week", denoms: "₹500 – ₹5,000", cashback: "10%", state: "EXPIRED", rank: 3 },
    ],
  });
  await db.gift.createMany({
    data: [
      { icon: "🪔", name: "Lotus", price: 51, state: "ACTIVE", rank: 0 },
      { icon: "🔔", name: "Divine Bell", price: 501, state: "ACTIVE", rank: 1 },
      { icon: "👑", name: "Honor Crown", price: 1001, state: "PENDING ADMIN", rank: 2 },
      { icon: "✦", name: "Eternal Gratitude", price: 5100, state: "ACTIVE", rank: 3 },
    ],
  });
  await db.recordingModality.createMany({
    data: [
      { mode: "Chat", note: "Transcript retained with the session record", retention: "3 years", status: "enabled", rank: 0 },
      { mode: "Voice (RTC)", note: "Provider supports up to 3 years", retention: "18 months", status: "enabled", rank: 1 },
      { mode: "Video (RTC)", note: "Storage cost pending vendor confirmation", retention: "—", status: "blocked", rank: 2 },
      { mode: "PSTN", note: "Provider ceiling is 3–6 months", retention: "6 months", status: "disabled", rank: 3 },
    ],
  });

  await db.auditLog.createMany({
    data: [
      { at: ist("2026-09-15", "09:38:12"), actorId: admins.super.id, actorName: "K. Prasad", action: "config.draft.submit", object: "consult.emergency.max_multiplier", diff: "4.0 → 3.0", correlation: "8f21c4a" },
      { at: ist("2026-09-15", "09:12:44"), actorId: admins.compliance.id, actorName: "M. Rathore", action: "live.observer.break_glass", object: "LIVE-8821", diff: "— → OBSERVING", correlation: "3b90ee1", breakGlass: true },
      { at: ist("2026-09-15", "08:54:03"), actorId: admins.super.id, actorName: "K. Prasad", action: "payout.batch.approve", object: "PB-2026-09-B", diff: "DRAFT → APPROVED", correlation: "77120ab" },
      { at: ist("2026-09-15", "08:31:57"), actorId: admins.support.id, actorName: "S. Banerjee", action: "review.remove", object: "REV-99120", diff: "VISIBLE → SOFT_HIDDEN", correlation: "c4412de" },
      { at: ist("2026-09-15", "07:58:20"), actorId: admins.finance.id, actorName: "A. Verma", action: "rbac.capability.grant", object: "user:priya.nair", diff: "— → dispute.refund.propose", correlation: "5512fab" },
      { at: ist("2026-09-14", "22:14:09"), actorName: "System", action: "price.version.create", object: "PV-00417", diff: "— → ₹90/min voice", correlation: "88214cc" },
      { at: ist("2026-09-14", "19:02:31"), actorId: admins.compliance.id, actorName: "M. Rathore", action: "astrologer.suspend", object: "AST-1188", diff: "ACTIVE → PARTIAL", correlation: "22140bb" },
    ],
  });

  // Snapshots the console shows until live analytics and accounting feeds are connected.
  const settings: Record<string, unknown> = {
    "finance.floorMode": "reject",
    "finance.kpis": { grossVolume: 21400000, grossDelta: "+11% vs Aug", duplicates: 4, trialBalance: 1240, trialDate: "14 Sep" },
    "finance.trialBalance": { title: "Trial balance ≠ 0 for 14 Sep", body: "Daily journal is out by ₹1,240 across 3 entries. Finance must drill down before the next payout batch is released." },
    "payout.paused": { raghav: true },
    "support.case.SES-88214": {
      metering: [
        { label: "Billed seconds", value: "722" },
        { label: "Billed minutes", value: "12" },
        { label: "Rate at connect", value: "₹80/min" },
        { label: "Amount billed", value: "₹960" },
      ],
      evidence: [
        { rank: "PLATFORM", label: "Server metering log · connect 14:02:11, end 14:14:13", when: "auto" },
        { rank: "PLATFORM", label: "RTC session record · two reconnect attempts, no media", when: "auto" },
        { rank: "PLATFORM", label: "Wallet ledger entry · hold ₹1,240, debit ₹960", when: "auto" },
        { rank: "CUSTOMER", label: "Screenshot upload · call-log-1412.png", when: "12 Sep" },
      ],
      billed: 960,
      buckets: { service: 800, promo: 160 },
    },
    "monitoring.baseObservers": 18,
    "monitoring.risk": [
      { label: "Critical", pct: "6%", count: "14" },
      { label: "High", pct: "14%", count: "34" },
      { label: "Medium", pct: "31%", count: "76" },
      { label: "Unknown", pct: "28%", count: "68" },
      { label: "Insufficient data", pct: "21%", count: "51" },
    ],
    "trust.density": { value: 68, target: 100 },
    "trust.sampleFloor": { floor: "30 consults", below: "41 astrologers" },
    "rbac.conflict": { user: "Priya Nair", requested: "astrologer.restore", existing: "astrologer.suspend", alternative: "astrologer.restore.review" },
    "recording.checklist": { title: "Cost & capability submission incomplete", body: "Two of five vendor items outstanding. Recording toggles stay disabled until the submission is complete.", complete: false },
    "metrics.overview": {
      dau: [37877, 38146, 38660, 39430, 39595, 44657, 45392, 40652, 41136, 41838, 42013, 42639, 48233, 48407, 43330, 43883, 44420, 44607, 44966, 50705, 51458, 46387, 46563, 47248, 47489, 47830, 54529, 55367, 50029, 50208],
      stickiness: [9.2, 9.2, 9.3, 9.6, 9.5, 10.8, 10.8, 9.7, 9.8, 9.9, 9.9, 10.0, 11.3, 11.2, 10.1, 10.1, 10.3, 10.3, 10.3, 11.5, 11.8, 10.5, 10.6, 10.6, 10.7, 10.7, 12.2, 12.3, 11.1, 11.1],
      channels: [
        ["24", 2268, 1332, 459], ["25", 2339, 1234, 475], ["26", 2263, 1320, 454], ["27", 2139, 1229, 414], ["28", 2365, 1240, 394], ["29", 2324, 1283, 514], ["01", 2305, 1319, 500],
        ["02", 2221, 1195, 422], ["03", 2358, 1386, 440], ["04", 2505, 1361, 442], ["05", 2390, 1415, 420], ["06", 2504, 1253, 496], ["07", 2358, 1407, 549], ["08", 2502, 1475, 445],
      ],
      live: [
        { label: "Live sessions", value: 184, sub: "across 23 public rooms", color: "#1c1917" },
        { label: "Calls in progress", value: 96, sub: "voice 71 · video 25", color: "#2a78d6" },
        { label: "Chats in progress", value: 71, sub: "median wait 42 s", color: "#eb6834" },
        { label: "Waiting in queue", value: 38, sub: "longest hold 3 m 10 s", color: "#b45309" },
        { label: "Available now", value: 142, sub: "of 557 registered", color: "#047857" },
        { label: "Astrologers busy", value: 167, sub: "30% of the roster", color: "#be123c" },
      ],
      availability: [
        { label: "Available", count: 142, color: "#047857" },
        { label: "Busy", count: 167, color: "#be123c" },
        { label: "On a break", count: 48, color: "#b45309" },
        { label: "Offline", count: 200, color: "#a8a29e" },
      ],
      registered: 557,
    },
  };
  for (const [key, value] of Object.entries(settings)) await db.setting.create({ data: { key, value: value as object } });

  console.log("Seeded demo data. Demo password for every account:", DEMO_PASSWORD);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
