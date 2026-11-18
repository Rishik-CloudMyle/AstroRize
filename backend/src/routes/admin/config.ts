import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istDate } from "../../lib/format.ts";
import { configNumber, discountLimits } from "../../lib/settings.ts";
import { getPackages, packageProblem, savePackages } from "../../lib/fixed-packages.ts";
import { actorName, requireCapability, requirePage, secondPerson } from "../../lib/rbac.ts";

// Config console: every operational setting, changed by draft → second approver → new version.
export const configRouter = Router();

const NUMBER = /^-?\d+(?:\.\d+)?$/;
/** Decimal keys (bounds like "1.0–6.0") take at most this many decimal places. */
const MAX_DECIMALS = 2;

interface Range {
  min: number;
  max: number;
  /** True when the bounds are whole numbers ("0–100"): the value must be one too. */
  integer: boolean;
  /** Decimal places written in the bounds ("1.0–6.0" → 1); values are padded to at least this. */
  decimals: number;
}

const decimalsOf = (n: string) => n.split(".")[1]?.length ?? 0;

/** Parses bounds like "0–100" or "1.0–6.0" (en dash, em dash or hyphen). Null when malformed. */
export function parseBounds(bounds: string): Range | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(bounds);
  if (!m) return null;
  const [, lo, hi] = m as unknown as [string, string, string];
  const min = Number(lo);
  const max = Number(hi);
  if (min > max) return null;
  const decimals = Math.max(decimalsOf(lo), decimalsOf(hi));
  return { min, max, integer: decimals === 0, decimals };
}

/**
 * Checks a proposed value against the key's range and returns it in the key's format
 * ("3" for a "1.0–6.0" key becomes "3.0"). Throws a message the console shows as is.
 */
function normaliseValue(raw: string, bounds: string): string {
  const range = parseBounds(bounds);
  if (!range) throw conflict("This setting has no valid range configured, so it can't be changed here.");
  const value = raw.trim();
  if (!NUMBER.test(value)) throw badRequest(`Enter a number${range.integer ? "" : " (use a dot for decimals)"} — allowed ${bounds}.`);
  const places = decimalsOf(value.replace(/0+$/, "").replace(/\.$/, ""));
  if (range.integer && places > 0) throw badRequest(`Use a whole number for this setting — allowed ${bounds}.`);
  if (!range.integer && places > MAX_DECIMALS) throw badRequest(`Use at most ${MAX_DECIMALS} decimal places — allowed ${bounds}.`);
  const n = Number(value);
  if (n < range.min || n > range.max) throw badRequest(`Out of range — allowed ${bounds}.`);
  return range.integer ? String(n) : n.toFixed(Math.max(range.decimals, places));
}

