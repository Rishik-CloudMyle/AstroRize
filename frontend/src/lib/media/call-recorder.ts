"use client";

import { ApiError, api } from "@/lib/api/client";

// Records a consultation's audio in this browser (client decision, Nov 2026: voice and video calls
// are recorded as AUDIO ONLY; only AstroRize's Super Admin can listen). Both sides of the call run
// one of these, so the call is kept even if one side's tab goes away; the server keeps the better
// take (backend lib/recordings.ts).
//
// What is recorded: this side's microphone mixed with the other side's sound (Web Audio), never
// video. Opus in WebM at 32 kbps (≈0.24 MB a minute); Safari records AAC in MP4 instead. It starts
// once billing has started (both sides joined) and uploads a numbered chunk every ~10 seconds, so a
// dropped connection or a closed tab loses at most the last few seconds. It lives in the call session
// (lib/media/call-session.ts), outside any page, so minimising or moving between pages doesn't stop it.

const TIMESLICE_MS = 10_000;
const BITRATE = 32_000;
/** How long to keep asking to start while the other side hasn't joined yet. */
const START_WAIT_MS = 3 * 60_000;
/** Chunks are retried for this long after the call ended (the server accepts them a little longer). */
const UPLOAD_AFTER_END_MS = 2 * 60_000;

/** The format this browser can record audio in, best first; null when it can't record. */
export function recordingMime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/** off: this call isn't recorded · waiting: for both sides to join · recording · stopped · failed (this side; the other may still record). */
export type RecorderState = "off" | "waiting" | "recording" | "stopped" | "failed";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CallRecorder {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private localNode: MediaStreamAudioSourceNode | null = null;
  private remoteNode: MediaStreamAudioSourceNode | null = null;
  private remote: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private take = 0;
  private nextSeq = 0;
  private queue: { seq: number; blob: Blob; ms: number }[] = [];
  private sending = false;
  private startedAt = 0;
  private stoppedAt = 0;
  /** performance.now() when recording stopped (the take's length). */
  private stoppedPerf = 0;
  private stopped = false;
  /** The recorder has delivered its last chunk (or never recorded). */
  private recDone = false;
  private finishSent = false;
  private resumeOnGesture = () => void this.ctx?.resume().catch(() => {});

  constructor(
    private readonly base: string,
    private readonly local: MediaStream,
    private readonly onState: (state: RecorderState) => void,
  ) {}

  /** Asks the server for a take (waiting while the other side joins), then records. */
  async start(remote: MediaStream | null) {
    this.remote = remote;
    const mime = recordingMime();
    if (!mime) return this.onState("failed");
    this.onState("waiting");
    const until = Date.now() + START_WAIT_MS;
    let failures = 0;
    while (!this.stopped) {
      try {
        // null: billing hasn't started yet (the other side is still joining) — ask again shortly.
        const { take } = await api.post<{ take: number | null }>(`${this.base}/recording/takes`, { mimeType: mime });
        if (take !== null) {
          this.take = take;
          break;
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === "RECORDING_OFF") return this.onState("off");
        if (e instanceof ApiError && e.status < 500 && e.status !== 429) return this.onState("failed");
        if (++failures > 10) return this.onState("failed");
      }
      if (Date.now() > until) return this.onState("failed");
      await sleep(3000);
    }
    if (this.stopped) {
      // Over before it could start: the empty take is closed.
      this.recDone = true;
      return void this.pump();
    }
    try {
      this.record(mime);
    } catch {
      this.teardown();
      this.onState("failed");
    }
  }

  private record(mime: string) {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.dest = ctx.createMediaStreamDestination();
    const mic = this.local.getAudioTracks();
    if (mic.length) {
      this.localNode = ctx.createMediaStreamSource(new MediaStream(mic));
      this.localNode.connect(this.dest);
    }
    this.setRemote(this.remote);
    // The call was started by a click, so the page may play audio; if the browser still holds the
    // context back, the next tap anywhere lets it run.
    void ctx.resume().catch(() => {});
    window.addEventListener("pointerdown", this.resumeOnGesture);
    window.addEventListener("keydown", this.resumeOnGesture);

    const rec = new MediaRecorder(this.dest.stream, { mimeType: mime, audioBitsPerSecond: BITRATE });
    this.rec = rec;
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.queue.push({ seq: this.nextSeq++, blob: e.data, ms: Math.round(performance.now() - this.startedAt) });
      void this.pump();
    };
    rec.onstop = () => {
      this.recDone = true;
      this.teardown();
      void this.pump();
    };
    rec.onerror = () => {
      this.onState("failed");
      this.stop();
    };
    this.startedAt = performance.now();
    rec.start(TIMESLICE_MS);
    this.onState("recording");
  }

  /** The other side's stream (it changes when they reconnect). */
  setRemote(stream: MediaStream | null) {
    this.remote = stream;
    if (!this.ctx || !this.dest) return;
    this.remoteNode?.disconnect();
    this.remoteNode = null;
    const tracks = stream?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    this.remoteNode = this.ctx.createMediaStreamSource(new MediaStream(tracks));
    this.remoteNode.connect(this.dest);
  }

  /** The call is over (or this side left): the last chunk is sent and the take finished. Safe to call twice. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.stoppedAt = Date.now();
    this.stoppedPerf = performance.now();
    if (this.rec && this.rec.state !== "inactive") {
      this.rec.stop(); // the final chunk arrives, then onstop
    } else {
      this.recDone = true;
      this.teardown();
      void this.pump();
    }
  }

  private teardown() {
    window.removeEventListener("pointerdown", this.resumeOnGesture);
    window.removeEventListener("keydown", this.resumeOnGesture);
    this.localNode?.disconnect();
    this.remoteNode?.disconnect();
    this.localNode = this.remoteNode = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.dest = null;
  }

  /** Sends the chunks in order, one at a time, retrying with a back-off; then finishes the take. */
  private async pump() {
    if (this.sending || !this.take) return;
    this.sending = true;
    let wait = 0;
    while (this.queue.length) {
      if (this.stopped && Date.now() - this.stoppedAt > UPLOAD_AFTER_END_MS) break;
      const item = this.queue[0];
      try {
        const res = await fetch(`/api${this.base}/recording/takes/${this.take}/chunks/${item.seq}?ms=${item.ms}`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/octet-stream" },
          body: item.blob,
        });
        if (res.ok) {
          this.queue.shift();
          wait = 0;
          continue;
        }
        // Refused for good (the call is over, the take was closed, a chunk is missing): this side stops.
        if (res.status !== 429 && res.status !== 408 && res.status < 500) {
          this.queue = [];
          this.onState("failed");
          this.stop();
          break;
        }
      } catch {
        // Offline for a moment: try again.
      }
      wait = Math.min(30_000, wait ? wait * 2 : 2000);
      await sleep(wait);
    }
    this.sending = false;
    if (this.queue.length && !(this.stopped && Date.now() - this.stoppedAt > UPLOAD_AFTER_END_MS)) return void this.pump();
    if (this.stopped && this.recDone && !this.finishSent) {
      this.finishSent = true;
      const durationMs = this.startedAt ? Math.round(this.stoppedPerf - this.startedAt) : 0;
      await api.post(`${this.base}/recording/takes/${this.take}/finish`, { chunks: this.nextSeq, durationMs }).catch(() => {});
      this.onState("stopped");
    }
  }
}
