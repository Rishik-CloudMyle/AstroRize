import { db } from "../db.ts";
import type { CallRecording, Consultation } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { HttpError, badRequest, conflict, notFound } from "./errors.ts";
import { recordingStore } from "./recording-store.ts";
import { rateLimit } from "./safety.ts";
import { configNumber } from "./settings.ts";

// Call recordings (client decision, Nov 2026): voice and video consultations — Instant Calls and
// private calls from a live too — are recorded as AUDIO ONLY, and only a Super Admin can listen.
//
// How: both browsers of the call record the mixed audio (their own microphone + the other side's
// sound; video is ignored) once billing has started, each as its own "take", and upload it in
// numbered chunks of ~10 s while the call runs (a page reload mid-call starts a new take). When a
// take ends it is assembled into one file. Once every take of a call has ended, the longest is kept;
// another take is dropped only when the kept one covers its whole time span, so nothing heard on the
// call is ever lost. Recording only happens when both sides accepted the notice (consent timestamps
// on the consultation). Later a provider-side recorder (ZEGO Cloud Recording → S3) can write takes
// with side "SERVER" and the browser recorder can be switched off.

export type RecordingSide = "CUSTOMER" | "ASTROLOGER";

/** The notice both sides see (and the customer accepts) before a voice or video consultation. */
export const RECORDING_NOTICE = "This consultation is recorded (audio only) for quality and safety. Only AstroRize can access it.";

/** Largest chunk accepted (~10 s at 32 kbps is about 40 KB; generous for slower timers and headers). */
export const CHUNK_MAX_BYTES = 512 * 1024;
/** Largest take: about 4½ hours at 32 kbps — far beyond any consultation. */
const TAKE_MAX_BYTES = 64 * 1024 * 1024;
/** Takes one side may start for one consultation (each reload of the call page starts one). */
const MAX_TAKES_PER_SIDE = 10;
/** Chunks may still arrive this long after the consultation ended (the last one is sent on hang-up). */
const UPLOAD_GRACE_MS = 3 * 60_000;
/** A take that has received nothing for this long is closed as PARTIAL (the browser went away). */
const STALE_MS = 2 * 60_000;
/** Slack when deciding whether the kept take covers another one's time span. */
const COVER_SLACK_MS = 5_000;

const MIME = /^audio\/(webm|mp4)(;\s*codecs="?[a-z0-9.]+"?)?$/i;

/** Whether a consultation has audio to record (voice, video, Instant Call — not chat). */
export function recordable(c: Pick<Consultation, "mode" | "kind">): boolean {
  return c.kind === "INSTANT" || c.mode === "VOICE" || c.mode === "VIDEO";
}

/**
 * The customer's acceptance of the recording notice, required before a voice or video consultation
 * (or a voice/video request from a live) is placed. Returns the consent time to store.
 */
export function customerConsent(c: Pick<Consultation, "mode" | "kind">, accepted: boolean | undefined): Date | null {
  if (!recordable(c)) return null;
  if (!accepted) throw new HttpError(400, "Please accept the recording notice to continue.", "RECORDING_CONSENT_REQUIRED");
  return new Date();
}

/**
 * The astrologer's side joined a voice or video call: they saw the notice on the incoming call and
 * on the call screen, and joining is their acceptance (stored once).
 */
export async function recordAstrologerConsent(c: Consultation) {
  if (!recordable(c) || c.astrologerRecordingConsentAt || !c.customerRecordingConsentAt) return;
  await db.consultation.updateMany({ where: { id: c.id, astrologerRecordingConsentAt: null }, data: { astrologerRecordingConsentAt: new Date() } });
}

/** Whether this call is recorded (both sides accepted the notice). The media answer carries it for the "● Recording" indicator. */
export function isRecorded(c: Pick<Consultation, "mode" | "kind" | "customerRecordingConsentAt">): boolean {
  // The astrologer's acceptance is recorded as they join, so the customer's is what decides it up front.
  return recordable(c) && !!c.customerRecordingConsentAt;
}

// ── One process handles a take at a time (chunks arrive in order; a retry must not race the original) ──

const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = locks.get(key) ?? Promise.resolve();
  const run = before.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

const extOf = (mime: string) => (mime.toLowerCase().startsWith("audio/mp4") ? "m4a" : "webm");
/** Content-Type for playback (without the codecs part). */
export const playbackType = (mime: string) => (mime.toLowerCase().startsWith("audio/mp4") ? "audio/mp4" : "audio/webm");

/** Uploads are accepted while the call runs, and for a short while after it ended. */
function uploadsOpen(c: Consultation, now = Date.now()) {
  if (c.status === "ACTIVE") return true;
  return c.status === "ENDED" && !!c.endedAt && now - c.endedAt.getTime() < UPLOAD_GRACE_MS;
}