async function keyView(key: string) {
  const k = await db.configKey.findUnique({ where: { key } });
  if (!k) throw notFound("Unknown config key.");
  const [history, pending] = await Promise.all([
    db.configChange.findMany({ where: { key, status: { in: ["APPROVED", "ROLLED_BACK"] } }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.configChange.findFirst({ where: { key, status: "SUBMITTED" }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    key: k.key,
    version: k.version,
    since: istDate(k.updatedAt),
    pending: pending
      ? {
          id: pending.id,
          toValue: pending.toValue,
          draftedBy: pending.draftedByName,
          draftedById: pending.draftedById,
          effective: pending.effectiveAt ? istDate(pending.effectiveAt) : null,
        }
      : null,
    history: history.map((h) => ({
      version: h.version,
      value: h.toValue,
      draftedBy: h.draftedByName,
      approvedBy: h.approvedByName ?? "—",
      when: istDate(h.createdAt),
    })),
  };
}

/** Settings replaced by newer ones: kept in the database for history, no longer listed or used. */
const RETIRED_KEYS = ["welcome.free_call_length_1", "welcome.free_call_length_2", "welcome.free_call_length_3", "marketing.campaign.max_discount_pct", ...[5, 10, 15, 30, 45, 60].map((m) => `fixed_session.discount_${m}m`)];

/** Rules that tie settings together, so every domain follows the same limits. */
async function keyRules(key: string, n: number) {
  if (key === "welcome.joining_bonus_minutes" && (!Number.isInteger(n) || n < 1 || n > 30 || n === 10 || n === 20)) {
    throw badRequest("The 1-time welcome call can be 1–30 whole minutes, but not 10 or 20 (those are the weekly free-call lengths).");
  }
  if (key === "welcome.free_call_minutes" && n !== 10 && n !== 20) throw badRequest("A free call can be 10 or 20 minutes — nothing else.");
  if (key.startsWith("fixed_session.discount_") || key.startsWith("offers.")) {
    const l = await discountLimits();
    if (key.startsWith("fixed_session.discount_") && (n < l.min || n > l.max)) {
      throw badRequest(`Package discounts must stay within the platform offer range, ${l.min}%–${l.max}% (offers.min_discount_pct is the floor, offers.max_discount_pct the ceiling).`);
    }
    if (key === "offers.min_discount_pct" || key === "offers.max_discount_pct") {
      // The floor and ceiling can't be moved past a Fixed Session package that already sits on the wrong side.
      for (const p of await getPackages()) {
        if (key === "offers.min_discount_pct" && p.discount < n) throw badRequest(`The ${p.minutes}-minute Fixed Session discount is ${p.discount}% — below ${n}%. Raise that package first.`);
        if (key === "offers.max_discount_pct" && p.discount > n) throw badRequest(`The ${p.minutes}-minute Fixed Session discount is ${p.discount}% — above ${n}%. Lower that package first.`);
      }
    }
    if (key === "offers.min_discount_pct" && n > l.max) throw badRequest(`The smallest offer can't be above the largest (${l.max}%).`);
    if (key === "offers.max_discount_pct" && n < l.min) throw badRequest(`The largest offer can't be below the smallest (${l.min}%).`);
  }
  if (key === "pricing.min_rate" && n > (await configNumber("pricing.max_rate", 500))) throw badRequest("The lowest price can't be above the highest price.");
  if (key === "pricing.max_rate" && n < (await configNumber("pricing.min_rate", 5))) throw badRequest("The highest price can't be below the lowest price.");
}

configRouter.get("/config", async (req, res) => {
  requirePage(req, "config");
  const [keys, open] = await Promise.all([
    db.configKey.findMany({ where: { key: { notIn: RETIRED_KEYS } }, orderBy: { rank: "asc" } }),
    db.configChange.findMany({ where: { status: "SUBMITTED" }, select: { key: true } }),
  ]);
  // Keys with a change waiting for a second approver (for the "Needs approval first" sort).
  const pending = new Set(open.map((c) => c.key));
  res.json({
    keys: keys.map((k) => ({
      key: k.key,
      flagged: k.flagged,
      description: k.description,
      current: k.value,
      scope: k.scope,
      bounds: k.bounds,
      dryRun: k.dryRun,
      domain: k.domain,
      version: k.version,
      range: parseBounds(k.bounds),
      pending: pending.has(k.key),
      changed: istDate(k.updatedAt),
      changedAt: k.updatedAt.toISOString(),
    })),
  });
});

configRouter.get("/config/:key", async (req, res, next) => {
  // "fixed-sessions" and "free-calls" are their own routes (declared further down), not Config keys.
  if (req.params.key === "fixed-sessions" || req.params.key === "free-calls") return next();
  requirePage(req, "config");
  res.json({ detail: await keyView(String(req.params.key)) });
});

/** Draft a new value and submit it for a second approver. */
configRouter.post("/config/:key/draft", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write");
  const { value: raw } = z
    .object({ value: z.string({ error: "Enter the proposed value." }).trim().min(1, "Enter the proposed value.").max(40, "That value is too long.") })
    .parse(req.body ?? {});
  const k = await db.configKey.findUnique({ where: { key: String(req.params.key) } });
  if (!k) throw notFound("Unknown config key.");
  const value = normaliseValue(raw, k.bounds);
  await keyRules(k.key, Number(value));
  if (Number(value) === Number(k.value)) throw badRequest(`${k.value} is already the current value. Enter a different one.`);
  const open = await db.configChange.findFirst({ where: { key: k.key, status: "SUBMITTED" } });
  if (open) throw conflict("A change to this key is already waiting for approval.");
  const change = await db.configChange.create({
    data: {
      key: k.key,
      fromValue: k.value,
      toValue: value,
      status: "SUBMITTED",
      draftedById: admin.user.id,
      draftedByName: actorName(admin),
      effectiveAt: new Date(Date.now() + 86400000),
    },
  });
  await audit(admin, "config.draft.submit", k.key, `${k.value} → ${value}`);
  res.status(201).json({ changeId: change.id, detail: await keyView(k.key) });
});

/** A different person approves; the new value becomes a new version. */
configRouter.post("/config/changes/:id/approve", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write");
  const change = await db.configChange.findUnique({ where: { id: String(req.params.id) } });
  if (!change || change.status !== "SUBMITTED") throw notFound("No change waiting for approval.");
  // Two-person rule; a Super Admin may approve their own draft (audited as self-approved).
  const self = secondPerson(admin, change.draftedById === admin.user.id, "Blocked — you drafted this change. A different approver is required.");
  const k = await db.configKey.findUniqueOrThrow({ where: { key: change.key } });
  // The draft was made against the value then in force; if that changed (e.g. a rollback), it must be redrafted.
  if (Number(k.value) !== Number(change.fromValue)) {
    throw conflict(`This draft changes ${change.fromValue}, but the setting is now ${k.value}. Reject it and draft the change again.`);
  }
  const version = k.version + 1;
  await db.$transaction(async (tx) => {
    // Once only, even if two approvers click at the same moment.
    const { count } = await tx.configChange.updateMany({
      where: { id: change.id, status: "SUBMITTED" },
      data: { status: "APPROVED", version, approvedById: admin.user.id, approvedByName: actorName(admin) },
    });
    if (!count) throw conflict("This change was just approved or rejected by someone else.");
    await tx.configKey.update({ where: { key: k.key }, data: { value: change.toValue, version, updatedAt: new Date() } });
  });
  await audit(admin, "config.change.approve", k.key, `${change.fromValue} → ${change.toValue} (v${version})${self}`);
  res.json({ detail: await keyView(k.key) });
});

configRouter.post("/config/changes/:id/reject", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write");
  const change = await db.configChange.findUnique({ where: { id: String(req.params.id) } });
  if (!change || change.status !== "SUBMITTED") throw notFound("No change waiting for approval.");
  const { count } = await db.configChange.updateMany({
    where: { id: change.id, status: "SUBMITTED" },
    data: { status: "REJECTED", approvedById: admin.user.id, approvedByName: actorName(admin) },
  });
  if (!count) throw conflict("This change was just approved or rejected by someone else.");
  await audit(admin, "config.change.reject", change.key, `${change.fromValue} → ${change.toValue}`);
  res.json({ detail: await keyView(change.key) });
});

/** Roll back to the previous value. This creates a new version; history is never rewritten. */
configRouter.post("/config/:key/rollback", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write");
  const k = await db.configKey.findUnique({ where: { key: String(req.params.key) } });
  if (!k) throw notFound("Unknown config key.");
  const last = await db.configChange.findFirst({ where: { key: k.key, status: "APPROVED" }, orderBy: { createdAt: "desc" } });
  if (!last) throw conflict("There is no earlier version to roll back to.");
  // A rollback undoes the latest approved change once; rolling back again would change nothing.
  if (Number(last.fromValue) === Number(k.value)) {
    throw conflict(`${k.key} is already at ${k.value}, the value before its latest approved change.`);
  }
  if (await db.configChange.findFirst({ where: { key: k.key, status: "SUBMITTED" } })) {
    throw conflict("A change to this key is waiting for approval. Approve or reject it before rolling back.");
  }
  const version = k.version + 1;
  await db.$transaction([
    db.configChange.create({
      data: {
        key: k.key,
        fromValue: k.value,
        toValue: last.fromValue,
        status: "ROLLED_BACK",
        version,
        draftedById: admin.user.id,
        draftedByName: actorName(admin),
        approvedById: admin.user.id,
        approvedByName: actorName(admin),
      },
    }),
    db.configKey.update({ where: { key: k.key }, data: { value: last.fromValue, version, updatedAt: new Date() } }),
  ]);
  await audit(admin, "config.rollback", k.key, `${k.value} → ${last.fromValue} (v${version})`);
  res.json({ restoredFrom: last.version ? last.version - 1 : null, detail: await keyView(k.key) });
});

/** Admin: the Fixed Session packages (length + discount) and the allowed discount range. */
configRouter.get("/config/fixed-sessions", async (req, res) => {
  requirePage(req, "config");
  const [packages, limits] = await Promise.all([getPackages(), discountLimits()]);
  res.json({ packages, limits, durations: packages.map((p) => p.minutes), discounts: Object.fromEntries(packages.map((p) => [p.minutes, p.discount])) });
});

/**
 * Admin: replace the whole list of Fixed Session packages — add a length, change a discount or delete
 * a length by sending the list as it should be. Anything outside the platform offer range is refused.
 */
configRouter.put("/config/fixed-sessions", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write");
  const { packages } = z
    .object({ packages: z.array(z.object({ minutes: z.number({ error: "Enter the length in minutes." }), discount: z.number({ error: "Enter the discount percent." }) })) })
    .parse(req.body);
  const problem = await packageProblem(packages);
  if (problem) throw badRequest(problem);
  const before = await getPackages();
  const saved = await savePackages(packages);
  const fmt = (l: { minutes: number; discount: number }[]) => l.map((p) => `${p.minutes}m@${p.discount}%`).join(", ");
  await audit(admin, "config.fixed_sessions.update", "fixed_sessions", `${fmt(before)} → ${fmt(saved)}`);
  res.json({ ok: true, packages: saved });
});

