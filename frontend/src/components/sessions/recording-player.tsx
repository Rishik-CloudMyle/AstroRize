"use client";

// The in-app player for a paid session's recording (audio only). Playback only:
//  - no download button or link, no "controls" attribute (so no browser menu with Download),
//    controlsList="nodownload noremoteplayback", no picture-in-picture, context menu blocked;
//  - the audio is streamed from an authenticated API route with a secret link that lives a couple of
//    minutes and is bound to this customer and this recording; the player asks for a new one when it
//    is about to run out (before a seek, a resume or a retry). There is no blob: URL and no stable
//    address anyone could keep or share;
//  - it pauses by itself whenever the protected area is hidden (tab/window lost focus).
// Fetching the link is also what records "this customer played their recording" for the audit log, so
// it only happens when Play is pressed, not when the page opens.

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { usePrivacyHidden } from "./protected-content";
import type { RecordingPart } from "./session-types";

const RATES = [0.75, 1, 1.25, 1.5, 2];
/** Ask for a new link when the current one has less than this left. */
const REFRESH_MARGIN_MS = 20_000;

function mmss(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const ctl =
  "grid size-app-hit shrink-0 place-items-center rounded-full text-app-ink hover:bg-app-tint focus-visible:outline-2 focus-visible:outline-app-selected disabled:opacity-50";

export default function RecordingPlayer({
  sessionId,
  parts,
  astrologer,
}: {
  sessionId: string;
  parts: RecordingPart[];
  astrologer: { name: string; initials: string; photo: string };
}) {
  const hidden = usePrivacyHidden();
  const audio = useRef<HTMLAudioElement>(null);
  const expires = useRef(0);
  const pending = useRef<{ seek: number; play: boolean } | null>(null);
  const retries = useRef(0);
  const scrubRef = useRef<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [mediaDur, setMediaDur] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [rate, setRate] = useState(1);

  const part = parts[Math.min(idx, parts.length - 1)];
  const total = Number.isFinite(mediaDur) && mediaDur > 0 ? mediaDur : (part?.durationSeconds ?? 0);

  /** Gets a fresh secret link for part `i` and starts it at `seek` seconds. */
  const load = useCallback(
    async (i: number, seek: number, play: boolean) => {
      const el = audio.current;
      const p = parts[i];
      if (!el || !p) return;
      setBusy(true);
      setError(null);
      try {
        const r = await api.post<{ url: string; expiresAt: string }>(`/my-sessions/${encodeURIComponent(sessionId)}/recordings/${encodeURIComponent(p.id)}/stream-token`);
        expires.current = Date.parse(r.expiresAt);
        pending.current = { seek, play };
        setIdx(i);
        setLoaded(true);
        el.src = r.url;
        el.load();
      } catch (e) {
        setBusy(false);
        setPlaying(false);
        setError(e instanceof ApiError ? e.message : "We couldn't open this recording. Check your connection and try again.");
      }
    },
    [parts, sessionId],
  );

  const stale = () => Date.now() > expires.current - REFRESH_MARGIN_MS;

  function toggle() {
    const el = audio.current;
    if (!el || busy) return;
    if (!loaded || el.ended) {
      void load(idx, 0, true);
    } else if (el.paused) {
      if (stale()) void load(idx, el.currentTime, true);
      else void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }

  function seekTo(t: number) {
    const el = audio.current;
    const to = Math.min(Math.max(0, t), total || t);
    setCur(to);
    if (!el || !loaded) return void (!busy && load(idx, to, false));
    if (stale()) void load(idx, to, !el.paused);
    else el.currentTime = to;
  }

  function commitScrub() {
    const v = scrubRef.current;
    scrubRef.current = null;
    setScrub(null);
    if (v !== null) seekTo(v);
  }

  // Covered (window lost focus / hidden): stop playing, and stay stopped until the person presses Play.
  useEffect(() => {
    if (hidden) audio.current?.pause();
  }, [hidden]);

  useEffect(() => {
    const el = audio.current;
    return () => {
      el?.pause();
      el?.removeAttribute("src");
      el?.load();
    };
  }, []);

  function onMeta() {
    const el = audio.current;
    if (!el) return;
    setMediaDur(el.duration);
    el.playbackRate = rate;
    const p = pending.current;
    pending.current = null;
    setBusy(false);
    retries.current = 0;
    if (!p) return;
    if (p.seek > 0) el.currentTime = p.seek;
    if (p.play && !hidden) void el.play().catch(() => setPlaying(false));
  }

  function onError() {
    const el = audio.current;
    if (!el || !el.getAttribute("src")) return;
    // Most likely the link ran out mid-playback (or a seek outside what was loaded): get a new one once or twice.
    if (retries.current < 2) {
      retries.current += 1;
      void load(idx, el.currentTime || cur, playing);
      return;
    }
    setBusy(false);
    setPlaying(false);
    setError("This recording stopped loading. Please try again.");
  }

  function onEnded() {
    setPlaying(false);
    if (idx + 1 < parts.length) void load(idx + 1, 0, true);
  }

  function chooseRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]!;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  function pickPart(i: number) {
    if (i === idx && loaded) return;
    audio.current?.pause();
    setCur(0);
    setMediaDur(0);
    setLoaded(false);
    setIdx(i);
  }

  const shown = scrub ?? cur;

  return (
    <div>
      {/* No `controls`: the browser's own bar (with its Download menu) never shows. */}
      <audio
        ref={audio}
        preload="none"
        controlsList="nodownload noremoteplayback"
        {...({ disablePictureInPicture: true, disableRemotePlayback: true } as object)}
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={onMeta}
        onTimeUpdate={(e) => scrubRef.current === null && setCur(e.currentTarget.currentTime)}
        onDurationChange={(e) => setMediaDur(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        onError={onError}
        className="hidden"
      />

      <div className="relative grid aspect-[16/8] place-items-center overflow-hidden rounded-app-card bg-app-tint-2 max-lg:aspect-[16/9]">
        {astrologer.photo ? (
          <Image src={astrologer.photo} alt="" fill unoptimized sizes="(max-width: 1024px) 100vw, 640px" className="scale-110 object-cover opacity-60 blur-md" draggable={false} />
        ) : null}
        <span className="relative grid size-24 place-items-center overflow-hidden rounded-full border-[3px] border-white bg-app-tint-2 text-[28px] font-bold text-app-active shadow-app-card">
          {astrologer.photo ? <Image src={astrologer.photo} alt="" fill unoptimized sizes="96px" className="object-cover" draggable={false} /> : astrologer.initials}
        </span>
        <span className="absolute right-2.5 bottom-2.5 rounded-md bg-app-ink/80 px-2 py-0.5 text-[12px] font-semibold text-white tabular-nums">{mmss(total)}</span>
      </div>

      {parts.length > 1 && (
        <div role="group" aria-label="Recording parts" className="mt-3 flex flex-wrap gap-2">
          {parts.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={i === idx}
              onClick={() => pickPart(i)}
              className={`h-8 rounded-full border px-3 text-[12px] font-bold ${i === idx ? "border-app-selected bg-app-tint text-app-active" : "border-app-line-gold bg-app-surface text-app-ink-2"}`}
            >
              Part {i + 1} · {mmss(p.durationSeconds)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-app-card border border-app-line bg-app-surface px-3 pt-2.5 pb-3">
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(total))}
          step={1}
          value={Math.min(shown, Math.max(1, Math.floor(total)))}
          disabled={!total}
          aria-label="Seek"
          aria-valuetext={`${mmss(shown)} of ${mmss(total)}`}
          onChange={(e) => {
            const v = Number(e.target.value);
            scrubRef.current = v;
            setScrub(v);
          }}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          className="block h-6 w-full cursor-pointer accent-amber-600 disabled:opacity-50"
        />
        <div className="mt-0.5 flex justify-between text-[12px] text-app-ink-3 tabular-nums">
          <span>{mmss(shown)}</span>
          <span>{mmss(total)}</span>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <button type="button" onClick={chooseRate} aria-label={`Playback speed ${rate}×`} className={`${ctl} w-14 rounded-app-btn text-[13px] font-bold`}>
            {rate}×
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => seekTo(cur - 15)} disabled={!loaded || busy} aria-label="Back 15 seconds" className={`${ctl} text-[12px] font-bold`}>
              −15
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              aria-label={busy ? "Loading" : playing ? "Pause" : "Play"}
              className="grid size-14 place-items-center rounded-full bg-app-primary text-app-on-primary shadow-app-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-selected disabled:opacity-70"
            >
              {busy ? (
                <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-app-on-primary/30 border-t-app-on-primary" />
              ) : playing ? (
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              )}
            </button>
            <button type="button" onClick={() => seekTo(cur + 15)} disabled={!loaded || busy} aria-label="Forward 15 seconds" className={`${ctl} text-[12px] font-bold`}>
              +15
            </button>
          </div>
          <span className="w-14" aria-hidden="true" />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2.5 mb-0 rounded-app-btn bg-app-error-bg px-3 py-2 text-[12.5px] text-app-error">
          {error}
        </p>
      )}
      {part?.partial && (
        <p className="mt-2.5 mb-0 text-[12px] leading-[1.45] text-app-ink-3">This recording stopped early, so it may not include the whole session.</p>
      )}
    </div>
  );
}
