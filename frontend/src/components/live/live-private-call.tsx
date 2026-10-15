"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { consultationActions } from "@/lib/consultation-store";
import { rupee } from "@/lib/format";
import type { Astrologer, LivePrivateConsult, LiveRoom, Settlement } from "@/lib/types";
import { useAppUI } from "../app-provider";
import { ConsultChat, useConsultChat } from "../consult/session/consult-chat";
import { useCallMedia } from "../consult/session/use-call-media";

// The customer's private consultation inside a live room. The live video keeps playing for
// them and everyone else; the astrologer's voice comes to them alone through a separate
// one-to-one room, and nothing of theirs (voice or video) is ever shown to the room.

const VOICE = { audio: true, video: false };

const clock = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
/** What the session has cost so far: partial minutes round up after the free window. */
const costSoFar = (c: LivePrivateConsult, secs: number) => Math.ceil(Math.max(0, secs - c.freeSeconds) / 60) * c.rate;
const firstName = (name: string) => name.replace(/^(Pt\.|Pandit|Acharya|Dr\.)\s+/i, "").split(" ")[0] ?? name;

/** The server's seconds figure, ticking on by one each second between polls (re-synced at each new figure). */
export function useTicking(base: number, on: boolean) {
  const [tick, setTick] = useState({ base, n: 0 });
  if (tick.base !== base) setTick({ base, n: 0 });
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setTick((t) => ({ ...t, n: t.n + 1 })), 1000);
    return () => clearInterval(id);
  }, [on]);
  return base + (tick.base === base ? tick.n : 0);
}

/**
 * "{Astrologer} is ready" over the video while the call is offered, then a compact call bar over
 * the video and the call's panel (voice status, chat) below it while it runs.
 */
export function PrivateCallOverlay({
  room,
  host,
  onRoom,
  onEnded,
}: {
  room: LiveRoom;
  host: Astrologer;
  onRoom: (room: LiveRoom) => void;
  onEnded: (s: Settlement | null) => void;
}) {
  const c = room.private;
  if (!c) return null;
  return <Overlay key={`${c.id}-${c.status}`} c={c} roomId={room.id} host={host} onRoom={onRoom} onEnded={onEnded} />;
}

