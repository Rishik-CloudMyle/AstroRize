import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { audit } from "../../lib/audit.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { istStamp } from "../../lib/format.ts";
import { requireCapability, requirePage } from "../../lib/rbac.ts";
import { recordingStore } from "../../lib/recording-store.ts";
import { playbackType, sweepRecordings } from "../../lib/recordings.ts";
import { configNumber } from "../../lib/settings.ts";

// Consultation call recordings (audio only) on the admin Recording page. Only a Super Admin can list
// or listen (capability recording.listen, locked to Super Admin): everyone else, Compliance included,
// gets 403. The audio is streamed through this route only (Range requests for seeking) — there is no
// public URL — and every listen is written to the audit log.

export const recordingsRouter = Router();

const DENIED = "Only a Super Admin can listen to call recordings.";
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

/** Listens are audited once per person and recording every 10 minutes (seeking re-requests the file). */
const lastAudit = new Map<string, number>();
const AUDIT_EVERY_MS = 10 * 60_000;

recordingsRouter.get("/recordings/:id/audio", async (req, res, next) => {
  const admin = guard(req);
  const r = await db.callRecording.findUnique({ where: { id: String(req.params.id) }, include: { consultation: { select: { ref: true } } } });
  if (!r || !r.storageKey || (r.status !== "READY" && r.status !== "PARTIAL")) throw notFound("Recording not found.");
  const size = await recordingStore.size(r.storageKey);
  if (size === null) throw notFound("The recording file is missing.");

  const key = `${admin.user.id}:${r.id}`;
  const last = lastAudit.get(key) ?? 0;
  if (Date.now() - last > AUDIT_EVERY_MS) {
    lastAudit.set(key, Date.now());
    await audit(admin, "recording.listen", r.consultation.ref, `Listened to the call recording (${r.side.toLowerCase()} side, take ${r.take}, ${r.status.toLowerCase()})`);
  }

  res.setHeader("Content-Type", playbackType(r.mimeType));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Disposition", `inline; filename="${r.consultation.ref}-audio.${r.storageKey.split(".").pop()}"`);

  let range: { start: number; end: number } | undefined;
  const header = req.headers.range;
  if (header) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!m || (!m[1] && !m[2])) throw new HttpError(416, "Invalid range.", "bad_range");
    // "bytes=a-b", "bytes=a-" or the last n bytes ("bytes=-n").
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.setHeader("Content-Range", `bytes */${size}`);
      throw new HttpError(416, "Range not satisfiable.", "bad_range");
    }
    end = Math.max(start, end);
    range = { start, end };
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
  } else {
    res.setHeader("Content-Length", String(size));
  }
  const stream = recordingStore.read(r.storageKey, range);
  stream.on("error", (e) => (res.headersSent ? res.destroy(e) : next(e)));
  stream.pipe(res);
});
