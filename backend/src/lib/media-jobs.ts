import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, stat, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { config } from "../config.ts";
import { db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { isDatabaseDown } from "./errors.ts";
import { WORK_DIR, privateStorage, sweepWorkDir } from "./storage.ts";
import { DEFAULT_TRANSCODE, TranscodeError, ffmpegPath, killAllFfmpeg, transcodeVideo } from "./transcode.ts";

// Background compression of videos sent in messages (storage cost): a producer–consumer queue.
//
//   API (producer)   stores the uploaded original, creates the message with attachmentState
//                    PROCESSING and a QUEUED MediaJob in the same transaction.
//   worker (consumer) claims a job, runs FFmpeg as a child process (lib/transcode.ts), stores the
//                    compressed MP4 + poster, points the message at them and deletes the original.
//
// The consumer runs in a separate process (src/worker.ts, `npm run worker`, MEDIA_WORKER=external,
// the production setup) or, where the database takes only one connection (the local `prisma dev`
// database), inside the API (MEDIA_WORKER=inline, the local default). Either way FFmpeg is its own
// process and the API's event loop only waits for it. The queue sits behind MediaQueue so it can move
// to BullMQ/Redis later, and files behind Storage (lib/storage.ts) so they can move to S3.

export type MediaJobKind = "VIDEO_TRANSCODE";

export interface NewMediaJob {
  kind: MediaJobKind;
  messageId: string;
  /** Storage key of the uploaded original. */
  input: string;
  inputBytes: number;
}

export interface ClaimedJob {
  id: string;
  kind: string;
  messageId: string | null;
  input: string;
  inputBytes: number;
  /** Including this run. */
  attempts: number;
  maxAttempts: number;
}

export interface MediaQueue {
  /**
   * Adds a job. The Postgres queue writes it inside `tx` (so it exists exactly when the message
   * does); a Redis queue would add it right after the transaction commits instead.
   */
  enqueue(job: NewMediaJob, tx?: Prisma.TransactionClient): Promise<string>;
  /** Tells consumers in this process that work is waiting (they also poll). */
  notify(): void;
  /** Claims the next job that is due, or null. Safe with any number of workers. */
  claim(workerId: string): Promise<ClaimedJob | null>;
  complete(id: string, result: { output: string | null; poster: string | null; outputBytes: number | null; note?: string }): Promise<void>;
  /** A failed run: tried again after `retryInMs`, or FAILED for good when it is null. */
  fail(id: string, error: string, retryInMs: number | null): Promise<void>;
  /** Puts RUNNING jobs whose worker went quiet (locked before `cutoff`, or by `lockedBy`) back in the queue. */
  requeue(where: { lockedBefore?: Date; lockedBy?: string }): Promise<number>;
}

const events = new EventEmitter();

/** The queue on the PostgreSQL MediaJob table. */
export const postgresQueue: MediaQueue = {
  async enqueue(job, tx) {
    const row = await (tx ?? db).mediaJob.create({ data: { ...job, maxAttempts: MAX_ATTEMPTS } });
    return row.id;
  },

  notify() {
    events.emit("queued");
  },

  async claim(workerId) {
    // Find a due job, then take it with a conditional UPDATE: only one worker's update can match
    // status = QUEUED, the others get count 0 and look again.
    for (let tries = 0; tries < 5; tries++) {
      const next = await db.mediaJob.findFirst({
        where: { status: "QUEUED", runAfter: { lte: new Date() } },
        orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (!next) return null;
      const taken = await db.mediaJob.updateMany({
        where: { id: next.id, status: "QUEUED" },
        data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } },
      });
      if (taken.count === 1) {
        return db.mediaJob.findUniqueOrThrow({
          where: { id: next.id },
          select: { id: true, kind: true, messageId: true, input: true, inputBytes: true, attempts: true, maxAttempts: true },
        });
      }
    }
    return null;
  },

  async complete(id, result) {
    await db.mediaJob.update({
      where: { id },
      data: { status: "DONE", output: result.output, poster: result.poster, outputBytes: result.outputBytes, lastError: result.note ?? null, finishedAt: new Date(), lockedAt: null },
    });
  },

  async fail(id, error, retryInMs) {
    await db.mediaJob.update({
      where: { id },
      data:
        retryInMs === null
          ? { status: "FAILED", lastError: error.slice(0, 1000), finishedAt: new Date(), lockedAt: null }
          : { status: "QUEUED", lastError: error.slice(0, 1000), runAfter: new Date(Date.now() + retryInMs), lockedAt: null, lockedBy: null },
    });
  },

  async requeue({ lockedBefore, lockedBy }) {
    const { count } = await db.mediaJob.updateMany({
      where: { status: "RUNNING", ...(lockedBefore ? { lockedAt: { lt: lockedBefore } } : {}), ...(lockedBy ? { lockedBy } : {}) },
      data: { status: "QUEUED", lockedAt: null, lockedBy: null, runAfter: new Date() },
    });
    return count;
  },
};

/** The queue the API and workers use. */
export const mediaQueue: MediaQueue = postgresQueue;

// ── Settings ──

/** Runs per job before it fails for good. */
const MAX_ATTEMPTS = 3;
/** Wait before try 2 and 3: 15 s, then 60 s. */
const backoffMs = (attempt: number) => 15_000 * 4 ** (attempt - 1);
/** A RUNNING job not finished after this long belongs to a worker that died: it is handed out again. */
const STALE_AFTER_MS = 10 * 60_000;
/** When compression fails for a reason other than a broken file, an original up to this size is still delivered. */
const KEEP_ORIGINAL_MAX_BYTES = 8 * 1024 * 1024;

/** inline (inside the API: local default) · external (src/worker.ts: production) · off. */
export function mediaWorkerMode(): "inline" | "external" | "off" {
  const v = config.mediaWorker;
  return v === "external" || v === "off" ? v : "inline";
}

// ── Doing one job ──

const MB = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
const randomName = (ext: string) => `${randomBytes(16).toString("hex")}.${ext}`;

/** Points the message at its final file(s) only if it still has the original (it may have been deleted meanwhile). */
async function setMessage(messageId: string, input: string, data: Prisma.MessageUpdateManyMutationInput): Promise<boolean> {
  const { count } = await db.message.updateMany({ where: { id: messageId, attachment: input }, data });
  return count === 1;
}

async function processJob(job: ClaimedJob, log: (line: string) => void): Promise<void> {
  const message = job.messageId
    ? await db.message.findUnique({ where: { id: job.messageId }, select: { attachment: true } })
    : null;
  // The message (or its file) is gone: account deleted, retention… Nothing to deliver.
  if (!message || message.attachment !== job.input) {
    await privateStorage.remove(job.input);
    await mediaQueue.complete(job.id, { output: null, poster: null, outputBytes: null, note: "The message no longer has this file." });
    return;
  }
  if (job.attempts > job.maxAttempts) return giveUp(job, new TranscodeError("Gave up after repeated tries (the worker kept stopping).", false), log);

  await mkdir(WORK_DIR, { recursive: true });
  const outFile = path.join(WORK_DIR, randomName("mp4"));
  const posterFile = path.join(WORK_DIR, randomName("jpg"));
  const started = Date.now();
  const source = await privateStorage.toLocalFile(job.input);
  try {
    await transcodeVideo(source.path, outFile, posterFile, { ...DEFAULT_TRANSCODE, timeoutMs: config.mediaTranscodeTimeoutMs });
  } catch (e) {
    await Promise.all([unlink(outFile).catch(() => {}), unlink(posterFile).catch(() => {})]);
    const err = e instanceof TranscodeError ? e : new TranscodeError(e instanceof Error ? e.message : String(e), false);
    if (err.permanent || job.attempts >= job.maxAttempts) return giveUp(job, err, log);
    const wait = backoffMs(job.attempts);
    log(`Media job ${job.id}: try ${job.attempts} failed (${err.message.slice(0, 160)}); trying again in ${Math.round(wait / 1000)} s.`);
    await mediaQueue.fail(job.id, err.message, wait);
    return;
  } finally {
    await source.done();
  }

  const outBytes = (await stat(outFile)).size;
  const posterKey = randomName("jpg");
  await privateStorage.putFile(posterKey, posterFile, "image/jpeg");
  // A video that was already small and efficient can come out bigger: then the original (an MP4)
  // stays, with the new poster.
  const keepOriginal = outBytes >= job.inputBytes && job.input.endsWith(".mp4");
  const outKey = keepOriginal ? job.input : randomName("mp4");
  if (keepOriginal) await unlink(outFile).catch(() => {});
  else await privateStorage.putFile(outKey, outFile, "video/mp4");

  const ok = await setMessage(job.messageId!, job.input, { attachment: outKey, attachmentPoster: posterKey, attachmentState: null });
  if (!ok) {
    // Deleted while we worked: remove everything.
    await Promise.all([privateStorage.remove(posterKey), privateStorage.remove(job.input), keepOriginal ? null : privateStorage.remove(outKey)]);
    await mediaQueue.complete(job.id, { output: null, poster: null, outputBytes: null, note: "The message was removed while it was being processed." });
    return;
  }
  if (!keepOriginal) await privateStorage.remove(job.input);
  const size = keepOriginal ? job.inputBytes : outBytes;
  await mediaQueue.complete(job.id, { output: outKey, poster: posterKey, outputBytes: size });
  log(`Media job ${job.id}: video ${MB(job.inputBytes)} → ${MB(size)}${keepOriginal ? " (original kept, already smaller)" : ""} in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

/**
 * The last try failed. A broken file is removed and the message says it couldn't be processed. When
 * the failure wasn't the file's fault (timeout, FFmpeg missing) and the original is small enough, the
 * original is delivered as it is instead.
 */
async function giveUp(job: ClaimedJob, err: TranscodeError, log: (line: string) => void) {
  const deliverOriginal = !err.permanent && job.inputBytes <= KEEP_ORIGINAL_MAX_BYTES;
  if (deliverOriginal) {
    await setMessage(job.messageId!, job.input, { attachmentState: null });
  } else {
    await setMessage(job.messageId!, job.input, { attachmentState: "FAILED" });
    await privateStorage.remove(job.input);
  }
  await mediaQueue.fail(job.id, err.message, null);
  log(`Media job ${job.id}: failed for good${deliverOriginal ? " (original delivered uncompressed)" : ""}: ${err.message.slice(0, 200)}`);
}

// ── The consumer loop ──

export interface Consumer {
  /** Stops claiming; waits up to `graceMs` for running jobs, then kills FFmpeg (those jobs are re-queued later). */
  stop(graceMs?: number): Promise<void>;
}

/**
 * Starts taking jobs: `concurrency` at a time, checking every `pollMs` (and at once when this
 * process queues one). Never throws: errors are logged and the loop carries on.
 */
export function startMediaConsumer(opts: { workerId: string; concurrency: number; pollMs: number; log?: (line: string) => void }): Consumer {
  const log = opts.log ?? ((line: string) => console.log(line));
  let active = 0;
  let stopped = false;
  let ticking = false;
  let again = false;
  const running = new Set<Promise<void>>();

  if (!ffmpegPath()) log("⚠ FFmpeg not found: message videos can't be compressed (set FFMPEG_PATH or reinstall ffmpeg-static).");

  async function tick() {
    if (ticking) {
      again = true;
      return;
    }
    ticking = true;
    try {
      do {
        again = false;
        while (!stopped && active < opts.concurrency) {
          const job = await mediaQueue.claim(opts.workerId);
          if (!job) break;
          active += 1;
          const p = processJob(job, log)
            .catch(async (e: unknown) => {
              const message = e instanceof Error ? e.message : String(e);
              log(`Media job ${job.id} crashed: ${message}`);
              // Unknown error (database, disk): try again later like any other failure, and on the
              // last try make sure the message doesn't stay "processing" for ever.
              if (job.attempts < job.maxAttempts) await mediaQueue.fail(job.id, message, backoffMs(job.attempts)).catch(() => {});
              else await giveUp(job, new TranscodeError(message, false), log).catch(() => {});
            })
            .finally(() => {
              active -= 1;
              running.delete(p);
              if (!stopped) void tick();
            });
          running.add(p);
        }
      } while (again && !stopped);
    } catch (e) {
      if (!isDatabaseDown(e)) log(`Media queue: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    } finally {
      ticking = false;
    }
  }

  async function sweep() {
    try {
      const n = await mediaQueue.requeue({ lockedBefore: new Date(Date.now() - STALE_AFTER_MS) });
      if (n) log(`Media queue: ${n} stalled job(s) handed out again.`);
      await sweepWorkDir(60 * 60_000);
    } catch (e) {
      if (!isDatabaseDown(e)) log(`Media queue sweep: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  const onQueued = () => void tick();
  events.on("queued", onQueued);
  const poll = setInterval(() => void tick(), opts.pollMs);
  const sweeper = setInterval(() => void sweep(), 60_000);
  // Jobs this same consumer had when its process last stopped (inline: the API restarted) go back
  // in the queue straight away instead of waiting to go stale.
  void mediaQueue
    .requeue({ lockedBy: opts.workerId })
    .catch(() => 0)
    .then((n) => {
      if (n) log(`Media queue: ${n} interrupted job(s) queued again.`);
      return sweep();
    })
    .then(() => tick());

  return {
    async stop(graceMs = 0) {
      stopped = true;
      events.off("queued", onQueued);
      clearInterval(poll);
      clearInterval(sweeper);
      if (running.size && graceMs > 0) {
        await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, graceMs))]);
      }
      killAllFfmpeg();
    },
  };
}

/** This machine's name, for MediaJob.lockedBy. */
export const workerHost = () => hostname().slice(0, 60);