/**
 * Starts a take for one side, once billing has started. `{ take: null }` while the two sides haven't
 * both joined yet (the browser asks again in a few seconds); 409 RECORDING_OFF when this call isn't
 * recorded.
 */
export async function startTake(c: Consultation, side: RecordingSide, userId: string, mimeType: unknown) {
  rateLimit(`rec-ask:${userId}`, 40, 60_000, "Too many recording requests. Try again in a minute.");
  if (typeof mimeType !== "string" || !MIME.test(mimeType)) throw badRequest("Unsupported recording format.");
  if (!recordable(c) || !c.customerRecordingConsentAt) throw new HttpError(409, "This consultation isn't recorded.", "RECORDING_OFF");
  if (c.status !== "ACTIVE") throw new HttpError(409, "This consultation isn't in progress.", "RECORDING_OFF");
  if (!c.billingStartedAt || !c.astrologerRecordingConsentAt) return { take: null };
  rateLimit(`rec-take:${userId}`, 12, 60_000, "Too many recording starts. Try again in a minute.");
  return withLock(`take:${c.id}:${side}`, async () => {
    const last = await db.callRecording.findFirst({ where: { consultationId: c.id, side }, orderBy: { take: "desc" } });
    if (last && last.take >= MAX_TAKES_PER_SIDE) throw new HttpError(409, "This call can't start another recording.", "RECORDING_OFF");
    // A take of this side still open (the page was reloaded): it ends here, as far as it got.
    if (last?.status === "RECORDING") await finishTake(last, { clean: false, note: "The page was reloaded during the call." });
    const take = await db.callRecording.create({
      data: { consultationId: c.id, side, take: (last?.take ?? 0) + 1, mimeType: mimeType.toLowerCase().replace(/\s+/g, "") },
    });
    return { take: take.take as number | null };
  });
}

async function takeOf(c: Consultation, side: RecordingSide, takeNo: number) {
  const take = await db.callRecording.findUnique({ where: { consultationId_side_take: { consultationId: c.id, side, take: takeNo } } });
  if (!take) throw notFound("Recording not found.");
  return take;
}

/** Sniffs the container: WebM (EBML) or MP4 (ftyp). The browser's Content-Type isn't trusted. */
function looksLike(buf: Buffer, mime: string): boolean {
  if (extOf(mime) === "m4a") return buf.length >= 8 && buf.toString("latin1", 4, 8) === "ftyp";
  return buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3;
}

/**
 * Stores chunk `seq` of a take. Idempotent: a chunk that was already stored answers ok again; after
 * a gap nothing is stored and `expected` says which sequence number must come next.
 */
export async function putChunk(c: Consultation, side: RecordingSide, userId: string, takeNo: number, seq: number, body: unknown, durationMs: number) {
  rateLimit(`rec-chunk:${userId}`, 40, 60_000, "Recording uploads are too frequent.");
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest("Empty recording chunk.");
  if (body.length > CHUNK_MAX_BYTES) throw new HttpError(413, "Recording chunk too large.", "too_large");
  if (!uploadsOpen(c)) throw new HttpError(409, "This consultation is over.", "RECORDING_CLOSED");
  return withLock(`chunk:${c.id}:${side}:${takeNo}`, async () => {
    const take = await takeOf(c, side, takeNo);
    if (seq < take.chunks) return { stored: take.chunks, duplicate: true, expected: null };
    if (take.status !== "RECORDING") throw new HttpError(409, "This recording has ended.", "RECORDING_CLOSED");
    // A gap: the browser re-sends from the chunk the server expects.
    if (seq > take.chunks) return { stored: take.chunks, duplicate: false, expected: take.chunks };
    if (seq === 0 && !looksLike(body, take.mimeType)) throw badRequest("That isn't an audio recording.");
    if (take.bytes + body.length > TAKE_MAX_BYTES) {
      await finishTake(take, { clean: false, note: "Stopped at the size limit." });
      throw new HttpError(409, "This recording reached its size limit.", "RECORDING_CLOSED");
    }
    await recordingStore.putChunk(take.id, seq, body);
    const updated = await db.callRecording.update({
      where: { id: take.id },
      data: {
        chunks: seq + 1,
        bytes: take.bytes + body.length,
        lastChunkAt: new Date(),
        durationMs: Math.max(take.durationMs, Math.min(durationMs, 24 * 3600_000)),
      },
    });
    return { stored: updated.chunks, duplicate: false, expected: null };
  });
}