function Overlay({
  c,
  roomId,
  host,
  onRoom,
  onEnded,
}: {
  c: LivePrivateConsult;
  roomId: string;
  host: Astrologer;
  onRoom: (room: LiveRoom) => void;
  onEnded: (s: Settlement | null) => void;
}) {
  const { toast } = useAppUI();
  const [busy, setBusy] = useState(false);
  // Seconds left to join: the server's figure minus the seconds ticked since it arrived.
  const answerBase = c.secondsToAnswer ?? 0;
  const left = Math.max(0, answerBase - (useTicking(answerBase, c.status === "connecting") - answerBase));
  const elapsed = useTicking(c.elapsedSeconds, c.status === "active");
  const name = firstName(host.name);

  async function join() {
    if (busy) return;
    setBusy(true);
    try {
      const { room } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(roomId)}/private/connect`);
      onRoom(room);
      void consultationActions.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't join the call. Check your connection and try again.");
      setBusy(false);
    }
  }

  const endedRef = useRef(false);
  async function end(auto = false) {
    if (endedRef.current) return;
    endedRef.current = true;
    setBusy(true);
    try {
      const res = await api.post<{ settlement: Settlement; status: string }>(`/consultations/${encodeURIComponent(c.id)}/end`);
      onEnded(res.status === "ended" ? res.settlement : null);
    } catch (e) {
      endedRef.current = false;
      setBusy(false);
      if (!auto) toast(e instanceof ApiError ? e.message : "Couldn't end the call. Check your connection and try again.");
      return;
    }
    void consultationActions.refresh();
  }

  // The held balance (or the 15-minute cap) is used up: the call ends here, as the server would.
  const capped = c.status === "active" && elapsed >= c.maxSeconds;
  useEffect(() => {
    if (!capped) return;
    const id = setTimeout(() => void end(true), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capped]);

  if (c.status === "connecting") {
    return (
      <div className="absolute inset-x-3 top-1/2 z-[2] mx-auto max-w-[440px] -translate-y-1/2 rounded-[20px] border border-amber-300/40 bg-[rgba(28,25,23,.92)] p-5 text-center shadow-[0_18px_40px_rgba(0,0,0,.35)]">
        <div className="text-[11px] font-extrabold uppercase tracking-[.1em] text-amber-300">🔒 Private consultation</div>
        <h3 className="mt-1.5 text-[19px] font-bold leading-snug text-paper">{host.name} is ready for you</h3>
        <p className="mt-1.5 text-[12.5px] leading-normal text-paper/80">
          Everyone keeps seeing the live video, but only you will hear {name} — and nobody in the room sees or hears you.
        </p>
        <p className="mt-2 text-[12.5px] text-paper/80">
          <b className="text-paper">{rupee(c.rate)}/min</b>
          {c.freeSeconds > 0 ? ` · first ${c.freeSeconds >= 60 ? `${Math.round(c.freeSeconds / 60)} min` : `${c.freeSeconds} s`} free` : ""} · billing starts when you join
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => void end()} disabled={busy} className="h-11 rounded-xl border border-white/20 bg-white/10 text-[14px] font-bold text-paper">
            Not now
          </button>
          <button type="button" onClick={() => void join()} disabled={busy || left === 0} className="az-cta h-11 rounded-xl text-[14px] font-bold disabled:opacity-60">
            {busy ? "Joining…" : "Join private call"}
          </button>
        </div>
        <p className="mt-2.5 text-[11.5px] tabular-nums text-paper/60" aria-live="polite">
          {left > 0 ? `Join within ${left} s, or the astrologer moves to the next person.` : "This invitation has expired — you have not been charged."}
        </p>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-3.5 top-[46px] z-[2] flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300/40 bg-[rgba(28,25,23,.88)] px-3 py-2">
      <span className="inline-flex h-6 items-center rounded-full bg-amber-300 px-2.5 text-[11px] font-extrabold text-ink">🔒 Private</span>
      <b className="tabular-nums text-[14px] text-paper" aria-label="Call time">
        {clock(elapsed)}
      </b>
      <span className="text-[12px] tabular-nums text-paper/75">
        {elapsed < c.freeSeconds ? "free time" : `${rupee(costSoFar(c, elapsed))} so far`} · {rupee(c.rate)}/min
      </span>
      <button type="button" onClick={() => void end()} disabled={busy} className="ml-auto h-9 rounded-xl bg-urgent px-4 text-[13px] font-bold text-white">
        End
      </button>
    </div>
  );
}

/**
 * Below the video while the private call runs: is the voice connected (or why not), mute, and
 * the call's own chat with the astrologer (works even while voice isn't set up).
 */
export function PrivateCallPanel({ c, host }: { c: LivePrivateConsult; host: Astrologer }) {
  const active = c.status === "active";
  const base = `/consultations/${encodeURIComponent(c.id)}`;
  const media = useCallMedia({ base, wants: VOICE, active });
  const chat = useConsultChat(base, active, true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const name = firstName(host.name);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.srcObject = media.remote;
    if (media.remote) void a.play().catch(() => {});
  }, [media.remote]);

  if (!active) return null;

  let voice: React.ReactNode;
  if (media.notConfigured) {
    voice = <span>Voice isn&apos;t connected yet — chat with {name} below. You&apos;re billed per minute either way.</span>;
  } else if (media.answerFailed) {
    voice = (
      <span>
        Couldn&apos;t reach the voice service.{" "}
        <button type="button" onClick={() => void media.reloadAnswer()} className="font-bold text-amber-300 underline">
          Try again
        </button>
      </span>
    );
  } else if (!media.answer) {
    voice = <span>Connecting voice…</span>;
  } else if (media.permission === "idle" || media.permission === "asking") {
    voice = (
      <button type="button" onClick={() => void media.allow()} disabled={media.permission === "asking"} className="h-10 rounded-xl bg-amber-400 px-4 text-[13.5px] font-bold text-ink">
        {media.permission === "asking" ? "Waiting for your browser…" : "Turn on microphone to talk"}
      </button>
    );
  } else if (media.permission !== "granted") {
    voice = (
      <span>
        {media.permission === "denied"
          ? "Microphone blocked. Allow it in your browser's site settings, then try again."
          : "Your microphone couldn't be used. Check it isn't in use by another app."}{" "}
        <button type="button" onClick={() => void media.allow()} className="font-bold text-amber-300 underline">
          Try again
        </button>
      </span>
    );
  } else {
    voice = (
      <span className="flex flex-wrap items-center gap-2">
        <span>
          {media.link === "connected"
            ? media.remote
              ? `Talking with ${name} — only you can hear.`
              : `Connected. Waiting for ${name}'s voice…`
            : media.link === "failed"
              ? media.linkProblem || "Voice couldn't connect."
              : "Connecting voice…"}
        </span>
        {media.link === "failed" && (
          <button type="button" onClick={media.retryJoin} className="font-bold text-amber-300 underline">
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={media.toggleMic}
          aria-pressed={media.micMuted}
          className={`ml-auto h-9 rounded-xl px-3.5 text-[13px] font-bold ${media.micMuted ? "bg-urgent text-white" : "border border-white/20 bg-white/10 text-paper"}`}
        >
          {media.micMuted ? "🔇 Unmute" : "🎤 Mute"}
        </button>
      </span>
    );
  }

  return (
    <section aria-labelledby="private-call-title" className="mt-3.5 overflow-hidden rounded-[20px] bg-ink text-paper">
      <audio ref={audioRef} autoPlay />
      <div className="border-b border-white/10 px-4 py-3">
        <b id="private-call-title" className="block text-[14px]">
          Private consultation with {host.name}
        </b>
        <div className="mt-1.5 text-[12.5px] leading-normal text-paper/80">{voice}</div>
      </div>
      <div className="h-[280px]">
        <ConsultChat chat={chat} peerName={name} dense />
      </div>
    </section>
  );
}
