"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  EMPTY_CALL,
  acquireCallSession,
  getCallSession,
  releaseCallSession,
  subscribeCalls,
  type Speaker,
} from "@/lib/media/call-session";
import type { MediaWants } from "@/lib/media/zego-call";

export type { Link, Permission, Speaker } from "@/lib/media/call-session";

// The media side of one consultation window, for either party. The call itself (credentials,
// devices, the ZEGO room, the other side's sound) lives in lib/media/call-session.ts, outside the
// window: this hook only shows it. Closing the window — Minimise, or moving to another page — leaves
// the call running; it ends when the consultation does (releaseCallSession) or when `active` is false.

const NONE: MediaWants = { audio: false, video: false };

export function useCallMedia({
  base,
  wants,
  active,
  onJoined,
}: {
  base: string;
  wants: MediaWants;
  active: boolean;
  /** This side's "joined" was recorded (re-read the session: billing may have started). */
  onJoined?: () => void;
}) {
  const needsDevices = wants.audio || wants.video;
  const onJoinedRef = useRef(onJoined);
  useEffect(() => {
    onJoinedRef.current = onJoined;
  });

  // Show the call while this window is open (starting it the first time); the call outlives the window.
  useEffect(() => {
    if (!active) {
      releaseCallSession(base);
      return;
    }
    const session = acquireCallSession(base, { audio: wants.audio, video: wants.video });
    session.attachWindow();
    const off = session.onJoined(() => onJoinedRef.current?.());
    return () => {
      off();
      session.detachWindow();
    };
  }, [active, base, wants.audio, wants.video]);

  const snap = useSyncExternalStore(
    subscribeCalls,
    () => (active ? (getCallSession(base)?.snap ?? EMPTY_CALL) : EMPTY_CALL),
    () => EMPTY_CALL,
  );
  const session = () => getCallSession(base);
  const answer = snap.answer;
  const available = answer?.available === true;

  return {
    /** Credentials answer (null while loading or for chat). */
    answer: needsDevices ? answer : null,
    answerFailed: snap.answerFailed,
    reloadAnswer: () => session()?.loadAnswer(),
    /** No room to join: ZEGO isn't set up on AstroRize yet. */
    notConfigured: answer?.available === false && answer.reason === "not_configured",
    available,
    wants: needsDevices ? wants : NONE,
    captureAllowed: needsDevices && (available || wants.video),
    permission: snap.permission,
    allow: () => session()?.allow(),
    preview: snap.preview,
    remote: snap.remote,
    link: snap.link,
    linkProblem: snap.linkProblem,
    retryJoin: () => session()?.retryJoin(),
    offline: snap.offline,
    /** ZEGO measures this side's network as poor: the video is being sent at a lower quality. */
    weakNetwork: snap.weakNetwork,
    /** Both directions are up: our stream is published and the other side's is playing (billing starts once both sides have this). */
    mediaUp: snap.mediaUp,
    micMuted: snap.micMuted,
    toggleMic: () => session()?.toggleMic(),
    cameraOff: snap.cameraOff,
    toggleCamera: () => session()?.toggleCamera(),
    canSwitchCamera: snap.cameras.length > 1,
    switchCamera: async () => session()?.switchCamera(),
    remoteCameraOff: snap.remoteCameraOff,
    levels: snap.levels,
    /** The other side's sound on this device (kept while minimised). */
    speaker: snap.speaker,
    setSpeaker: (update: (s: Speaker) => Speaker) => session()?.setSpeaker(update),
    /** The browser blocked the other side's sound until a tap. */
    audioBlocked: snap.audioBlocked,
    resumeAudio: () => session()?.resumeAudio(),
  };
}

export type CallMedia = ReturnType<typeof useCallMedia>;
