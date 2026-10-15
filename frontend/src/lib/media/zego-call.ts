"use client";

import type { ZegoExpressEngine } from "zego-express-engine-webrtc";

// One-to-one voice/video through ZEGO (the client's real-time provider). This module owns the
// camera/microphone capture (so permission prompts and the self-view work the same whether or not
// ZEGO is set up) and, when the API hands out room credentials, joins the consultation's room,
// publishes this side's stream and plays the other side's. The SDK is loaded only when a call
// actually starts, so pages that never call stay light.

/** What a session sends and receives. */
export interface MediaWants {
  audio: boolean;
  video: boolean;
}

/** GET …/consultations/:id/media */
export type MediaAnswer =
  | {
      available: true;
      appId: number;
      server: string;
      roomId: string;
      userId: string;
      userName: string;
      token: string;
      myStreamId: string;
      peerStreamId: string;
      wants: MediaWants;
    }
  | { available: false; reason: "chat" | "ended" | "not_configured" | string; wants: MediaWants };

export type MediaCredentials = Extract<MediaAnswer, { available: true }>;

/** Why the camera or microphone couldn't be used. */
export type CaptureProblem = "denied" | "no_device" | "in_use" | "insecure" | "unsupported" | "unknown";

export class CaptureError extends Error {
  constructor(readonly problem: CaptureProblem) {
    super(problem);
  }
}

/**
 * Asks the browser for the microphone (and the camera when `wants.video`). Never asks for the
 * camera on a voice call. Throws CaptureError with the reason when it can't.
 */
export async function captureLocal(wants: MediaWants, cameraId?: string): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) throw new CaptureError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new CaptureError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: wants.audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      video: wants.video
        ? { ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "user" }), width: { ideal: 960 }, height: { ideal: 540 } }
        : false,
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new CaptureError("denied");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CaptureError("no_device");
    if (name === "NotReadableError" || name === "AbortError") throw new CaptureError("in_use");
    throw new CaptureError("unknown");
  }
}

/** The cameras this browser can use (labels appear once permission is given). */
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}

/** Stops every track of a captured stream (turns the camera light off). */
export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** connecting → connected; reconnecting while the network recovers; failed when it gave up. */
export type CallState = "connecting" | "connected" | "reconnecting" | "failed";

export interface CallHandlers {
  onState: (state: CallState, detail?: string) => void;
  /** The other side's stream started (or stopped: null). */
  onRemote: (stream: MediaStream | null) => void;
  /** The other side turned their camera off (true) or on. */
  onRemoteCamera: (off: boolean) => void;
  /** Sound levels 0–100, a few times a second: for the "speaking" animation. */
  onLevels: (levels: { me: number; peer: number }) => void;
  /** Fresh credentials when the token is about to expire (null: the session is over). */
  renew: () => Promise<MediaCredentials | null>;
}

/** Plain-language reason for a failed join; ZEGO's code is kept for support. */
function joinProblem(code: number | string | undefined): string {
  const ref = code !== undefined && code !== 0 && code !== "" ? ` (code ${code})` : "";
  return `The call couldn't connect${ref}. Check your internet connection and try again.`;
}

/** A joined consultation room. Create with ZegoCall.join; always end with leave(). */
export class ZegoCall {
  private engine: ZegoExpressEngine | null = null;
  private published: MediaStream | null = null;
  private playing = false;
  private left = false;

  private constructor(
    private cred: MediaCredentials,
    private handlers: CallHandlers,
  ) {}

  /** Joins the room, publishes `local` (already captured) and plays the other side when it appears. */
  static async join(cred: MediaCredentials, local: MediaStream | null, handlers: CallHandlers): Promise<ZegoCall> {
    const call = new ZegoCall(cred, handlers);
    await call.start(local);
    return call;
  }

