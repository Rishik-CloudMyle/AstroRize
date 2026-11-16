import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { audit } from "../lib/audit.ts";
import { forbidden, notFound, unauthorized } from "../lib/errors.ts";
import { PAID_SESSION_WHERE, readStreamToken, recordingOf, streamToken } from "../lib/my-sessions.ts";
import { recordingStore } from "../lib/recording-store.ts";
import { sendRecordingAudio } from "../lib/recording-stream.ts";
import { playbackType, sweepRecordings } from "../lib/recordings.ts";
import { rateLimit } from "../lib/safety.ts";
import { configNumber } from "../lib/settings.ts";
import { roleGuard, type AuthContext } from "../middleware/auth.ts";

// "My consultations": the signed-in customer's own PAID sessions, newest first, with the recording of
// a voice/video/Instant call (in-app playback only) or the transcript of a chat. Client decision,
// 16 Nov 2026. Only the owning customer is served (404 for anyone else's id — no guessing); sessions
// paid with free minutes are never listed. A Super Admin still listens through the admin Recording page.
//   GET  /my-sessions?before=<ISO>                          → the list
//   GET  /my-sessions/:id                                   → one session (+ recording state, transcript)
//   POST /my-sessions/:id/recordings/:rid/stream-token      → { url, expiresAt } (audited once per 10 min)
//   GET  /my-sessions/:id/recordings/:rid/audio?t=<token>   → the audio (inline, no-store, Range)

export const mySessionsRouter = Router();
mySessionsRouter.use(roleGuard("customer"));

const auth = (req: Request) => req.auth as AuthContext;
const PAGE = 20;
/** Most transcript lines returned for one session (a long chat stays well under it). */
const TRANSCRIPT_MAX = 2000;

const astrologerSelect = { select: { name: true, initials: true, slug: true, photo: true } } as const;

async function playbackOn() {
  return (await configNumber("recording.customer_playback", 1)) !== 0;
}

type SessionRow = Prisma.ConsultationGetPayload<{ include: { astrologer: typeof astrologerSelect; recordings: true } }>;

function modeOf(c: Pick<SessionRow, "mode" | "kind">) {
  return c.kind === "INSTANT" ? "instant" : (c.mode.toLowerCase() as "chat" | "voice" | "video");
}

function summary(c: SessionRow, enabled: boolean, messageCount: number) {
  const rec = recordingOf(c, c.recordings, enabled);
  return {
    id: c.id,
    astrologer: { name: c.astrologer.name, initials: c.astrologer.initials, slug: c.astrologer.slug, photo: c.astrologer.photo },
    mode: modeOf(c),
    fixed: c.kind === "FIXED",
    at: (c.billingStartedAt ?? c.connectedAt ?? c.requestedAt).toISOString(),
    endedAt: c.endedAt?.toISOString() ?? null,
    durationSeconds: c.billedSeconds,
    amount: c.total,
    recording: { state: rec.state, parts: rec.parts },
    // Chat: the transcript is the record. (Voice/video may also have the messages sent during the call.)
    transcript: { available: enabled && messageCount > 0, count: messageCount },
  };
}

/** One of this customer's paid, ended sessions — or 404 (also for someone else's, so ids can't be probed). */
async function ownPaid(userId: string, id: string) {
  const c = await db.consultation.findFirst({
    where: { id, customerId: userId, ...PAID_SESSION_WHERE },
    include: { astrologer: astrologerSelect, recordings: true },
  });
  if (!c) throw notFound("We couldn't find that consultation.");
  return c;
}

async function messageCounts(ids: string[]) {
  const rows = ids.length
    ? await db.consultMessage.groupBy({
        by: ["consultationId"],
        where: { consultationId: { in: ids }, blocked: false, sender: { not: "SYSTEM" } },
        _count: { _all: true },
      })
    : [];
  return new Map(rows.map((r) => [r.consultationId, r._count._all]));
}

