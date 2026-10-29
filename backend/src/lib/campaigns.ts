// Marketing campaigns as real offers (client decisions, Oct 2026).
//
// Three kinds: RECHARGE_CASHBACK (a percent of a recharge back as promotional credit, optionally
// from a minimum recharge and up to a cap), CONSULT_DISCOUNT (a percent off the per-minute price of
// a consultation — Astrorize pays the discount, the astrologer still earns their share of the full
// price) and BONUS_CREDIT (flat promotional credit, credited when claimed).
//
// "Claim first, then use": a customer claims an offer on /offers; only claimed, unexpired, unused
// offers apply. A claim lasts `claimValidDays` and can be used `usesPerCustomer` times.
//
// Limits (Config console): the advertised percent may not exceed marketing.campaign.max_discount_pct;
// the cashback floor (wallet.cashback.floor_pct, default 80) means at most 100 − floor percent
// (20%) may actually apply. In the Finance floor mode "reject" a campaign above it can't be
// submitted or approved; in "adjust" it may go live and the percent is clamped when it applies.
// A bonus credit may not exceed marketing.bonus_credit.max.
//
// Campaigns made before offers existed only have display strings (denominations, "5–14%"): they are
// "legacy", stay listed in the console and are never claimable.

import { db } from "../db.ts";
import type { Campaign, Prisma } from "../generated/prisma/client.ts";
import { conflict, forbidden, notFound } from "./errors.ts";
import { istDate, istDateKey, makeRef, rupee } from "./format.ts";
import { notify, notifyMany } from "./notifications.ts";
import { configNumber, getSetting } from "./settings.ts";
import { audit } from "./audit.ts";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof db;
const DAY_MS = 86_400_000;

export const CAMPAIGN_KINDS = ["RECHARGE_CASHBACK", "CONSULT_DISCOUNT", "BONUS_CREDIT"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];
export const AUDIENCES = ["ALL", "NEW"] as const;

/** Made before offers existed: no percent / amount set, so nothing could be applied. */
export function isLegacy(c: Pick<Campaign, "kind" | "percent" | "flatAmount">): boolean {
  return c.kind === "BONUS_CREDIT" ? c.flatAmount == null : c.percent == null;
}

// ── Limits ──

export interface OfferLimits {
  /** marketing.campaign.max_discount_pct: the most a campaign may advertise. */
  maxPct: number;
  /** wallet.cashback.floor_pct: share of the price that must stay payable. */
  floorPct: number;
  /** Finance's floor mode: refuse campaigns above the floor, or clamp them when they apply. */
  floorMode: "reject" | "adjust";
  /** marketing.bonus_credit.max (₹) */
  bonusMax: number;
}

export async function offerLimits(): Promise<OfferLimits> {
  const [maxPct, floorPct, floorMode, bonusMax] = await Promise.all([
    configNumber("marketing.campaign.max_discount_pct", 40),
    configNumber("wallet.cashback.floor_pct", 80),
    getSetting<"reject" | "adjust">("finance.floorMode", "reject"),
    configNumber("marketing.bonus_credit.max", 200),
  ]);
  return { maxPct, floorPct: Math.min(100, Math.max(0, floorPct)), floorMode: floorMode === "adjust" ? "adjust" : "reject", bonusMax };
}

/** The most percent the cashback floor lets apply (80% floor → 20%). */
export const floorCap = (l: OfferLimits) => Math.max(0, 100 - l.floorPct);

/** The percent that actually applies: the campaign's, clamped by the floor. */
export const appliedPct = (percent: number, l: OfferLimits) => Math.max(0, Math.min(percent, floorCap(l)));

