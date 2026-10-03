"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Astrologer, LiveRoom } from "@/lib/types";
import { discountLabel, rupee } from "@/lib/format";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";

const REACTIONS = ["❤️", "🙏", "🔥", "✨", "👏"];
const REACTION_LIMIT = 5; // per 10 seconds
const REACTION_WINDOW_MS = 10_000;

interface Floating {
  id: number;
  emoji: string;
  left: number;
}

export default function LiveRoomView({ room, host }: { room: LiveRoom; host: Astrologer }) {
  const { startConsult, openConsultModes, toast } = useAppUI();
  const session = useSession();

  const [chat, setChat] = useState(room.chat);
  const [message, setMessage] = useState("");
  const [voted, setVoted] = useState<number | null>(null);
  const [sent, setSent] = useState(0);
  const [floating, setFloating] = useState<Floating[]>([]);
  const sentTimes = useRef<number[]>([]);
  const nextId = useRef(0);

  function sendReaction(emoji: string, now: number) {
    sentTimes.current = sentTimes.current.filter((t) => now - t < REACTION_WINDOW_MS);
    if (sentTimes.current.length >= REACTION_LIMIT) {
      toast("Slow down a little — reactions are limited to 5 every 10 seconds.");
      return;
    }
    sentTimes.current.push(now);
    setSent((n) => n + 1);
    const id = nextId.current++;
    setFloating((f) => [...f, { id, emoji, left: 8 + Math.random() * 20 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 1900);
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    setChat((c) => [...c, { who: session.loggedIn ? session.user.name : "You", text }]);
    setMessage("");
  }

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {/* ---------- Video ---------- */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-ink sm:aspect-[16/10]">
          <Image src={room.thumb} alt={`${host.name} live`} fill priority sizes="(max-width: 1024px) 100vw, 860px" className="object-cover" />
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
              <button
                type="button"
                onClick={() => startConsult({ astrologerId: host.id })}
                className="az-cta ml-auto h-11 rounded-full px-[22px] text-[14.5px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.32)]"
              >
                Consult now
              </button>
            </div>
          </div>
        </div>

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
                  onClick={() => voted === null && setVoted(i)}
                  aria-pressed={mine}
                  disabled={voted !== null && !mine}
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
        {/* ---------- Chat ---------- */}
        <div className="flex min-h-[340px] flex-col rounded-[20px] border border-line bg-paper p-4">
          <b className="block text-[13.5px]">Room chat</b>
          <div className="mt-3 flex max-h-[320px] flex-1 flex-col gap-[9px] overflow-y-auto" aria-live="polite">
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
            <button type="submit" className="h-10 rounded-xl bg-amber-500 px-3.5 text-[13px] font-bold text-ink">
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
            <span className="text-[28px] font-bold tabular-nums text-ink">#{room.queue.position}</span>
            <span className="text-[13px] text-stone-600">
              of {room.queue.waiting} waiting · room for {room.queue.capacity}
            </span>
          </div>
          <div className="mt-1.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 text-xs font-bold text-blue-700">
            ⏱ {room.queue.eta}
          </div>
          <button
            type="button"
            onClick={openConsultModes}
            className="mt-3 h-[42px] w-full rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink"
          >
            Join the consult queue
          </button>
        </div>
      </aside>
    </div>
  );
}
