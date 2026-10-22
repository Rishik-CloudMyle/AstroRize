import { createHash } from "node:crypto";
import { db } from "../db.ts";
import type { Astrologer, Prisma } from "../generated/prisma/client.ts";
import { istDate, istDateKey } from "./format.ts";
import { effectivePresence } from "./presence.ts";
import { configNumber } from "./settings.ts";

// The welcome campaign (spec AR-WEL): every customer with a verified mobile number gets free
// consultations — how many, per what period and how long each is are set in the Config console
// (welcome.allowance_count / welcome.allowance_period / welcome.complimentary_seconds). A free
// call is counted only once it connects. Free time earns the astrologer nothing and is never
// refunded; after it, the same session continues at the astrologer's normal rate if the wallet
// allows, else it ends.

/** Modes the free call can use (the spec's seed allow-list: Audio + Chat). */
export const WELCOME_MODES = ["CHAT", "VOICE"] as const;

/** ONCE = once ever; DAY / WEEK (Mon–Sun) / MONTH = per calendar day, week or month in IST. */
export type AllowancePeriod = "ONCE" | "DAY" | "WEEK" | "MONTH";
/** The period an astrologer's free-call capacity counts over (Astrologer.freeCallsLimitPeriod). */
export type CapacityPeriod = "DAY" | "WEEK";

/**
 * Config "welcome.allowance_period" is a number: 0 = once ever, 1 = per day, 7 = per week,
 * 30 = per calendar month. Values in between read as the shorter period (e.g. 10 = per week).
 */
function allowancePeriodOf(n: number): AllowancePeriod {
  if (!(n >= 1)) return "ONCE";
  if (n < 7) return "DAY";
  if (n < 30) return "WEEK";
  return "MONTH";
}

/** Policy, from the Config console (Admin-approved changes, versioned there). */
export async function welcomePolicy() {
  const [enabled, seconds, reminder, dailyLimit, minMeaningful, maxRestores, count, period, maxPerDay, maxPerWeek] = await Promise.all([
    configNumber("welcome.enabled", 1),
    configNumber("welcome.complimentary_seconds", 300),
    configNumber("welcome.reminder_seconds", 120),
    configNumber("welcome.daily_limit_default", 5),
    configNumber("welcome.min_meaningful_seconds", 30),
    configNumber("welcome.max_fault_restores", 2),
    configNumber("welcome.allowance_count", 1),
    configNumber("welcome.allowance_period", 0),
    configNumber("welcome.astrologer_max_per_day", 10),
    configNumber("welcome.astrologer_max_per_week", 50),
  ]);
  return {
    enabled: enabled === 1,
    complimentarySeconds: Math.max(1, Math.round(seconds)),
    reminderSeconds: reminder,
    dailyLimitDefault: Math.max(0, Math.floor(dailyLimit)),
    minMeaningfulSeconds: minMeaningful,
    maxFaultRestores: maxRestores,
    /** Free calls each customer (mobile number) gets per `allowancePeriod`. */
    allowanceCount: Math.max(0, Math.floor(count)),
    allowancePeriod: allowancePeriodOf(period),
    /** Most free calls an astrologer may offer per day / per week (their own setting is capped to it). */
    maxPerDay: Math.max(0, Math.floor(maxPerDay)),
    maxPerWeek: Math.max(0, Math.floor(maxPerWeek)),
  };
}

type Tx = Prisma.TransactionClient;
type Policy = Awaited<ReturnType<typeof welcomePolicy>>;

// ── IST calendar periods ──

const DAY_MS = 86400000;
/** 00:00 IST of an IST date key. */
const istMidnight = (key: string) => new Date(`${key}T00:00:00+05:30`);

/** When the current period began (IST), or null for "once ever". */
export function periodStart(period: AllowancePeriod, now = new Date()): Date | null {
  const key = istDateKey(now);
  if (period === "ONCE") return null;
  if (period === "DAY") return istMidnight(key);
  if (period === "MONTH") return istMidnight(`${key.slice(0, 7)}-01`);
  // Weeks run Monday to Sunday.
  const weekday = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(istMidnight(key).getTime() - weekday * DAY_MS);
}