/** Why a campaign can't be submitted or approved now, or null. */
export function offerProblem(c: Campaign, l: OfferLimits, now = new Date()): string | null {
  if (isLegacy(c)) return `${c.id} is a legacy campaign with no offer set. Edit it (kind and percent or amount) before submitting.`;
  if (c.kind === "BONUS_CREDIT") {
    if ((c.flatAmount ?? 0) > l.bonusMax) return `${c.id} gives ${rupee(c.flatAmount ?? 0)}, above the ${rupee(l.bonusMax)} limit (marketing.bonus_credit.max).`;
  } else {
    const pct = c.percent ?? 0;
    if (pct > l.maxPct) return `${c.id} offers ${pct}%, above the ${l.maxPct}% limit (marketing.campaign.max_discount_pct).`;
    if (l.floorMode === "reject" && pct > floorCap(l)) {
      return `${c.id} offers ${pct}%, but the ${l.floorPct}% cashback floor allows at most ${floorCap(l)}% (wallet.cashback.floor_pct, floor mode "reject").`;
    }
  }
  if (c.startsAt && c.endsAt && c.startsAt >= c.endsAt) return `${c.id} ends before it starts.`;
  if (c.endsAt && c.endsAt <= now) return `${c.id} has already ended (${istDate(c.endsAt)}). Change its end date first.`;
  return null;
}

/** Live and claimable right now. */
export function isOpen(c: Campaign, now = new Date()): boolean {
  return c.state === "ACTIVE" && !isLegacy(c) && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now);
}

/** "10% cashback on recharges of ₹500 or more, up to ₹100" — one line for lists and notifications. */
export function offerSummary(c: Campaign, l?: OfferLimits): string {
  if (isLegacy(c)) return [c.cashback && `${c.cashback} cashback`, c.denoms].filter(Boolean).join(" · ") || "Legacy campaign";
  if (c.kind === "BONUS_CREDIT") return `${rupee(c.flatAmount ?? 0)} bonus credit`;
  const pct = l ? appliedPct(c.percent ?? 0, l) : (c.percent ?? 0);
  if (c.kind === "CONSULT_DISCOUNT") return `${pct}% off consultations`;
  const parts = [`${pct}% cashback on recharges`];
  if (c.minRecharge) parts[0] += ` of ${rupee(c.minRecharge)} or more`;
  if (c.maxBenefit) parts.push(`up to ${rupee(c.maxBenefit)}`);
  return parts.join(", ");
}

// ── Who an offer is for ──

/** Customers who can receive offers; NEW = no paid consultation yet. */
export function audienceWhere(audience: string): Prisma.UserWhereInput {
  return {
    role: "CUSTOMER",
    active: true,
    ...(audience === "NEW" ? { consultations: { none: { status: "ENDED", total: { gt: 0 } } } } : {}),
  };
}

async function inAudience(userId: string, audience: string, client: Client = db): Promise<boolean> {
  return !!(await client.user.findFirst({ where: { id: userId, ...audienceWhere(audience) }, select: { id: true } }));
}

// ── Customer side ──

const claimView = (k: { status: string; expiresAt: Date; usesLeft: number; claimedAt: Date }, now: Date) => {
  const expired = k.status === "ACTIVE" && k.expiresAt <= now;
  return {
    status: expired ? "EXPIRED" : k.status,
    claimedAt: k.claimedAt.toISOString(),
    expiresAt: k.expiresAt.toISOString(),
    expires: istDate(k.expiresAt),
    usesLeft: k.usesLeft,
  };
};

/**
 * The offers page: every open campaign (with the customer's claim, if any), and offers the customer
 * claimed that still apply after their campaign closed. `userId` null = a visitor.
 */
