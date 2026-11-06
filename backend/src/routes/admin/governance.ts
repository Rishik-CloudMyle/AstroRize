import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istDayMonth, istStamp } from "../../lib/format.ts";
import {
  CAPABILITIES,
  CAPABILITY_LOCKS,
  MATRIX_SETTING,
  PAGE_LABELS,
  PAGE_LOCKS,
  PAGE_ORDER,
  ROLE_LABELS,
  ROLE_ORDER,
  SEPARATION_OF_DUTIES,
  SUPER_LOCK_REASON,
  actorName,
  capabilitiesOf,
  defaultMatrix,
  invalidateMatrix,
  loadMatrix,
  matrixDiff,
  normalise,
  requireCapability,
  requirePage,
  type AdminRoleKey,
  type Lock,
  type Matrix,
  type PageKey,
  type StoredMatrix,
} from "../../lib/rbac.ts";
import {
  RETENTION_DEFAULT_DAYS,
  RETENTION_MAX_DAYS,
  RETENTION_MIN_DAYS,
  RETENTION_SETTING,
  lastPurge,
  retentionPolicy,
} from "../../lib/retention.ts";
import { configNumber, putSetting } from "../../lib/settings.ts";
import { zegoConfigured } from "../../lib/zego.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

export const governanceRouter = Router();

// ── Trust & reviews ──

const REASON_CODES = ["R-01 Off-topic", "R-02 Abusive", "R-04 Policy violation", "R-07 Not a verified consultation"];
/** "Other": the moderator writes the reason themselves (stored and audited like a preset one). */
const OTHER_REASON = "Other";
const OTHER_REASON_MIN = 10;
const OTHER_REASON_MAX = 300;

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
    consultationDensity(),
    sampleFloorStatus(),
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
        /** Why it was removed, while it is inside its undo window. */
        reason: r.status === "SOFT_HIDDEN" ? r.removedReason : null,
        hiddenUndoLeft:
          r.status === "SOFT_HIDDEN" && r.hiddenAt
            ? `${Math.max(0, undoMins - Math.floor((now.getTime() - r.hiddenAt.getTime()) / 60000))} min`
            : undefined,
      })),
      reasonCodes: REASON_CODES,
      otherReason: { code: OTHER_REASON, min: OTHER_REASON_MIN, max: OTHER_REASON_MAX },
      undoWindow: `${undoMins} min`,
      density,
      sampleFloor,
    },
  });
});

/** A consultation that really happened: it connected and was settled. */
const COMPLETED = { status: "ENDED", connectedAt: { not: null } } satisfies Prisma.ConsultationWhereInput;

/**
 * Recommendation engine density gate: completed consultations on the platform so far, against
 * the target in Config "trust.recommendation.min_consultations".
 */
async function consultationDensity() {
  const [value, target] = await Promise.all([
    db.consultation.count({ where: COMPLETED }),
    configNumber("trust.recommendation.min_consultations", 1000),
  ]);
  return { value, target: Math.max(1, target) };
}

/**
 * Sample floor (Config "trust.rating.min_consults_to_publish"): how many astrologers customers can
 * see have fewer completed consultations than the floor.
 */
async function sampleFloorStatus() {
  const [floor, astrologers, counts] = await Promise.all([
    configNumber("trust.rating.min_consults_to_publish", 25),
    db.astrologer.findMany({ where: { lifecycle: "active", suspension: { not: "full" } }, select: { id: true } }),
    db.consultation.groupBy({ by: ["astrologerId"], where: COMPLETED, _count: { _all: true } }),
  ]);
  const done = new Map(counts.map((c) => [c.astrologerId, c._count._all]));
  const below = astrologers.filter((a) => (done.get(a.id) ?? 0) < floor).length;
  return { floor, below, total: astrologers.length };
}

