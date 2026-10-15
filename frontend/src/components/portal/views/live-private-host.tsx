"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/portal/format";
import type { LiveHostPrivate, Settlement } from "@/lib/portal/types";
import { ConsultChat, useConsultChat } from "../../consult/session/consult-chat";
import { useCallMedia } from "../../consult/session/use-call-media";
import { useTicking } from "../../live/live-private-call";
import { Avatar } from "./live-queue-people";

// The private consultation running inside the astrologer's live: who it is with, the time and
// money, the private voice line (only that customer hears the astrologer while it runs — the
// room keeps the video, without sound) and its chat. Ending it returns the room to public.

const VOICE = { audio: true, video: false };
const clock = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

export default function LivePrivateHost({ p, onEnded }: { p: LiveHostPrivate; onEnded: (message: string) => void }) {
  const active = p.status === "active";
  const base = `/portal/consultations/${encodeURIComponent(p.id)}`;
  const media = useCallMedia({ base, wants: VOICE, active });
  const chat = useConsultChat(base, active, true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elapsed = useTicking(p.elapsedSeconds, active);
  const answerBase = p.secondsToAnswer ?? 0;
  const answerLeft = Math.max(0, answerBase - (useTicking(answerBase, !active) - answerBase));
  const who = p.profile?.name ?? p.alias;
  const billed = Math.ceil(Math.max(0, Math.min(elapsed, p.maxSeconds) - p.freeSeconds) / 60);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.srcObject = media.remote;
    if (media.remote) void a.play().catch(() => {});
  }, [media.remote]);

  async function end() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ settlement: Settlement }>(`${base}/end`);
      const s = res.settlement;
      onEnded(
        active
          ? `Private consultation ended after ${clock(s.elapsed)}. ${s.total > 0 ? `${p.alias} was charged ${rupee(s.total)}.` : "Nothing was charged."} The room is public again.`
          : `Invitation withdrawn — ${p.alias} wasn't charged. The room is public again.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't end it. Check your connection and try again.");
      setBusy(false);
    }
  }

  let voice: React.ReactNode = null;
  if (active) {
    if (media.notConfigured) voice = "Voice isn't connected yet — use the chat below. The room hears nothing while this runs.";
    else if (media.answerFailed) voice = "Couldn't reach the voice service. The chat below works.";
    else if (!media.answer) voice = "Connecting voice…";
    else if (media.permission === "idle" || media.permission === "asking")
      voice = (
        <button type="button" onClick={() => void media.allow()} disabled={media.permission === "asking"} className="h-9 rounded-xl bg-amber-400 px-3.5 text-[13px] font-bold text-ink">
          {media.permission === "asking" ? "Waiting for your browser…" : "Turn on microphone for this call"}
        </button>
      );
    else if (media.permission !== "granted") voice = "Your microphone is blocked or in use. Allow it in the browser's site settings.";
    else
      voice = (
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {media.link === "connected"
              ? media.remote
                ? `Talking with ${who} — only they can hear you.`
                : `Connected. Waiting for ${who}'s voice…`
              : media.link === "failed"
                ? media.linkProblem || "Voice couldn't connect."
                : "Connecting voice…"}
          </span>
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
    <section aria-labelledby="private-host-title" className="overflow-hidden rounded-[20px] bg-ink text-paper">
      <audio ref={audioRef} autoPlay />
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3.5">
        <Avatar photoUrl={p.profile?.photoUrl ?? null} initials={p.profile?.initials ?? "•"} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.1em] text-amber-300">🔒 Private consultation</div>
          <b id="private-host-title" className="block truncate text-[15px]">
            {who}
            {p.profile && <span className="ml-1.5 text-[12px] font-semibold text-paper/60">{p.alias}</span>}
            {p.profile?.age != null && <span className="ml-1.5 text-[12px] font-semibold text-paper/60">· {p.profile.age}</span>}
          </b>
          <span className="text-[12px] tabular-nums text-paper/70">
            {active
              ? `${clock(elapsed)} · ${elapsed < p.freeSeconds ? "free time" : `${billed} min billed`} · ${rupee(p.rate)}/min`
              : answerLeft > 0
                ? `Waiting for them to join · ${answerLeft} s`
                : "They didn't join — withdrawing the invitation…"}
          </span>
        </div>
        <button type="button" onClick={() => void end()} disabled={busy} className="h-10 rounded-xl bg-urgent px-4 text-[13.5px] font-bold text-white">
          {busy ? "Ending…" : active ? "End" : "Cancel"}
        </button>
      </div>
      <p className="border-b border-white/10 px-4 py-2.5 text-[12px] leading-normal text-paper/75">
        Your video stays live for everyone, without sound, while this runs. Viewers see “Private consultation in progress”; they never
        see or hear the customer.
      </p>
      {error && (
        <p role="alert" className="px-4 pt-2.5 text-[12.5px] font-semibold text-rose-300">
          {error}
        </p>
      )}
      {active && (
        <>
          <div className="px-4 py-2.5 text-[12.5px] leading-normal text-paper/80">{voice}</div>
          <div className="h-[260px] border-t border-white/10">
            <ConsultChat chat={chat} peerName={who} dense />
          </div>
        </>
      )}
    </section>
  );
}