export async function offersFor(userId: string | null, now = new Date()) {
  const [limits, campaigns, claims] = await Promise.all([
    offerLimits(),
    db.campaign.findMany({ where: { state: "ACTIVE" }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }] }),
    userId ? db.campaignClaim.findMany({ where: { userId }, include: { campaign: true } }) : Promise.resolve([]),
  ]);
  const isNew = userId ? await inAudience(userId, "NEW") : true;
  const claimOf = new Map(claims.map((k) => [k.campaignId, k]));
  const open = campaigns.filter((c) => isOpen(c, now));
  // Claimed and still usable, though the campaign itself has since closed to new claims.
  const stillUsable = claims.filter((k) => !open.some((c) => c.id === k.campaignId) && k.status === "ACTIVE" && k.expiresAt > now && k.usesLeft > 0);
  const rows = [...open, ...stillUsable.map((k) => k.campaign)];
  return rows.map((c) => {
    const k = claimOf.get(c.id);
    return {
      id: c.id,
      kind: c.kind as CampaignKind,
      name: c.name,
      description: c.description,
      summary: offerSummary(c, limits),
      /** The percent that applies (after the cashback floor). */
      percent: c.percent == null ? null : appliedPct(c.percent, limits),
      flatAmount: c.flatAmount,
      minRecharge: c.minRecharge,
      maxBenefit: c.maxBenefit,
      endsAt: c.endsAt?.toISOString() ?? null,
      ends: c.endsAt ? istDate(c.endsAt) : null,
      claimValidDays: c.claimValidDays,
      usesPerCustomer: c.usesPerCustomer,
      audience: c.audience,
      /** False for a NEW-customers offer once this customer has paid for a consultation. */
      eligible: c.audience !== "NEW" || isNew,
      open: open.includes(c),
      claim: k ? claimView(k, now) : null,
    };
  });
}

/** A unique wallet ledger reference. */
async function ledgerRef(client: Client, prefix: string) {
  for (;;) {
    const ref = makeRef(prefix);
    if (!(await client.transaction.findUnique({ where: { ref }, select: { id: true } }))) return ref;
  }
}

/**
 * Claims an offer: once per customer per campaign, while it is open. A bonus credit is credited to
 * the promotional balance straight away (with its ledger line); the others wait to be used.
 */
