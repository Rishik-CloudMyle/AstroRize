"use client";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  CaptureError,
  ZegoCall,
  captureLocal,
  listCameras,
  stopStream,
  type CallState,
  type CaptureProblem,
  type MediaAnswer,
  type MediaWants,
} from "./zego-call";

// One consultation's call, kept OUTSIDE the React tree: the room credentials, the captured
// microphone/camera, the ZEGO room (joined once), the other side's stream and the sound playing it.
// The session window (and the minimised bar, or any other page) only shows a view of it, so
// minimising, restoring or moving between pages never leaves and re-joins the room, never asks for
// the devices again and never re-publishes: the call keeps running and its sound keeps playing.
//
// A call is released (room left, devices off) only when the consultation is over — its owner calls
// releaseCallSession(base) when the session ends, the site/portal watchers release calls whose
// consultation is no longer open — or when the page itself goes away.

/** idle: not asked yet · asking: the browser prompt is up · granted · or why it failed. */
export type Permission = "idle" | "asking" | "granted" | CaptureProblem;

/** connected/… once joined; "off" when there is no room to join (chat, not set up, not started). */
export type Link = CallState | "off";

/** The other side's sound on this device. */
export interface Speaker {
  off: boolean;
  volume: number;
}

export interface CallSnapshot {
  /** Credentials answer (null while loading, and for a chat). */
  answer: MediaAnswer | null;
  answerFailed: boolean;
  permission: Permission;
  /** What the self-view shows (a new object after a camera switch; the same tracks are published). */
  preview: MediaStream | null;
  remote: MediaStream | null;
  link: Link;
  linkProblem: string;
  micMuted: boolean;
  cameraOff: boolean;
  remoteCameraOff: boolean;
  levels: { me: number; peer: number };
  cameras: MediaDeviceInfo[];
  offline: boolean;
  weakNetwork: boolean;
  /** Both directions are up (billing starts once both sides report this). */
  mediaUp: boolean;
  speaker: Speaker;
  /** The browser blocked the other side's sound until the person taps (autoplay rules). */
  audioBlocked: boolean;
}

export const EMPTY_CALL: CallSnapshot = {
  answer: null,
  answerFailed: false,
  permission: "idle",
  preview: null,
  remote: null,
  link: "off",
  linkProblem: "",
  micMuted: false,
  cameraOff: false,
  remoteCameraOff: false,
  levels: { me: 0, peer: 0 },
  cameras: [],
  offline: false,
  weakNetwork: false,
  mediaUp: false,
  speaker: { off: false, volume: 1 },
  audioBlocked: false,
};

