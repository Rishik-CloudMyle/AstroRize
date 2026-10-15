"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** "1:16" */
function mmss(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The astrologer's intro video, styled like the app's profile video: their photo as the poster,
 * a round play/pause button, "1:16 · Introduction" and a thin progress bar.
 */
export default function IntroVideo({
  src,
  poster,
  name,
  className = "",
  heightClass = "h-[220px] sm:h-[260px]",
}: {
  src: string;
  poster: string;
  name: string;
  className?: string;
  heightClass?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  // The length may have loaded (or the file failed) before React attached its handlers.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (v.error) setFailed(true);
    else if (v.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
  }, []);

  function toggle() {
    const v = video.current;
    if (!v || failed) return;
    if (v.paused) {
      setStarted(true);
      // A pause straight after play rejects with AbortError; that isn't a failure.
      v.play().catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name !== "AbortError") setFailed(true);
      });
    } else {
      v.pause();
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-ink ${heightClass} ${className}`}>
      <video
        ref={video}
        src={src}
        preload="metadata"
        playsInline
        aria-label={`Introduction video from ${name}`}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (Number.isFinite(v.duration) && v.duration > 0) setProgress(v.currentTime / v.duration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(1);
        }}
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
      {/* The photo stands in as the poster until the video is first played. */}
      {!started && <Image src={poster} alt="" fill sizes="(min-width: 1024px) 760px, 100vw" className="object-cover opacity-[.88]" />}
      {failed ? (
        <div role="status" className="absolute inset-0 grid place-items-center bg-black/45 px-6 text-center text-[13px] text-white/85">
          The introduction video couldn&apos;t play. Check your connection and try again later.
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause introduction" : "Play introduction"}
          className="group absolute inset-0 grid place-items-center"
        >
          <span
            className={`grid size-14 place-items-center rounded-full bg-amber-500 text-[18px] font-extrabold text-ink shadow-[0_8px_20px_rgba(0,0,0,.3)] transition-opacity group-hover:scale-105 ${playing ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : ""}`}
          >
            {playing ? "❚❚" : "▶"}
          </span>
        </button>
      )}
      <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-[3px] text-[11px] font-bold text-white">
        {duration ? `${mmss(duration)} · ` : ""}Introduction
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
        <b className="block h-full bg-amber-500" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
