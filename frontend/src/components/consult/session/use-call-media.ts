"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
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
} from "@/lib/media/zego-call";

// The media side of one consultation window, for either party: asks the API for the room
// credentials, captures the microphone (and the camera on a video call only), joins the room and
// plays the other side. Everything is released when the window closes or the page goes away.

/** idle: not asked yet · asking: the browser prompt is up · granted · or why it failed. */
export type Permission = "idle" | "asking" | "granted" | CaptureProblem;

/** connected/… once joined; "off" when there is no room to join (chat, not set up, not started). */
export type Link = CallState | "off";

const NONE: MediaWants = { audio: false, video: false };

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

export function useCallMedia({ base, wants, active }: { base: string; wants: MediaWants; active: boolean }) {
  const needsDevices = wants.audio || wants.video;
  const [answer, setAnswer] = useState<MediaAnswer | null>(null);
  const [answerFailed, setAnswerFailed] = useState(false);
  const [permission, setPermission] = useState<Permission>("idle");
  // The captured stream (joined once) and what the self-view shows (changes on camera switch).
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [link, setLink] = useState<Link>("off");
  const [linkProblem, setLinkProblem] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);
  const [levels, setLevels] = useState({ me: 0, peer: 0 });
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [offline, setOffline] = useState(false);
  const [joinAttempt, setJoinAttempt] = useState(0);

  const localRef = useRef<MediaStream | null>(null);
  const callRef = useRef<ZegoCall | null>(null);
  const cameraIdRef = useRef<string | undefined>(undefined);
  const wantsRef = useRef(wants);
  useEffect(() => {
    wantsRef.current = wants;
  });

  // 1. Room credentials (or why there are none). Chat sessions have no room at all.
  const loadAnswer = useCallback(async () => {
    try {
      const { media } = await api.get<{ media: MediaAnswer }>(`${base}/media`);
      setAnswer(media);
      setAnswerFailed(false);
    } catch {
      setAnswerFailed(true);
    }
  }, [base]);

  useEffect(() => {
    if (!active || !needsDevices) return;
    let cancelled = false;
    api.get<{ media: MediaAnswer }>(`${base}/media`).then(
      ({ media }) => {
        if (cancelled) return;
        setAnswer(media);
        setAnswerFailed(false);
      },
      () => !cancelled && setAnswerFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [active, needsDevices, base]);

  const available = answer?.available === true;
  // Devices are captured when there is a room to send them to — or, on a video call, so the
  // customer can at least check their own picture while video isn't connected yet.
  const captureAllowed = needsDevices && (available || wants.video);

  /** Opens the camera/microphone (the browser asks the first time). */
  const allow = useCallback(async () => {
    if (localRef.current) return;
    setPermission("asking");
    try {
      const stream = await captureLocal(wantsRef.current, cameraIdRef.current);
      localRef.current = stream;
      setLocal(stream);
      setPreview(stream);
      setPermission("granted");
      setMicMuted(false);
      setCameraOff(false);
      if (wantsRef.current.video) setCameras(await listCameras());
    } catch (e) {
      setPermission(e instanceof CaptureError ? e.problem : "unknown");
    }
  }, []);

  // Already allowed for this site: no need to show the "allow" step first.
  useEffect(() => {
    if (!active || !captureAllowed || permission !== "idle") return;
    let cancelled = false;
    void alreadyAllowed(wantsRef.current).then((ok) => {
      if (ok && !cancelled) void allow();
    });
    return () => {
      cancelled = true;
    };
  }, [active, captureAllowed, permission, allow]);

  // 2. Join the room once there are credentials and the devices are on.
  useEffect(() => {
    if (!active || !answer?.available || !local) return;
    let joined: ZegoCall | null = null;
    let gone = false;
    void ZegoCall.join(answer, local, {
      onState: (state, detail) => {
        if (gone) return;
        setLink(state);
        setLinkProblem(state === "failed" ? (detail ?? "The call couldn't connect.") : "");
      },
      onRemote: (stream) => {
        if (gone) return;
        setRemote(stream);
        if (!stream) setRemoteCameraOff(false);
      },
      onRemoteCamera: (off) => !gone && setRemoteCameraOff(off),
      onLevels: (l) => !gone && setLevels(l),
      // A fresh token for the same room; kept out of state so the call isn't re-joined.
      renew: async () => {
        const { media } = await api.get<{ media: MediaAnswer }>(`${base}/media`);
        return media.available ? media : null;
      },
    })
      .then((call) => {
        if (gone) call.leave();
        else {
          joined = call;
          callRef.current = call;
        }
      })
      .catch(() => {
        if (gone) return;
        setLink("failed");
        setLinkProblem("The call couldn't connect. Check your internet connection and try again.");
      });
    return () => {
      gone = true;
      joined?.leave();
      if (callRef.current === joined) callRef.current = null;
      setRemote(null);
      setLink("off");
    };
    // joinAttempt: "Try again" re-runs the join with the same devices.
  }, [active, answer, local, joinAttempt, base]);

  // 3. Release everything when the window closes, the session ends, or the page is left.
  useEffect(() => {
    const release = () => {
      callRef.current?.leave();
      callRef.current = null;
      stopStream(localRef.current);
      localRef.current = null;
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);

  useEffect(() => {
    if (active) return;
    callRef.current?.leave();
    callRef.current = null;
    stopStream(localRef.current);
    localRef.current = null;
  }, [active]);

  // The browser's own view of the network, shown while ZEGO reconnects.
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const toggleMic = useCallback(() => {
    const next = !micMuted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    callRef.current?.setMicMuted(next);
    setMicMuted(next);
  }, [micMuted]);

  const toggleCamera = useCallback(() => {
    const next = !cameraOff;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    callRef.current?.setCameraOff(next);
    setCameraOff(next);
  }, [cameraOff]);

  /** Front ↔ back (or the next camera on a computer). */
  const switchCamera = useCallback(async () => {
    const current = localRef.current;
    if (!current || cameras.length < 2) return;
    const nowId = current.getVideoTracks()[0]?.getSettings().deviceId;
    const idx = cameras.findIndex((c) => c.deviceId === nowId);
    const next = cameras[(idx + 1) % cameras.length];
    try {
      const fresh = await captureLocal({ audio: false, video: true }, next.deviceId);
      const track = fresh.getVideoTracks()[0];
      if (!track) return;
      track.enabled = !cameraOff;
      await callRef.current?.replaceVideoTrack(track);
      current.getVideoTracks().forEach((t) => {
        t.stop();
        current.removeTrack(t);
      });
      current.addTrack(track);
      cameraIdRef.current = next.deviceId;
      // Same stream (still joined), new object for the self-view so it picks up the new camera.
      setPreview(new MediaStream(current.getTracks()));
    } catch {
      // The other camera is busy or gone: keep the current one.
    }
  }, [cameras, cameraOff]);

  const retryJoin = useCallback(() => {
    setLink("connecting");
    setJoinAttempt((n) => n + 1);
  }, []);

  return {
    /** Credentials answer (null while loading or for chat). */
    answer: needsDevices ? answer : null,
    answerFailed,
    reloadAnswer: loadAnswer,
    /** No room to join: ZEGO isn't set up on Astrorize yet. */
    notConfigured: answer?.available === false && answer.reason === "not_configured",
    available,
    wants: needsDevices ? wants : NONE,
    captureAllowed,
    permission,
    allow,
    preview,
    remote,
    link,
    linkProblem,
    retryJoin,
    offline,
    micMuted,
    toggleMic,
    cameraOff,
    toggleCamera,
    canSwitchCamera: cameras.length > 1,
    switchCamera,
    remoteCameraOff,
    levels,
  };
}

export type CallMedia = ReturnType<typeof useCallMedia>;
