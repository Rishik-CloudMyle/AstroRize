"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Astrologer, LiveRoom } from "@/lib/types";
import { ApiError, api } from "@/lib/api/client";
import { discountLabel, rupee } from "@/lib/format";
import { useOpenConsultation } from "@/lib/consultation-store";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import { recheckAvailability, useFreshAstrologer } from "../astrologer/use-fresh-astrologer";
import { ConsultBlockedNote, blockedHint, useConsultGate } from "../consult/consult-gate";
import { FROZEN_HINT } from "../consult/consult-lock";

const REACTIONS = ["❤️", "🙏", "🔥", "✨", "👏"];
const REACTION_LIMIT = 5; // per 10 seconds
const REACTION_WINDOW_MS = 10_000;
/** How often the open room refreshes its poll, chat and queue. */
const REFRESH_MS = 4000;

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

interface Floating {
  id: number;
  emoji: string;
  left: number;
}

export default function LiveRoomView({ room: initialRoom, host: initialHost }: { room: LiveRoom; host: Astrologer }) {
  const { startConsult, openConsultModes, openLogin, toast } = useAppUI();
  const session = useSession();
  // One consultation at a time: frozen while the customer has another one open.
  const frozen = !!useOpenConsultation();
  // The host's availability, kept current: a one-to-one consult is possible only when they are
  // available (not while hosting this room); astrologer and staff accounts can't consult at all.
  const host = useFreshAstrologer(initialHost);
  const gate = useConsultGate(host);
  const staff = gate.kind === "staff";
  // The stage video: a spinner until it can play, then it fades in; a calm message if it fails.
  const [video, setVideo] = useState<"loading" | "playing" | "error">("loading");
  const videoRef = useRef<HTMLVideoElement>(null);
  // The video may have loaded (or failed) before React attached its event handlers.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.error) setVideo("error");
    else if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) setVideo("playing");
  }, []);

  const [room, setRoom] = useState(initialRoom);
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState(false);
  const [sent, setSent] = useState(0);
  const [floating, setFloating] = useState<Floating[]>([]);
  const sentTimes = useRef<number[]>([]);
  const nextId = useRef(0);
  const chatBox = useRef<HTMLDivElement>(null);
  const { chat } = room;
  const voted = room.poll.myVote;

  // Keep the poll results, chat and queue current while the room is open.
  // The signed-in state is a dependency so the queue position is re-read after logging in.
  useEffect(() => {
    if (ended) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { room: fresh } = await api.get<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(initialRoom.id)}`);
        if (!cancelled) setRoom(fresh);
      } catch (e) {
        if (!cancelled && e instanceof ApiError && e.status === 404) {
          setEnded(true);
          // The host may be free for a one-to-one now.
          recheckAvailability();
        }
      }
    };
    void refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initialRoom.id, ended, session.loggedIn]);

  // Follow new chat messages, unless the viewer has scrolled up to read.
  const lastChat = chat.length ? chat[chat.length - 1].text + chat.length : "";
  useEffect(() => {
    const box = chatBox.current;
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 80) box.scrollTop = box.scrollHeight;
  }, [lastChat]);

  async function vote(optionIndex: number) {
    if (voted !== null || voting) return;
    setVoting(true);
    try {
      const { room: fresh } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(room.id)}/poll-vote`, {
        optionIndex,
      });
      setRoom(fresh);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setVoting(false);
    }
  }

  function sendReaction(emoji: string, now: number) {
    sentTimes.current = sentTimes.current.filter((t) => now - t < REACTION_WINDOW_MS);
    if (sentTimes.current.length >= REACTION_LIMIT) {
      toast("Slow down a little — reactions are limited to 5 every 10 seconds.");
      return;
    }
    sentTimes.current.push(now);
    setSent((n) => n + 1);
    api.post(`/live-rooms/${encodeURIComponent(room.id)}/reactions`, { emoji }).catch((e) => toast(errorText(e)));
    const id = nextId.current++;
    setFloating((f) => [...f, { id, emoji, left: 8 + Math.random() * 20 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 1900);
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    if (!session.loggedIn) {
      openLogin({ notice: "Log in to chat in the room." });
      return;
    }
    setSending(true);
    try {
      const { message: posted } = await api.post<{ message: { who: string; text: string } }>(
        `/live-rooms/${encodeURIComponent(room.id)}/chat`,
        { text },
      );
      setRoom((r) => ({ ...r, chat: [...r.chat, posted] }));
      setMessage("");
    } catch (err) {
      toast(errorText(err));
    } finally {
      setSending(false);
    }
  }

  function joinQueue() {
    if (!session.loggedIn) {
      openLogin({ notice: "Log in to join the consult queue." });
      return;
    }
    openConsultModes({ roomId: room.id, onJoined: setRoom });
  }

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {/* ---------- Video ---------- */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-ink sm:aspect-[16/10]">
          {/* Looping studio video until real live streaming (RTC) is connected. Muted, because
              browsers only autoplay silent video. No poster: a spinner shows until it can play. */}
          <video
            ref={videoRef}
            src="/assets/videos/live-room.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label={`${host.name} live`}
            onCanPlay={() => setVideo((v) => (v === "loading" ? "playing" : v))}
            onPlaying={() => setVideo("playing")}
            onError={() => setVideo("error")}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${video === "playing" ? "opacity-100" : "opacity-0"}`}
          />
          {video === "loading" && (
            <div role="status" className="absolute inset-0 grid place-items-center">
              <span className="flex flex-col items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-10 animate-spin rounded-full border-[3px] border-white/20 border-t-amber-400"
                />
                <span className="text-[13px] font-semibold text-white/80">Loading live video…</span>
              </span>
            </div>
          )}
          {video === "error" && (
            <div role="status" className="absolute inset-0 grid place-items-center px-6 text-center">
              <span className="max-w-[34ch] text-[13.5px] leading-normal text-white/80">
                The live video couldn&apos;t load. Check your connection — the chat, poll and queue still work.
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,.42)_0%,rgba(28,25,23,.08)_38%,rgba(28,25,23,.72)_100%)]" />

          <div className="absolute inset-x-3.5 top-3.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold text-white">
              ● LIVE
            </span>
            <span className="inline-flex h-[26px] items-center rounded-full bg-black/45 px-[11px] text-[11px] font-bold text-white">
              👁 {room.viewers.toLocaleString("en-IN")} watching
            </span>
            <span className="ml-auto inline-flex items-center gap-[7px] rounded-full bg-black/45 py-1 pl-[5px] pr-3">
              <span className="relative size-[26px] overflow-hidden rounded-full border-2 border-gold">
                <Image src={host.photo} alt="" fill sizes="52px" className="object-cover" />
              </span>
              <b className="text-[12.5px] text-paper">{host.name}</b>
            </span>
          </div>

          {room.state === "private" && (
            <div className="absolute left-1/2 top-1/2 w-[86%] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-amber-300/35 bg-[rgba(28,25,23,.78)] px-5 py-5 text-center sm:px-[26px]">
              <div className="text-[15px] font-bold text-amber-300">Private consultation in progress</div>
              <p className="mt-1.5 text-[12.5px] leading-normal text-paper/80">
                The astrologer&apos;s video continues. Customer audio and video are never shown. Gift animations stay
                visible, without audio.
              </p>
            </div>
          )}

          {/* Floating reactions */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-24 right-0 h-40 w-40">
            {floating.map((f) => (
              <span key={f.id} className="az-float absolute bottom-0 text-[28px]" style={{ left: `${f.left}%` }}>
                {f.emoji}
              </span>
            ))}
          </div>

          <div className="absolute inset-x-3.5 bottom-3.5 flex flex-col gap-2.5">
            {ended && (
              <div className="flex items-center gap-2.5 rounded-xl bg-stone-800/90 px-[13px] py-2.5 text-[12.5px] font-semibold text-white">
                <span>■</span>
                <span className="flex-1">This live room has ended. You can still consult {host.name} one-to-one.</span>
              </div>
            )}
            {room.state === "monitor" && (
              <div className="flex items-center gap-2.5 rounded-xl bg-blue-700/90 px-[13px] py-2.5 text-[12.5px] font-semibold text-white">
                <span>🛡</span>
                <span className="flex-1">A compliance monitor has joined this live session.</span>
              </div>
            )}
            {room.state === "degrade" && (
              <div className="flex items-center gap-2.5 rounded-xl bg-amber-700/90 px-[13px] py-2.5 text-[12.5px] font-semibold text-white">
                <span>⚠</span>
                <span className="flex-1">
                  High load — chat is in slow mode (1 message per 30 s) and reactions are being sampled.
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-baseline gap-[7px] rounded-full bg-black/45 px-3.5 py-[7px]">
                {host.was && host.was > host.price && (
                  <span className="text-xs text-white/65 line-through">{rupee(host.was)}</span>
                )}
                <b className="text-[15px] text-paper">{rupee(host.price)}/min</b>
                {discountLabel(host.price, host.was) && (
                  <span className="text-[11px] font-bold text-amber-300">{discountLabel(host.price, host.was)}</span>
                )}
              </span>
              {gate.kind === "live" && !ended ? (
                // Hosting this room: the way to consult them now is the room's queue.
                <button
                  type="button"
                  disabled={room.queue.inQueue}
                  onClick={joinQueue}
                  className={`ml-auto h-11 rounded-full px-[22px] text-[14.5px] font-bold ${room.queue.inQueue ? "cursor-default bg-stone-300/90 text-stone-600" : "az-cta shadow-[0_6px_16px_rgba(255,140,26,.32)]"}`}
                >
                  {room.queue.inQueue ? "✓ You're in the queue" : "Join the consult queue"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={gate.kind !== "ok"}
                  title={gate.kind === "frozen" ? FROZEN_HINT : blockedHint(gate)}
                  onClick={() => startConsult({ astrologer: host })}
                  className={`ml-auto h-11 rounded-full px-[22px] text-[14.5px] font-bold ${gate.kind !== "ok" ? "cursor-not-allowed bg-stone-300/90 text-stone-600" : "az-cta shadow-[0_6px_16px_rgba(255,140,26,.32)]"}`}
                >
                  {gate.kind === "frozen"
                    ? "🔒 Consultation in progress"
                    : gate.kind === "busy"
                      ? "In a consultation"
                      : gate.kind === "off"
                        ? "Offline right now"
                        : gate.kind === "live"
                          ? "Live now"
                          : "Consult now"}
                </button>
              )}
            </div>
          </div>
        </div>

        {staff && (
          <div className="mt-3.5">
            <ConsultBlockedNote gate={gate} astrologer={host} />
          </div>
        )}

        <div className="mt-3.5 flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5">
          <span className="text-[15px] leading-[1.3]">⌁</span>
          <div className="min-w-0 flex-1">
            <b className="block text-[13.5px] text-ink">If a web consultation drops</b>
            <span className="mt-[3px] block text-[12.5px] leading-normal text-stone-600">
              Billing stops and you pay only for the time you were actually connected, then the session closes. To
              carry on, start a new consultation — we&apos;ll check your balance again first.
            </span>
          </div>
        </div>

        {/* ---------- Poll ---------- */}
        <div className="relative mt-[18px] rounded-[20px] border border-line bg-paper p-5">
          <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">Poll from the astrologer</div>
          <b className="mt-1.5 block text-base text-ink">{room.poll.question}</b>
          <div className="mt-3 flex flex-col gap-2">
            {room.poll.options.map((o, i) => {
              const mine = voted === i;
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => void vote(i)}
                  aria-pressed={mine}
                  disabled={(voted !== null && !mine) || voting}
                  className={`relative flex h-11 w-full items-center justify-between gap-2.5 overflow-hidden rounded-xl border bg-white px-3.5 text-left disabled:cursor-default ${
                    mine ? "border-amber-500" : "border-line"
                  }`}
                >
                  <span
                    className="absolute inset-y-0 left-0 transition-colors duration-500"
                    style={{
                      width: `${o.pct}%`,
                      background: voted === null ? "transparent" : mine ? "#fef3c7" : "#f7f4ee",
                    }}
                  />
                  <span className="relative truncate text-[13.5px] font-semibold text-ink">{o.label}</span>
                  <span className="relative text-[12.5px] font-bold tabular-nums text-stone-500">
                    {o.pct}%
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 text-[11.5px] text-stone-500">
            One vote per viewer. Votes cannot be changed. Results are visible to the astrologer from launch.
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-3.5">
        {/* ---------- Announcements from the astrologer (newest first) ---------- */}
        {room.announcements.length > 0 && (
          <section aria-labelledby="announcements-title" className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
            <b id="announcements-title" className="block text-[13.5px]">
              Announcements
            </b>
            <ul className="mt-2.5 flex flex-col gap-2.5" aria-live="polite">
              {room.announcements.map((a) => (
                <li key={a.id} className="rounded-[14px] border border-amber-200/70 bg-paper px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex h-5 items-center rounded-full bg-amber-500 px-2 text-[10.5px] font-extrabold uppercase tracking-[.04em] text-ink">
                      Astrologer
                    </span>
                    <b className="text-[12.5px] text-amber-800">{host.name}</b>
                    <time className="ml-auto text-[11px] tabular-nums text-stone-500">{a.at}</time>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-[1.45] break-words text-ink">{a.text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Chat ---------- */}
        <div className="flex min-h-[340px] flex-col rounded-[20px] border border-line bg-paper p-4">
          <b className="block text-[13.5px]">Room chat</b>
          <div ref={chatBox} className="mt-3 flex max-h-[320px] flex-1 flex-col gap-[9px] overflow-y-auto" aria-live="polite">
            {chat.map((c, i) => (
              <div key={i} className="text-[13px] leading-[1.45]">
                <b className="font-bold text-amber-800">{c.who}</b> <span className="text-stone-600">{c.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={sendChat} className="mt-3 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Say something…"
              aria-label="Chat message"
              maxLength={200}
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[13.5px] text-ink outline-none focus:border-amber-500"
            />
            <button type="submit" disabled={sending} className="h-10 rounded-xl bg-amber-500 px-3.5 text-[13px] font-bold text-ink">
              Send
            </button>
          </form>
        </div>

        {/* ---------- Reactions ---------- */}
        <div className="rounded-[20px] border border-line bg-paper p-4">
          <b className="block text-[13.5px]">Reactions</b>
          <div className="mt-3 flex flex-wrap gap-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => sendReaction(emoji, e.timeStamp)}
                aria-label={`Send ${emoji}`}
                className="grid size-12 place-items-center rounded-[14px] border border-line-warm bg-card text-[22px] leading-none hover:-translate-y-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="mt-2.5 text-[11.5px] leading-[1.45] text-stone-500">
            {sent > 0 ? `Sent ${sent}. ` : ""}Up to 5 reactions every 10 seconds. They float over the video and never
            appear in the chat.
          </div>
        </div>

        {/* ---------- Queue ---------- */}
        <div className="rounded-[20px] border border-line bg-paper p-4">
          <b className="block text-[13.5px]">Queue</b>
          <div className="mt-2.5 flex items-baseline gap-2">
            {room.queue.inQueue ? (
              <>
                <span className="text-[28px] font-bold tabular-nums text-ink">#{room.queue.position}</span>
                <span className="text-[13px] text-stone-600">
                  of {room.queue.waiting} waiting · room for {room.queue.capacity}
                </span>
              </>
            ) : (
              <>
                <span className="text-[28px] font-bold tabular-nums text-ink">{room.queue.waiting}</span>
                <span className="text-[13px] text-stone-600">waiting · room for {room.queue.capacity}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 text-xs font-bold text-blue-700">
            ⏱ {room.queue.eta}
          </div>
          <button
            type="button"
            onClick={joinQueue}
            disabled={room.queue.inQueue || ended || frozen || staff}
            title={staff ? blockedHint(gate) : frozen && !room.queue.inQueue ? FROZEN_HINT : undefined}
            className={`mt-3 h-[42px] w-full rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink disabled:cursor-default ${(frozen || staff) && !room.queue.inQueue ? "opacity-45" : ""}`}
          >
            {room.queue.inQueue
              ? "✓ You're in the queue"
              : staff
                ? "For customer accounts"
                : frozen
                  ? "🔒 Consultation in progress"
                  : "Join the consult queue"}
          </button>
        </div>
      </aside>
    </div>
  );
}
