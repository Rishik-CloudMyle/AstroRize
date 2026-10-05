import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { ageLabel, istDayMonth, istStamp } from "../../lib/format.ts";
import { CAPABILITIES, actorName, requireCapability, requirePage } from "../../lib/rbac.ts";
import { configNumber, getSetting, putSetting } from "../../lib/settings.ts";

export const governanceRouter = Router();

// ── Live monitoring ──

const OBSERVER_CAPACITY = 25;
const LEASE_SECONDS = 600;

governanceRouter.get("/monitoring", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const now = new Date();
  // Expired leases free their capacity.
  await db.observerLease.updateMany({ where: { releasedAt: null, expiresAt: { lt: now } }, data: { releasedAt: now } });
  const [targets, active, mine, risk, baseUsed] = await Promise.all([
    db.monitorTarget.findMany({ orderBy: { startedAt: "asc" } }),
    db.observerLease.count({ where: { releasedAt: null } }),
    db.observerLease.findFirst({ where: { adminId: admin.user.id, releasedAt: null } }),
    getSetting<{ label: string; pct: string; count: string }[]>("monitoring.risk", []),
    getSetting<number>("monitoring.baseObservers", 0),
  ]);
  const order = ["CRITICAL", "HIGH", "PROMOTED", "PRIVATE", "SAMPLING"];
  res.json({
    monitoring: {
      capacity: { used: baseUsed + active, total: OBSERVER_CAPACITY },
      queue: targets
        .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))
        .map((t) => ({ id: t.id, band: t.band, astro: t.astroLabel, reason: t.reason, age: ageLabel(t.startedAt, now, "long"), denied: t.denied })),
      risk,
      myLease: mine ? { id: mine.id, targetId: mine.targetId, secondsLeft: Math.max(0, Math.floor((mine.expiresAt.getTime() - now.getTime()) / 1000)) } : null,
    },
  });
});

governanceRouter.post("/monitoring/:id/join", async (req, res) => {
  requirePage(req, "compliance");
  const admin = requireCapability(req, "live.observer.join");
  const { breakGlass, justification } = z
    .object({ breakGlass: z.boolean().default(false), justification: z.string().trim().max(500).optional() })
    .parse(req.body ?? {});
  const target = await db.monitorTarget.findUnique({ where: { id: String(req.params.id) } });
  if (!target) throw notFound("Live session not found.");
  if (target.denied) throw forbidden("Denied — this is a private consultation. Observers can never join a private live.");
  if (breakGlass && (!justification || justification.length < 10)) throw forbidden("Break-glass access needs a written justification.");
  const now = new Date();
  await db.observerLease.updateMany({ where: { adminId: admin.user.id, releasedAt: null }, data: { releasedAt: now } });
  const [active, baseUsed] = await Promise.all([
    db.observerLease.count({ where: { releasedAt: null, expiresAt: { gt: now } } }),
    getSetting<number>("monitoring.baseObservers", 0),
  ]);
  if (baseUsed + active >= OBSERVER_CAPACITY) throw conflict("Observer capacity is full — you're in line and will join when a seat frees up.");
  const lease = await db.observerLease.create({
    data: { adminId: admin.user.id, adminName: actorName(admin), targetId: target.id, breakGlass, expiresAt: new Date(now.getTime() + LEASE_SECONDS * 1000) },
  });
  await audit(admin, breakGlass ? "live.observer.break_glass" : "live.observer.join", target.id, "— → OBSERVING", { breakGlass });
  res.json({ lease: { id: lease.id, targetId: target.id, secondsLeft: LEASE_SECONDS } });
});

governanceRouter.post("/monitoring/leases/:id/release", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const lease = await db.observerLease.findUnique({ where: { id: String(req.params.id) } });
  if (!lease || lease.adminId !== admin.user.id) throw notFound("Lease not found.");
  if (!lease.releasedAt) await db.observerLease.update({ where: { id: lease.id }, data: { releasedAt: new Date() } });
  await audit(admin, "live.observer.leave", lease.targetId, "OBSERVING → —");
  res.json({ ok: true });
});