  private async start(local: MediaStream | null) {
    const { cred, handlers } = this;
    handlers.onState("connecting");
    const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");
    if (this.left) return;
    const engine = new ZegoExpressEngine(cred.appId, cred.server);
    this.engine = engine;
    try {
      engine.setLogConfig({ logLevel: "disable", remoteLogLevel: "disable" });
      engine.setDebugVerbose(false);
    } catch {
      // Older SDKs: logging stays at its default.
    }

    engine.on("roomStateChanged", (_room, reason, code) => {
      if (this.left) return;
      if (reason === "LOGINED" || reason === "RECONNECTED") handlers.onState("connected");
      else if (reason === "RECONNECTING" || reason === "LOGINING") handlers.onState(reason === "LOGINING" ? "connecting" : "reconnecting");
      else if (reason === "RECONNECT_FAILED" || reason === "LOGIN_FAILED") handlers.onState("failed", joinProblem(code));
      else if (reason === "KICKOUT") handlers.onState("failed", "This call was opened somewhere else (another tab or device).");
    });
    engine.on("roomStreamUpdate", (_room, type, list) => {
      if (this.left || !list.some((s) => s.streamID === cred.peerStreamId)) return;
      if (type === "ADD") void this.play();
      else this.stopPlaying();
    });
    engine.on("remoteCameraStatusUpdate", (streamId, status) => {
      if (streamId === cred.peerStreamId) handlers.onRemoteCamera(status === "MUTE");
    });
    engine.on("soundLevelUpdate", (list) => {
      let me = 0;
      let peer = 0;
      for (const l of list) {
        if (l.streamID === cred.myStreamId) me = l.soundLevel;
        else if (l.streamID === cred.peerStreamId) peer = l.soundLevel;
      }
      handlers.onLevels({ me, peer });
    });
    engine.on("tokenWillExpire", () => {
      void handlers
        .renew()
        .then((fresh) => {
          if (fresh && this.engine && !this.left) {
            this.cred = fresh;
            this.engine.renewToken(fresh.token, fresh.roomId);
          }
        })
        .catch(() => {
          // The next warning retries; if it never succeeds ZEGO reports the room as failed.
        });
    });

    let ok = false;
    try {
      ok = await engine.loginRoom(cred.roomId, cred.token, { userID: cred.userId, userName: cred.userName }, { userUpdate: false });
    } catch (e) {
      if (!this.left) handlers.onState("failed", joinProblem((e as { code?: number | string })?.code));
      return;
    }
    if (this.left) return;
    if (!ok) {
      handlers.onState("failed", joinProblem(undefined));
      return;
    }
    handlers.onState("connected");
    engine.setSoundLevelDelegate(true, 300);
    if (local) {
      // Our own capture, handed to ZEGO as a custom source: the same tracks the self-view shows.
      this.published = await engine.createStream({ custom: { source: local } });
      if (this.left) return;
      engine.startPublishingStream(cred.myStreamId, this.published);
    }
  }

  private async play() {
    if (!this.engine || this.playing) return;
    this.playing = true;
    try {
      const remote = await this.engine.startPlayingStream(this.cred.peerStreamId, { audio: this.cred.wants.audio, video: this.cred.wants.video });
      if (!this.left) this.handlers.onRemote(remote);
    } catch {
      this.playing = false;
      // ZEGO announces the stream again when it becomes playable.
    }
  }

  private stopPlaying() {
    if (!this.engine || !this.playing) return;
    this.playing = false;
    try {
      this.engine.stopPlayingStream(this.cred.peerStreamId);
    } catch {
      // Already stopped.
    }
    this.handlers.onRemote(null);
  }

  /** Mutes or unmutes what this side sends (the other side is told through ZEGO). */
  setMicMuted(muted: boolean) {
    if (this.engine && this.published) this.engine.mutePublishStreamAudio(this.published, muted);
  }

  setCameraOff(off: boolean) {
    if (this.engine && this.published) this.engine.mutePublishStreamVideo(this.published, off);
  }

  /** After switching cameras: send the new camera's track instead of the old one. */
  async replaceVideoTrack(track: MediaStreamTrack) {
    if (this.engine && this.published) await this.engine.replaceTrack(this.published, track);
  }

  /** Stops publishing and playing, leaves the room and frees the engine. Safe to call twice. */
  leave() {
    if (this.left) return;
    this.left = true;
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    try {
      if (this.playing) engine.stopPlayingStream(this.cred.peerStreamId);
      if (this.published) {
        engine.stopPublishingStream(this.cred.myStreamId);
        engine.destroyStream(this.published);
      }
      engine.logoutRoom(this.cred.roomId);
    } catch {
      // Leaving is best effort: the room closes on ZEGO's side when the page goes.
    }
  }
}