governanceRouter.post("/reviews/:id/remove", async (req, res) => {
  const admin = requirePage(req, "trust");
  const body = z
    .object({
      reason: z.enum([OTHER_REASON, ...REASON_CODES] as [string, ...string[]], { error: "Choose a reason code." }),
      note: z.string().trim().max(OTHER_REASON_MAX, `Keep your reason to ${OTHER_REASON_MAX} characters.`).optional(),
    })
    .parse(req.body);
  if (body.reason === OTHER_REASON && (body.note ?? "").length < OTHER_REASON_MIN) {
    throw badRequest(`Write your reason in at least ${OTHER_REASON_MIN} characters.`);
  }
  // A written reason is kept whole; a preset one is audited by its code, as before.
  const reason = body.reason === OTHER_REASON ? `${OTHER_REASON} — ${body.note}` : body.reason;
  const audited = body.reason === OTHER_REASON ? reason : reason.split(" ")[0];
  const r = await db.review.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound("Review not found.");
  if (r.status === "SOFT_HIDDEN" || r.status === "REMOVED") throw conflict("This review is already hidden.");
  await db.review.update({ where: { id: r.id }, data: { status: "SOFT_HIDDEN", hiddenAt: new Date(), removedReason: reason, moderatedBy: actorName(admin) } });
  await audit(admin, "review.remove", r.id, `${r.status} → SOFT_HIDDEN · ${audited}`);
  res.json({ ok: true });
});

governanceRouter.post("/reviews/:id/restore", async (req, res) => {
  const admin = requirePage(req, "trust");
  const r = await db.review.findUnique({ where: { id: String(req.params.id) } });
  if (!r) throw notFound("Review not found.");
  if (r.status !== "SOFT_HIDDEN") throw conflict("Only a review inside its undo window can be restored.");
  // Undo puts the review back as it was before the removal: a flagged one returns to the queue
  // (still hidden from the website) for a keep-or-remove decision.
  const back = r.flag ? "FLAGGED" : "VISIBLE";
  await db.review.update({ where: { id: r.id }, data: { status: back, hiddenAt: null, removedReason: null } });
  await audit(admin, "review.restore", r.id, `SOFT_HIDDEN → ${back}`);
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

/** Who may change a cell: nobody for a locked one (the Super Admin column and the PAGE/CAPABILITY_LOCKS). */
function rbacView(matrix: Matrix, stored: StoredMatrix | null, canEdit: boolean) {
  const defaults = defaultMatrix();
  const cell = (lock: Lock | undefined, role: AdminRoleKey, on: boolean, wasDefault: boolean) => ({
    on,
    locked: role === "super" || !!lock,
    reason: role === "super" ? SUPER_LOCK_REASON : (lock?.reason ?? null),
    isDefault: on === wasDefault,
  });
  return {
    roles: ROLE_ORDER.map((r) => ({ key: r, label: ROLE_LABELS[r] })),
    pages: PAGE_ORDER.map((p) => ({
      key: p,
      label: PAGE_LABELS[p],
      cells: ROLE_ORDER.map((r) => cell(PAGE_LOCKS[p], r, matrix.pages[r].includes(p), defaults.pages[r].includes(p))),
    })),
    capabilities: CAPABILITIES.map((c) => ({
      key: c.key,
      label: c.label,
      page: c.page,
      cells: ROLE_ORDER.map((r) =>
        cell(CAPABILITY_LOCKS[c.key], r, matrix.capabilities[c.key]!.includes(r), defaults.capabilities[c.key]!.includes(r)),
      ),
    })),
    separationOfDuties: SEPARATION_OF_DUTIES,
    version: stored?.version ?? 0,
    customised: matrixDiff(defaults, matrix).length > 0,
    updatedBy: stored?.updatedBy ?? null,
    updatedAt: stored ? istStamp(new Date(stored.updatedAt)) : null,
    canEdit,
  };
}

governanceRouter.get("/rbac", async (req, res) => {
  const admin = requirePage(req, "rbac");
  const { matrix, stored } = await loadMatrix();
  res.json({ rbac: rbacView(matrix, stored, capabilitiesOf(admin.adminRole).includes("rbac.edit")) });
});

const roleKey = z.enum(ROLE_ORDER as [AdminRoleKey, ...AdminRoleKey[]]);
const matrixBody = z.object({
  /** The version the editor started from; a save on top of someone else's newer save is refused. */
  version: z.number().int().min(0),
  pages: z.partialRecord(roleKey, z.array(z.enum(PAGE_ORDER as [PageKey, ...PageKey[]]))),
  capabilities: z.record(z.string(), z.array(roleKey)),
});

/** Refuses a matrix that changes a locked cell (the grid never sends one; this guards the API). */
function lockedChange(asked: Matrix, base: Matrix): string | null {
  for (const r of ROLE_ORDER) {
    for (const p of PAGE_ORDER) {
      const lock = r === "super" ? SUPER_LOCK_REASON : PAGE_LOCKS[p]?.reason;
      if (lock && asked.pages[r]?.includes(p) !== base.pages[r].includes(p)) return `Locked — ${lock}`;
    }
    for (const c of CAPABILITIES) {
      const lock = r === "super" ? SUPER_LOCK_REASON : CAPABILITY_LOCKS[c.key]?.reason;
      if (lock && (asked.capabilities[c.key] ?? []).includes(r) !== base.capabilities[c.key]!.includes(r)) return `Locked — ${lock}`;
    }
  }
  return null;
}

governanceRouter.put("/rbac/matrix", async (req, res) => {
  requirePage(req, "rbac");
  const admin = requireCapability(req, "rbac.edit", "Only a Super Admin can change access.");
  const body = matrixBody.parse(req.body);
  invalidateMatrix();
  const { matrix: before, stored } = await loadMatrix();
  if (body.version !== (stored?.version ?? 0)) throw conflict("Someone else changed access while you were editing. Reload to see the latest matrix.");
  const asked: Matrix = {
    pages: Object.fromEntries(ROLE_ORDER.map((r) => [r, body.pages[r] ?? before.pages[r]])) as Matrix["pages"],
    capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c.key, body.capabilities[c.key] ?? before.capabilities[c.key]!])),
  };
  const blocked = lockedChange(asked, normalise(before));
  if (blocked) throw forbidden(blocked);
  const next = normalise(asked);
  const diff = matrixDiff(before, next);
  if (!diff.length) throw badRequest("Nothing changed.");
  const saved: StoredMatrix = { ...next, version: (stored?.version ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: actorName(admin) };
  await putSetting(MATRIX_SETTING, saved);
  invalidateMatrix();
  await audit(admin, "rbac.matrix.update", "rbac.matrix", diff.join("; "));
  const fresh = await loadMatrix();
  res.json({ rbac: rbacView(fresh.matrix, fresh.stored, true), changes: diff });
});

