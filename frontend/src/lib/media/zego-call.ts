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
 * Video quality (client decision): 720p when the network allows, lower automatically on a weak one.
 * The camera is asked for 1280×720; ZEGO sends it at up to 1.5 Mbps and, when the network can't
 * carry that, its traffic control lowers the bitrate (down to `minBitrate`) and WebRTC then lowers
 * the resolution before the frame rate ("motion"), so the picture keeps moving. Audio is unaffected.
 */
export const VIDEO_720P = { width: 1280, height: 720, frameRate: 24, bitrate: 1500, minBitrate: 150 } as const;

/** How our own capture is handed to ZEGO (a custom source: the same tracks the self-view shows). */
export function publishSource(local: MediaStream) {
  return {
    custom: {
      source: local,
      bitrate: VIDEO_720P.bitrate,
      minBitrate: VIDEO_720P.minBitrate,
      videoOptimizationMode: "motion" as const,
    },
  };
}

/** ZEGO's publish options: traffic control on (adapts to the sender's and the receiver's network). */
export const PUBLISH_OPTIONS = { enableTrafficControl: true } as const;

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
        ? {
            ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "user" }),
            width: { ideal: VIDEO_720P.width },
            height: { ideal: VIDEO_720P.height },
            frameRate: { ideal: VIDEO_720P.frameRate, max: 30 },
          }
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

/**
 * How long joining may take before the person is told. ZEGO keeps trying its backup addresses
 * meanwhile (and the call still connects if one answers); "Try again" starts afresh.
 */
export const JOIN_TIMEOUT_MS = 20_000;

/** ZEGO's network grades: 0 excellent · 1 good · 2 medium · 3 poor · 4 unusable (-1 unknown). */
const POOR_NETWORK = 3;

export interface CallHandlers {
  onState: (state: CallState, detail?: string) => void;
  /** The other side's stream started (or stopped: null). */
  onRemote: (stream: MediaStream | null) => void;
  /** The other side turned their camera off (true) or on. */
  onRemoteCamera: (off: boolean) => void;
  /** Sound levels 0–100, a few times a second: for the "speaking" animation. */
  onLevels: (levels: { me: number; peer: number }) => void;
  /** This side's network is poor (ZEGO's own measure, every few seconds): video quality is being lowered. */
  onWeakNetwork?: (weak: boolean) => void;
  /**
   * The conversation is really up on this side: our stream is being published AND we are playing the
   * other side's (for a voice call, its audio). Billing starts once both sides report this.
   */
  onMediaUp?: (up: boolean) => void;
  /** Fresh credentials when the token is about to expire (null: the session is over). */
  renew: () => Promise<MediaCredentials | null>;
}

/** Plain-language reason for a failed join; ZEGO's code is kept for support. */
function joinProblem(code: number | string | undefined): string {
  const ref = code !== undefined && code !== 0 && code !== "" ? ` (code ${code})` : "";
  return `The call couldn't connect${ref}. Check your internet connection and try again.`;
}

const UNREACHABLE =
  "We can't reach the call service from this network. Check your internet connection (or switch between Wi-Fi and mobile data) and tap Try again.";

/**
 * Logs out of the room and frees the engine (its connection, peer connections and our published
 * stream). Best effort: ZEGO closes the session on its side when the page goes anyway.
 */
export function closeEngine(engine: ZegoExpressEngine, roomId: string) {
  try {
    engine.logoutRoom(roomId);
  } catch {
    // Already out.
  }
  try {
    engine.destroyEngine();
  } catch {
    // Already destroyed.
  }
}

/**
 * A consultation's room. ZegoCall.open joins in the background and returns at once, so the caller
 * can leave() at any moment — even mid-join (a closed window never stays in the room). Always
 * end with leave().
 */
export class ZegoCall {
  private engine: ZegoExpressEngine | null = null;
  private published: MediaStream | null = null;
  private playing = false;
  private left = false;
  /** ZEGO says our stream is out (PUBLISHING) / the other side's is playing (PLAYING). */
  private publishing = false;
  private remotePlaying = false;
  private mediaUp = false;
  /** What the caller asked for, applied as soon as our stream is published (and kept across reconnects). */
  private audioOff = false;
  private videoOff = false;

  private constructor(
    private cred: MediaCredentials,
    private handlers: CallHandlers,
  ) {}