/** The browser stopped its recorder and sent everything: the take is assembled (READY). */
export async function finishFromBrowser(c: Consultation, side: RecordingSide, takeNo: number, chunks: number, durationMs: number) {
  return withLock(`chunk:${c.id}:${side}:${takeNo}`, async () => {
    const take = await takeOf(c, side, takeNo);
    if (take.status !== "RECORDING") return { status: take.status };
    const complete = chunks === take.chunks;
    const done = await finishTake(take, {
      clean: complete,
      durationMs,
      note: complete ? null : `${chunks - take.chunks} of ${chunks} chunks didn't arrive.`,
    });
    return { status: done.status };
  });
}

/**
 * Closes a take: assembles its chunks into one file (READY when the browser finished cleanly,
 * PARTIAL otherwise; FAILED when no audio arrived), then lets the consultation pick its kept take.
 */
async function finishTake(take: CallRecording, opts: { clean: boolean; durationMs?: number; note?: string | null }): Promise<CallRecording> {
  const durationMs = Math.max(take.durationMs, Math.min(opts.durationMs ?? 0, 24 * 3600_000));
  const endedAt = take.lastChunkAt ?? new Date();
  let done: CallRecording;
  if (take.chunks === 0) {
    await recordingStore.removeChunks(take.id);
    done = await db.callRecording.update({ where: { id: take.id }, data: { status: "FAILED", endedAt, note: opts.note ?? "No audio arrived." } });
  } else {
    try {
      const ext = extOf(take.mimeType);
      const { key, bytes } = await recordingStore.assemble(take.id, take.chunks, ext, ext === "webm" ? (b) => withWebmDuration(b, durationMs) : undefined);
      done = await db.callRecording.update({
        where: { id: take.id },
        data: { status: opts.clean ? "READY" : "PARTIAL", storageKey: key, bytes, durationMs, endedAt, note: opts.note ?? null },
      });
    } catch (e) {
      console.error("Recording assembly failed:", e instanceof Error ? e.message : e);
      done = await db.callRecording.update({ where: { id: take.id }, data: { status: "FAILED", endedAt, note: "The recording couldn't be put together." } });
    }
  }
  await pickKept(take.consultationId);
  // Hook: a media worker (FFmpeg) may later remux the file and set processedAt. Nothing depends on it.
  return done;
}

/**
 * Once no take of the call is still recording: keeps the longest (then the larger) and drops any
 * other take whose whole time span it covers — the same conversation recorded twice. A take that
 * holds time the kept one doesn't (e.g. before a reload) stays.
 */
async function pickKept(consultationId: string) {
  const takes = await db.callRecording.findMany({ where: { consultationId, status: { in: ["RECORDING", "READY", "PARTIAL"] } } });
  if (!takes.length || takes.some((t) => t.status === "RECORDING")) return;
  const bucket = (ms: number) => Math.round(ms / 5000);
  const kept = [...takes].sort(
    (a, b) => bucket(b.durationMs) - bucket(a.durationMs) || b.bytes - a.bytes || (a.side === "ASTROLOGER" ? -1 : 1),
  )[0]!;
  const keptEnd = (kept.endedAt ?? kept.startedAt).getTime();
  for (const t of takes) {
    if (t.id === kept.id) continue;
    const covered = t.startedAt.getTime() >= kept.startedAt.getTime() - COVER_SLACK_MS && (t.endedAt ?? t.startedAt).getTime() <= keptEnd + COVER_SLACK_MS;
    if (!covered) continue;
    if (t.storageKey) await recordingStore.remove(t.storageKey);
    await db.callRecording.update({
      where: { id: t.id },
      data: { status: "DISCARDED", storageKey: null, note: `Same call as the ${kept.side.toLowerCase()} recording (take ${kept.take}), which was kept.` },
    });
  }
}

/**
 * Once a minute (server sweep): closes takes whose browser went away (nothing for a while, or the
 * call ended and the last chunk never came), then applies the retention period — Config
 * recording.retention_days, 0 = keep (the client hasn't decided a period yet).
 */
export async function sweepRecordings(now = new Date()) {
  const stale = await db.callRecording.findMany({
    where: { status: "RECORDING", OR: [{ lastChunkAt: { lt: new Date(now.getTime() - STALE_MS) } }, { lastChunkAt: null, startedAt: { lt: new Date(now.getTime() - STALE_MS) } }] },
    take: 50,
  });
  // Also takes whose call ended more than the grace period ago (their last chunk can't come any more).
  const ended = await db.callRecording.findMany({
    where: { status: "RECORDING", consultation: { status: { not: "ACTIVE" }, endedAt: { lt: new Date(now.getTime() - UPLOAD_GRACE_MS) } } },
    take: 50,
  });
  const seen = new Set<string>();
  for (const t of [...stale, ...ended]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    await withLock(`chunk:${t.consultationId}:${t.side}:${t.take}`, async () => {
      const fresh = await db.callRecording.findUnique({ where: { id: t.id } });
      if (fresh?.status === "RECORDING") await finishTake(fresh, { clean: false, note: "The recording browser stopped sending (closed or lost connection)." });
    });
  }

  const days = await configNumber("recording.retention_days", 0);
  if (days > 0) {
    const old = await db.callRecording.findMany({
      where: { status: { in: ["READY", "PARTIAL"] }, startedAt: { lt: new Date(now.getTime() - days * 86_400_000) } },
      take: 200,
      include: { consultation: { select: { ref: true } } },
    });
    for (const r of old) {
      if (r.storageKey) await recordingStore.remove(r.storageKey);
      await db.callRecording.update({ where: { id: r.id }, data: { status: "DELETED", storageKey: null, note: `Deleted after the ${days}-day retention period.` } });
    }
    if (old.length) await audit(null, "recording.purge", "call recordings", `${old.length} recording${old.length === 1 ? "" : "s"} older than ${days} days deleted`);
  }
}

