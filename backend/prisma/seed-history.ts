// Adds about 30 days of past platform activity so the admin overview's charts have something
// to show: customers who signed up over the month, their recharges (payments + wallet
// transactions) and their ended consultations with the live astrologers.
//
// Additive and safe to re-run: it only inserts rows, all marked so they can be recognised
// (ids start "his_", references start "HIS-", emails end "@history.invalid"), and it does
// nothing when that history is already there. The same random seed gives the same history
// (dated relative to the moment it runs).
//
// Run on its own:  node --env-file=.env prisma/seed-history.ts
// prisma/seed.ts also runs it at the end, so a fresh seed includes the history.
//
// What it deliberately leaves alone:
// - Astrologer.consults, ratings, reviews and prices (the public profile figures). The seeded
//   "consults" totals are lifetime numbers that already include this month, so they are not
//   incremented, and history consultations carry no star ratings.
// - Astrologer earnings statements (EarningsLine) and payout batches, which are seeded fixtures.
//
// ⚠ Demo data only. Never run this against the production database.

import { db } from "../src/db.ts";
import type { Prisma } from "../src/generated/prisma/client.ts";
import { GST_RATE, VIDEO_PREMIUM, instantRate } from "../src/lib/billing.ts";
import { istDateKey } from "../src/lib/format.ts";

const DAYS = 30;
const DAY_MS = 86400000;
const MARK = "HIS-";

/** Small deterministic random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Aarav", "Ananya", "Rohan", "Priya", "Vihaan", "Isha", "Kabir", "Diya", "Arjun", "Meera", "Aditya", "Kavya", "Siddharth", "Nisha", "Rahul", "Pooja", "Karan", "Sanya", "Varun", "Tanvi", "Nikhil", "Riya", "Manish", "Shreya", "Deepak", "Aisha", "Harsh", "Neha", "Gaurav", "Simran", "Yash", "Divya", "Amit", "Swati", "Rakesh", "Lakshmi", "Suresh", "Bhavna", "Vikas", "Anjali"];
const LAST = ["Sharma", "Iyer", "Patel", "Reddy", "Nair", "Gupta", "Menon", "Joshi", "Rao", "Singh", "Kulkarni", "Das", "Bose", "Mehta", "Pillai", "Chopra", "Banerjee", "Kapoor", "Verma", "Shetty"];
const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Lucknow", "Kochi", "Indore"];

/** Share of a day's consultations in each IST hour: quiet nights, a morning bump, busy evenings. */
const HOUR_WEIGHTS = [2, 1, 0.6, 0.4, 0.4, 0.6, 1.2, 2.4, 3.6, 4, 3.6, 3.2, 3.4, 3.2, 3, 3.2, 3.6, 4.4, 5.6, 7, 8, 8, 6.4, 4];
const HOUR_TOTAL = HOUR_WEIGHTS.reduce((s, w) => s + w, 0);

function pickWeighted<T>(rand: () => number, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1]!;
}

/** IST midnight starting the IST day of `d`. */
const istMidnight = (d: Date) => new Date(`${istDateKey(d)}T00:00:00+05:30`);