governanceRouter.post("/rbac/matrix/reset", async (req, res) => {
  requirePage(req, "rbac");
  const admin = requireCapability(req, "rbac.edit", "Only a Super Admin can change access.");
  invalidateMatrix();
  const { matrix: before } = await loadMatrix();
  const diff = matrixDiff(before, defaultMatrix());
  if (!diff.length) throw conflict("Access is already at the defaults.");
  await db.setting.deleteMany({ where: { key: MATRIX_SETTING } });
  invalidateMatrix();
  await audit(admin, "rbac.matrix.reset", "rbac.matrix", diff.join("; "));
  const fresh = await loadMatrix();
  res.json({ rbac: rbacView(fresh.matrix, fresh.stored, true), changes: diff });
});

// ── Audit log ──

const starts = (...prefixes: string[]): Prisma.AuditLogWhereInput => ({ OR: prefixes.map((p) => ({ action: { startsWith: p } })) });
/** Audit lanes, as database filters (so a lane or a search reaches past the latest entries). */
const LANES: Record<string, Prisma.AuditLogWhereInput> = {
  all: {},
  "break-glass": { breakGlass: true },
  config: starts("config."),
  money: starts("payout.", "dispute.", "wallet."),
  access: starts("rbac.", "staff.", "live.observer"),
};

/**
 * Sort orders for the audit list. The list is capped (200 shown), so the
 * order is applied in the query: "Oldest" must reach the first entries, not reverse the newest.
 * Ties fall back to time (newest first), then id, so the order is stable between loads.
 */
const AUDIT_SORTS: Record<string, Prisma.AuditLogOrderByWithRelationInput[]> = {
  newest: [{ at: "desc" }, { id: "desc" }],
  oldest: [{ at: "asc" }, { id: "asc" }],
  actor: [{ actorName: "asc" }, { at: "desc" }, { id: "desc" }],
  action: [{ action: "asc" }, { at: "desc" }, { id: "desc" }],
};

