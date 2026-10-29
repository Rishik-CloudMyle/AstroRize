import { createHash } from "node:crypto";
import { db } from "../db.ts";
import type { Astrologer, Prisma } from "../generated/prisma/client.ts";
import { istDate, istDateKey } from "./format.ts";
import { effectivePresence } from "./presence.ts";
import { configNumber } from "./settings.ts";

// The welcome campaign (spec AR-WEL): every customer with a verified mobile number gets a weekly
// pool of free minutes (Config welcome.weekly_free_minutes; weeks run Monday to Sunday, IST). For
// each free call the customer chooses a length (Config welcome.free_call_length_1/_2/_3, e.g. 5, 10
// or 30 min) that fits in what is left this week; the WHOLE chosen length is taken from the pool
// once the conversation starts (Consultation.billingStartedAt — both sides really connected), even
// if the call ends earlier. Free time earns the astrologer nothing from the customer (Astrorize
// compensates them monthly) and is never refunded; after it, the same session continues at the
// astrologer's normal rate if the wallet allows, else it ends.

/**
 * Modes the free call can use: Voice (the spec's allow-list was Audio + Chat; paid chat is no
 * longer offered, and Video and Instant Call stay paid).
 */
export const WELCOME_MODES = ["VOICE"] as const;

/** The period an astrologer's free-call capacity counts over (Astrologer.freeCallsLimitPeriod). */
export type CapacityPeriod = "DAY" | "WEEK";
/** IST calendar periods: the customer's free minutes count per WEEK (Mon–Sun). */
type Period = CapacityPeriod;

/** The free-call lengths the customer may choose from (minutes): the Config options that are on, smallest first. */
function lengthsOf(values: number[]): number[] {
  const on = values.map((n) => Math.floor(n)).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(on)].sort((a, b) => a - b);
}

