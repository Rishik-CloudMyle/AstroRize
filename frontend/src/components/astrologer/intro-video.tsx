"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** "1:16" */
function mmss(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The astrologer's intro video, styled like the app's profile video: their photo as the poster
 * with a round play button and "1:16 · Introduction". Once played it plays inline with the
 * browser's own controls (pause, seek, volume, full screen). `preload="none"` (the public
 * profile) loads nothing until the visitor presses play.
 */
export default function IntroVideo({
  src,
  poster,
  name,
  className = "",
  heightClass = "h-[220px] sm:h-[260px]",
  preload = "metadata",
}: {
  src: string;
  poster: string;
  name: string;
  className?: string;
  heightClass?: string;
  preload?: "none" | "metadata";
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // The length may have loaded (or the file failed) before React attached its handlers.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (v.error) setFailed(true);
    else if (v.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
  }, []);

  function start() {
    const v = video.current;
    if (!v || failed) return;
    setStarted(true);
    // The play button goes away; keyboard focus moves to the video's own controls.
    v.focus();
    // A pause straight after play rejects with AbortError; that isn't a failure.
    v.play().catch((e: unknown) => {
      if ((e as { name?: string } | null)?.name !== "AbortError") setFailed(true);
    });
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-ink ${heightClass} ${className}`}>
      <video
        ref={video}
        src={src}
        preload={preload}
        playsInline
        controls={started && !failed}
        tabIndex={started ? 0 : -1}
        aria-label={`Introduction video from ${name}`}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-contain outline-none"
      />
      {/* The photo stands in as the poster until the video is first played. */}
      {/* (Opaque, so a first frame the browser has already loaded doesn't show through.) */}
      {!started && (
        <>
          <Image src={poster} alt="" fill sizes="(min-width: 1024px) 760px, 100vw" className="object-cover" />
          <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,0)_45%,rgba(28,25,23,.35))]" />
        </>
      )}
      {failed ? (
        <div role="status" className="absolute inset-0 grid place-items-center bg-black/45 px-6 text-center text-[13px] text-white/85">
          The introduction video couldn&apos;t play. Check your connection and try again later.
        </div>
      ) : (
        !started && (
          <button type="button" onClick={start} aria-label={`Play introduction from ${name}`} className="group absolute inset-0 grid place-items-center">
            <span className="grid size-14 place-items-center rounded-full bg-amber-500 pl-1 text-[18px] font-extrabold text-ink shadow-[0_8px_20px_rgba(0,0,0,.3)] transition-transform group-hover:scale-105">
              ▶
            </span>
          </button>
        )
      )}
      {!started && (
        <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-full bg-black/55 px-2 py-[3px] text-[11px] font-bold text-white">
          {duration ? `${mmss(duration)} · ` : ""}Introduction
        </span>
      )}
    </div>
  );
}

/**
 * Stand-in where no intro video has been uploaded yet: the astrologer's photo, blurred and
 * tinted, behind a quiet play glyph and "Intro video coming soon". Never a fake video.
 */
export function IntroVideoPlaceholder({
  poster,
  label = "Intro video coming soon",
  note,
  className = "",
  heightClass = "h-[180px] sm:h-[220px]",
}: {
  poster: string;
  label?: string;
  note?: string;
  className?: string;
  heightClass?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden rounded-2xl border border-line-warm bg-[#2a211b] ${heightClass} ${className}`}
    >
      <Image src={poster} alt="" fill sizes="(min-width: 1024px) 760px, 100vw" className="scale-110 object-cover opacity-55 blur-[14px]" />
      <span className="absolute inset-0 bg-[linear-gradient(160deg,rgba(28,25,23,.35),rgba(120,72,20,.55))]" />
      {/* A thin gold frame inset from the edge. */}
      <span className="pointer-events-none absolute inset-2.5 rounded-xl border border-amber-200/35" />
      <div className="absolute inset-0 grid place-content-center justify-items-center gap-2.5 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-full border border-amber-200/60 bg-white/10 pl-0.5 text-[15px] text-amber-100 backdrop-blur-sm">
          ▶
        </span>
        <b className="text-[14px] font-bold tracking-[.01em] text-amber-50">{label}</b>
        {note && <span className="max-w-[40ch] text-[12px] leading-[1.45] text-amber-100/80">{note}</span>}
      </div>
    </div>
  );
}