/** When the next period begins (IST), or null for "once ever". */
export function periodEnd(period: AllowancePeriod, now = new Date()): Date | null {
  const start = periodStart(period, now);
  if (!start) return null;
  if (period === "DAY") return new Date(start.getTime() + DAY_MS);
  if (period === "WEEK") return new Date(start.getTime() + 7 * DAY_MS);
  const [y, m] = istDateKey(now).split("-").map(Number) as [number, number];
  return istMidnight(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`);
}

/** "once" | "day" | "week" | "month" — how the website and portals name a period. */
export const periodName = (p: AllowancePeriod | CapacityPeriod) => (p === "ONCE" ? "once" : p.toLowerCase()) as "once" | "day" | "week" | "month";

// ── The customer's allowance ──

/** The identity a benefit belongs to: a hash of the verified mobile number (no personal data). */
export function identityKey(phone: string): string {
  return createHash("sha256").update(`astrorize-welcome:${phone.replace(/\D/g, "").slice(-10)}`).digest("hex");
}

// WelcomeBenefit is the identity anchor (one row per mobile number); FreeCallUse rows count the
// free calls that connected. The benefit's state machine:
//   GRANTED   the person may take free calls — as many as their allowance has left this period
//   RESERVED  a free call request is in flight (consultationId); never two at once
//   REVOKED   no free calls (staff action)
//   CONSUMED  LEGACY only: rows from before allowances were configurable. Their call was copied
//             into FreeCallUse, so they are treated exactly like GRANTED (with "1, once ever" they
//             are used up just as before). Normal code paths move them on to GRANTED over time.
// Request → GRANTED/CONSUMED → RESERVED. Connects → a FreeCallUse row + back to GRANTED. Never
// connects (cancelled, declined, timed out) → back to GRANTED, nothing counted. A free call that
// drops in its first seconds through no fault of the customer gets its FreeCallUse.restoredAt set
// (it no longer counts), a bounded number of times per person (WelcomeBenefit.faultRestores).

/** Benefit statuses that may take a free call (allowance permitting). */
const ELIGIBLE = ["GRANTED", "CONSUMED"];

/**
 * Grants the welcome benefit to a customer who has just verified their mobile number. Idempotent:
 * a number that ever had one (even on a deleted account) gets no new row — its allowance keeps
 * counting the calls already used; a returning number is re-linked to the new account unless revoked.
 */
export async function grantWelcome(userId: string, phone: string, tx: Prisma.TransactionClient = db) {
  const key = identityKey(phone);
  const existing = await tx.welcomeBenefit.findUnique({ where: { identityKey: key } });
  if (existing) {
    if (!existing.userId && ELIGIBLE.includes(existing.status)) {
      return tx.welcomeBenefit.update({ where: { id: existing.id }, data: { userId } });
    }
    return existing;
  }
  return tx.welcomeBenefit.create({ data: { identityKey: key, userId } });
}

/** The customer's benefit, or null. */
export function benefitOf(userId: string) {
  return db.welcomeBenefit.findUnique({ where: { userId } });
}

/** Free calls this person has used in the current allowance period (restored ones don't count). */
export async function allowanceOf(client: Tx | typeof db, key: string, policy: Policy, now = new Date()) {
  const start = periodStart(policy.allowancePeriod, now);
  const used = await client.freeCallUse.count({
    where: { identityKey: key, restoredAt: null, ...(start ? { usedAt: { gte: start } } : {}) },
  });
  return {
    used,
    remaining: Math.max(0, policy.allowanceCount - used),
    /** When the allowance starts again (null for "once ever"). */
    resetsAt: periodEnd(policy.allowancePeriod, now),
  };
}

/**
 * Whether this customer may start a free call now (their own side only — the astrologer's is
 * freeCallRefusal). Returns the benefit, or a refusal with a message for the customer.
 */
export async function welcomeAvailability(
  tx: Tx,
  userId: string,
  policy: Policy,
): Promise<{ ok: true; id: string } | { ok: false; code: string; message: string }> {
  const none = { ok: false as const, code: "WEL_NOT_AVAILABLE", message: "You don't have a free call to use. You can still consult at the normal rate." };
  const b = await tx.welcomeBenefit.findUnique({ where: { userId } });
  if (!b || !ELIGIBLE.includes(b.status)) return none;
  const { remaining, resetsAt } = await allowanceOf(tx, b.identityKey, policy);
  if (remaining > 0) return { ok: true, id: b.id };
  if (!resetsAt) return { ...none, message: "You've used your free calls. You can still consult at the normal rate." };
  return {
    ...none,
    message: `You've used this ${periodName(policy.allowancePeriod)}'s free calls — your next one is available from ${istDate(resetsAt)}. You can still consult at the normal rate.`,
  };
}

// ── The astrologer's capacity ──

/** Consultation.billingMode of a welcome call. */
export const COMPLIMENTARY = "COMPLIMENTARY_THEN_PAID";

/** Statuses of a consultation that never connected. */
const NOT_CONNECTED = ["REJECTED", "TIMED_OUT", "CANCELLED"];
/** A free call in any of these keeps the astrologer from taking another one. */
const FREE_IN_FLIGHT = ["REQUESTED", "CONNECTING", "ACTIVE"];

/**
 * Free calls an astrologer takes per day or per week: their own setting (portal or HR), else the
 * campaign's daily default — never more than the admin maximum for that period.
 */
export function capacityOf(a: Pick<Astrologer, "freeCallsDailyLimit" | "freeCallsLimitPeriod">, policy: Policy) {
  const own = a.freeCallsDailyLimit !== null;
  const period: CapacityPeriod = own && a.freeCallsLimitPeriod === "WEEK" ? "WEEK" : "DAY";
  const max = period === "WEEK" ? policy.maxPerWeek : policy.maxPerDay;
  return { limit: Math.min(a.freeCallsDailyLimit ?? policy.dailyLimitDefault, max), period, isDefault: !own };
}

type CapacityFields = Pick<Astrologer, "id" | "freeCallsDailyLimit" | "freeCallsLimitPeriod">;

/**
 * Free calls counted against each astrologer's capacity this period (their IST day or Mon–Sun
 * week): those connected in it, plus those requested and about to connect, so two customers
 * can't both take the last one. Also says which astrologers have a free call in flight.
 */
async function quotaUsed(client: Tx | typeof db, astrologers: CapacityFields[], policy: Policy, now = new Date()) {
  const used = new Map<string, number>();
  const inFlight = new Set<string>();
  if (!astrologers.length) return { used, inFlight };
  const weekStart = periodStart("WEEK", now)!;
  const rows = await client.consultation.findMany({
    where: {
      astrologerId: { in: astrologers.map((a) => a.id) },
      billingMode: COMPLIMENTARY,
      OR: [{ connectedAt: { gte: weekStart } }, { status: { in: FREE_IN_FLIGHT } }],
    },
    select: { astrologerId: true, status: true, connectedAt: true },
  });
  const startOf = new Map(astrologers.map((a) => [a.id, periodStart(capacityOf(a, policy).period, now)!]));
  for (const r of rows) {
    if (FREE_IN_FLIGHT.includes(r.status)) inFlight.add(r.astrologerId);
    const counts = r.status === "REQUESTED" || r.status === "CONNECTING" || (r.connectedAt && r.connectedAt >= startOf.get(r.astrologerId)!);
    if (counts) used.set(r.astrologerId, (used.get(r.astrologerId) ?? 0) + 1);
  }
  return { used, inFlight };
}

/** Free calls an astrologer has CONNECTED in their current capacity period (IST day or week). */
export async function freeCallsUsed(a: CapacityFields, policy: Policy, now = new Date()): Promise<number> {
  const start = periodStart(capacityOf(a, policy).period, now)!;
  return db.consultation.count({ where: { astrologerId: a.id, billingMode: COMPLIMENTARY, connectedAt: { gte: start } } });
}

/**
 * An astrologer's free calls as the portal and the admin record show them: taking part, their
 * capacity and period, how many are used this period, and the admin maximums for setting it.
 */
export async function capacityView(a: Astrologer, policy: Policy, now = new Date()) {
  const cap = capacityOf(a, policy);
  const used = await freeCallsUsed(a, policy, now);
  return {
    /** Taking free calls right now: the campaign is on and the astrologer takes part. */
    enabled: policy.enabled && a.freeCallsEnabled,
    /** The astrologer's own switch (portal or HR). */
    optedIn: a.freeCallsEnabled,
    campaignOn: policy.enabled,
    /** Their own number, or null for the campaign default (per day). */
    ownLimit: a.freeCallsDailyLimit,
    /** day | week */
    period: periodName(cap.period),
    limit: cap.limit,
    isDefault: cap.isDefault,
    defaultLimit: policy.dailyLimitDefault,
    /** Connected this period (today, or this Mon–Sun week, IST). */
    used,
    remaining: Math.max(0, cap.limit - used),
    resetsAt: periodEnd(cap.period, now)!.toISOString(),
    maxPerDay: policy.maxPerDay,
    maxPerWeek: policy.maxPerWeek,
    /** Length of each free call, in seconds. */
    freeSeconds: policy.complimentarySeconds,
  };
}

/** Validates a capacity someone wants to set (portal or HR): a whole number within the admin maximum for its period. */
export function capacityProblem(limit: number, period: CapacityPeriod, policy: Policy): string | null {
  const max = period === "WEEK" ? policy.maxPerWeek : policy.maxPerDay;
  if (!Number.isInteger(limit) || limit < 0) return "Enter the number of free calls as a whole number.";
  if (limit > max) return `You can offer at most ${max} free calls per ${periodName(period)}.`;
  return null;
}

/** Why a free call can't be taken with this astrologer right now (code + message), or null. */
export async function freeCallRefusal(
  a: Astrologer,
  policy: Policy,
  client: Tx | typeof db = db,
): Promise<{ code: string; message: string } | null> {
  if (!policy.enabled) return { code: "WEL_DISABLED", message: "Free calls aren't available right now. You can still consult at the normal rate." };
  if (!a.freeCallsEnabled) {
    return { code: "WEL_ASTROLOGER_NOT_PARTICIPATING", message: `${a.name} doesn't take free calls. Choose an astrologer marked “Free call”.` };
  }
  if (effectivePresence(a) !== "ON") return { code: "WEL_ASTROLOGER_UNAVAILABLE", message: `${a.name} isn't available for a free call right now.` };
  const { used, inFlight } = await quotaUsed(client, [a], policy);
  // One free call at a time per astrologer.
  if (inFlight.has(a.id)) {
    return { code: "WEL_ASTROLOGER_BUSY", message: `${a.name} is busy with another free call. Try again in a few minutes — you have not been charged.` };
  }
  const { limit, period } = capacityOf(a, policy);
  if ((used.get(a.id) ?? 0) >= limit) {
    return {
      code: "WEL_DAILY_LIMIT",
      message: `${a.name} has taken all of ${period === "WEEK" ? "this week's" : "today's"} free calls. Try another astrologer marked “Free call”.`,
    };
  }
  return null;
}

