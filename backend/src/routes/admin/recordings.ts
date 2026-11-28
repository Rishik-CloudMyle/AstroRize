import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { audit } from "../../lib/audit.ts";
import { notFound } from "../../lib/errors.ts";
import { istStamp } from "../../lib/format.ts";
import { RECORDING_ACCESS_SETTING, RECORDING_ROLES, invalidateMatrix, recordingAccess, requireCapability, requirePage } from "../../lib/rbac.ts";
import { recordingStore } from "../../lib/recording-store.ts";
import { sendRecordingAudio } from "../../lib/recording-stream.ts";
import { playbackType, sweepRecordings } from "../../lib/recordings.ts";
import { phoneConfigured } from "../../lib/phone/acefone.ts";
import { PSTN_SETTING } from "../../lib/phone/state.ts";
import { configNumber, getSetting, putSetting } from "../../lib/settings.ts";

// Consultation call recordings (audio only) on the admin Recording page. A Super Admin can list and
// listen, and can switch the same access on or off for Support and Compliance (capability
// recording.listen, lib/rbac.ts): everyone else gets 403. The audio is streamed through this route only (Range requests for seeking) — there is no
// public URL — and every listen is written to the audit log.

export const recordingsRouter = Router();

const DENIED = "You don't have access to call recordings. A Super Admin can give it to Support or Compliance.";
const PAGE = 30;
/** What is shown: kept takes, ones still recording and ones that failed (not the dropped duplicates). */
const SHOWN = ["RECORDING", "READY", "PARTIAL", "FAILED", "DELETED"];

function guard(req: Parameters<typeof requirePage>[0]) {
  requirePage(req, "recording");
  return requireCapability(req, "recording.listen", DENIED);
}

recordingsRouter.get("/recordings", async (req, res) => {
  guard(req);
  const { q, before } = z
    .object({ q: z.string().trim().max(80).optional().catch(undefined), before: z.iso.datetime().optional().catch(undefined) })
    .parse(req.query);
  // Close takes whose browser went away first, so the list shows them as they really are.
  await sweepRecordings().catch(() => {});
  const where: Prisma.CallRecordingWhereInput = {
    status: { in: SHOWN },
    ...(before ? { startedAt: { lt: new Date(before) } } : {}),
    ...(q
      ? {
          consultation: {
            OR: [
              { ref: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { astrologer: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
        }
      : {}),
  };
  const [rows, total, retentionDays] = await Promise.all([
    db.callRecording.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      include: {
        consultation: {
          select: {
            ref: true,
            mode: true,
            kind: true,
            origin: true,
            billedSeconds: true,
            billingStartedAt: true,
            endedAt: true,
            customerAlias: true,
            customer: { select: { name: true } },
            astrologer: { select: { name: true } },
          },
        },
      },
    }),
    db.callRecording.count({ where: { status: { in: ["READY", "PARTIAL"] } } }),
    configNumber("recording.retention_days", 0),
  ]);
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  res.json({
    recordings: page.map((r) => {
      const c = r.consultation;
      return {
        id: r.id,
        ref: c.ref,
        customer: c.customer?.name ?? `Deleted account (${c.customerAlias})`,
        astrologer: c.astrologer.name,
        mode: c.kind === "INSTANT" ? "Instant Call" : c.mode === "VIDEO" ? "Video" : "Voice",
        fromLive: c.origin === "LIVE",
        side: r.side,
        take: r.take,
        status: r.status,
        note: r.note,
        startedAt: istStamp(r.startedAt),
        durationSeconds: Math.round(r.durationMs / 1000),
        billedSeconds: c.billedSeconds,
        bytes: r.bytes,
        playable: (r.status === "READY" || r.status === "PARTIAL") && !!r.storageKey,
        type: playbackType(r.mimeType),
      };
    }),
    next: more ? page[page.length - 1]!.startedAt.toISOString() : null,
    total,
    retentionDays,
  });
});

/** The phone backup for voice calls (Acefone): switch it on or off. */
recordingsRouter.get("/recordings/phone", async (req, res) => {
  guard(req);
  res.json({ configured: phoneConfigured(), enabled: (await getSetting<boolean>(PSTN_SETTING, true)) !== false });
});

recordingsRouter.put("/recordings/phone", async (req, res) => {
  guard(req);
  const admin = requireCapability(req, "retention.edit", "Only a Super Admin can switch phone calls on or off.");
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  await putSetting(PSTN_SETTING, enabled);
  await audit(admin, "phone.settings", PSTN_SETTING, enabled ? "OFF → ON" : "ON → OFF");
  res.json({ configured: phoneConfigured(), enabled });
});

/** Who besides a Super Admin may listen: Support and Compliance, each switched by a Super Admin. */
recordingsRouter.get("/recordings/access", async (req, res) => {
  requirePage(req, "recording");
  requireCapability(req, "rbac.edit", "Only a Super Admin can see or change this.");
  res.json({ access: await recordingAccess() });
});

recordingsRouter.put("/recordings/access", async (req, res) => {
  requirePage(req, "recording");
  const admin = requireCapability(req, "rbac.edit", "Only a Super Admin can change who listens to recordings.");
  const next = z.object({ support: z.boolean(), compliance: z.boolean() }).parse(req.body);
  const before = await recordingAccess();
  await putSetting(RECORDING_ACCESS_SETTING, next);
  invalidateMatrix();
  for (const role of RECORDING_ROLES) {
    if (before[role] !== next[role]) await audit(admin, "recording.access", `department:${role}`, `Call recording access ${before[role] ? "ON → OFF" : "OFF → ON"}`);
  }
  res.json({ access: next });
});

/** Every playback is audited; the further requests of one playback (seeking) are not repeated within 10 minutes. */
const lastAudit = new Map<string, number>();
const AUDIT_EVERY_MS = 10 * 60_000;
/** A request for the start of the file this long after the last entry is a new playback. */
const NEW_PLAY_MS = 15_000;

recordingsRouter.get("/recordings/:id/audio", async (req, res, next) => {
  const admin = guard(req);
  const r = await db.callRecording.findUnique({ where: { id: String(req.params.id) }, include: { consultation: { select: { ref: true } } } });
  if (!r || !r.storageKey || (r.status !== "READY" && r.status !== "PARTIAL")) throw notFound("Recording not found.");
  const size = await recordingStore.size(r.storageKey);
  if (size === null) throw notFound("The recording file is missing.");

  const key = `${admin.user.id}:${r.id}`;
  const last = lastAudit.get(key) ?? 0;
  const fromStart = /^bytes=0-/.test(req.get("range") ?? "bytes=0-");
  if (Date.now() - last > (fromStart ? NEW_PLAY_MS : AUDIT_EVERY_MS)) {
    lastAudit.set(key, Date.now());
    await audit(admin, "recording.listen", r.consultation.ref, `Listened to the call recording (${r.side.toLowerCase()} side, take ${r.take}, ${r.status.toLowerCase()})`);
  }

  await sendRecordingAudio(
    req,
    res,
    next,
    { storageKey: r.storageKey, mimeType: playbackType(r.mimeType), disposition: `inline; filename="${r.consultation.ref}-audio.${r.storageKey.split(".").pop()}"` },
    size,
  );
});
