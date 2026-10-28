"use client";

import type { ZegoExpressEngine } from "zego-express-engine-webrtc";
import { JOIN_TIMEOUT_MS, PUBLISH_OPTIONS, closeEngine, publishSource, type CallState } from "./media/zego-call";

// A live room's public video through ZEGO: the host broadcasts one stream (camera + microphone),
// viewers only play it. A private consultation taken from the live is a separate one-to-one room
// (lib/media/zego-call.ts), so its audio never reaches the live audience. The SDK is loaded only
// when there is something to connect to.

/** GET /api/live-rooms/:id/media (viewer) and GET /api/portal/live/media (host). */
export type LiveMediaAnswer =
  | {
      available: true;
      appId: number;
      server: string;
      roomId: string;
      userId: string;
      userName: string;
      token: string;
      /** The live's one stream. */
      streamId: string;
      /** True for the host (may publish the stream), false for viewers. */
      publish: boolean;
    }
  | { available: false; reason: "not_configured" | string };

export type LiveCredentials = Extract<LiveMediaAnswer, { available: true }>;

export interface LiveHandlers {
  onState: (state: CallState, detail?: string) => void;
  /** Viewers: the live's stream started (or stopped: null). */
  onStream?: (stream: MediaStream | null) => void;
  /** Fresh credentials when the token is about to expire (null: the live is over). */
  renew: () => Promise<LiveCredentials | null>;
}

const problem = (code?: number | string) =>
  `The live video couldn't connect${code !== undefined && code !== 0 && code !== "" ? ` (code ${code})` : ""}. Check your internet connection.`;

/**
 * A live room. ZegoLive.watch / ZegoLive.broadcast join in the background and return at once, so
 * the caller can leave() at any moment, even mid-join. Always end with leave().
 */
export class ZegoLive {
  private engine: ZegoExpressEngine | null = null;
  private published: MediaStream | null = null;
  private playing = false;
  private left = false;
  /** What the caller asked for, applied as soon as our stream is published (and kept across reconnects). */
  private audioOff = false;
  private videoOff = false;

  private constructor(
    private cred: LiveCredentials,
    private handlers: LiveHandlers,
  ) {}

  /** Viewer: joins play-only and plays the live's stream whenever it is on air. */
  static watch(cred: LiveCredentials, handlers: LiveHandlers): ZegoLive {
    return new ZegoLive(cred, handlers).begin(null);
  }

  /** Host: joins and publishes `local` (camera + microphone, already captured) as the live's stream. */
  static broadcast(cred: LiveCredentials, local: MediaStream, handlers: LiveHandlers): ZegoLive {
    return new ZegoLive(cred, handlers).begin(local);
  }

  private begin(local: MediaStream | null): ZegoLive {
    this.start(local).catch((e: unknown) => {
      // The SDK didn't load, or ZEGO refused the stream.
      if (!this.left) this.handlers.onState("failed", problem((e as { code?: number | string })?.code));
    });
    return this;
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
      else if (reason === "RECONNECTING") handlers.onState("reconnecting");
      else if (reason === "RECONNECT_FAILED" || reason === "LOGIN_FAILED") handlers.onState("failed", problem(code));
      else if (reason === "KICKOUT") handlers.onState("failed", "This live was opened somewhere else (another tab or device).");
    });
    if (!local) {
      engine.on("roomStreamUpdate", (_room, type, list) => {
        if (this.left || !list.some((s) => s.streamID === cred.streamId)) return;
        if (type === "ADD") void this.play();
        else this.stopPlaying();
      });
    }
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
          // Retried at the next warning.
        });
    });

    let ok = false;
    // A blocked or very poor network: ZEGO's login can keep retrying for a long time. Say so.
    const slow = setTimeout(() => !this.left && handlers.onState("failed", problem()), JOIN_TIMEOUT_MS);
    try {
      ok = await engine.loginRoom(cred.roomId, cred.token, { userID: cred.userId, userName: cred.userName }, { userUpdate: false });
    } catch (e) {
      if (!this.left) handlers.onState("failed", problem((e as { code?: number | string })?.code));
      return;
    } finally {
      clearTimeout(slow);
    }
    // Left while joining: leave() already logged out, but the join may have finished after it.
    if (this.left) return closeEngine(engine, cred.roomId);
    if (!ok) {
      handlers.onState("failed", problem());
      return;
    }
    handlers.onState("connected");
    if (local) {
      const published = await engine.createStream(publishSource(local));
      if (this.left) return;
      this.published = published;
      engine.startPublishingStream(cred.streamId, published, PUBLISH_OPTIONS);
      if (this.audioOff) engine.mutePublishStreamAudio(published, true);
      if (this.videoOff) engine.mutePublishStreamVideo(published, true);
    } else {
      // Already on air when we arrived: roomStreamUpdate only reports changes.
      void this.play();
    }
  }

  private async play() {
    if (!this.engine || this.playing) return;
    this.playing = true;
    try {
      const stream = await this.engine.startPlayingStream(this.cred.streamId, { audio: true, video: true });
      if (!this.left) this.handlers.onStream?.(stream);
    } catch {
      this.playing = false;
      // Not on air yet: ZEGO announces it when it starts.
    }
  }

  private stopPlaying() {
    if (!this.engine || !this.playing) return;
    this.playing = false;
    try {
      this.engine.stopPlayingStream(this.cred.streamId);
    } catch {
      // Already stopped.
    }
    this.handlers.onStream?.(null);
  }

  /** Host: silences the live's audio for everyone (e.g. during a private consultation) or restores it. */
  setAudioMuted(muted: boolean) {
    this.audioOff = muted;
    if (this.engine && this.published) this.engine.mutePublishStreamAudio(this.published, muted);
  }

  setVideoOff(off: boolean) {
    this.videoOff = off;
    if (this.engine && this.published) this.engine.mutePublishStreamVideo(this.published, off);
  }

  /** Stops publishing/playing, leaves the room and frees the engine. Safe to call twice. */
  leave() {
    if (this.left) return;
    this.left = true;
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    try {
      if (this.playing) engine.stopPlayingStream(this.cred.streamId);
      if (this.published) {
        engine.stopPublishingStream(this.cred.streamId);
        engine.destroyStream(this.published);
      }
    } catch {
      // Best effort: closing the engine below releases them too.
    }
    closeEngine(engine, this.cred.roomId);
  }
}