/** The astrologers (of these) a customer can take a free call with right now: taking part, available, not in another free call, capacity left. */
export async function freeCallOpen(astrologers: Astrologer[]): Promise<Set<string>> {
  const open = new Set<string>();
  const candidates = astrologers.filter((a) => a.freeCallsEnabled && effectivePresence(a) === "ON");
  if (!candidates.length) return open;
  const policy = await welcomePolicy();
  if (!policy.enabled) return open;
  const { used, inFlight } = await quotaUsed(db, candidates, policy);
  for (const a of candidates) {
    if (!inFlight.has(a.id) && (used.get(a.id) ?? 0) < capacityOf(a, policy).limit) open.add(a.id);
  }
  return open;
}

// ── Using a free call ──

/** Puts the customer's benefit on hold for a free call being requested. False when it isn't free to use. */
export async function reserveWelcome(tx: Tx, userId: string, consultationId: string): Promise<boolean> {
  const { count } = await tx.welcomeBenefit.updateMany({
    where: { userId, status: { in: ELIGIBLE } },
    data: { status: "RESERVED", consultationId, reservedAt: new Date() },
  });
  return count === 1;
}

/** The free call never connected: nothing is counted and the benefit is the customer's again. */
export function releaseWelcome(tx: Tx | typeof db, consultationId: string) {
  return tx.welcomeBenefit.updateMany({
    where: { consultationId, status: "RESERVED" },
    data: { status: "GRANTED", consultationId: null, reservedAt: null },
  });
}