export async function claimOffer(userId: string, campaignId: string, now = new Date()) {
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c || !isOpen(c, now)) throw notFound("This offer isn't available any more.");
  if (!(await inAudience(userId, c.audience))) throw forbidden("This offer is for new customers — it applies before your first paid consultation.");
  const ref = c.kind === "BONUS_CREDIT" ? await ledgerRef(db, "CMB") : null;
  try {
    return await db.$transaction(async (tx) => {
      if (c.kind === "BONUS_CREDIT") {
        const amount = c.flatAmount ?? 0;
        const claim = await tx.campaignClaim.create({ data: { campaignId: c.id, userId, expiresAt: now, usesLeft: 0, status: "USED", lastUsedAt: now } });
        await tx.wallet.upsert({ where: { userId }, create: { userId, promo: amount }, update: { promo: { increment: amount } } });
        await tx.transaction.create({ data: { userId, type: "Campaign bonus", ref: ref!, bucket: "Promotional", amount } });
        return { claim, credited: amount };
      }
      const claim = await tx.campaignClaim.create({
        data: { campaignId: c.id, userId, expiresAt: new Date(now.getTime() + c.claimValidDays * DAY_MS), usesLeft: c.usesPerCustomer },
      });
      return { claim, credited: 0 };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw conflict("You've already claimed this offer.");
    throw e;
  }
}

/** Usable claims of one kind, with their campaigns. */
function usableClaims(client: Client, userId: string, kind: CampaignKind, now: Date) {
  return client.campaignClaim.findMany({
    where: { userId, status: "ACTIVE", expiresAt: { gt: now }, usesLeft: { gt: 0 }, campaign: { kind } },
    include: { campaign: true },
  });
}

export interface CashbackQuote {
  claimId: string;
  campaignId: string;
  name: string;
  percent: number;
  cashback: number;
}

/** Cashback a claimed RECHARGE_CASHBACK offer adds to a recharge of `amount`. */
export function cashbackOn(c: Campaign, amount: number, l: OfferLimits): number {
  if (c.kind !== "RECHARGE_CASHBACK" || c.percent == null) return 0;
  if (c.minRecharge && amount < c.minRecharge) return 0;
  const raw = Math.floor((amount * appliedPct(c.percent, l)) / 100);
  return Math.max(0, c.maxBenefit ? Math.min(raw, c.maxBenefit) : raw);
}

/** The customer's best claimed cashback for each amount (null where none applies). */
export async function cashbackQuotes(userId: string, amounts: number[], now = new Date(), client: Client = db): Promise<(CashbackQuote | null)[]> {
  const [limits, claims] = await Promise.all([offerLimits(), usableClaims(client, userId, "RECHARGE_CASHBACK", now)]);
  return amounts.map((amount) => {
    let best: CashbackQuote | null = null;
    for (const k of claims) {
      const cashback = cashbackOn(k.campaign, amount, limits);
      // The biggest cashback; on a tie, the claim that expires first.
      if (cashback > 0 && (!best || cashback > best.cashback)) {
        best = { claimId: k.id, campaignId: k.campaignId, name: k.campaign.name, percent: appliedPct(k.campaign.percent ?? 0, limits), cashback };
      }
    }
    return best;
  });
}

export interface DiscountQuote {
  claimId: string;
  campaignId: string;
  name: string;
  /** Percent off, after the cashback floor. */
  pct: number;
  expiresAt: Date;
}

/** The customer's best claimed consultation discount, or null. */
export async function discountQuote(userId: string, now = new Date(), client: Client = db): Promise<DiscountQuote | null> {
  const [limits, claims] = await Promise.all([offerLimits(), usableClaims(client, userId, "CONSULT_DISCOUNT", now)]);
  let best: DiscountQuote | null = null;
  for (const k of claims) {
    const pct = appliedPct(k.campaign.percent ?? 0, limits);
    if (pct > 0 && (!best || pct > best.pct || (pct === best.pct && k.expiresAt < best.expiresAt))) {
      best = { claimId: k.id, campaignId: k.campaignId, name: k.campaign.name, pct, expiresAt: k.expiresAt };
    }
  }
  return best;
}

/** The per-minute price after a discount: rounded down, never below ₹1. */
export const discountedRate = (rate: number, pct: number) => Math.max(1, Math.floor((rate * (100 - pct)) / 100));

/**
 * Uses one of a claim's uses (a recharge was paid, or a discounted consultation connected); the
 * last use marks it USED. False when there was no use left (e.g. another tab used it first).
 * Expiry isn't re-checked: the offer was valid when the customer was quoted it.
 */
export async function useClaim(tx: Tx, claimId: string, now = new Date()): Promise<boolean> {
  const { count } = await tx.campaignClaim.updateMany({
    where: { id: claimId, status: "ACTIVE", usesLeft: { gt: 0 } },
    data: { usesLeft: { decrement: 1 }, lastUsedAt: now },
  });
  if (!count) return false;
  await tx.campaignClaim.updateMany({ where: { id: claimId, status: "ACTIVE", usesLeft: { lte: 0 } }, data: { status: "USED" } });
  return true;
}

// ── Notifications and the minute sweep ──

const offerHref = (id: string) => `/offers#${id}`;
/** The astrologer's notice opens their dashboard; the query names the campaign so each is sent once. */
const portalHref = (id: string) => `/portal?campaign=${encodeURIComponent(id)}`;

/** What a live campaign means for an astrologer's consultations and earnings. */
function astrologerNoticeBody(c: Campaign, l: OfferLimits): string {
  const summary = offerSummary(c, l);
  const d = c.description.trim();
  const about = d ? `${/[.!?]$/.test(d) ? d : `${d}.`} ` : "";
  if (c.kind === "CONSULT_DISCOUNT") {
    return `${about}Customers who claim it may see ${summary} with you. You still earn on your full price — Astrorize pays the discount.`;
  }
  return `${about}Customers get ${summary}${c.endsAt ? ` until ${istDate(c.endsAt)}` : ""}. Your price and earnings don't change.`;
}

const hasNotice = (kind: string, href: string, client: Client = db) =>
  client.notification.findFirst({ where: { kind, href }, select: { id: true } }).then(Boolean);

/**
 * When a campaign is live (on approval, or when its start date arrives — the minute sweep): "New
 * offer: …" to every customer it is for, and "New campaign live: …" to every active astrologer,
 * since customers may pay less for a consultation. Each goes out once per campaign: safe to call
 * again, and an approval racing the sweep can't send twice (both take the same lock). Returns how
 * many customers were told now.
 */
export async function announceCampaign(c: Campaign, now = new Date()) {
  if (!isOpen(c, now)) return 0;
  const href = offerHref(c.id);
  const astroHref = portalHref(c.id);
  // The cheap check first: the sweep calls this every minute for every live campaign.
  if ((await hasNotice("campaign.new", href)) && (await hasNotice("campaign.live", astroHref))) return 0;
  const limits = await offerLimits();
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`campaign.announce:${c.id}`}))`;
      let told = 0;
      if (!(await hasNotice("campaign.new", href, tx))) {
        const ids = (await tx.user.findMany({ where: audienceWhere(c.audience), select: { id: true } })).map((u) => u.id);
        await notifyMany(
          ids,
          {
            kind: "campaign.new",
            title: `New offer: ${c.name}`,
            body: `${offerSummary(c, limits)}. Claim it on the Offers page${c.endsAt ? ` by ${istDate(c.endsAt)}` : ""}.`,
            href,
          },
          tx,
        );
        told = ids.length;
      }
      if (!(await hasNotice("campaign.live", astroHref, tx))) {
        const astrologers = await tx.user.findMany({
          where: { role: "ASTROLOGER", active: true, astrologer: { is: { lifecycle: "active" } } },
          select: { id: true },
        });
        await notifyMany(
          astrologers.map((u) => u.id),
          { kind: "campaign.live", title: `New campaign live: ${c.name}`, body: astrologerNoticeBody(c, limits), href: astroHref },
          tx,
        );
      }
      return told;
    },
    { timeout: 60_000 },
  );
}

/** Hour (IST) from which the daily offers notice goes out. */
const DAILY_HOUR_IST = 9;
let dailyDoneFor = "";

/**
 * Once per IST day (from 9:00): each customer with an offer that expires tomorrow is told so;
 * otherwise each customer with open offers they haven't claimed gets "Today's offers". At most one
 * of these per customer per day; after a restart, customers already told today are skipped.
 */
export async function sendDailyOfferNotices(now = new Date()) {
  const today = istDateKey(now);
  const hour = Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  if (dailyDoneFor === today || hour < DAILY_HOUR_IST) return;
  const dayStart = new Date(`${today}T00:00:00+05:30`);
  const tomorrowStart = new Date(dayStart.getTime() + DAY_MS);
  const told = new Set(
    (await db.notification.findMany({ where: { kind: { in: ["campaign.daily", "campaign.expiring"] }, createdAt: { gte: dayStart } }, select: { userId: true } })).map(
      (n) => n.userId,
    ),
  );

  // Claims that expire tomorrow (IST) and haven't been used up.
  const expiring = await db.campaignClaim.findMany({
    where: { status: "ACTIVE", usesLeft: { gt: 0 }, expiresAt: { gte: tomorrowStart, lt: new Date(tomorrowStart.getTime() + DAY_MS) } },
    include: { campaign: true },
  });
  for (const k of expiring) {
    if (told.has(k.userId)) continue;
    told.add(k.userId);
    await notify(k.userId, {
      kind: "campaign.expiring",
      title: "Your offer expires tomorrow",
      body: `${k.campaign.name} can be used until ${istDate(k.expiresAt)}. It applies automatically${k.campaign.kind === "CONSULT_DISCOUNT" ? " to your next consultation" : " to your next recharge"}.`,
      href: offerHref(k.campaignId),
    });
  }

  const open = (await db.campaign.findMany({ where: { state: "ACTIVE" } })).filter((c) => isOpen(c, now));
  if (open.length) {
    const limits = await offerLimits();
    // Customer → the open offers they could still claim, leaving out one they were told about as
    // "New offer" today already (e.g. approved after 9:00, then the API restarted).
    const waiting = new Map<string, Campaign[]>();
    for (const c of open) {
      const users = await db.user.findMany({
        where: {
          ...audienceWhere(c.audience),
          campaignClaims: { none: { campaignId: c.id } },
          notifications: { none: { kind: "campaign.new", href: offerHref(c.id), createdAt: { gte: dayStart } } },
        },
        select: { id: true },
      });
      for (const u of users) if (!told.has(u.id)) waiting.set(u.id, [...(waiting.get(u.id) ?? []), c]);
    }
    // Same text → one batch insert.
    const byText = new Map<string, { title: string; body: string; ids: string[] }>();
    for (const [userId, list] of waiting) {
      const title = list.length === 1 ? "Today's offer" : `Today's offers: ${list.length} waiting for you`;
      const body =
        list.length === 1
          ? `${list[0]!.name} — ${offerSummary(list[0]!, limits)}. Claim it before it's gone.`
          : `${list.map((c) => c.name).join(", ")}. Claim them on the Offers page.`;
      const key = `${title}\n${body}`;
      byText.set(key, { title, body, ids: [...(byText.get(key)?.ids ?? []), userId] });
    }
    for (const { title, body, ids } of byText.values()) await notifyMany(ids, { kind: "campaign.daily", title, body, href: "/offers" });
  }
  dailyDoneFor = today;
}

