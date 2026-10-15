"use client";

import type { ZegoExpressEngine } from "zego-express-engine-webrtc";
import type { CallState } from "./media/zego-call";

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

/** A joined live room. Create with ZegoLive.watch or ZegoLive.broadcast; always end with leave(). */
export class ZegoLive {
  private engine: ZegoExpressEngine | null = null;
  private published: MediaStream | null = null;
  private playing = false;
  private left = false;

  private constructor(
    private cred: LiveCredentials,
    private handlers: LiveHandlers,
  ) {}

  /** Viewer: joins play-only and plays the live's stream whenever it is on air. */
  static async watch(cred: LiveCredentials, handlers: LiveHandlers): Promise<ZegoLive> {
    const live = new ZegoLive(cred, handlers);
    await live.start(null);
    return live;
  }

  /** Host: joins and publishes `local` (camera + microphone, already captured) as the live's stream. */
  static async broadcast(cred: LiveCredentials, local: MediaStream, handlers: LiveHandlers): Promise<ZegoLive> {
    const live = new ZegoLive(cred, handlers);
    await live.start(local);
    return live;
  }

  private async start(local: MediaStream | null) {
    const { cred, handlers } = this;
    handlers.onState("connecting");
    const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");
    if (this.left) return;
    const engine = new ZegoExpressEngine(cred.appId, cred.server);
    this.engine = engine;
    try {
      engine.setLogConfig({ logLevel: "error", remoteLogLevel: "disable" });
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
    try {
      ok = await engine.loginRoom(cred.roomId, cred.token, { userID: cred.userId, userName: cred.userName }, { userUpdate: false });
    } catch (e) {
      if (!this.left) handlers.onState("failed", problem((e as { code?: number | string })?.code));
      return;
    }
    if (this.left) return;
    if (!ok) {
      handlers.onState("failed", problem());
      return;
    }
    handlers.onState("connected");
    if (local) {
      this.published = await engine.createStream({ custom: { source: local } });
      if (this.left) return;
      engine.startPublishingStream(cred.streamId, this.published);
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
    if (this.engine && this.published) this.engine.mutePublishStreamAudio(this.published, muted);
  }

  setVideoOff(off: boolean) {
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
      engine.logoutRoom(this.cred.roomId);
      engine.destroyEngine();
    } catch {
      // Best effort: ZEGO closes the session when the page goes.
    }
  }
}