/**
 * The free call connected: it counts against the person's allowance (a FreeCallUse row, once per
 * consultation) and the benefit is free for their next one. Safe to run twice.
 */
export async function consumeWelcome(tx: Tx | typeof db, consultationId: string, at = new Date()) {
  const b = await tx.welcomeBenefit.findFirst({ where: { consultationId, status: "RESERVED" }, select: { identityKey: true } });
  if (!b) return;
  const c = await tx.consultation.findUnique({ where: { id: consultationId }, select: { astrologerId: true } });
  if (!c) return;
  await tx.freeCallUse.createMany({ data: [{ identityKey: b.identityKey, consultationId, astrologerId: c.astrologerId, usedAt: at }], skipDuplicates: true });
  await tx.welcomeBenefit.updateMany({ where: { consultationId, status: "RESERVED" }, data: { status: "GRANTED", consumedAt: at } });
}

/**
 * A free call dropped before it meant anything (under welcome.min_meaningful_seconds) and the
 * customer didn't end it: it no longer counts, at most welcome.max_fault_restores times per person.
 * Returns true when it was given back.
 */
export async function restoreAfterFault(tx: Tx, consultationId: string, policy: Policy): Promise<boolean> {
  const use = await tx.freeCallUse.findUnique({ where: { consultationId }, include: { benefit: { select: { id: true, faultRestores: true } } } });
  if (!use || use.restoredAt || use.benefit.faultRestores >= policy.maxFaultRestores) return false;
  const { count } = await tx.freeCallUse.updateMany({ where: { id: use.id, restoredAt: null }, data: { restoredAt: new Date() } });
  if (count !== 1) return false;
  await tx.welcomeBenefit.update({ where: { id: use.benefit.id }, data: { faultRestores: { increment: 1 } } });
  return true;
}