mySessionsRouter.get("/", async (req, res) => {
  const me = auth(req).user;
  const { before } = z.object({ before: z.iso.datetime().optional().catch(undefined) }).parse(req.query);
  const [enabled, rows] = await Promise.all([
    playbackOn(),
    db.consultation.findMany({
      where: { customerId: me.id, ...PAID_SESSION_WHERE, ...(before ? { requestedAt: { lt: new Date(before) } } : {}) },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      include: { astrologer: astrologerSelect, recordings: true },
    }),
  ]);
  const page = rows.slice(0, PAGE);
  const counts = await messageCounts(page.map((c) => c.id));
  res.json({
    sessions: page.map((c) => summary(c, enabled, counts.get(c.id) ?? 0)),
    next: rows.length > PAGE ? page[page.length - 1]!.requestedAt.toISOString() : null,
  });
});

mySessionsRouter.get("/:id", async (req, res) => {
  const me = auth(req).user;
  const id = String(req.params.id);
  // Close takes whose browser went away first, so the state shown is the real one.
  await sweepRecordings().catch(() => {});
  const [c, enabled] = await Promise.all([ownPaid(me.id, id), playbackOn()]);
  const lines = enabled
    ? await db.consultMessage.findMany({ where: { consultationId: c.id, blocked: false }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: TRANSCRIPT_MAX })
    : [];
  const spoken = lines.filter((m) => m.sender !== "SYSTEM").length;
  res.json({
    session: {
      ...summary(c, enabled, spoken),
      rate: c.rate,
      messages: lines.map((m) => ({
        id: m.id,
        from: m.sender === "SYSTEM" ? "system" : m.sender === "CUSTOMER" ? "me" : "astrologer",
        text: m.text,
        at: m.createdAt.toISOString(),
      })),
    },
  });
});

/** Listens are audited once per customer and recording every 10 minutes (the player renews its link and seeks). */
const lastAudit = new Map<string, number>();
const AUDIT_EVERY_MS = 10 * 60_000;

mySessionsRouter.post("/:id/recordings/:rid/stream-token", async (req, res) => {
  const me = auth(req);
  if (!(await playbackOn())) throw forbidden("Recording playback isn't available right now.");
  rateLimit(`my-rec-token:${me.user.id}`, 60, 10 * 60_000, "You're opening recordings too quickly. Wait a few minutes.");
  const c = await ownPaid(me.user.id, String(req.params.id));
  const parts = c.recordings
    .filter((r) => (r.status === "READY" || r.status === "PARTIAL") && r.storageKey)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const idx = parts.findIndex((r) => r.id === String(req.params.rid));
  if (idx < 0) throw notFound("That recording isn't available.");
  const r = parts[idx]!;
  const key = `${me.user.id}:${r.id}`;
  if (Date.now() - (lastAudit.get(key) ?? 0) > AUDIT_EVERY_MS) {
    lastAudit.set(key, Date.now());
    // No content: only that this customer played their own recording.
    await audit(me, "recording.listen.customer", c.ref, `Customer played their own recording (part ${idx + 1} of ${parts.length}, ${r.status.toLowerCase()})`);
  }
  const ttl = Math.min(600, Math.max(60, await configNumber("recording.customer_token_seconds", 180)));
  const { token, expiresAt } = streamToken(me.user.id, r.id, ttl);
  res.json({
    url: `/api/my-sessions/${encodeURIComponent(c.id)}/recordings/${encodeURIComponent(r.id)}/audio?t=${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

mySessionsRouter.get("/:id/recordings/:rid/audio", async (req, res, next) => {
  const me = auth(req);
  // 401: no / forged / expired link. 403: a valid link that isn't this customer's or this recording's.
  const claims = readStreamToken(req.query.t);
  if (!claims) throw unauthorized("This playback link has expired. Reopen the recording.");
  if (claims.userId !== me.user.id || claims.recordingId !== String(req.params.rid)) throw forbidden("This playback link isn't for you.");
  rateLimit(`my-rec-stream:${me.user.id}`, 400, 10 * 60_000, "Too many playback requests. Wait a few minutes.");
  if (!(await playbackOn())) throw forbidden("Recording playback isn't available right now.");
  const c = await ownPaid(me.user.id, String(req.params.id));
  const r = c.recordings.find((x) => x.id === claims.recordingId);
  if (!r || !r.storageKey || (r.status !== "READY" && r.status !== "PARTIAL")) throw notFound("That recording isn't available.");
  const size = await recordingStore.size(r.storageKey);
  if (size === null) throw notFound("The recording file is missing.");
  await sendRecordingAudio(req, res, next, { storageKey: r.storageKey, mimeType: playbackType(r.mimeType), disposition: "inline" }, size);
});