/**
 * Every minute (server.ts): campaigns past their end date close (claims already made keep their own
 * expiry), claims past their expiry are marked EXPIRED, open campaigns not yet announced are
 * announced, and the daily notice goes out once a day.
 */
export async function sweepCampaigns(now = new Date()) {
  const ended = await db.campaign.findMany({ where: { state: "ACTIVE", endsAt: { lte: now } }, select: { id: true } });
  for (const { id } of ended) {
    const { count } = await db.campaign.updateMany({ where: { id, state: "ACTIVE" }, data: { state: "EXPIRED" } });
    if (count) await audit(null, "campaign.end", id, "ACTIVE → EXPIRED (end date reached)");
  }
  await db.campaignClaim.updateMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  // Announced on approval when already open; otherwise (a later start date, or the approval's
  // announcement failed) here, once.
  const live = await db.campaign.findMany({ where: { state: "ACTIVE" } });
  for (const c of live) await announceCampaign(c, now);
  await sendDailyOfferNotices(now);
}

// ── Finance ──

/** What campaigns cost Astrorize since the start of this IST month. */
export async function campaignCostThisMonth(now = new Date()) {
  const start = new Date(`${istDateKey(now).slice(0, 7)}-01T00:00:00+05:30`);
  const [cashback, bonus, discount] = await Promise.all([
    db.payment.aggregate({ where: { status: "PAID", paidAt: { gte: start }, cashback: { gt: 0 } }, _sum: { cashback: true } }),
    db.transaction.aggregate({ where: { type: "Campaign bonus", createdAt: { gte: start } }, _sum: { amount: true } }),
    db.earningsLine.aggregate({ where: { date: { gte: start }, discount: { gt: 0 } }, _sum: { discount: true } }),
  ]);
  const c = cashback._sum.cashback ?? 0;
  const b = bonus._sum.amount ?? 0;
  const d = discount._sum.discount ?? 0;
  return { month: now.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Kolkata" }).slice(0, 3), cashback: c, bonus: b, discount: d, total: c + b + d };
}