// ── WebM duration ──
// A browser's MediaRecorder writes WebM without a Duration (it doesn't know it yet), so players show
// no length. The Info element near the start gets one added when the take is assembled.

function readVint(buf: Buffer, i: number): { value: number; len: number; unknown: boolean } | null {
  const first = buf[i];
  if (first === undefined || first === 0) return null;
  const len = Math.clz32(first) - 23;
  if (len < 1 || len > 8 || i + len > buf.length) return null;
  let value = first & (0xff >> len);
  let allOnes = value === 0xff >> len;
  for (let k = 1; k < len; k++) {
    value = value * 256 + buf[i + k]!;
    if (buf[i + k] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: allOnes };
}

function writeVint(value: number, len: number): Buffer | null {
  if (value >= 2 ** (7 * len) - 1) return null;
  const out = Buffer.alloc(len);
  let v = value;
  for (let k = len - 1; k >= 0; k--) {
    out[k] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0]! |= 0x80 >> (len - 1);
  return out;
}

/** An element id's length from its first byte (ids keep their length marker). */
const idLen = (b: number | undefined) => (b === undefined || b === 0 ? 0 : Math.clz32(b) - 23);

/** The file with a Duration in its Info element (unchanged if it already has one or isn't plain WebM). */
export function withWebmDuration(buf: Buffer, durationMs: number): Buffer {
  try {
    if (durationMs <= 0 || buf.length < 8 || buf.readUInt32BE(0) !== 0x1a45dfa3) return buf;
    const ebmlSize = readVint(buf, 4);
    if (!ebmlSize) return buf;
    const segAt = 4 + ebmlSize.len + ebmlSize.value;
    if (buf.readUInt32BE(segAt) !== 0x18538067) return buf;
    const segSize = readVint(buf, segAt + 4);
    if (!segSize) return buf;
    let i = segAt + 4 + segSize.len;
    // Walk the Segment's first children to Info (1549A966).
    for (let n = 0; n < 8 && i < buf.length; n++) {
      const l = idLen(buf[i]);
      if (l < 1 || l > 4) return buf;
      const id = buf.readUIntBE(i, l);
      const size = readVint(buf, i + l);
      if (!size || size.unknown) return buf;
      if (id === 0x1549a966) {
        const dataAt = i + l + size.len;
        const end = dataAt + size.value;
        if (end > buf.length) return buf;
        let scaleNs = 1_000_000;
        for (let j = dataAt; j < end; ) {
          const cl = idLen(buf[j]);
          if (cl < 1 || cl > 4) return buf;
          const cid = buf.readUIntBE(j, cl);
          const cs = readVint(buf, j + cl);
          if (!cs) return buf;
          const cd = j + cl + cs.len;
          if (cid === 0x4489) return buf; // already has a Duration
          if (cid === 0x2ad7b1 && cs.value >= 1 && cs.value <= 6) scaleNs = buf.readUIntBE(cd, cs.value);
          j = cd + cs.value;
        }
        const duration = Buffer.alloc(11);
        duration.writeUInt16BE(0x4489, 0);
        duration[2] = 0x88; // size 8
        duration.writeDoubleBE((durationMs * 1_000_000) / scaleNs, 3);
        const newInfoSize = writeVint(size.value + duration.length, size.len);
        if (!newInfoSize) return buf;
        const parts = [buf.subarray(0, segAt + 4)];
        if (segSize.unknown) parts.push(buf.subarray(segAt + 4, segAt + 4 + segSize.len));
        else {
          const s = writeVint(segSize.value + duration.length, segSize.len);
          if (!s) return buf;
          parts.push(s);
        }
        parts.push(buf.subarray(segAt + 4 + segSize.len, i + l), newInfoSize, buf.subarray(dataAt, end), duration, buf.subarray(end));
        return Buffer.concat(parts);
      }
      i = i + l + size.len + size.value;
    }
    return buf;
  } catch {
    return buf;
  }
}