governanceRouter.get("/audit", async (req, res) => {
  requirePage(req, "audit");
  const lane = typeof req.query.lane === "string" && Object.hasOwn(LANES, req.query.lane) ? req.query.lane : "all";
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  const sort = typeof req.query.sort === "string" && Object.hasOwn(AUDIT_SORTS, req.query.sort) ? req.query.sort : "newest";
  const text = { contains: q, mode: "insensitive" as const };
  const search: Prisma.AuditLogWhereInput = q ? { OR: [{ actorName: text }, { action: text }, { object: text }, { diff: text }] } : {};
  const rows = await db.auditLog.findMany({ where: { AND: [LANES[lane]!, search] }, orderBy: AUDIT_SORTS[sort]!, take: 200 });
  res.json({
    entries: rows.map((r) => ({ ts: istStamp(r.at), actor: r.actorName, action: r.action, object: r.object, diff: r.diff, corr: r.correlation, breakGlass: r.breakGlass })),
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

// ── Recording & retention ──
// Written conversation — live-room chat, astrologer–customer messages and the chat inside
// consultations — is kept for the retention period below and purged daily (lib/retention.ts).
// Voice and video consultations are recorded as audio only (lib/recordings.ts); the recordings
// themselves are listed only to a Super Admin (routes/admin/recordings.ts). Public live video is
// not recorded.

governanceRouter.get("/recording", async (req, res) => {
  const admin = requirePage(req, "recording");
  const [policy, purge, liveChat, messages, conversations, consultChat, oldestChat, oldestMessage, oldestConsult] = await Promise.all([
    retentionPolicy(),
    lastPurge(),
    db.chatMessage.count(),
    db.message.count(),
    db.messageThread.count(),
    db.consultMessage.count(),
    db.chatMessage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.message.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.consultMessage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const oldest = [oldestChat?.createdAt, oldestMessage?.createdAt, oldestConsult?.createdAt]
    .filter((d): d is Date => !!d)
    .sort((x, y) => x.getTime() - y.getTime())[0];
  res.json({
    recording: {
      // Whether voice and video run at all (ZEGO keys set).
      media: { connected: zegoConfigured() },
      // Call audio recordings: only a Super Admin sees the list and can listen.
      calls: { canListen: capabilitiesOf(admin.adminRole).includes("recording.listen"), retentionDays: await configNumber("recording.retention_days", 0) },
      stored: { liveChat, messages, conversations, consultChat, oldest: oldest ? istStamp(oldest) : null },
      retention: {
        days: policy.days,
        defaultDays: RETENTION_DEFAULT_DAYS,
        minDays: RETENTION_MIN_DAYS,
        maxDays: RETENTION_MAX_DAYS,
        updatedBy: policy.updatedBy,
        updatedAt: policy.updatedAt ? istStamp(new Date(policy.updatedAt)) : null,
        canEdit: capabilitiesOf(admin.adminRole).includes("retention.edit"),
      },
      lastPurge: purge ? { at: istStamp(new Date(purge.at)), chatMessages: purge.chatMessages, messages: purge.messages, threads: purge.threads } : null,
    },
  });
});

governanceRouter.put("/recording/retention", async (req, res) => {
  requirePage(req, "recording");
  const admin = requireCapability(req, "retention.edit", "Only a Super Admin can change how long conversations are kept.");
  const { days } = z
    .object({
      days: z
        .number({ error: "Choose a retention period." })
        .int("Choose a whole number of days.")
        .min(RETENTION_MIN_DAYS, `Keep conversations for at least ${RETENTION_MIN_DAYS} days.`)
        .max(RETENTION_MAX_DAYS, `Conversations can be kept for at most ${RETENTION_MAX_DAYS} days (5 years).`),
    })
    .parse(req.body ?? {});
  const before = await retentionPolicy();
  if (before.days === days) throw badRequest("That is already the retention period.");
  await putSetting(RETENTION_SETTING, { days, updatedAt: new Date().toISOString(), updatedBy: actorName(admin) });
  await audit(admin, "retention.update", "conversations", `${before.days} days → ${days} days`);
  res.json({ ok: true, days });
});