export async function seedHistory(): Promise<void> {
  const already = await db.consultation.count({ where: { ref: { startsWith: MARK } } });
  if (already > 0) {
    console.log(`History already present (${already} consultations) — nothing added.`);
    return;
  }

  const rand = rng(20261008);
  const now = new Date();
  const today = istMidnight(now);
  const firstDay = new Date(today.getTime() - (DAYS - 1) * DAY_MS);

  // Astrologers the directory lists; busier ones (more lifetime consults) get more of the month.
  const astrologers = await db.astrologer.findMany({
    where: { lifecycle: "active", suspension: "none" },
    select: { id: true, price: true, instantMultiplier: true, consults: true },
  });
  if (!astrologers.length) {
    console.log("No live astrologers — no history added.");
    return;
  }
  const denominations = (await db.denomination.findMany({ where: { enabled: true }, orderBy: { amount: "asc" } })).filter(
    (d) => d.amount <= 2000,
  );
  if (!denominations.length) {
    console.log("No recharge amounts enabled — no history added.");
    return;
  }

  // ── Customers: some from before the window, the rest signing up across it (more at weekends, growing) ──
  interface Cust {
    id: string;
    createdAt: Date;
    service: number;
    promo: number;
  }
  const customers: Cust[] = [];
  const users: { id: string; name: string; initials: string; firstName: string; lastName: string; email: string; city: string; createdAt: Date }[] = [];
  const addCustomer = (createdAt: Date) => {
    const n = customers.length + 1;
    const first = FIRST[Math.floor(rand() * FIRST.length)]!;
    const last = LAST[Math.floor(rand() * LAST.length)]!;
    const id = `his_c${String(n).padStart(4, "0")}`;
    customers.push({ id, createdAt, service: 0, promo: 0 });
    users.push({
      id,
      name: `${first} ${last}`,
      initials: `${first[0]}${last[0]}`,
      firstName: first,
      lastName: last,
      email: `customer${String(n).padStart(4, "0")}@history.invalid`,
      city: CITIES[Math.floor(rand() * CITIES.length)]!,
      createdAt,
    });
  };
  for (let i = 0; i < 45; i++) addCustomer(new Date(firstDay.getTime() - (1 + rand() * 60) * DAY_MS));
  for (let d = 0; d < DAYS; d++) {
    const dayStart = new Date(firstDay.getTime() + d * DAY_MS);
    const weekday = new Date(dayStart.getTime() + 6 * 3600000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const expected = (2.6 + d * 0.06) * (weekend ? 1.4 : 1);
    const count = Math.max(0, Math.round(expected + (rand() - 0.5) * 3));
    for (let i = 0; i < count; i++) {
      const at = new Date(dayStart.getTime() + (7 + rand() * 16) * 3600000);
      if (at < now) addCustomer(at);
    }
  }
  customers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // ── Consultations, with a recharge just before whenever the wallet runs short ──
  const consultations: Prisma.ConsultationCreateManyInput[] = [];
  const payments: { id: string; userId: string; amount: number; gst: number; bonus: number; total: number; status: string; provider: string; providerOrderId: string; createdAt: Date; paidAt: Date }[] = [];
  const transactions: { userId: string; type: string; ref: string; bucket: string; amount: number; createdAt: Date }[] = [];
  let seq = 0;
  const ref = (kind: string) => `${MARK}${kind}-${String(++seq).padStart(6, "0")}`;

  for (let d = 0; d < DAYS; d++) {
    const dayStart = new Date(firstDay.getTime() + d * DAY_MS);
    const weekday = new Date(dayStart.getTime() + 6 * 3600000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const planned = Math.round((16 + d * 0.22) * (weekend ? 1.35 : 1) * (0.85 + rand() * 0.3));
    for (let i = 0; i < planned; i++) {
      const hour = pickWeighted(rand, HOUR_WEIGHTS.map((_, h) => h), (h) => HOUR_WEIGHTS[h]! / HOUR_TOTAL);
      const connectedAt = new Date(dayStart.getTime() + (hour + rand()) * 3600000);
      const seconds = Math.round(120 + rand() * rand() * 780); // 2–15 min, most of them short
      const endedAt = new Date(connectedAt.getTime() + seconds * 1000);
      // Only past days: today's figures (the website's "consultations today") come from real sessions.
      if (endedAt.getTime() > today.getTime()) continue;

      const eligible = customers.filter((c) => c.createdAt.getTime() < connectedAt.getTime() - 15 * 60000);
      if (!eligible.length) continue;
      // Recent sign-ups are likelier to consult (first reading), the rest are repeat customers.
      const cust =
        rand() < 0.3
          ? eligible[eligible.length - 1 - Math.floor(rand() * Math.min(8, eligible.length))]!
          : eligible[Math.floor(rand() * eligible.length)]!;
      // In proportion to lifetime consults, so a month never exceeds anyone's lifetime total.
      const astro = pickWeighted(rand, astrologers, (a) => Math.max(1, a.consults));

      const roll = rand();
      const instant = roll < 0.08;
      const mode = instant ? "VOICE" : roll < 0.55 ? "CHAT" : roll < 0.87 ? "VOICE" : "VIDEO";
      const rate = instant ? instantRate(astro.price, astro.instantMultiplier) : astro.price + (mode === "VIDEO" ? VIDEO_PREMIUM : 0);
      const minutes = Math.ceil(seconds / 60);
      const total = minutes * rate;

      if (cust.service + cust.promo < total) {
        const need = total - cust.service - cust.promo;
        const fits = denominations.filter((x) => x.amount >= need);
        const denom = fits.length ? fits[Math.min(fits.length - 1, Math.floor(rand() * 2))]! : denominations[denominations.length - 1]!;
        const paidAt = new Date(connectedAt.getTime() - (2 + rand() * 20) * 60000);
        const gst = Math.round(denom.amount * GST_RATE);
        const orderRef = ref("ORD");
        payments.push({
          id: `his_p${seq}`,
          userId: cust.id,
          amount: denom.amount,
          gst,
          bonus: denom.bonus,
          total: denom.amount + gst,
          status: "PAID",
          provider: "mock",
          providerOrderId: orderRef,
          createdAt: new Date(paidAt.getTime() - 40000),
          paidAt,
        });
        transactions.push({ userId: cust.id, type: "Recharge", ref: ref("RCH"), bucket: "Service", amount: denom.amount, createdAt: paidAt });
        if (denom.bonus > 0) transactions.push({ userId: cust.id, type: "Cashback", ref: ref("CB"), bucket: "Promotional", amount: denom.bonus, createdAt: paidAt });
        cust.service += denom.amount;
        cust.promo += denom.bonus;
        if (cust.service + cust.promo < total) continue; // even the largest recharge isn't enough
      }

      const promoUsed = Math.min(cust.promo, total);
      const serviceUsed = total - promoUsed;
      cust.promo -= promoUsed;
      cust.service -= serviceUsed;
      const sesRef = ref("SES");
      const requestedAt = new Date(connectedAt.getTime() - (20 + rand() * 70) * 1000);
      consultations.push({
        id: `his_s${seq}`,
        ref: sesRef,
        customerId: cust.id,
        customerAlias: `${String.fromCharCode(65 + Math.floor(rand() * 26))}-${1000 + Math.floor(rand() * 9000)}`,
        astrologerId: astro.id,
        mode,
        kind: instant ? "INSTANT" : "STANDARD",
        source: rand() < 0.6 ? "APP" : "WEB",
        rate,
        status: "ENDED",
        requestedAt,
        offeredAt: requestedAt,
        connectedAt,
        endedAt,
        endReason: seconds >= 15 * 60 ? "cap" : "user",
        billedSeconds: seconds,
        billedMinutes: minutes,
        total,
        promoUsed,
        serviceUsed,
      });
      const bucket = promoUsed > 0 ? `Promo ₹${promoUsed.toLocaleString("en-IN")} + Service ₹${serviceUsed.toLocaleString("en-IN")}` : "Service";
      transactions.push({ userId: cust.id, type: "Consultation", ref: sesRef, bucket, amount: -total, createdAt: endedAt });
    }
  }

  // All or nothing, so a failed run leaves no half history behind (and the next run adds it).
  await db.$transaction(
    async (tx) => {
      await tx.user.createMany({ data: users.map((u) => ({ ...u, role: "CUSTOMER" as const })) });
      await tx.wallet.createMany({ data: customers.map((c) => ({ userId: c.id, service: c.service, promo: c.promo })) });
      await tx.payment.createMany({ data: payments });
      await tx.consultation.createMany({ data: consultations });
      await tx.transaction.createMany({ data: transactions });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  console.log(
    `History added: ${users.length} customers, ${consultations.length} consultations, ${payments.length} recharges over the last ${DAYS} days.`,
  );
}

if (import.meta.main) {
  seedHistory()
    .then(() => db.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await db.$disconnect();
      process.exit(1);
    });
}
