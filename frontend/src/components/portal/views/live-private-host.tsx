"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/portal/format";
import type { LiveHostPrivate, Settlement } from "@/lib/portal/types";
import { useHydrated } from "@/lib/session-store";
import { SessionWindow } from "../../consult/session/session-window";
import { releaseCallSession } from "@/lib/media/call-session";
import { WINDOW_TITLE, useTicking } from "../../live/live-private-call";
import { Avatar } from "./live-queue-people";

// The private consultation running inside the astrologer's live: who it is with, the time and
// money, and — once the customer joins — the same session window as a one-to-one consultation in
// the mode they chose (chat, voice or video), in a private room of its own. While it runs the
// live's sound is off for viewers (the video carries on); ending it makes the room public again.

const clock = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

const TITLE = { chat: "Private chat", voice: "Private voice call", video: "Private video call" } as const;

export default function LivePrivateHost({ p, onEnded }: { p: LiveHostPrivate; onEnded: (message: string) => void }) {
  const active = p.status === "active";
  const base = `/portal/consultations/${encodeURIComponent(p.id)}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The window opens by itself when the customer joins (and again after a refresh); Minimise
  // returns to the console, and "Open" brings it back.
  const [windowShut, setWindowShut] = useState(false);
  const hydrated = useHydrated();
  // Billing (and the clock) starts once both sides have really joined the private room.
  const billing = active && !!p.billingStartedAt;
  const elapsed = useTicking(p.elapsedSeconds, billing);
  const router = useRouter();
  // While the call waits for a side to join, re-read the console often so the clock starts as billing does.
  useEffect(() => {
    if (!active || billing) return;
    const id = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(id);
  }, [active, billing, router]);
  const answerBase = p.secondsToAnswer ?? 0;
  const answerLeft = Math.max(0, answerBase - (useTicking(answerBase, !active) - answerBase));
  const who = p.profile?.name ?? p.alias;
  const billed = Math.ceil(Math.max(0, Math.min(elapsed, p.maxSeconds) - p.freeSeconds) / 60);
  const title = TITLE[p.mode] ?? "Private consultation";

  async function end() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ settlement: Settlement }>(`${base}/end`);
      releaseCallSession(base);
      const s = res.settlement;
      onEnded(
        active && !billing
          ? `${title} ended before it started — ${who} wasn't charged. The room is public again, with sound.`
          : active
          ? `${title} ended after ${clock(s.elapsed)}. ${s.total > 0 ? `${who} was charged ${rupee(s.total)}.` : "Nothing was charged."} The room is public again, with sound.`
          : `Invitation withdrawn — ${who} wasn't charged. The room is public again.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't end it. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="private-host-title" className="overflow-hidden rounded-[20px] bg-ink text-paper max-lg:rounded-app-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3.5">
        <Avatar photoUrl={p.profile?.photoUrl ?? null} initials={p.profile?.initials ?? "•"} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-amber-300">🔒 {title}</div>
          <b id="private-host-title" className="block truncate text-[15px]">
            {who}
            {p.profile && <span className="ml-1.5 text-[12px] font-semibold text-paper/60">{p.alias}</span>}
            {p.profile?.age != null && <span className="ml-1.5 text-[12px] font-semibold text-paper/60">· {p.profile.age}</span>}
          </b>
          <span className="text-[12px] tabular-nums text-paper/70">
            {active && !billing
              ? `Joining the private call · not billed yet · ${rupee(p.rate)}/min`
              : active
              ? `${clock(elapsed)} · ${elapsed < p.freeSeconds ? "free time" : `${billed} min billed`} · ${rupee(p.rate)}/min`
              : answerLeft > 0
                ? `Waiting for them to join · ${answerLeft} s · ${rupee(p.rate)}/min`
                : "They didn't join — withdrawing the invitation…"}
          </span>
        </div>
        <div className="flex gap-2">
          {active && windowShut && (
            <button type="button" onClick={() => setWindowShut(false)} className="h-10 rounded-xl bg-amber-400 px-4 text-[13.5px] font-bold text-ink max-lg:h-app-hit max-lg:rounded-app-btn">
              {p.mode === "chat" ? "Open chat" : "Open call"}
            </button>
          )}
          <button type="button" onClick={() => void end()} disabled={busy} className="h-10 rounded-xl bg-urgent px-4 text-[13.5px] font-bold text-white max-lg:h-app-hit max-lg:rounded-app-btn">
            {busy ? "Ending…" : active ? "End" : "Cancel"}
          </button>
        </div>
      </div>
      <p className="px-4 py-2.5 text-[12px] leading-normal text-paper/75">
        {active
          ? "Your live audio is muted for viewers while this runs — your video stays live for everyone. The sound comes back by itself when it ends. Viewers never see or hear the customer."
          : `They asked for a ${title.toLowerCase()}. Once they join, your live audio is muted for viewers until it ends; your video stays live.`}
      </p>
      {error && (
        <p role="alert" className="px-4 pb-2.5 text-[12.5px] font-semibold text-rose-300">
          {error}
        </p>
      )}

      {active &&
        !windowShut &&
        hydrated &&
        createPortal(
          <SessionWindow
            base={base}
            kind={p.window}
            active
            peer={{ name: who, photo: p.profile?.photoUrl ?? null, initials: p.profile?.initials ?? "?" }}
            title={WINDOW_TITLE[p.window] ?? title}
            badges={
              <span className="inline-flex h-7 items-center rounded-full bg-amber-300/20 px-3 text-[12px] font-bold text-amber-200">
                🔇 Live audio muted for viewers
              </span>
            }
            clock={clock(elapsed)}
            chips={
              <span className="inline-flex h-7 items-center rounded-full bg-white/10 px-3 text-[12px] font-bold tabular-nums text-paper">
                {elapsed < p.freeSeconds ? "Free time" : `${billed} min billed`} · {rupee(p.rate)}/min
              </span>
            }
            ending={busy}
            onEnd={() => void end()}
            onMinimise={() => setWindowShut(true)}
            waiting={billing ? undefined : `Waiting for ${who} to join — the call and billing start when they do.`}
            onJoined={() => router.refresh()}
          />,
          document.body,
        )}
    </section>
  );
}
