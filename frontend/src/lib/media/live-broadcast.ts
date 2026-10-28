"use client";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { ZegoLive, type LiveMediaAnswer } from "@/lib/live-media";
import type { LiveHostPrivate } from "@/lib/portal/types";
import type { LiveChatLine, LiveGift } from "@/lib/types";
import { CaptureError, captureLocal, stopStream, type CallState, type CaptureProblem } from "./zego-call";

// The astrologer's live broadcast, kept OUTSIDE the React tree (like lib/media/call-session.ts for
// calls): the room's feed (followed every few seconds — viewers, chat, gifts, the private
// consultation in progress), the captured camera and microphone, and the ZEGO room the live's one
// stream is published to. The Live console and the portal-wide "You're LIVE" bar are only views of
// it, so moving between portal pages or leaving the console never stops the stream, never asks for
// the devices again and never re-publishes: viewers notice nothing.
//
// While a private consultation runs, the broadcast's sound is switched off — the video keeps going
// to everyone — and comes back when it ends. That follows the feed here, so it also happens while
// the astrologer is on another page. When ZEGO isn't set up nothing is broadcast.
//
// The session is started by the portal while the astrologer is live, and released only when the
// live is over: End live (releaseLiveBroadcast), the server saying the room has closed (went
// offline, ended in another tab, by the team), or the page itself going away.

export type Permission = "idle" | "asking" | "granted" | CaptureProblem;

/** What is happening in the astrologer's room (GET /portal/live/feed). */
export interface LiveFeed {
  chat: LiveChatLine[];
  gifts: LiveGift[];
  viewers: number;
  giftsTotal: number;
  giftsCount: number;
  title: string;
  /** When this live session started (ISO). */
  startedAt?: string;
  /** The private consultation in progress (followed closely, with the feed), or null. */
  private: LiveHostPrivate | null;
  /** People waiting in the consult queue. */
  waiting: number;
}

export interface LiveSnapshot {
  /** Credentials answer (null while loading). */
  answer: LiveMediaAnswer | null;
  answerFailed: boolean;
  permission: Permission;
  local: MediaStream | null;
  link: CallState | "off";
  linkProblem: string;
  micOn: boolean;
  camOn: boolean;
  feed: LiveFeed | null;
  /** When the feed was last read (Date.now()), to tick clocks between reads. */
  feedAt: number;
  /** A private consultation is in session: the room hears nothing (the video carries on). */
  privateOn: boolean;
}

const EMPTY: LiveSnapshot = {
  answer: null,
  answerFailed: false,
  permission: "idle",
  local: null,
  link: "off",
  linkProblem: "",
  micOn: true,
  camOn: true,
  feed: null,
  feedAt: 0,
  privateOn: false,
};

const CAMERA_AND_MIC = { audio: true, video: true };
/** How often the room's feed is read while live. */
const FEED_MS = 4000;

const listeners = new Set<() => void>();
const endedListeners = new Set<() => void>();
let current: LiveBroadcastSession | null = null;
let snapshot: LiveSnapshot | null = null;

function emit() {
  snapshot = current ? current.snap : null;
  listeners.forEach((l) => l());
}

export class LiveBroadcastSession {
  snap: LiveSnapshot = EMPTY;
  private local: MediaStream | null = null;
  private zego: ZegoLive | null = null;
  private leaveZego: () => void = () => {};
  private feedTimer: ReturnType<typeof setInterval> | undefined;
  private feedInFlight = false;
  private released = false;
  private started = false;

  private set(patch: Partial<LiveSnapshot>) {
    if (this.released) return;
    this.snap = { ...this.snap, ...patch };
    emit();
  }

  /** The room hears nothing while a private consultation runs, or while the microphone is off. */
  get audioMuted() {
    return this.snap.privateOn || !this.snap.micOn;
  }

  start() {
    if (this.started || this.released) return;
    this.started = true;
    void this.readFeed();
    this.feedTimer = setInterval(() => void this.readFeed(), FEED_MS);
    void this.loadAnswer();
  }

  /** The room's feed; an answer with no feed means the live is over (ended elsewhere, or offline). */
  private async readFeed() {
    if (this.released || this.feedInFlight) return;
    this.feedInFlight = true;
    try {
      const res = await api.get<{ feed: LiveFeed | null }>("/portal/live/feed");
      if (this.released) return;
      if (!res.feed) return endedByServer(this);
      const privateOn = res.feed.private?.status === "active";
      this.set({ feed: res.feed, feedAt: Date.now(), privateOn });
      this.zego?.setAudioMuted(this.audioMuted);
    } catch {
      // Offline or the API restarting: the next read tries again; the stream carries on meanwhile.
    } finally {
      this.feedInFlight = false;
    }
  }