governanceRouter.post("/monitoring/:id/flag", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const { label } = z.object({ label: z.string().trim().min(2).max(80) }).parse(req.body);
  const target = await db.monitorTarget.findUnique({ where: { id: String(req.params.id) } });
  if (!target) throw notFound("Live session not found.");
  await audit(admin, "live.observer.flag", target.id, label);
  res.json({ ok: true });
});

// ── Trust & reviews ──

const REASON_CODES = ["R-01 Off-topic", "R-02 Abusive", "R-04 Policy violation", "R-07 Not a verified consultation"];

governanceRouter.get("/trust", async (req, res) => {
  requirePage(req, "trust");
  const now = new Date();
  const undoMins = await configNumber("trust.review.removal_undo_mins", 30);
  // Soft-hidden reviews past the undo window become permanently removed.
  await db.review.updateMany({
    where: { status: "SOFT_HIDDEN", hiddenAt: { lt: new Date(now.getTime() - undoMins * 60000) } },
    data: { status: "REMOVED" },
  });
  const [queue, density, sampleFloor] = await Promise.all([
    db.review.findMany({ where: { status: { in: ["FLAGGED", "SOFT_HIDDEN"] } }, orderBy: { createdAt: "desc" } }),
    getSetting("trust.density", { value: 0, target: 100 }),
    getSetting("trust.sampleFloor", { floor: "", below: "" }),
  ]);
  res.json({
    trust: {
      queue: queue.map((r) => ({
        id: r.id,
        stars: "★".repeat(r.stars) + "☆".repeat(5 - r.stars),
        flag: r.flag ?? "",
        when: istDayMonth(r.createdAt),
        astro: r.astrologerName,
        text: r.text,
        status: r.status,
        hiddenUndoLeft:
          r.status === "SOFT_HIDDEN" && r.hiddenAt
            ? `${Math.max(0, undoMins - Math.floor((now.getTime() - r.hiddenAt.getTime()) / 60000))} min`
            : undefined,
      })),
      reasonCodes: REASON_CODES,
      undoWindow: `${undoMins} min`,
      density,
      sampleFloor,
    },
  });
});

governanceRouter.post("/reviews/:id/remove", async (req, res) => {
  const admin = requirePage(req, "trust");
  const { reason } = z.object({ reason: z.enum(REASON_CODES as [string, ...string[]]) }).parse(req.body);
  const r = await db.review.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound("Review not found.");
  if (r.status === "SOFT_HIDDEN" || r.status === "REMOVED") throw conflict("This review is already hidden.");
  await db.review.update({ where: { id: r.id }, data: { status: "SOFT_HIDDEN", hiddenAt: new Date(), removedReason: reason, moderatedBy: actorName(admin) } });
  await audit(admin, "review.remove", r.id, `${r.status} → SOFT_HIDDEN · ${reason.split(" ")[0]}`);
  res.json({ ok: true });
});

governanceRouter.post("/reviews/:id/restore", async (req, res) => {
  const admin = requirePage(req, "trust");
  const r = await db.review.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound("Review not found.");
  if (r.status !== "SOFT_HIDDEN") throw conflict("Only a review inside its undo window can be restored.");
  await db.review.update({ where: { id: r.id }, data: { status: "VISIBLE", hiddenAt: null, removedReason: null, flag: null } });
  await audit(admin, "review.restore", r.id, "SOFT_HIDDEN → VISIBLE");
  res.json({ ok: true });
});

governanceRouter.post("/reviews/:id/keep", async (req, res) => {
  const admin = requirePage(req, "trust");
  const r = await db.review.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound("Review not found.");
  if (r.status !== "FLAGGED") throw conflict("This review isn't waiting for a decision.");
  await db.review.update({ where: { id: r.id }, data: { status: "VISIBLE", flag: null, moderatedBy: actorName(admin) } });
  await audit(admin, "review.keep", r.id, "FLAGGED → VISIBLE");
  res.json({ ok: true });
});

// ── RBAC ──

const ROLE_ORDER = ["super", "finance", "support", "compliance"] as const;

governanceRouter.get("/rbac", async (req, res) => {
  requirePage(req, "rbac");
  const conflictCase = await getSetting("rbac.conflict", null as null | { user: string; requested: string; existing: string; alternative: string; resolved?: string });
  res.json({
    rbac: {
      roles: ["Super", "Finance", "Support", "Compliance"],
      matrix: CAPABILITIES.map((c) => ({ key: c.key, grants: ROLE_ORDER.map((r) => c.roles.includes(r)) })),
      conflict: conflictCase,
    },
  });
});

