"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { ZegoLive, type LiveMediaAnswer } from "@/lib/live-media";
import { CaptureError, captureLocal, stopStream, type CallState, type CaptureProblem } from "@/lib/media/zego-call";

// The astrologer's side of a live: their camera and microphone, shown to them as a self-view and
// broadcast as the live's one stream when live video (ZEGO) is set up. While a private
// consultation runs, the broadcast's sound is switched off — the video keeps going to everyone —
// and comes back when it ends. When ZEGO isn't set up nothing is broadcast, and the console says so.

export type Permission = "idle" | "asking" | "granted" | CaptureProblem;

const CAMERA_AND_MIC = { audio: true, video: true };

export function useLiveBroadcast({ live, privateOn }: { live: boolean; privateOn: boolean }) {
  const [answer, setAnswer] = useState<LiveMediaAnswer | null>(null);
  const [answerFailed, setAnswerFailed] = useState(false);
  const [permission, setPermission] = useState<Permission>("idle");
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [link, setLink] = useState<CallState | "off">("off");
  const [linkProblem, setLinkProblem] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const localRef = useRef<MediaStream | null>(null);
  const liveRef = useRef<ZegoLive | null>(null);
  const audioMutedRef = useRef(false);

  const loadAnswer = useCallback(async () => {
    try {
      const { media } = await api.get<{ media: LiveMediaAnswer }>("/portal/live/media");
      setAnswer(media);
      setAnswerFailed(false);
    } catch {
      setAnswerFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    api
      .get<{ media: LiveMediaAnswer }>("/portal/live/media")
      .then(({ media }) => {
        if (!cancelled) setAnswer(media);
      })
      .catch(() => {
        if (!cancelled) setAnswerFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [live]);

  /** Turns the camera and microphone on (the browser asks the first time). */
  const allow = useCallback(async () => {
    if (localRef.current) return;
    setPermission("asking");
    try {
      const stream = await captureLocal(CAMERA_AND_MIC);
      localRef.current = stream;
      setLocal(stream);
      setPermission("granted");
      setMicOn(true);
      setCamOn(true);
    } catch (e) {
      setPermission(e instanceof CaptureError ? e.problem : "unknown");
    }
  }, []);

  // Already allowed for this site: turn them on without a click.
  useEffect(() => {
    if (!live || permission !== "idle" || !navigator.permissions?.query) return;
    let cancelled = false;
    void Promise.all(["camera", "microphone"].map((name) => navigator.permissions.query({ name: name as PermissionName })))
      .then((states) => {
        if (!cancelled && states.every((s) => s.state === "granted")) void allow();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [live, permission, allow]);

  // Broadcast once there are credentials and the devices are on.
  useEffect(() => {
    if (!live || !answer?.available || !local) return;
    let joined: ZegoLive | null = null;
    let gone = false;
    void ZegoLive.broadcast(answer, local, {
      onState: (s, detail) => {
        if (gone) return;
        setLink(s);
        setLinkProblem(s === "failed" ? (detail ?? "") : "");
        // Joined (or re-joined): apply the current sound state.
        if (s === "connected") joined?.setAudioMuted(audioMutedRef.current);
      },
      renew: async () => {
        const { media } = await api.get<{ media: LiveMediaAnswer }>("/portal/live/media");
        return media.available ? media : null;
      },
    })
      .then((l) => {
        if (gone) l.leave();
        else {
          joined = l;
          liveRef.current = l;
          l.setAudioMuted(audioMutedRef.current);
        }
      })
      .catch(() => {
        if (!gone) setLink("failed");
      });
    return () => {
      gone = true;
      joined?.leave();
      if (liveRef.current === joined) liveRef.current = null;
      setLink("off");
    };
  }, [live, answer, local]);

  // A private consultation: the room hears nothing (the video carries on). Mic off: same.
  const audioMuted = privateOn || !micOn;
  useEffect(() => {
    audioMutedRef.current = audioMuted;
    liveRef.current?.setAudioMuted(audioMuted);
  }, [audioMuted]);

  // Not live any more: stop broadcasting and turn the camera off (state resets below, while rendering).
  useEffect(() => {
    if (live) return;
    liveRef.current?.leave();
    liveRef.current = null;
    stopStream(localRef.current);
    localRef.current = null;
  }, [live]);
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    setWasLive(live);
    if (!live) {
      setLocal(null);
      setPermission("idle");
      setAnswer(null);
    }
  }
  useEffect(() => {
    const release = () => {
      liveRef.current?.leave();
      stopStream(localRef.current);
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
      localRef.current = null;
    };
  }, []);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
      return !on;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((on) => {
      localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !on));
      liveRef.current?.setVideoOff(on);
      return !on;
    });
  }, []);

  return {
    /** Live video isn't set up on Astrorize yet: nothing is broadcast. */
    notConfigured: answer?.available === false,
    answerFailed,
    reloadAnswer: loadAnswer,
    permission,
    allow,
    local,
    link,
    linkProblem,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    audioMuted,
  };
}

export type LiveBroadcast = ReturnType<typeof useLiveBroadcast>;