/** Policy, from the Config console (Admin-approved changes, versioned there). */
export async function welcomePolicy() {
  const [enabled, weekly, len1, len2, len3, reminder, dailyLimit, minMeaningful, maxRestores, maxPerDay, maxPerWeek] = await Promise.all([
    configNumber("welcome.enabled", 1),
    configNumber("welcome.weekly_free_minutes", 30),
    configNumber("welcome.free_call_length_1", 5),
    configNumber("welcome.free_call_length_2", 10),
    configNumber("welcome.free_call_length_3", 30),
    configNumber("welcome.reminder_seconds", 120),
    configNumber("welcome.daily_limit_default", 5),
    configNumber("welcome.min_meaningful_seconds", 30),
    configNumber("welcome.max_fault_restores", 2),
    configNumber("welcome.astrologer_max_per_day", 10),
    configNumber("welcome.astrologer_max_per_week", 50),
  ]);
  return {
    enabled: enabled === 1,
    /** Free minutes each customer (mobile number) gets per Mon–Sun week (IST). */
    weeklyMinutes: Math.max(0, Math.floor(weekly)),
    /** Lengths a free call can be (minutes), smallest first. */
    lengths: lengthsOf([len1, len2, len3]),
    reminderSeconds: reminder,
    dailyLimitDefault: Math.max(0, Math.floor(dailyLimit)),
    minMeaningfulSeconds: minMeaningful,
    maxFaultRestores: maxRestores,
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

/** When the current IST day, or Monday-to-Sunday week, began. */
export function periodStart(period: Period, now = new Date()): Date {
  const key = istDateKey(now);
  if (period === "DAY") return istMidnight(key);
  const weekday = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(istMidnight(key).getTime() - weekday * DAY_MS);
}

/** When the next IST day, or week (Monday 00:00 IST), begins. */
export function periodEnd(period: Period, now = new Date()): Date {
  return new Date(periodStart(period, now).getTime() + (period === "DAY" ? 1 : 7) * DAY_MS);
}

/** "day" | "week" — how the website and portals name a period. */
export const periodName = (p: Period) => p.toLowerCase() as "day" | "week";

// ── The customer's weekly free minutes ──

/** The identity a benefit belongs to: a hash of the verified mobile number (no personal data). */
export function identityKey(phone: string): string {
  return createHash("sha256").update(`astrorize-welcome:${phone.replace(/\D/g, "").slice(-10)}`).digest("hex");
}

// WelcomeBenefit is the identity anchor (one row per mobile number); FreeCallUse rows are the free
// calls that started (minutes = the length chosen). The benefit's state machine:
//   GRANTED   the person may take free calls — as long as a length fits in this week's minutes left
//   RESERVED  a free call request is in flight (consultationId); never two at once
//   REVOKED   no free calls (staff action)
//   CONSUMED  LEGACY only: rows from before allowances were configurable. Their call was copied
//             into FreeCallUse, so they are treated exactly like GRANTED. Normal code paths move
//             them on to GRANTED over time.
// Request → GRANTED/CONSUMED → RESERVED. Conversation starts (billingStartedAt) → a FreeCallUse row
// with the chosen minutes + back to GRANTED. Never starts (cancelled, declined, timed out, the other
// side never joined) → back to GRANTED, nothing counted. A free call that drops in its first seconds
// through no fault of the customer gets its FreeCallUse.restoredAt set (its minutes are given back),
// a bounded number of times per person (WelcomeBenefit.faultRestores).

/** Benefit statuses that may take a free call (minutes permitting). */
const ELIGIBLE = ["GRANTED", "CONSUMED"];

/**
 * Grants the welcome benefit to a customer who has just verified their mobile number. Idempotent:
 * a number that ever had one (even on a deleted account) gets no new row — its weekly minutes keep
 * counting the calls already taken; a returning number is re-linked to the new account unless revoked.
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

/** Free minutes this person has used this week (Mon–Sun, IST; minutes given back after an early drop don't count). */
export async function weeklyMinutesOf(client: Tx | typeof db, key: string, policy: Policy, now = new Date()) {
  const { _sum } = await client.freeCallUse.aggregate({
    where: { identityKey: key, restoredAt: null, usedAt: { gte: periodStart("WEEK", now) } },
    _sum: { minutes: true },
  });
  const used = _sum.minutes ?? 0;
  return {
    total: policy.weeklyMinutes,
    used,
    remaining: Math.max(0, policy.weeklyMinutes - used),
    /** Monday 00:00 IST: the minutes start again. */
    resetsAt: periodEnd("WEEK", now),
  };
}

/** The lengths (minutes) that fit in `remaining`. */
export const lengthsThatFit = (policy: Policy, remaining: number) => policy.lengths.filter((m) => m <= remaining);

/**
 * Whether this customer may start a free call of `minutes` now (their own side only — the
 * astrologer's is freeCallRefusal). Returns the benefit, or a refusal with a message for the customer.
 */
export async function welcomeAvailability(
  tx: Tx,
  userId: string,
  policy: Policy,
  minutes: number,
): Promise<{ ok: true; id: string } | { ok: false; code: string; message: string }> {
  const none = { ok: false as const, code: "WEL_NOT_AVAILABLE", message: "You don't have free minutes to use. You can still consult at the normal rate." };
  const b = await tx.welcomeBenefit.findUnique({ where: { userId } });
  if (!b || !ELIGIBLE.includes(b.status)) return none;
  if (!policy.lengths.includes(minutes)) {
    return { ok: false, code: "WEL_LENGTH_INVALID", message: `Choose a free call of ${policy.lengths.map((m) => `${m}`).join(", ")} minutes.` };
  }
  const { remaining, resetsAt } = await weeklyMinutesOf(tx, b.identityKey, policy);
  if (minutes <= remaining) return { ok: true, id: b.id };
  const fits = lengthsThatFit(policy, remaining);
  return {
    ...none,
    code: "WEL_MINUTES_SHORT",
    message: fits.length
      ? `You have ${remaining} free minute${remaining === 1 ? "" : "s"} left this week — choose ${fits.map((m) => `${m} min`).join(" or ")}.`
      : `You've used this week's free minutes — they reset on ${istDate(resetsAt)}. You can still consult at the normal rate.`,
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
 * week): those whose conversation started in it, plus those requested and about to start, so two
 * customers can't both take the last one. Also says which astrologers have a free call in flight.
 */
async function quotaUsed(client: Tx | typeof db, astrologers: CapacityFields[], policy: Policy, now = new Date()) {
  const used = new Map<string, number>();
  const inFlight = new Set<string>();
  if (!astrologers.length) return { used, inFlight };
  const weekStart = periodStart("WEEK", now);
  const rows = await client.consultation.findMany({
    where: {
      astrologerId: { in: astrologers.map((a) => a.id) },
      billingMode: COMPLIMENTARY,
      OR: [{ billingStartedAt: { gte: weekStart } }, { status: { in: FREE_IN_FLIGHT } }],
    },
    select: { astrologerId: true, status: true, billingStartedAt: true },
  });
  const startOf = new Map(astrologers.map((a) => [a.id, periodStart(capacityOf(a, policy).period, now)]));
  for (const r of rows) {
    if (FREE_IN_FLIGHT.includes(r.status)) inFlight.add(r.astrologerId);
    const counts = r.billingStartedAt ? r.billingStartedAt >= startOf.get(r.astrologerId)! : FREE_IN_FLIGHT.includes(r.status);
    if (counts) used.set(r.astrologerId, (used.get(r.astrologerId) ?? 0) + 1);
  }
  return { used, inFlight };
}

/** Free calls an astrologer has TAKEN (the conversation started) in their current capacity period (IST day or week). */
export async function freeCallsUsed(a: CapacityFields, policy: Policy, now = new Date()): Promise<number> {
  const start = periodStart(capacityOf(a, policy).period, now);
  return db.consultation.count({ where: { astrologerId: a.id, billingMode: COMPLIMENTARY, billingStartedAt: { gte: start } } });
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
    /** Taken this period (today, or this Mon–Sun week, IST). */
    used,
    remaining: Math.max(0, cap.limit - used),
    resetsAt: periodEnd(cap.period, now).toISOString(),
    maxPerDay: policy.maxPerDay,
    maxPerWeek: policy.maxPerWeek,
    /** Lengths a customer can choose for a free call (minutes), and their weekly free minutes. */
    lengths: policy.lengths,
    weeklyMinutes: policy.weeklyMinutes,
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

/** The free call never started (no conversation): nothing is counted and the benefit is the customer's again. */
export function releaseWelcome(tx: Tx | typeof db, consultationId: string) {
  return tx.welcomeBenefit.updateMany({
    where: { consultationId, status: "RESERVED" },
    data: { status: "GRANTED", consultationId: null, reservedAt: null },
  });
}

/**
 * The free call's conversation started (billingStartedAt): the WHOLE chosen length is taken from the
 * person's weekly minutes (a FreeCallUse row, once per consultation) even if the call ends earlier,
 * and the benefit is free for their next one. Safe to run twice.
 */
export async function consumeWelcome(tx: Tx | typeof db, consultationId: string, at = new Date()) {
  const b = await tx.welcomeBenefit.findFirst({ where: { consultationId, status: "RESERVED" }, select: { identityKey: true } });
  if (!b) return;
  const c = await tx.consultation.findUnique({ where: { id: consultationId }, select: { astrologerId: true, complimentarySeconds: true } });
  if (!c) return;
  const minutes = Math.ceil(c.complimentarySeconds / 60);
  await tx.freeCallUse.createMany({ data: [{ identityKey: b.identityKey, consultationId, astrologerId: c.astrologerId, usedAt: at, minutes }], skipDuplicates: true });
  await tx.welcomeBenefit.updateMany({ where: { consultationId, status: "RESERVED" }, data: { status: "GRANTED", consumedAt: at } });
}

/**
 * A free call dropped before it meant anything (under welcome.min_meaningful_seconds) and the
 * customer didn't end it: its minutes are given back, at most welcome.max_fault_restores times per person.
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
 * when the astrologer went offline): the conversation never started → released, started → counted.
 * Runs from the consultation sweep, and before a customer's benefit is shown.
 */
export async function reconcileWelcome(userId?: string) {
  const reserved = await db.welcomeBenefit.findMany({ where: { status: "RESERVED", ...(userId ? { userId } : {}) } });
  for (const b of reserved) {
    if (!b.consultationId) {
      await db.welcomeBenefit.updateMany({ where: { id: b.id, status: "RESERVED" }, data: { status: "GRANTED", reservedAt: null } });
      continue;
    }
    const c = await db.consultation.findUnique({ where: { id: b.consultationId }, select: { status: true, billingStartedAt: true } });
    if (c?.billingStartedAt) await consumeWelcome(db, b.consultationId, c.billingStartedAt);
    else if (!c || NOT_CONNECTED.includes(c.status) || c.status === "ENDED") await releaseWelcome(db, b.consultationId);
  }
}

/** The customer's free minutes as the website shows them, or null when they never had any. */
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
  const week = await weeklyMinutesOf(db, b.identityKey, policy);
  const remaining = eligible ? week.remaining : 0;
  const fits = lengthsThatFit(policy, remaining);
  const status = b.status === "RESERVED" ? "reserved" : b.status === "REVOKED" ? "revoked" : fits.length ? "granted" : "consumed";
  return {
    /** granted (a free call fits in this week's minutes) | reserved (one is being requested) | consumed (none left this week) | revoked */
    status,
    /** True while a free call can be started: the campaign is on and at least one length fits. */
    available: policy.enabled && eligible && fits.length > 0,
    reminderSeconds: policy.reminderSeconds,
    /** Modes it can be used for (Video and Instant Call stay paid). */
    modes: WELCOME_MODES.map((m) => m.toLowerCase()),
    /** This Mon–Sun week's (IST) free minutes. */
    weekly: {
      total: week.total,
      used: week.used,
      remaining,
      /** ISO time they reset: Monday 00:00 IST. */
      resetsAt: week.resetsAt.toISOString(),
    },
    /** The lengths a free call can be (minutes, smallest first); `fits` = it fits in what is left this week. The whole length is used. */
    lengths: policy.lengths.map((minutes) => ({ minutes, fits: minutes <= remaining })),
  };
}
