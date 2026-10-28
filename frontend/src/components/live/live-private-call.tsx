"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api } from "@/lib/api/client";
import { consultationActions } from "@/lib/consultation-store";
import { useHydrated } from "@/lib/session-store";
import { clock, rupee } from "@/lib/format";
import type { Astrologer, ConsultMode, LivePrivateConsult, LiveRoom, Settlement } from "@/lib/types";
import { useAppUI } from "../app-provider";
import { MeterChips, endNoteOf, type MeterInput } from "../consult/call-stage";
import { SessionWindow } from "../consult/session/session-window";
import { releaseCallSession } from "@/lib/media/call-session";

// The customer's private consultation inside a live room, in the mode they chose when joining the
// queue: chat, voice or video. It opens the same session window as a one-to-one consultation
// (its own private room — never the live's). The live video keeps playing behind it without sound,
// and nothing of the customer's (messages, voice or video) is ever shown to the room.

/** "Private video call" — what the customer is joining. */
export const PRIVATE_TITLE: Record<ConsultMode, string> = { chat: "Private chat", voice: "Private voice call", video: "Private video call" };

/** The session window's own title (short: the header also carries the clock on a phone). */
export const WINDOW_TITLE: Record<ConsultMode, string> = { chat: "Chat", voice: "Voice call", video: "Video call" };

/** What costs so far: partial minutes round up after the free window. */
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
 * "{Astrologer} is ready" over the video while the call is offered; once it runs, the session
 * window for its mode (opened straight away) and a compact call bar over the live to get back to it.
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
  // The call's window opens by itself when the call starts (also after a refresh); Minimise
  // brings the customer back to the live, and the bar over the video re-opens it.
  const [open, setOpen] = useState(true);
  const mounted = useHydrated();
  // Seconds left to join: the server's figure minus the seconds ticked since it arrived.
  const answerBase = c.secondsToAnswer ?? 0;
  const left = Math.max(0, answerBase - (useTicking(answerBase, c.status === "connecting") - answerBase));
  // Billing (and the clock) starts once both sides have really joined the private room.
  const billing = c.status === "active" && !!c.billingStartedAt;
  const elapsed = useTicking(c.elapsedSeconds, billing);
  const name = firstName(host.name);
  const title = PRIVATE_TITLE[c.mode] ?? "Private consultation";

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
      releaseCallSession(`/consultations/${encodeURIComponent(c.id)}`);
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
  const capped = billing && elapsed >= c.maxSeconds;
  useEffect(() => {
    if (!capped) return;
    const id = setTimeout(() => void end(true), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capped]);

  if (c.status === "connecting") {
    const what =
      c.mode === "chat"
        ? `Your chat with ${name} is private — nobody in the room sees it.`
        : c.mode === "video"
          ? `A private video call: only ${name} sees and hears you. The room keeps the live video, without sound.`
          : `Only you will hear ${name} — and nobody in the room hears you. The room keeps the live video, without sound.`;
    return (
      <div className="absolute inset-x-3 top-1/2 z-[2] mx-auto max-w-[440px] -translate-y-1/2 rounded-[20px] border border-amber-300/40 bg-[rgba(28,25,23,.92)] p-5 text-center shadow-[0_18px_40px_rgba(0,0,0,.35)]">
        <div className="text-[11px] font-extrabold uppercase tracking-[.1em] text-amber-300">🔒 {title}</div>
        <h3 className="mt-1.5 text-[19px] font-bold leading-snug text-paper">{host.name} is ready for you</h3>
        <p className="mt-1.5 text-[12.5px] leading-normal text-paper/80">{what}</p>
        <p className="mt-2 text-[12.5px] text-paper/80">
          <b className="text-paper">{rupee(c.rate)}/min</b>
          {c.freeSeconds > 0 ? ` · first ${c.freeSeconds >= 60 ? `${Math.round(c.freeSeconds / 60)} min` : `${c.freeSeconds} s`} free` : ""} · billing starts once you&apos;re both in the call
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => void end()} disabled={busy} className="h-11 rounded-xl border border-white/20 bg-white/10 text-[14px] font-bold text-paper">
            Not now
          </button>
          <button type="button" onClick={() => void join()} disabled={busy || left === 0} className="az-cta h-11 rounded-xl text-[14px] font-bold disabled:opacity-60">
            {busy ? "Joining…" : c.mode === "chat" ? "Join private chat" : "Join private call"}
          </button>
        </div>
        <p className="mt-2.5 text-[11.5px] tabular-nums text-paper/60" aria-live="polite">
          {left > 0 ? `Join within ${left} s, or the astrologer moves to the next person.` : "This invitation has expired — you have not been charged."}
        </p>
      </div>
    );
  }

  const meter: MeterInput = {
    complimentary: false,
    rate: c.rate,
    held: c.held,
    elapsed,
    freeSeconds: c.freeSeconds,
    maxSeconds: c.maxSeconds,
    reminderSeconds: 0,
  };

  return (
    <>
      <div className="absolute inset-x-3.5 top-[46px] z-[2] flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300/40 bg-[rgba(28,25,23,.88)] px-3 py-2 max-lg:inset-x-3 max-lg:top-[calc(max(6px,env(safe-area-inset-top))+60px)]">
        <span className="inline-flex h-6 items-center rounded-full bg-amber-300 px-2.5 text-[11px] font-extrabold text-ink">🔒 {title}</span>
        <b className="tabular-nums text-[14px] text-paper" aria-label="Call time">
          {clock(elapsed)}
        </b>
        <span className="text-[12px] tabular-nums text-paper/75">
          {!billing
            ? `waiting for ${name} to join · not billed yet`
            : elapsed < c.freeSeconds
              ? "free time"
              : `${rupee(costSoFar(c, elapsed))} so far`}{" "}
          · {rupee(c.rate)}/min
        </span>
        <span className="ml-auto flex gap-2">
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-xl bg-amber-400 px-3.5 text-[13px] font-bold text-ink">
              {c.mode === "chat" ? "Open chat" : "Open call"}
            </button>
          )}
          <button type="button" onClick={() => void end()} disabled={busy} className="h-9 rounded-xl bg-urgent px-4 text-[13px] font-bold text-white">
            End
          </button>
        </span>
      </div>
      {open &&
        mounted &&
        createPortal(
          <SessionWindow
            base={`/consultations/${encodeURIComponent(c.id)}`}
            kind={c.window}
            active
            peer={{ name: host.name, photo: host.photo, initials: host.name.slice(0, 1) }}
            title={WINDOW_TITLE[c.window] ?? title}
            appLook
            badges={
              <span className="inline-flex h-7 items-center rounded-full bg-amber-300/20 px-3 text-[12px] font-bold text-amber-200 max-lg:h-6 max-lg:bg-app-tint-2 max-lg:px-2.5 max-lg:text-[11px] max-lg:text-app-active">
                🔒 Private · from the live
              </span>
            }
            clock={clock(elapsed)}
            chips={<MeterChips m={meter} instant={false} />}
            ending={busy}
            onEnd={() => void end()}
            onMinimise={() => setOpen(false)}
            endNote={endNoteOf(meter)}
            waiting={billing ? undefined : `Waiting for ${host.name} to join — you're not being charged yet.`}
            onJoined={() => {
              // Re-read the room at once: billing may have started.
              api
                .get<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(roomId)}`)
                .then(({ room }) => onRoom(room))
                .catch(() => {});
            }}
          />,
          document.body,
        )}
    </>
  );
}
