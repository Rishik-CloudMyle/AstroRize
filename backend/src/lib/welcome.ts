import { createHash } from "node:crypto";
import { db } from "../db.ts";
import type { Astrologer, Prisma } from "../generated/prisma/client.ts";
import { istDateKey } from "./format.ts";
import { effectivePresence } from "./presence.ts";
import { configNumber } from "./settings.ts";

// The welcome campaign (spec AR-WEL): every new customer with a verified mobile number gets ONE
// complimentary consultation. It never expires and is used up only when such a call connects.
// Free time earns the astrologer nothing and is never refunded; after it, the same session
// continues at the astrologer's normal rate if the wallet allows, else it ends.

/** Modes the free call can use (the spec's seed allow-list: Audio + Chat). */
export const WELCOME_MODES = ["CHAT", "VOICE"] as const;

/** Policy, from the Config console (Admin-approved changes, versioned there). */
export async function welcomePolicy() {
  const [enabled, seconds, reminder, dailyLimit, minMeaningful, maxRestores] = await Promise.all([
    configNumber("welcome.enabled", 1),
    configNumber("welcome.complimentary_seconds", 300),
    configNumber("welcome.reminder_seconds", 120),
    configNumber("welcome.daily_limit_default", 5),
    configNumber("welcome.min_meaningful_seconds", 30),
    configNumber("welcome.max_fault_restores", 2),
  ]);
  return {
    enabled: enabled === 1,
    complimentarySeconds: seconds,
    reminderSeconds: reminder,
    dailyLimitDefault: dailyLimit,
    minMeaningfulSeconds: minMeaningful,
    maxFaultRestores: maxRestores,
  };
}

/** The identity a benefit belongs to: a hash of the verified mobile number (no personal data). */
export function identityKey(phone: string): string {
  return createHash("sha256").update(`astrorize-welcome:${phone.replace(/\D/g, "").slice(-10)}`).digest("hex");
}

/**
 * Grants the welcome benefit to a customer who has just verified their mobile number. Idempotent:
 * a number that ever had one (granted, used or revoked — even on a deleted account) gets nothing
 * new; a returning number is re-linked to the new account only if its benefit is still unused.
 */