  async loadAnswer() {
    try {
      const { media } = await api.get<{ media: LiveMediaAnswer }>("/portal/live/media");
      if (this.released) return;
      this.set({ answer: media, answerFailed: false });
      if (media.available && this.snap.permission === "idle" && (await alreadyAllowed())) void this.allow();
      this.maybeBroadcast();
    } catch (e) {
      if (this.released) return;
      // 409: not live any more — the feed confirms it and lets go.
      if (e instanceof ApiError && e.status === 409) return void this.readFeed();
      this.set({ answerFailed: true });
    }
  }

  /** Turns the camera and microphone on (the browser asks the first time). */
  async allow() {
    if (this.local || this.released || this.snap.permission === "asking") return;
    this.set({ permission: "asking" });
    try {
      const stream = await captureLocal(CAMERA_AND_MIC);
      if (this.released) return stopStream(stream);
      this.local = stream;
      this.set({ local: stream, permission: "granted", micOn: true, camOn: true });
      this.maybeBroadcast();
    } catch (e) {
      this.set({ permission: e instanceof CaptureError ? e.problem : "unknown" });
    }
  }

  /** Broadcast once there are credentials and the devices are on — once. */
  private maybeBroadcast() {
    const answer = this.snap.answer;
    if (this.released || this.zego || !answer?.available || !this.local) return;
    let gone = false;
    const zego: ZegoLive = ZegoLive.broadcast(answer, this.local, {
      onState: (s, detail) => {
        if (gone) return;
        this.set({ link: s, linkProblem: s === "failed" ? (detail ?? "") : "" });
        // Joined (or re-joined): apply the current sound state.
        if (s === "connected") zego.setAudioMuted(this.audioMuted);
      },
      renew: async () => {
        const { media } = await api.get<{ media: LiveMediaAnswer }>("/portal/live/media");
        return media.available ? media : null;
      },
    });
    zego.setAudioMuted(this.audioMuted);
    zego.setVideoOff(!this.snap.camOn);
    this.zego = zego;
    this.leaveZego = () => {
      gone = true;
      zego.leave();
    };
  }

  /** "Try again" after a failed join: broadcasts afresh with the same camera and microphone. */
  retry() {
    if (this.released) return;
    this.leaveZego();
    this.zego = null;
    this.set({ link: "connecting", linkProblem: "" });
    if (!this.snap.answer?.available) void this.loadAnswer();
    else this.maybeBroadcast();
  }

  toggleMic() {
    const on = !this.snap.micOn;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.set({ micOn: on });
    this.zego?.setAudioMuted(this.audioMuted);
  }

  toggleCam() {
    const on = !this.snap.camOn;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.zego?.setVideoOff(!on);
    this.set({ camOn: on });
  }

  /** Stops broadcasting, leaves the room and turns the camera and microphone off. Safe to call twice. */
  release() {
    if (this.released) return;
    this.released = true;
    clearInterval(this.feedTimer);
    this.leaveZego();
    this.zego = null;
    stopStream(this.local);
    this.local = null;
  }
}

/** True when the browser already allows the camera and microphone for this site (no prompt would appear). */
async function alreadyAllowed(): Promise<boolean> {
  if (!navigator.permissions?.query) return false;
  try {
    const states = await Promise.all(["camera", "microphone"].map((name) => navigator.permissions.query({ name: name as PermissionName })));
    return states.every((s) => s.state === "granted");
  } catch {
    return false;
  }
}

function endedByServer(session: LiveBroadcastSession) {
  if (current !== session) return session.release();
  releaseLiveBroadcast();
  endedListeners.forEach((l) => l());
}

/** The astrologer is live: the broadcast session, started if it isn't yet. */
export function acquireLiveBroadcast(): LiveBroadcastSession {
  if (!current) {
    current = new LiveBroadcastSession();
    installPageHooks();
    emit();
  }
  current.start();
  return current;
}

export function getLiveBroadcast(): LiveBroadcastSession | null {
  return current;
}

/** The live is over: stop broadcasting and turn the devices off. */
export function releaseLiveBroadcast() {
  if (!current) return;
  current.release();
  current = null;
  emit();
}

export function subscribeLive(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called when the server says the live is over (it was ended somewhere else, or the astrologer went offline). */
export function onLiveEndedByServer(listener: () => void): () => void {
  endedListeners.add(listener);
  return () => {
    endedListeners.delete(listener);
  };
}

/** The broadcast in progress (null when not live). */
export const liveSnapshot = () => snapshot;
export const serverLiveSnapshot = () => null;

let pageHooks = false;
function installPageHooks() {
  if (pageHooks || typeof window === "undefined") return;
  pageHooks = true;
  // The page itself goes away (tab closed, reload): stop publishing and free the devices.
  window.addEventListener("pagehide", () => {
    current?.release();
    current = null;
    snapshot = null;
  });
}