/**
 * Settles benefits left RESERVED by a request that has since finished elsewhere (e.g. timed out
 * when the astrologer went offline): never connected → released, connected → counted.
 * Runs from the consultation sweep, and before a customer's benefit is shown.
 */
export async function reconcileWelcome(userId?: string) {
  const reserved = await db.welcomeBenefit.findMany({ where: { status: "RESERVED", ...(userId ? { userId } : {}) } });
  for (const b of reserved) {
    if (!b.consultationId) {
      await db.welcomeBenefit.updateMany({ where: { id: b.id, status: "RESERVED" }, data: { status: "GRANTED", reservedAt: null } });
      continue;
    }
    const c = await db.consultation.findUnique({ where: { id: b.consultationId }, select: { status: true, connectedAt: true } });
    if (!c || NOT_CONNECTED.includes(c.status) || (c.status === "ENDED" && !c.connectedAt)) await releaseWelcome(db, b.consultationId);
    else if (c.connectedAt) await consumeWelcome(db, b.consultationId, c.connectedAt);
  }
}

/** The customer's free calls as the website shows them, or null when they never had any. */
export async function welcomeView(userId: string) {
  let b = await benefitOf(userId);
  if (!b) return null;
  if (b.status === "RESERVED") {
    await reconcileWelcome(userId);
    b = await benefitOf(userId);
    if (!b) return null;
  }
  const policy = await welcomePolicy();
  const eligible = ELIGIBLE.includes(b.status);
  const allowance = await allowanceOf(db, b.identityKey, policy);
  const status = b.status === "RESERVED" ? "reserved" : b.status === "REVOKED" ? "revoked" : allowance.remaining > 0 ? "granted" : "consumed";
  return {
    /** granted (free calls left) | reserved (one is being requested) | consumed (none left for now) | revoked */
    status,
    /** True while it can be used to start a free call. */
    available: policy.enabled && eligible && allowance.remaining > 0,
    /** Length of each free call, in seconds. */
    freeSeconds: policy.complimentarySeconds,
    reminderSeconds: policy.reminderSeconds,
    /** Modes it can be used for (Video and Instant Call stay paid). */
    modes: WELCOME_MODES.map((m) => m.toLowerCase()),
    allowance: {
      /** Free calls per period. */
      count: policy.allowanceCount,
      /** once | day | week | month (IST calendar periods; weeks run Monday to Sunday) */
      period: periodName(policy.allowancePeriod),
      used: allowance.used,
      remaining: eligible ? allowance.remaining : 0,
      /** ISO time the allowance starts again; null for "once ever". */
      resetsAt: allowance.resetsAt?.toISOString() ?? null,
    },
  };
}