  /** Joins the room, publishes `local` (already captured) and plays the other side when it appears. */
  static open(cred: MediaCredentials, local: MediaStream | null, handlers: CallHandlers): ZegoCall {
    const call = new ZegoCall(cred, handlers);
    call.start(local).catch((e: unknown) => {
      // The SDK didn't load, or ZEGO refused the stream.
      if (!call.left) handlers.onState("failed", joinProblem((e as { code?: number | string })?.code));
    });
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
      // Nothing of ours (tokens, ids) goes to the console or to ZEGO's log upload.
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
    engine.on("publisherStateUpdate", (r) => {
      if (this.left || r.streamID !== this.cred.myStreamId) return;
      this.publishing = r.state === "PUBLISHING";
      this.reportMedia();
      // Our stream was refused or dropped for good (ZEGO retries short outages itself).
      if (r.state === "NO_PUBLISH" && r.errorCode !== 0) handlers.onState("failed", joinProblem(r.errorCode));
    });
    engine.on("playerStateUpdate", (r) => {
      if (this.left || r.streamID !== this.cred.peerStreamId) return;
      this.remotePlaying = r.state === "PLAYING";
      this.reportMedia();
    });
    engine.on("networkQuality", (userId, up, down) => {
      if (!this.left && userId === this.cred.userId) handlers.onWeakNetwork?.(up >= POOR_NETWORK || down >= POOR_NETWORK);
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
    // A blocked or very poor network: ZEGO's login can keep retrying for a long time. Say so.
    const slow = setTimeout(() => !this.left && handlers.onState("failed", UNREACHABLE), JOIN_TIMEOUT_MS);
    try {
      ok = await engine.loginRoom(cred.roomId, cred.token, { userID: cred.userId, userName: cred.userName }, { userUpdate: false });
    } catch (e) {
      if (!this.left) handlers.onState("failed", joinProblem((e as { code?: number | string })?.code));
      return;
    } finally {
      clearTimeout(slow);
    }
    // Left while joining: leave() already logged out, but the join may have finished after it.
    if (this.left) return closeEngine(engine, cred.roomId);
    if (!ok) {
      handlers.onState("failed", joinProblem(undefined));
      return;
    }
    handlers.onState("connected");
    engine.setSoundLevelDelegate(true, 300);
    if (local) {
      // Our own capture, handed to ZEGO as a custom source: the same tracks the self-view shows.
      const published = await engine.createStream(publishSource(local));
      if (this.left) return;
      this.published = published;
      engine.startPublishingStream(cred.myStreamId, published, PUBLISH_OPTIONS);
      if (this.audioOff) engine.mutePublishStreamAudio(published, true);
      if (this.videoOff) engine.mutePublishStreamVideo(published, true);
    }
  }

  /** Tells the page when both directions are up (and when they stop being). */
  private reportMedia() {
    const up = this.publishing && this.remotePlaying;
    if (up === this.mediaUp || this.left) return;
    this.mediaUp = up;
    this.handlers.onMediaUp?.(up);
  }

  private async play() {
    if (!this.engine || this.playing) return;
    this.playing = true;
    try {
      const remote = await this.engine.startPlayingStream(this.cred.peerStreamId, { audio: this.cred.wants.audio, video: this.cred.wants.video });
      if (this.left) return;
      this.handlers.onRemote(remote);
      // The stream is ours to play once startPlayingStream resolves (playerStateUpdate confirms it too).
      this.remotePlaying = true;
      this.reportMedia();
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
    this.remotePlaying = false;
    this.reportMedia();
  }

  /** Mutes or unmutes what this side sends (the other side is told through ZEGO). */
  setMicMuted(muted: boolean) {
    this.audioOff = muted;
    if (this.engine && this.published) this.engine.mutePublishStreamAudio(this.published, muted);
  }

  setCameraOff(off: boolean) {
    this.videoOff = off;
    if (this.engine && this.published) this.engine.mutePublishStreamVideo(this.published, off);
  }

  /** After switching cameras: send the new camera's track instead of the old one. */
  async replaceVideoTrack(track: MediaStreamTrack) {
    if (this.engine && this.published) await this.engine.replaceTrack(this.published, track);
  }

  /** Stops publishing and playing, leaves the room and frees the engine. Safe to call twice, and mid-join. */
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
    } catch {
      // Best effort: closing the engine below releases them too.
    }
    closeEngine(engine, this.cred.roomId);
  }
}
