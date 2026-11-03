"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getLiveBroadcast, liveSnapshot, serverLiveSnapshot, subscribeLive, type LiveSnapshot } from "@/lib/media/live-broadcast";

export type { Permission } from "@/lib/media/live-broadcast";

// The astrologer's side of a live, as the console shows it: their camera and microphone (a
// self-view), and the state of the broadcast. The broadcast itself lives in
// lib/media/live-broadcast.ts, outside the console, so leaving the Live page never stops it.

/** The broadcast in progress (null when not live). */
export function useLiveSnapshot(): LiveSnapshot | null {
  return useSyncExternalStore(subscribeLive, liveSnapshot, serverLiveSnapshot);
}

export function useLiveBroadcast(live: boolean) {
  const found = useLiveSnapshot();
  const snap = live ? found : null;
  const session = () => getLiveBroadcast();
  const micOn = snap?.micOn ?? true;
  return {
    /** Live video isn't set up on AstroRize yet: nothing is broadcast. */
    notConfigured: snap?.answer?.available === false,
    answerFailed: snap?.answerFailed ?? false,
    reloadAnswer: () => session()?.loadAnswer(),
    permission: snap?.permission ?? "idle",
    allow: async () => session()?.allow(),
    local: snap?.local ?? null,
    link: snap?.link ?? "off",
    linkProblem: snap?.linkProblem ?? "",
    retry: () => session()?.retry(),
    micOn,
    camOn: snap?.camOn ?? true,
    toggleMic: () => session()?.toggleMic(),
    toggleCam: () => session()?.toggleCam(),
    audioMuted: (snap?.privateOn ?? false) || !micOn,
  };
}

export type LiveBroadcast = ReturnType<typeof useLiveBroadcast>;

/** "MM:SS" since the live started (from the feed), ticking every second; null until known. */
export function useLiveClock(startedAt: string | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  const secs = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}