// ── Free calls: one page for everything about free minutes ──

const FREE_KEYS = {
  enabled: "welcome.enabled",
  weeklyMinutes: "welcome.weekly_free_minutes",
  lengthMinutes: "welcome.free_call_minutes",
  chooseLength: "welcome.choose_length",
  oneTimeEnabled: "welcome.onetime_enabled",
  oneTimeMinutes: "welcome.joining_bonus_minutes",
  dailyLimit: "welcome.daily_limit_default",
  weeklyLimit: "welcome.astrologer_max_per_week",
  reminderSeconds: "welcome.reminder_seconds",
} as const;
const FREE_DEFAULTS: Record<keyof typeof FREE_KEYS, number> = { enabled: 1, weeklyMinutes: 30, lengthMinutes: 10, chooseLength: 0, oneTimeEnabled: 1, oneTimeMinutes: 5, dailyLimit: 5, weeklyLimit: 50, reminderSeconds: 120 };

configRouter.get("/config/free-calls", async (req, res) => {
  requirePage(req, "config");
  const entries = await Promise.all(
    (Object.keys(FREE_KEYS) as (keyof typeof FREE_KEYS)[]).map(async (k) => [k, await configNumber(FREE_KEYS[k], FREE_DEFAULTS[k])] as const),
  );
  res.json(Object.fromEntries(entries));
});