/** True when the browser already allows these devices for this site (no prompt would appear). */
async function alreadyAllowed(wants: MediaWants): Promise<boolean> {
  const names: string[] = [];
  if (wants.audio) names.push("microphone");
  if (wants.video) names.push("camera");
  if (!names.length || !navigator.permissions?.query) return false;
  try {
    const states = await Promise.all(names.map((name) => navigator.permissions.query({ name: name as PermissionName })));
    return states.every((s) => s.state === "granted");
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
const sessions = new Map<string, CallSession>();
/** The bases of the calls in progress (a new array whenever one starts or ends). */
let openBases: string[] = [];

function emit() {
  listeners.forEach((l) => l());
}

export class CallSession {
  snap: CallSnapshot = { ...EMPTY_CALL, offline: typeof navigator !== "undefined" && !navigator.onLine };
  private local: MediaStream | null = null;
  private call: ZegoCall | null = null;
  private cameraId: string | undefined;
  private audio: HTMLAudioElement | null = null;
  private released = false;
  private started = false;
  /** The window was shown at least once (a chat counts as joined from then on). */
  private windowSeen = false;
  private windows = 0;
  /** "Joined" has been recorded for the current stretch of being in the conversation. */
  private joinedSent = false;
  private joinTimer: ReturnType<typeof setTimeout> | undefined;
  private joinedListeners = new Set<() => void>();
  /** When this call was started here (Date.now()). */
  readonly createdAt = Date.now();

  constructor(
    readonly base: string,
    readonly wants: MediaWants,
  ) {}

  get needsDevices() {
    return this.wants.audio || this.wants.video;
  }

  /** How many windows show this call right now (0 while minimised). */
  get windowCount() {
    return this.windows;
  }

  private set(patch: Partial<CallSnapshot>) {
    if (this.released) return;
    this.snap = { ...this.snap, ...patch };
    emit();
    this.updateJoined();
  }

  /** Starts what can start by itself: the credentials, and the devices if the site may already use them. */
  start() {
    if (this.started || this.released) return;
    this.started = true;
    if (!this.needsDevices) return;
    void this.loadAnswer();
  }

  async loadAnswer() {
    try {
      const { media } = await api.get<{ media: MediaAnswer }>(`${this.base}/media`);
      if (this.released) return;
      this.set({ answer: media, answerFailed: false });
      // Devices are captured when there is a room to send them to — or, on a video call, so the
      // person can at least check their own picture while video isn't connected yet.
      if (this.captureAllowed && this.snap.permission === "idle" && (await alreadyAllowed(this.wants))) void this.allow();
      this.maybeJoin();
    } catch {
      this.set({ answerFailed: true });
    }
  }

  get captureAllowed() {
    return this.needsDevices && (this.snap.answer?.available === true || this.wants.video);
  }

  /** Opens the camera/microphone (the browser asks the first time). */
  async allow() {
    if (this.local || this.released || this.snap.permission === "asking") return;
    this.set({ permission: "asking" });
    try {
      const stream = await captureLocal(this.wants, this.cameraId);
      if (this.released) return stopStream(stream);
      this.local = stream;
      this.set({ preview: stream, permission: "granted", micMuted: false, cameraOff: false });
      if (this.wants.video) this.set({ cameras: await listCameras() });
      this.maybeJoin();
    } catch (e) {
      this.set({ permission: e instanceof CaptureError ? e.problem : "unknown" });
    }
  }

  /** Joins the room once there are credentials and the devices are on — once. */
  private maybeJoin() {
    const answer = this.snap.answer;
    if (this.released || this.call || !answer?.available || !this.local) return;
    const local = this.local;
    let gone = false;
    const call = ZegoCall.open(answer, local, {
      onState: (state, detail) => !gone && this.set({ link: state, linkProblem: state === "failed" ? (detail ?? "The call couldn't connect.") : "" }),
      onRemote: (stream) => {
        if (gone) return;
        this.set(stream ? { remote: stream } : { remote: null, remoteCameraOff: false });
        this.playRemote(stream);
      },
      onRemoteCamera: (off) => !gone && this.set({ remoteCameraOff: off }),
      onLevels: (levels) => {
        if (gone) return;
        const l = this.snap.levels;
        // Only re-render when it shows: the levels arrive a few times a second.
        if (Math.abs(l.me - levels.me) > 2 || Math.abs(l.peer - levels.peer) > 2) this.set({ levels });
      },
      onWeakNetwork: (weak) => !gone && this.snap.weakNetwork !== weak && this.set({ weakNetwork: weak }),
      onMediaUp: (up) => !gone && this.set({ mediaUp: up }),
      // A fresh token for the same room; the call isn't re-joined.
      renew: async () => {
        const { media } = await api.get<{ media: MediaAnswer }>(`${this.base}/media`);
        return media.available ? media : null;
      },
    });
    this.call = call;
    this.leaveCall = () => {
      gone = true;
      call.leave();
    };
    // Joined again (Try again): the microphone and camera switches carry over.
    call.setMicMuted(local.getAudioTracks().some((t) => !t.enabled));
    call.setCameraOff(local.getVideoTracks().some((t) => !t.enabled));
  }

  private leaveCall: () => void = () => {};

  /** "Try again" after a failed join: a fresh join with the same devices. */
  retryJoin() {
    if (this.released) return;
    this.leaveCall();
    this.call = null;
    this.playRemote(null);
    this.set({ link: "connecting", linkProblem: "", remote: null, mediaUp: false, weakNetwork: false });
    this.maybeJoin();
  }

  // ── The other side's sound: one <audio> per call, outside any window, so it keeps playing while minimised ──

  private playRemote(stream: MediaStream | null) {
    if (!stream) {
      if (this.audio) this.audio.srcObject = null;
      return;
    }
    if (!stream.getAudioTracks().length) return;
    if (!this.audio) {
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("data-call-audio", this.base);
      el.hidden = true;
      document.body.appendChild(el);
      this.audio = el;
    }
    this.audio.srcObject = stream;
    this.applySpeaker();
    this.audio.play().then(
      () => this.snap.audioBlocked && this.set({ audioBlocked: false }),
      () => this.set({ audioBlocked: true }),
    );
  }

  /** After a tap: play the sound the browser blocked. */
  resumeAudio() {
    this.audio?.play().then(
      () => this.set({ audioBlocked: false }),
      () => {},
    );
  }

  private applySpeaker() {
    if (!this.audio) return;
    this.audio.muted = this.snap.speaker.off;
    this.audio.volume = this.snap.speaker.volume;
  }

  setSpeaker(update: (s: Speaker) => Speaker) {
    this.set({ speaker: update(this.snap.speaker) });
    this.applySpeaker();
  }

  toggleMic() {
    const next = !this.snap.micMuted;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !next));
    this.call?.setMicMuted(next);
    this.set({ micMuted: next });
  }

  toggleCamera() {
    const next = !this.snap.cameraOff;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = !next));
    this.call?.setCameraOff(next);
    this.set({ cameraOff: next });
  }

  /** Front ↔ back (or the next camera on a computer). */
  async switchCamera() {
    const current = this.local;
    const cameras = this.snap.cameras;
    if (!current || cameras.length < 2) return;
    const nowId = current.getVideoTracks()[0]?.getSettings().deviceId;
    const idx = cameras.findIndex((c) => c.deviceId === nowId);
    const next = cameras[(idx + 1) % cameras.length];
    try {
      const fresh = await captureLocal({ audio: false, video: true }, next.deviceId);
      const track = fresh.getVideoTracks()[0];
      if (!track || this.released) return;
      track.enabled = !this.snap.cameraOff;
      await this.call?.replaceVideoTrack(track);
      current.getVideoTracks().forEach((t) => {
        t.stop();
        current.removeTrack(t);
      });
      current.addTrack(track);
      this.cameraId = next.deviceId;
      // Same stream (still joined), new object for the self-view so it picks up the new camera.
      this.set({ preview: new MediaStream(current.getTracks()) });
    } catch {
      // The other camera is busy or gone: keep the current one.
    }
  }

  // ── "Joined" (billing starts once both sides have joined) ──

  /** A window is showing this call. */
  attachWindow() {
    this.windows += 1;
    this.windowSeen = true;
    emit();
    this.updateJoined();
  }

  detachWindow() {
    this.windows = Math.max(0, this.windows - 1);
    emit();
  }

  /** Called each time this side's "joined" is recorded (the page re-reads the session then). */
  onJoined(listener: () => void) {
    this.joinedListeners.add(listener);
    return () => this.joinedListeners.delete(listener);
  }

  private get notConfigured() {
    const a = this.snap.answer;
    return a?.available === false && a.reason === "not_configured";
  }

  /**
   * This side is really in the conversation: on a voice or video call once its own stream is
   * published AND the other side's is playing; on a chat (or a call while voice/video isn't set up
   * on Astrorize) once the window has been open. Reported once per stretch — minimising or moving
   * between pages doesn't report again; a call that dropped and came back does (the server's
   * record is idempotent and never moves when billing started).
   */
  private updateJoined() {
    if (this.released) return;
    const ready = this.windowSeen && (!this.needsDevices || this.notConfigured || this.snap.mediaUp);
    if (!ready) {
      if (this.joinedSent) {
        this.joinedSent = false;
        clearTimeout(this.joinTimer);
      }
      return;
    }
    if (this.joinedSent) return;
    this.joinedSent = true;
    const send = (attempt: number) => {
      api.post(`${this.base}/joined`).then(
        () => {
          if (!this.released) this.joinedListeners.forEach((l) => l());
        },
        (e) => {
          if (this.released || !this.joinedSent || attempt >= 5 || (e instanceof ApiError && e.status < 500)) return;
          this.joinTimer = setTimeout(() => send(attempt + 1), 2000);
        },
      );
    };
    send(0);
  }

  setOffline(offline: boolean) {
    if (this.snap.offline !== offline) this.set({ offline });
  }

  /** Leaves the room, turns the devices off and stops the sound. Safe to call twice. */
  release() {
    if (this.released) return;
    this.released = true;
    clearTimeout(this.joinTimer);
    this.leaveCall();
    this.call = null;
    stopStream(this.local);
    this.local = null;
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio.remove();
      this.audio = null;
    }
    this.joinedListeners.clear();
  }
}