governanceRouter.post("/rbac/conflict/:action", async (req, res) => {
  const admin = requirePage(req, "rbac");
  const action = z.enum(["revoke", "grant-alternative"]).parse(req.params.action);
  const c = await getSetting("rbac.conflict", null as null | { user: string; requested: string; existing: string; alternative: string; resolved?: string });
  if (!c || c.resolved) throw conflict("There is no open separation-of-duties conflict.");
  await putSetting("rbac.conflict", { ...c, resolved: action });
  if (action === "revoke") await audit(admin, "rbac.capability.revoke", `user:${c.user}`, `${c.existing} → —`);
  else await audit(admin, "rbac.capability.grant", `user:${c.user}`, `— → ${c.alternative}`);
  res.json({ ok: true });
});

// ── Audit log ──

const LANES: Record<string, (action: string, breakGlass: boolean) => boolean> = {
  all: () => true,
  "break-glass": (_a, bg) => bg,
  config: (a) => a.startsWith("config."),
  money: (a) => a.startsWith("payout.") || a.startsWith("dispute.") || a.startsWith("wallet."),
  access: (a) => a.startsWith("rbac.") || a.startsWith("live.observer"),
};

governanceRouter.get("/audit", async (req, res) => {
  requirePage(req, "audit");
  const lane = typeof req.query.lane === "string" && LANES[req.query.lane] ? req.query.lane : "all";
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const rows = await db.auditLog.findMany({ orderBy: { at: "desc" }, take: 500 });
  res.json({
    entries: rows
      .filter((r) => LANES[lane]!(r.action, r.breakGlass))
      .filter((r) => !q || [r.actorName, r.action, r.object, r.diff].some((v) => v.toLowerCase().includes(q)))
      .slice(0, 200)
      .map((r) => ({ ts: istStamp(r.at), actor: r.actorName, action: r.action, object: r.object, diff: r.diff, corr: r.correlation, breakGlass: r.breakGlass })),
  });
});

/** CSV export of the audit log (the export itself is audited). */
governanceRouter.get("/audit/export", async (req, res) => {
  const admin = requirePage(req, "audit");
  const rows = await db.auditLog.findMany({ orderBy: { at: "desc" } });
  await audit(admin, "audit.export", "audit_log", `${rows.length} rows`);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ["timestamp_ist,actor,action,object,before_after,correlation,break_glass"]
    .concat(rows.map((r) => [istStamp(r.at), r.actorName, r.action, r.object, r.diff, r.correlation, String(r.breakGlass)].map(esc).join(",")))
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="astrorize-audit-log.csv"');
  res.send(csv);
});

// ── Recording ──

governanceRouter.get("/recording", async (req, res) => {
  requirePage(req, "recording");
  const [modalities, checklist] = await Promise.all([
    db.recordingModality.findMany({ orderBy: { rank: "asc" } }),
    getSetting("recording.checklist", { title: "", body: "", complete: false }),
  ]);
  res.json({ recording: { checklist, modalities: modalities.map((m) => ({ mode: m.mode, note: m.note, retention: m.retention, status: m.status })) } });
});

governanceRouter.patch("/recording/:mode", async (req, res) => {
  const admin = requirePage(req, "recording");
  const { status } = z.object({ status: z.enum(["enabled", "disabled"]) }).parse(req.body);
  const checklist = await getSetting("recording.checklist", { complete: false } as { complete?: boolean });
  if (!checklist.complete) throw conflict("Recording toggles stay disabled until the cost & capability submission is complete.");
  const m = await db.recordingModality.findUnique({ where: { mode: String(req.params.mode) } });
  if (!m) throw notFound("Unknown recording type.");
  if (m.status === "blocked") throw conflict(`${m.mode} recording is blocked: ${m.note}.`);
  await db.recordingModality.update({ where: { mode: m.mode }, data: { status } });
  await audit(admin, "recording.toggle", m.mode, `${m.status} → ${status}`);
  res.json({ ok: true });
});
