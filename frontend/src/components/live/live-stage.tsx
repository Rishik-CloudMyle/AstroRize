"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { ZegoLive, type LiveMediaAnswer } from "@/lib/live-media";
import type { CallState } from "@/lib/media/zego-call";

/**
 * The live's video for a viewer who joined: the host's real stream (play only) when live video is
 * set up, or the room's poster with an honest "not connected yet" note when it isn't. Never a
 * recording presented as live. `silenced`: the host is in a private consultation, so nothing is
 * heard here (the host's stream audio is also muted at the source).
 */
export default function LiveStage({
  roomId,
  poster,
  hostName,
  silenced,
  quiet = false,
}: {
  roomId: string;
  poster: string;
  hostName: string;
  silenced: boolean;
  /** Another notice is centred over the video (private banner, call card): keep this one out of its way. */
  quiet?: boolean;
}) {
  const [answer, setAnswer] = useState<LiveMediaAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const [link, setLink] = useState<CallState | "off">("off");
  const [problem, setProblem] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ media: LiveMediaAnswer }>(`/live-rooms/${encodeURIComponent(roomId)}/media`)
      .then(({ media }) => !cancelled && setAnswer(media))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    if (!answer?.available) return;
    let live: ZegoLive | null = null;
    let gone = false;
    void ZegoLive.watch(answer, {
      onState: (s, detail) => {
        if (gone) return;
        setLink(s);
        setProblem(s === "failed" ? (detail ?? "") : "");
      },
      onStream: (s) => !gone && setStream(s),
      renew: async () => {
        const { media } = await api.get<{ media: LiveMediaAnswer }>(`/live-rooms/${encodeURIComponent(roomId)}/media`);
        return media.available ? media : null;
      },
    })
      .then((l) => {
        if (gone) l.leave();
        else live = l;
      })
      .catch(() => {
        if (!gone) setLink("failed");
      });
    return () => {
      gone = true;
      live?.leave();
      setStream(null);
    };
  }, [answer, roomId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
  }, [stream]);

  const muted = !soundOn || silenced;
  const notConnected = answer?.available === false || failed;

  return (
    <>
      <Image src={poster} alt="" fill priority sizes="(min-width: 1024px) 800px, 100vw" className={`object-cover ${stream ? "opacity-0" : "opacity-60"}`} />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        aria-label={`${hostName} live`}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${stream ? "opacity-100" : "opacity-0"}`}
      />
      {!stream && !quiet && (
        <div role="status" className="absolute inset-x-0 top-[38%] grid -translate-y-1/2 place-items-center px-6 text-center">
          {notConnected ? (
            <span className="max-w-[36ch] rounded-2xl bg-black/55 px-4 py-3">
              <b className="block text-[14px] text-paper">Live video isn&apos;t connected yet</b>
              <span className="mt-1 block text-[12.5px] leading-normal text-white/80">
                {answer?.available === false
                  ? "Chat, gifts, the poll and the consult queue work as usual."
                  : "Couldn't reach the live video. Chat and the queue still work."}
              </span>
            </span>
          ) : link === "failed" ? (
            <span className="max-w-[34ch] rounded-2xl bg-black/55 px-4 py-3 text-[13px] leading-normal text-white/85">
              {problem || "The live video couldn't connect. Check your connection — the chat and queue still work."}
            </span>
          ) : (
            <span className="flex flex-col items-center gap-3">
              <span aria-hidden="true" className="size-10 animate-spin rounded-full border-[3px] border-white/20 border-t-amber-400" />
              <span className="text-[13px] font-semibold text-white/80">{answer ? `Waiting for ${hostName}'s video…` : "Loading live video…"}</span>
            </span>
          )}
        </div>
      )}
      {stream && !silenced && !soundOn && (
        <button
          type="button"
          onClick={() => setSoundOn(true)}
          className="absolute left-1/2 top-[46%] z-[1] -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-[13px] font-bold text-white"
        >
          🔈 Tap for sound
        </button>
      )}
    </>
  );
}