/** Admin: set every free-call rule at once. Each value is checked; nothing is saved unless all are valid. */
configRouter.put("/config/free-calls", async (req, res) => {
  requirePage(req, "config");
  const admin = requireCapability(req, "config.write");
  const int = (label: string, min: number, max: number) => z.number({ error: `Enter ${label}.` }).int(`${label} must be a whole number.`).min(min, `${label} must be at least ${min}.`).max(max, `${label} can be at most ${max}.`);
  const v = z
    .object({
      enabled: int("on or off", 0, 1),
      weeklyMinutes: int("the weekly free minutes", 0, 600),
      lengthMinutes: int("the free-call length", 10, 20),
      chooseLength: int("on or off for choosing the length", 0, 1),
      oneTimeEnabled: int("on or off for the 1-time call", 0, 1),
      oneTimeMinutes: int("the 1-time call length", 1, 30),
      dailyLimit: int("the daily limit per astrologer", 0, 50),
      weeklyLimit: int("the weekly limit per astrologer", 0, 500),
      reminderSeconds: int("the reminder time", 30, 300),
    })
    .parse(req.body);
  await keyRules(FREE_KEYS.lengthMinutes, v.lengthMinutes);
  await keyRules(FREE_KEYS.oneTimeMinutes, v.oneTimeMinutes);
  if (v.weeklyMinutes !== 0 && v.weeklyMinutes < v.lengthMinutes) throw badRequest(`Weekly free minutes (${v.weeklyMinutes}) must cover at least one free call of ${v.lengthMinutes} minutes — or be 0 to stop free calls.`);
  if (v.chooseLength === 1 && v.weeklyMinutes !== 0 && v.weeklyMinutes < 20) throw badRequest("To let customers choose between 10 and 20 minutes, weekly free minutes must be at least 20.");
  const before = await getFreeCalls();
  for (const k of Object.keys(FREE_KEYS) as (keyof typeof FREE_KEYS)[]) {
    if (before[k] === v[k]) continue;
    await db.configKey.update({ where: { key: FREE_KEYS[k] }, data: { value: String(v[k]), version: { increment: 1 }, updatedAt: new Date() } });
  }
  const changed = (Object.keys(FREE_KEYS) as (keyof typeof FREE_KEYS)[]).filter((k) => before[k] !== v[k]).map((k) => `${FREE_KEYS[k]} ${before[k]} → ${v[k]}`);
  if (changed.length) await audit(admin, "config.free_calls.update", "free_calls", changed.join(" · "));
  res.json({ ok: true, ...v });
});

async function getFreeCalls() {
  const out = {} as Record<keyof typeof FREE_KEYS, number>;
  for (const k of Object.keys(FREE_KEYS) as (keyof typeof FREE_KEYS)[]) out[k] = await configNumber(FREE_KEYS[k], FREE_DEFAULTS[k]);
  return out;
}