function setOpenBases() {
  openBases = [...sessions.keys()];
}

/** The call of this consultation side (e.g. "/consultations/ID"), started if it isn't yet. */
export function acquireCallSession(base: string, wants: MediaWants): CallSession {
  let s = sessions.get(base);
  if (s && (s.wants.audio !== wants.audio || s.wants.video !== wants.video)) {
    // The same consultation can't change mode; a different window kind means a different call.
    s.release();
    sessions.delete(base);
    s = undefined;
  }
  if (!s) {
    s = new CallSession(base, wants);
    sessions.set(base, s);
    setOpenBases();
    installPageHooks();
    emit();
  }
  s.start();
  return s;
}

export function getCallSession(base: string): CallSession | undefined {
  return sessions.get(base);
}

/** The consultation is over (or this side left it): leave its room and turn the devices off. */
export function releaseCallSession(base: string) {
  const s = sessions.get(base);
  if (!s) return;
  s.release();
  sessions.delete(base);
  setOpenBases();
  emit();
}

/** Releases every call under `prefix` (e.g. "/consultations/") except those still open. */
export function releaseCallSessionsExcept(prefix: string, keep: (base: string) => boolean) {
  for (const base of [...sessions.keys()]) if (base.startsWith(prefix) && !keep(base)) releaseCallSession(base);
}

export function subscribeCalls(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const callBases = () => openBases;
const NO_BASES: string[] = [];
export const serverCallBases = () => NO_BASES;

let pageHooks = false;
function installPageHooks() {
  if (pageHooks || typeof window === "undefined") return;
  pageHooks = true;
  // The page itself goes away: leave every room (ZEGO would time us out anyway).
  window.addEventListener("pagehide", () => {
    for (const base of [...sessions.keys()]) releaseCallSession(base);
  });
  // The browser's own view of the network, shown while ZEGO reconnects.
  const sync = () => {
    for (const s of sessions.values()) s.setOffline(!navigator.onLine);
  };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
}