export async function grantWelcome(userId: string, phone: string, tx: Prisma.TransactionClient = db) {
  const key = identityKey(phone);
  const existing = await tx.welcomeBenefit.findUnique({ where: { identityKey: key } });
  if (existing) {
    if (!existing.userId && existing.status === "GRANTED") {
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

/** Complimentary calls an astrologer has CONNECTED today (IST) — the daily quota counts only these. */
export async function freeCallsToday(astrologerId: string, now = new Date()): Promise<number> {
  const start = new Date(`${istDateKey(now)}T00:00:00+05:30`);
  return db.consultation.count({
    where: { astrologerId, billingMode: "COMPLIMENTARY_THEN_PAID", connectedAt: { gte: start } },
  });
}

// ── Using the free call ──
// GRANTED → RESERVED when a free call is requested → CONSUMED when it connects. A request that
// never connects (cancelled, declined, timed out) gives it back (GRANTED). A free call that drops
// in its first seconds through no fault of the customer is given back too, a bounded number of times.

/** Consultation.billingMode of a welcome call. */
export const COMPLIMENTARY = "COMPLIMENTARY_THEN_PAID";

type Tx = Prisma.TransactionClient;
type Policy = Awaited<ReturnType<typeof welcomePolicy>>;

/** Statuses of a consultation that never connected. */
const NOT_CONNECTED = ["REJECTED", "TIMED_OUT", "CANCELLED"];

/** Start of today in IST. */
const todayStart = (now = new Date()) => new Date(`${istDateKey(now)}T00:00:00+05:30`);

/** Free calls an astrologer takes per day: their own limit, else the campaign default. */
export function dailyLimitOf(a: Pick<Astrologer, "freeCallsDailyLimit">, policy: Policy): number {
  return a.freeCallsDailyLimit ?? policy.dailyLimitDefault;
}

/**
 * Free calls counted against each astrologer's quota today: those connected today (IST) plus
 * those requested and about to connect, so two customers can't both take the last one.
 */
async function quotaUsed(client: Tx | typeof db, astrologerIds: string[], now = new Date()): Promise<Map<string, number>> {
  const used = new Map<string, number>();
  if (!astrologerIds.length) return used;
  const rows = await client.consultation.findMany({
    where: {
      astrologerId: { in: astrologerIds },
      billingMode: COMPLIMENTARY,
      OR: [{ connectedAt: { gte: todayStart(now) } }, { status: { in: ["REQUESTED", "CONNECTING"] } }],
    },
    select: { astrologerId: true },
  });
  for (const r of rows) used.set(r.astrologerId, (used.get(r.astrologerId) ?? 0) + 1);
  return used;
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
  const used = (await quotaUsed(client, [a.id])).get(a.id) ?? 0;
  if (used >= dailyLimitOf(a, policy)) {
    return { code: "WEL_DAILY_LIMIT", message: `${a.name} has taken all of today's free calls. Try another astrologer marked “Free call”.` };
  }
  return null;
}

/** The astrologers (of these) a customer can take a free call with right now: taking part, available, quota left. */
export async function freeCallOpen(astrologers: Astrologer[]): Promise<Set<string>> {
  const open = new Set<string>();
  const candidates = astrologers.filter((a) => a.freeCallsEnabled && effectivePresence(a) === "ON");
  if (!candidates.length) return open;
  const policy = await welcomePolicy();
  if (!policy.enabled) return open;
  const used = await quotaUsed(db, candidates.map((a) => a.id));
  for (const a of candidates) if ((used.get(a.id) ?? 0) < dailyLimitOf(a, policy)) open.add(a.id);
  return open;
}

/** Puts the customer's benefit on hold for a free call being requested. False when it isn't GRANTED. */
export async function reserveWelcome(tx: Tx, userId: string, consultationId: string): Promise<boolean> {
  const { count } = await tx.welcomeBenefit.updateMany({
    where: { userId, status: "GRANTED" },
    data: { status: "RESERVED", consultationId, reservedAt: new Date() },
  });
  return count === 1;
}

/** The free call never connected: the benefit is the customer's again. */
export function releaseWelcome(tx: Tx | typeof db, consultationId: string) {
  return tx.welcomeBenefit.updateMany({
    where: { consultationId, status: "RESERVED" },
    data: { status: "GRANTED", consultationId: null, reservedAt: null },
  });
}

/** The free call connected: the benefit is used up. */
export function consumeWelcome(tx: Tx | typeof db, consultationId: string, at = new Date()) {
  return tx.welcomeBenefit.updateMany({ where: { consultationId, status: "RESERVED" }, data: { status: "CONSUMED", consumedAt: at } });
}

/**
 * A free call dropped before it meant anything (under welcome.min_meaningful_seconds) and the
 * customer didn't end it: give the benefit back, at most welcome.max_fault_restores times.
 * Returns true when it was given back.
 */
export async function restoreAfterFault(tx: Tx, consultationId: string, policy: Policy): Promise<boolean> {
  const b = await tx.welcomeBenefit.findFirst({ where: { consultationId, status: "CONSUMED" } });
  if (!b || b.faultRestores >= policy.maxFaultRestores) return false;
  const { count } = await tx.welcomeBenefit.updateMany({
    where: { id: b.id, status: "CONSUMED" },
    data: { status: "GRANTED", consultationId: null, reservedAt: null, consumedAt: null, faultRestores: { increment: 1 } },
  });
  return count === 1;
}

/**
 * Settles benefits left RESERVED by a request that has since finished elsewhere (e.g. timed out
 * when the astrologer went offline): never connected → GRANTED, connected → CONSUMED.
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

/** The customer's free call as the website shows it, or null when they never had one. */
export async function welcomeView(userId: string) {
  let b = await benefitOf(userId);
  if (!b) return null;
  if (b.status === "RESERVED") {
    await reconcileWelcome(userId);
    b = await benefitOf(userId);
    if (!b) return null;
  }
  const policy = await welcomePolicy();
  return {
    /** granted | reserved | consumed | revoked */
    status: b.status.toLowerCase(),
    /** True while it can be used to start a free call. */
    available: policy.enabled && b.status === "GRANTED",
    freeSeconds: policy.complimentarySeconds,
    reminderSeconds: policy.reminderSeconds,
    /** Modes it can be used for (Video and Instant Call stay paid). */
    modes: WELCOME_MODES.map((m) => m.toLowerCase()),
  };
}
