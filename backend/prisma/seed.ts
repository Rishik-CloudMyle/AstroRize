// Loads the prototype's demo data into the database. Safe to re-run: it empties every
// table first. Run with `npm run db:seed` (or `npm run db:reset` to rebuild from scratch).
//
// ⚠ Demo data and demo passwords only. Never run this against the production database.

import { db } from "../src/db.ts";
import { hashPassword } from "../src/lib/password.ts";
import { GST_RATE } from "../src/lib/billing.ts";
import { istDateKey } from "../src/lib/format.ts";

// Demo builds only: one easy password for every seeded account. The seed refuses to run in
// production, and real accounts must meet the sign-up password rules.
const DEMO_PASSWORD = "123456";
const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60000);
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => minutesAgo(d * 1440);

/** Half-month payout cycles (1–15, 16–end, IST), the running one first: "PB-2026-10-A". */
function payoutCycles(at: Date, count: number) {
  const [y0, m0, d0] = istDateKey(at).split("-").map(Number) as [number, number, number];
  let y = y0;
  let m = m0 - 1;
  let first = d0 <= 15;
  const out: { id: string; label: string; from: Date; to: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const mm = String(m + 1).padStart(2, "0");
    const from = new Date(`${y}-${mm}-${first ? "01" : "16"}T00:00:00+05:30`);
    const to = new Date(`${y}-${mm}-${first ? "15" : String(last)}T23:59:59+05:30`);
    const mon = from.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Kolkata" });
    const half = first ? "A" : "B";
    out.push({ id: `PB-${y}-${mm}-${half}`, label: `Cycle ${y}-${mm}-${half} · ${first ? 1 : 16}–${first ? 15 : last} ${mon.slice(0, 3)}`, from, to });
    if (first) {
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
    }
    first = !first;
  }
  return out;
}
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
      firstName: "Sneha",
      lastName: "R",
      gender: "Woman",
      birthDate: new Date("1994-05-14T00:00:00Z"),
      birthTime: "06:42",
      birthPlace: "Kothrud, Pune",
      city: "Pune",
      state: "Maharashtra",
      photoUrl: "/assets/avatars/user-sneha.jpg",
      // The balance is exactly what the ledger below adds up to (Finance checks wallets against it).
      wallet: { create: { service: 2389, promo: 40, promoExpiresAt: ist("2027-09-20", "23:59") } },
    },
  });
  // Recharges are real payments; promotional credit is spent before service balance.
  const recharges = [
    { ref: "PAY-76410", amount: 1000, bonus: 100, at: ist("2026-08-01", "11:00") },
    { ref: "PAY-77120", amount: 2000, bonus: 250, at: ist("2026-08-10", "11:00") },
    { ref: "PAY-80932", amount: 500, bonus: 40, at: ist("2026-09-20", "19:30") },
  ];
  await db.payment.createMany({
    data: recharges.map((r) => {
      const gst = Math.round(r.amount * GST_RATE);
      return { userId: customer.id, amount: r.amount, gst, bonus: r.bonus, total: r.amount + gst, status: "PAID", provider: "mock", providerOrderId: r.ref, createdAt: r.at, paidAt: r.at };
    }),
  });
  await db.transaction.createMany({
    data: [
      ...recharges.flatMap((r, i) => [
        { userId: customer.id, type: "Recharge", ref: r.ref, bucket: "Service", amount: r.amount, createdAt: r.at },
        { userId: customer.id, type: "Cashback", ref: `CB-${r.ref.slice(4)}`, bucket: "Promotional", amount: r.bonus, createdAt: new Date(r.at.getTime() + 60000 + i) },
      ]),
      { userId: customer.id, type: "Gift sent", ref: "GFT-2201", bucket: "Promo ₹100 + Service ₹401", amount: -501, createdAt: ist("2026-08-04", "18:20") },
      { userId: customer.id, type: "Consultation", ref: "SES-88214", bucket: "Promo ₹250 + Service ₹710", amount: -960, createdAt: ist("2026-08-11", "14:14") },
    ],
  });

  // More customers with full profiles (they join live queues and consult like anyone else).
  const queueCustomers: { id: string }[] = [];
  for (const c of [
    { first: "Kavya", last: "Menon", gender: "Woman", dob: "1997-11-02", tob: "21:15", pob: "Kochi", city: "Kochi", state: "Kerala", photo: "/assets/avatars/astro-kavya.jpg", phone: "9811100001" },
    { first: "Rohan", last: "Mehta", gender: "Man", dob: "1990-02-19", tob: "04:50", pob: "Ahmedabad", city: "Mumbai", state: "Maharashtra", photo: "/assets/avatars/astro-rohan.jpg", phone: "9811100002" },
    { first: "Sameer", last: "Khan", gender: "Man", dob: "1986-07-30", tob: null, pob: "Lucknow", city: "Delhi", state: "Delhi", photo: null, phone: "9811100003" },
  ]) {
    queueCustomers.push(
      await db.user.create({
        data: {
          role: "CUSTOMER",
          name: `${c.first} ${c.last}`,
          initials: c.first[0]! + c.last[0]!,
          phone: c.phone,
          firstName: c.first,
          lastName: c.last,
          gender: c.gender,
          birthDate: new Date(`${c.dob}T00:00:00Z`),
          birthTime: c.tob,
          birthPlace: c.pob,
          city: c.city,
          state: c.state,
          photoUrl: c.photo,
          wallet: { create: { service: 500, promo: 40, promoExpiresAt: daysAgo(-330) } },
        },
      }),
    );
    const paidAt = daysAgo(35);
    const orderRef = `PAY-${c.phone.slice(-5)}`;
    await db.payment.create({ data: { userId: queueCustomers.at(-1)!.id, amount: 500, gst: 90, bonus: 40, total: 590, status: "PAID", provider: "mock", providerOrderId: orderRef, createdAt: paidAt, paidAt } });
    await db.transaction.createMany({
      data: [
        { userId: queueCustomers.at(-1)!.id, type: "Recharge", ref: orderRef, bucket: "Service", amount: 500, createdAt: paidAt },
        { userId: queueCustomers.at(-1)!.id, type: "Cashback", ref: `CB-${orderRef.slice(4)}`, bucket: "Promotional", amount: 40, createdAt: new Date(paidAt.getTime() + 60000) },
      ],
    });
  }

  // Every listed astrologer has their own portal login, so each can come online and go live.
  const astrologerLogin = (name: string, initials: string, email: string, phone: string) =>
    db.user.create({ data: { role: "ASTROLOGER", name, initials, email, phone, passwordHash } });
  const raghavUser = await astrologerLogin("Pt. Raghav Joshi", "RJ", "raghav.joshi@email.com", "9876543242");
  const meeraUser = await astrologerLogin("Acharya Meera Iyer", "MI", "meera.iyer@email.com", "9876543243");
  const arjunUser = await astrologerLogin("Pandit Arjun Deshmukh", "AD", "arjun.deshmukh@email.com", "9876543244");
  const snehaUser = await astrologerLogin("Sneha Ramanathan", "SR", "sneha.ramanathan@email.com", "9876543245");
  const vikramUser = await astrologerLogin("Vikram Sethi", "VS", "vikram.sethi@email.com", "9876543246");
  const lalitaUser = await astrologerLogin("Dr. Lalita Bose", "LB", "lalita.bose@email.com", "9876543247");

  const admins = {
    super: await db.user.create({ data: { role: "ADMIN", adminRole: "SUPER", name: "Kunal Prasad", initials: "KP", actorName: "K. Prasad", email: "admin@astrorize.com", passwordHash } }),
    finance: await db.user.create({ data: { role: "ADMIN", adminRole: "FINANCE", name: "A. Verma", initials: "AV", actorName: "A. Verma", email: "finance@astrorize.com", passwordHash } }),
    support: await db.user.create({ data: { role: "ADMIN", adminRole: "SUPPORT", name: "S. Banerjee", initials: "SB", actorName: "S. Banerjee", email: "support@astrorize.com", passwordHash } }),
    compliance: await db.user.create({ data: { role: "ADMIN", adminRole: "COMPLIANCE", name: "M. Rathore", initials: "MR", actorName: "M. Rathore", email: "compliance@astrorize.com", passwordHash } }),
    marketing: await db.user.create({ data: { role: "ADMIN", adminRole: "MARKETING", name: "R. Kapoor", initials: "RK", actorName: "R. Kapoor", email: "marketing@astrorize.com", passwordHash } }),
  };
  // More people per department, so one can cover when another is away.
  await db.user.createMany({
    data: [
      { role: "ADMIN", adminRole: "FINANCE", name: "Neha Gupta", initials: "NG", actorName: "N. Gupta", email: "neha.gupta@astrorize.com", passwordHash },
      { role: "ADMIN", adminRole: "SUPPORT", name: "Priya Nair", initials: "PN", actorName: "P. Nair", email: "priya.nair@astrorize.com", passwordHash },
      { role: "ADMIN", adminRole: "SUPPORT", name: "Arun Das", initials: "AD", actorName: "A. Das", email: "arun.das@astrorize.com", passwordHash },
      { role: "ADMIN", adminRole: "SUPPORT", name: "Fatima Shaikh", initials: "FS", actorName: "F. Shaikh", email: "fatima.shaikh@astrorize.com", passwordHash, active: false },
      { role: "ADMIN", adminRole: "COMPLIANCE", name: "Vivek Rao", initials: "VR", actorName: "V. Rao", email: "vivek.rao@astrorize.com", passwordHash },
      { role: "ADMIN", adminRole: "MARKETING", name: "Isha Malhotra", initials: "IM", actorName: "I. Malhotra", email: "isha.malhotra@astrorize.com", passwordHash },
    ],
  });

  // ── Astrologers (prices identical to the public website) ──
  // Everyone starts offline: an astrologer is shown online only after they switch it on in
  // their portal, and is switched off again when the portal is closed (src/lib/presence.ts).
  const astrologers = [
    {
      id: "raghav", slug: "pt-raghav-joshi", userId: raghavUser.id, name: "Pt. Raghav Joshi", initials: "RJ", greeting: "Raghav", gender: "Male",
      recognition: "PREMIUM", presence: "OFF", skills: ["Vedic", "Face Reading"], languages: ["Hindi", "English"], years: 18, rating: 4.9, consults: 1204,
      price: 28, was: 35, eta: null, photo: "/assets/avatars/astro-raghav.jpg", ratingDistribution: [990, 168, 36, 8, 2],
      about: "Eighteen years reading career and dharma charts for working professionals. Sessions stay practical — timing, not fear.",
    },
    {
      id: "meera", slug: "acharya-meera-iyer", userId: meeraUser.id, name: "Acharya Meera Iyer", initials: "MI", greeting: "Meera", gender: "Female",
      recognition: "TRUSTED", presence: "OFF", skills: ["Nadi", "Counseling"], languages: ["Tamil", "English", "Hindi"], years: 14, rating: 4.8, consults: 860,
      price: 32, was: null, eta: "~6–12 min", photo: "/assets/avatars/astro-meera.jpg", ratingDistribution: [666, 140, 40, 10, 4],
      about: "Relationship and family charts with a calm, specific style. She names what the chart can answer and what it cannot.",
    },
    {
      id: "arjun", slug: "pandit-arjun-deshmukh", userId: arjunUser.id, name: "Pandit Arjun Deshmukh", initials: "AD", greeting: "Arjun", gender: "Male",
      recognition: "PROVEN", presence: "OFF", skills: ["KP", "Timing"], languages: ["Marathi", "Hindi", "English"], years: 9, rating: 4.7, consults: 412,
      price: 22, was: 28, eta: null, photo: "/assets/avatars/astro-arjun.jpg", ratingDistribution: [300, 80, 22, 7, 3],
      about: "KP timings for money decisions. Speaks plainly. Offers Fixed Sessions of 15, 30, 45 or 60 minutes.",
    },
    {
      id: "sneha", slug: "sneha-ramanathan", userId: snehaUser.id, name: "Sneha Ramanathan", initials: "SR", greeting: "Sneha", gender: "Female",
      recognition: "RISING", presence: "OFF", skills: ["Tarot", "Numerology"], languages: ["English", "Tamil"], years: 6, rating: 4.6, consults: 188,
      price: 18, was: 24, eta: "~3–7 min", photo: "/assets/avatars/astro-ananya.jpg", ratingDistribution: [130, 38, 12, 5, 3],
      about: "Tarot with a counselling background. Best for people who want language for a decision they have already half-made.",
    },
    {
      id: "vikram", slug: "vikram-sethi", userId: vikramUser.id, name: "Vikram Sethi", initials: "VS", greeting: "Vikram", gender: "Male",
      recognition: "FRESH", presence: "OFF", skills: ["Vastu", "Palmistry"], languages: ["Hindi", "Punjabi"], years: 4, rating: null, consults: 24,
      price: 15, was: null, eta: null, photo: "/assets/avatars/astro-vikram.jpg", ratingDistribution: [16, 5, 2, 1, 0],
      about: "New on Astrorize. Vastu walkthroughs for homes and small commercial spaces.",
    },
    {
      id: "lalita", slug: "dr-lalita-bose", userId: lalitaUser.id, name: "Dr. Lalita Bose", initials: "LB", greeting: "Lalita", gender: "Female",
      recognition: "PREMIUM", presence: "OFF", skills: ["Vedic", "Prashna"], languages: ["Bengali", "English", "Hindi"], years: 22, rating: 4.9, consults: 2140,
      price: 45, was: 60, eta: null, photo: "/assets/avatars/astro-leela.jpg", ratingDistribution: [1800, 260, 58, 16, 6],
      about: "Twenty-two years, mostly Prashna. Answers the question you actually asked, in the time you actually have.",
    },
  ] as const;
  for (const [rank, a] of astrologers.entries()) {
    await db.astrologer.create({ data: { ...a, skills: [...a.skills], languages: [...a.languages], ratingDistribution: [...a.ratingDistribution], instantMultiplier: 3, rank } });
  }
  // Astrologers who aren't live on the site yet (or any more), for the admin lifecycle list.
  // None of these appear publicly: only active, not fully suspended astrologers do.
  const offstage = [
    { id: "rohit", slug: "rohit-kamble", name: "Rohit Kamble", initials: "RK", greeting: "Rohit", gender: "Male", lifecycle: "training", suspension: "none", skills: ["Vastu"], languages: ["Marathi", "Hindi"], years: 7, price: 20, photo: "/assets/avatars/astro-rohan.jpg", about: "Vastu consultant completing platform training." },
    { id: "farida", slug: "farida-sheikh", name: "Farida Sheikh", initials: "FS", greeting: "Farida", gender: "Female", lifecycle: "docs", suspension: "none", skills: ["Tarot"], languages: ["Hindi", "Urdu", "English"], years: 5, price: 18, photo: "/assets/avatars/astro-kavya.jpg", about: "Tarot reader; identity documents awaiting verification." },
    { id: "sameer", slug: "acharya-sameer-qureshi", name: "Acharya Sameer Qureshi", initials: "SQ", greeting: "Sameer", gender: "Male", lifecycle: "active", suspension: "full", skills: ["Vedic"], languages: ["Urdu", "Hindi", "English"], years: 21, price: 40, photo: "/assets/avatars/astro-sameer.jpg", about: "Suspended pending a compliance review." },
  ];
  for (const [i, a] of offstage.entries()) {
    await db.astrologer.create({
      data: { ...a, recognition: "FRESH", presence: "OFF", rating: null, consults: a.id === "sameer" ? 640 : 0, was: null, eta: null, ratingDistribution: [0, 0, 0, 0, 0], instantMultiplier: 3, rank: 100 + i },
    });
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
  // One room per astrologer, none of them live: a room opens to customers only when its
  // astrologer presses "Go live" in the portal. The topic is the last one used (the portal
  // pre-fills it) and the poll is ready to launch, with no votes. No chat, queue or viewers.
  const rooms = [
    { id: "raghav", topic: "Saturn transit Q&A", thumb: "/assets/gallery/gallery-live.jpg", eta: "~6–12 min", pollQuestion: "Which house should I read next?", pollOptions: ["7th house — relationships", "10th house — career", "2nd house — money"] },
    { id: "meera", topic: "Marriage timing, gently", thumb: "/assets/gallery/gallery-courtyard.jpg", eta: "~6–12 min", pollQuestion: "What should we look at next?", pollOptions: ["Marriage timing", "Family harmony", "Children"] },
    { id: "arjun", topic: "KP timing clinic", thumb: "/assets/gallery/gallery-desk.jpg", eta: "~4–9 min", pollQuestion: "Which decision should we time next?", pollOptions: ["Job change", "Business launch", "Loan / investment"] },
    { id: "sneha", topic: "Tarot: career crossroads", thumb: "/assets/spotlight/spotlight-live.jpg", eta: "~3–7 min", pollQuestion: "Which spread should I pull next?", pollOptions: ["Past · present · future", "Career crossroads", "Yes / no card"] },
    { id: "vikram", topic: "Vastu for small homes", thumb: "/assets/gallery/gallery-palm.jpg", eta: "~5–10 min", pollQuestion: "Which room should we walk through next?", pollOptions: ["Kitchen", "Bedroom", "Entrance"] },
    { id: "lalita", topic: "Prashna hour", thumb: "/assets/gallery/gallery-study.jpg", eta: "~10–18 min", pollQuestion: "What should the next Prashna be about?", pollOptions: ["Health of a parent", "Property purchase", "Travel abroad"] },
  ];
  for (const [rank, r] of rooms.entries()) {
    await db.liveRoom.create({
      data: { ...r, astrologerId: r.id, rank, isLive: false, viewers: 0, state: "normal", pollCounts: r.pollOptions.map(() => 0), startedAt: daysAgo(1 + rank) },
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
  const slots: { date: Date; start: string; end: string; state: string; detail?: string; customerId?: string }[] = [
    { date: dayKey(0), start: "10:00", end: "11:00", state: "OPEN" },
    { date: dayKey(0), start: "14:00", end: "14:30", state: "BOOKED", detail: "Fixed Session · 30 min", customerId: queueCustomers[1]!.id },
    { date: dayKey(0), start: "18:00", end: "19:00", state: "OPEN" },
  ];
  if (todayDow !== 0) slots.push({ date: dayKey(-todayDow), start: "10:00", end: "11:00", state: "OPEN" });
  if (todayDow !== 4) slots.push({ date: dayKey(4 - todayDow), start: "16:00", end: "17:00", state: "CANCELLED" });
  await db.availabilitySlot.createMany({ data: slots.map((s) => ({ astrologerId: "raghav", ...s })) });

  // No requests waiting and no session in progress: Raghav is offline until he comes online,
  // and customers can only ask an astrologer who is online.

  // Conversations with real customer accounts, so the astrologer sees who they're talking to.
  const threads: [{ id: string }, [string, string, boolean?][]][] = [
    [customer, [
      ["CUSTOMER", "Namaste. When is a good muhurat for registering property?"],
      ["ASTROLOGER", "Let us look at your chart properly. Book a 15-minute voice consult and I will give you two windows."],
      ["CUSTOMER", "Sure. Can I call you on 98765 •••••"],
      ["SYSTEM", "Contact details cannot be shared through Astrorize. Keep the conversation on the platform so both of you stay protected.", true],
    ]],
    [queueCustomers[0]!, [["CUSTOMER", "thank you 🙏"]]],
    [queueCustomers[1]!, [["CUSTOMER", "can we move the fixed session?"]]],
    [queueCustomers[2]!, [["CUSTOMER", "about the reading last week"]]],
  ];
  for (const [i, [who, messages]] of threads.entries()) {
    await db.messageThread.create({
      data: {
        astrologerId: "raghav",
        customerId: who.id,
        customerAlias: `C-${1000 + i}`,
        updatedAt: minutesAgo(10 + i * 30),
        messages: { create: messages.map(([sender, text, blocked], j) => ({ sender, text, blocked: !!blocked, createdAt: minutesAgo(10 + i * 30 + (messages.length - j)) })) },
      },
    });
  }


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
    ["live.room.max_concurrent_per_astrologer", false, "Live rooms one astrologer may host at the same time.", "1", "global", "1–3", "No astrologer currently requests more than one. Raising this needs a provider capacity review.", "live"],
    ["marketing.gift.max_value", true, "Ceiling on a single gift in the catalogue. Anything above needs Admin approval before it goes ACTIVE.", "5100", "global", "100–10000", "Lowering it sends catalogue gifts above the new ceiling back for Admin approval.", "marketing"],
    ["marketing.campaign.max_discount_pct", false, "Largest discount a campaign may advertise before the cashback floor clamps it.", "40", "segment", "0–70", "Raising it allows bigger advertised discounts; the cashback floor still limits the effective price.", "marketing"],
    ["hr.application.review_sla_days", false, "Days an application may sit in review before it is flagged past SLA on the queue.", "5", "global", "1–21", "Lowering it flags applications as past SLA sooner on the lifecycle queue.", "hr"],
    ["hr.pricing.max_increase_pct", true, "Largest per-minute price increase an astrologer may request in a single price version.", "25", "global", "0–50", "Lowering it sends more astrologer price-increase requests for a manual override.", "hr"],
    ["rbac.session.step_up_validity_mins", true, "How long a step-up MFA verification stays valid before the next privileged action re-prompts.", "15", "global", "1–60", "Raising it means fewer MFA re-prompts but a longer window in which a privileged action needs no new check.", "rbac"],
  ];
  for (const [rank, [key, flagged, description, value, scope, bounds, dryRun, domain]] of configKeys.entries()) {
    await db.configKey.create({ data: { key, flagged, description, value, scope, bounds, dryRun, domain, rank, version: key === "wallet.cashback.floor_pct" ? 14 : 1, updatedAt: ist("2026-08-02") } });
  }
  await db.configChange.createMany({
    data: [
      { key: "wallet.cashback.floor_pct", fromValue: "—", toValue: "96", status: "APPROVED", version: 11, draftedByName: "System migration", approvedByName: "—", createdAt: ist("2026-01-01") },
      { key: "wallet.cashback.floor_pct", fromValue: "96", toValue: "96", status: "APPROVED", version: 12, draftedByName: "K. Prasad", approvedByName: "A. Verma", createdAt: ist("2026-04-05") },
      { key: "wallet.cashback.floor_pct", fromValue: "96", toValue: "88", status: "APPROVED", version: 13, draftedByName: "A. Verma", approvedByName: "K. Prasad", createdAt: ist("2026-06-14") },
      { key: "wallet.cashback.floor_pct", fromValue: "88", toValue: "80", status: "APPROVED", version: 14, draftedById: admins.super.id, draftedByName: "K. Prasad", approvedById: admins.finance.id, approvedByName: "A. Verma", createdAt: ist("2026-08-02") },
      { key: "consult.emergency.max_multiplier", fromValue: "4.0", toValue: "3.0", status: "SUBMITTED", draftedById: admins.super.id, draftedByName: "K. Prasad", effectiveAt: new Date(now + 3 * 86400000), createdAt: hoursAgo(4) },
    ],
  });


  // The session every seeded ticket is about: Sneha's 10-minute Instant Call with Acharya Meera Iyer
  // (₹32 × 3 = ₹96/min). It matches her ledger line, so an approved refund really returns ₹960.
  await db.consultation.create({
    data: {
      ref: "SES-88214",
      customerId: customer.id,
      customerAlias: "Sneha R",
      astrologerId: "meera",
      mode: "VOICE",
      kind: "INSTANT",
      source: "WEB",
      rate: 96,
      status: "ENDED",
      heldAmount: 2849,
      requestedAt: ist("2026-08-11", "14:01:40"),
      offeredAt: ist("2026-08-11", "14:01:40"),
      connectedAt: ist("2026-08-11", "14:02:11"),
      endedAt: ist("2026-08-11", "14:13:11"),
      endReason: "user",
      billedSeconds: 600,
      billedMinutes: 10,
      total: 960,
      promoUsed: 250,
      serviceUsed: 710,
    },
  });
  await db.earningsLine.create({
    data: { astrologerId: "meera", date: ist("2026-08-11", "14:13:11"), sessionRef: "SES-88214", kind: "emergency", mode: "Emergency voice", minutes: 10 },
  });
  await db.supportTicket.createMany({
    data: [
      { id: "TKT-3391", subject: "Charged for a call that never connected", state: "EVIDENCE_REQUESTED", slaDueAt: hoursAgo(-2), customerAlias: "Sneha R", sessionRef: "SES-88214", createdAt: hoursAgo(20) },
      { id: "TKT-3388", subject: "Fixed Session ended early", state: "INVESTIGATING", slaDueAt: hoursAgo(-26), customerAlias: "Sneha R", sessionRef: "SES-88214", createdAt: daysAgo(1) },
      { id: "TKT-3384", subject: "Charged twice for the same session", state: "REFUND_PROPOSED", refundState: "PROPOSED", refundAmount: 960, proposedBy: "S. Banerjee", slaDueAt: hoursAgo(-74), customerAlias: "Sneha R", sessionRef: "SES-88214", createdAt: daysAgo(2) },
      { id: "TKT-3379", subject: "Promotional credit expired early", state: "INVESTIGATING", slaDueAt: hoursAgo(-73), customerAlias: "Sneha R", sessionRef: "SES-88214", createdAt: daysAgo(3) },
      { id: "TKT-3371", subject: "Astrologer shared contact details", state: "ESCALATED", slaDueAt: daysAgo(2), customerAlias: "Sneha R", sessionRef: "SES-88214", createdAt: daysAgo(4) },
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

  // Live monitoring shows only real live rooms and consultations: no seeded monitoring targets.

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
  await db.auditLog.createMany({
    data: [
      { at: ist("2026-09-15", "09:38:12"), actorId: admins.super.id, actorName: "K. Prasad", action: "config.draft.submit", object: "consult.emergency.max_multiplier", diff: "4.0 → 3.0", correlation: "8f21c4a" },
      { at: ist("2026-09-15", "08:31:57"), actorId: admins.compliance.id, actorName: "M. Rathore", action: "review.remove", object: "REV-99120", diff: "VISIBLE → SOFT_HIDDEN", correlation: "c4412de" },
      { at: ist("2026-09-15", "07:58:20"), actorId: admins.super.id, actorName: "K. Prasad", action: "staff.create", object: "staff:priya.nair@astrorize.com", diff: "— → Support · Active", correlation: "5512fab" },
      { at: ist("2026-09-14", "22:14:09"), actorName: "System", action: "price.version.create", object: "PV-00417", diff: "— → ₹90/min voice", correlation: "88214cc" },
      { at: ist("2026-09-14", "19:02:31"), actorId: admins.compliance.id, actorName: "M. Rathore", action: "astrologer.suspend", object: "AST-1188", diff: "ACTIVE → PARTIAL", correlation: "22140bb" },
    ],
  });

  // Snapshots the console shows until live analytics and accounting feeds are connected.
  const settings: Record<string, unknown> = {
    "finance.floorMode": "reject",
    "payout.paused": { raghav: true },
    // Observer seats on the Live monitoring page (real leases are counted against it).
    "monitoring.observerCapacity": 25,
    "trust.density": { value: 68, target: 100 },
    "trust.sampleFloor": { floor: "30 consults", below: "41 astrologers" },
    "rbac.conflict": { user: "Priya Nair", requested: "astrologer.restore", existing: "astrologer.suspend", alternative: "astrologer.restore.review" },
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

  await (await import("./seed-history.ts")).seedHistory(); // ~30 days of past activity for the admin overview

  // Payout batches from what astrologers actually earned in each closed half-month cycle (TDS 5%):
  // the last closed cycle drafted for Finance to approve, the one before approved by Finance and
  // waiting for a Super Admin to release it (approver ≠ releaser), the oldest released. The cycle
  // still running gets its batch when it closes.
  const cycles = payoutCycles(new Date(), 4).slice(1);
  for (const [i, c] of cycles.entries()) {
    const sums = await db.consultation.groupBy({
      by: ["astrologerId"],
      where: { status: "ENDED", endedAt: { gte: c.from, lte: c.to } },
      _sum: { total: true },
    });
    const gross = sums.reduce((n, r) => n + (r._sum.total ?? 0), 0);
    if (!gross) continue;
    const approvedAt = new Date(c.to.getTime() + 10.5 * 3600000); // the next morning
    const base = { id: c.id, cycle: c.label, astrologers: sums.length, gross, tds: Math.round(gross * 0.05), createdAt: new Date(c.to.getTime() + 3600000) };
    const approved = { approvedById: admins.finance.id, approvedByName: "A. Verma", approvedRole: "FINANCE" as const, approvedAt };
    await db.payoutBatch.create({
      data:
        i === 0
          ? { ...base, state: "DRAFT" }
          : i === 1
            ? { ...base, ...approved, state: "APPROVED" }
            : { ...base, ...approved, state: "RELEASED", releasedById: admins.super.id, releasedByName: "K. Prasad", releasedAt: new Date(approvedAt.getTime() + 4 * 3600000) },
    });
    if (i > 0) {
      await db.auditLog.create({ data: { at: approvedAt, actorId: admins.finance.id, actorName: "A. Verma", action: "payout.batch.approve", object: c.id, diff: "DRAFT → APPROVED", correlation: `pb${i}a` } });
    }
    if (i > 1) {
      await db.auditLog.create({ data: { at: new Date(approvedAt.getTime() + 4 * 3600000), actorId: admins.super.id, actorName: "K. Prasad", action: "payout.batch.release", object: c.id, diff: "APPROVED → RELEASED", correlation: `pb${i}r` } });
    }
  }
  console.log("Seeded demo data. Demo password for every account:", DEMO_PASSWORD);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
