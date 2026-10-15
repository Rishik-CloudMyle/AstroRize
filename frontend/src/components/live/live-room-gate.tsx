"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { discountLabel, languageLine, rupee } from "@/lib/format";
import { useSession } from "@/lib/session-store";
import type { Astrologer, LiveRoom } from "@/lib/types";
import { useAppUI } from "../app-provider";
import { RecognitionBadge, VerifiedTick } from "../astrologer/parts";
import { recheckAvailability } from "../astrologer/use-fresh-astrologer";
import { liveForLabel, plannedLabel, useMinuteClock } from "./live-feed";
import LiveRoomView from "./live-room-view";

/** How often the preview re-reads the room (viewers, details, still live?). */
const PREVIEW_REFRESH_MS = 8000;

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

/**
 * A live room opens on a preview first: who is live, what about, how long, the rate and a
 * "Join live" button. Only joining counts as watching (and tells the room "<name> joined").
 */
export default function LiveRoomGate({ room, host }: { room: LiveRoom; host: Astrologer }) {
  const [joined, setJoined] = useState<LiveRoom | null>(null);
  if (joined) return <LiveRoomView room={joined} host={host} />;
  return <LivePreview room={room} host={host} onJoined={setJoined} />;
}

function LivePreview({ room: initialRoom, host, onJoined }: { room: LiveRoom; host: Astrologer; onJoined: (room: LiveRoom) => void }) {
  const session = useSession();
  const { openLogin, toast } = useAppUI();
  const [room, setRoom] = useState(initialRoom);
  const [ended, setEnded] = useState(false);
  const [joining, setJoining] = useState(false);
  const minute = useMinuteClock();

  const markEnded = useCallback(() => {
    setEnded(true);
    recheckAvailability();
  }, []);

  // Keep the viewer count and details current while the preview is open (this doesn't count as watching).
  useEffect(() => {
    if (ended) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { room: fresh } = await api.get<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(initialRoom.id)}`);
        if (!cancelled) setRoom(fresh);
      } catch (e) {
        if (!cancelled && e instanceof ApiError && e.status === 404) markEnded();
      }
    };
    const id = setInterval(refresh, PREVIEW_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initialRoom.id, ended, markEnded]);

  async function join() {
    if (joining || ended) return;
    if (!session.loggedIn) {
      openLogin({ notice: "Sign in to join the live." });
      return;
    }
    setJoining(true);
    try {
      const { room: fresh } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(room.id)}/join`);
      onJoined(fresh);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) markEnded();
      else if (e instanceof ApiError && e.status === 401) openLogin({ notice: "Sign in to join the live." });
      else toast(errorText(e));
      setJoining(false);
    }
  }

  const liveFor = liveForLabel(room.startedAt, minute);
  const planned = plannedLabel(room.durationMins);
  const discount = discountLabel(host.price, host.was);
  const signedOut = session.ready && !session.loggedIn;

  return (
    <section
      aria-labelledby="live-preview-title"
      className="mx-auto mt-6 max-w-[1040px] overflow-hidden rounded-[24px] border border-line-warm bg-card shadow-[0_8px_20px_rgba(90,62,40,.06)] lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      {/* ---------- The room as it looks from outside ---------- */}
      <div className="relative aspect-[16/11] bg-ink lg:aspect-auto lg:min-h-[420px]">
        <Image src={room.thumb} alt="" fill priority sizes="(min-width: 1024px) 560px, 100vw" className={`object-cover ${ended ? "opacity-40 grayscale" : ""}`} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,.45)_0%,rgba(28,25,23,.05)_45%,rgba(28,25,23,.7)_100%)]" />
        <div className="absolute inset-x-3.5 top-3.5 flex flex-wrap items-center gap-2">
          {ended ? (
            <span className="inline-flex h-[26px] items-center rounded-full bg-stone-700 px-[11px] text-[11px] font-extrabold text-white">■ ENDED</span>
          ) : (
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold text-white">● LIVE</span>
          )}
          {!ended && (
            <span className="inline-flex h-[26px] items-center rounded-full bg-black/45 px-[11px] text-[11px] font-bold text-white">
              👁 {room.viewers.toLocaleString("en-IN")} watching
            </span>
          )}
          {!ended && liveFor && (
            <span className="inline-flex h-[26px] items-center rounded-full bg-black/45 px-[11px] text-[11px] font-bold text-white">{liveFor}</span>
          )}
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-3">
          <span className="relative size-[60px] shrink-0 overflow-hidden rounded-full border-[3px] border-gold shadow-[0_0_0_2px_rgba(255,255,255,.7)]">
            <Image src={host.photo} alt="" fill sizes="120px" className="object-cover" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <b className="font-name text-[19px] font-bold leading-tight text-paper [overflow-wrap:anywhere]">{host.name}</b>
              <VerifiedTick size={16} />
            </span>
            <span className="mt-1 block">
              <RecognitionBadge astrologer={host} />
            </span>
          </span>
        </div>
      </div>

      {/* ---------- What this live is about, and Join ---------- */}
      <div className="flex min-w-0 flex-col p-5 sm:p-7">
        <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">{ended ? "Live ended" : "Live now"}</div>
        <h2 id="live-preview-title" className="mt-1.5 font-display text-[28px] font-semibold leading-[1.1] text-ink [overflow-wrap:anywhere] sm:text-[32px]">
          {room.title}
        </h2>
        {room.topic !== room.title && <p className="mt-1.5 text-[14px] leading-normal text-stone-600 [overflow-wrap:anywhere]">{room.topic}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-2.5 text-[13px]">
          {room.category && (
            <div className="rounded-[14px] bg-cream px-3.5 py-2.5">
              <dt className="text-[11px] font-semibold text-stone-500">Category</dt>
              <dd className="mt-0.5 font-bold text-ink">{room.category}</dd>
            </div>
          )}
          <div className="rounded-[14px] bg-cream px-3.5 py-2.5">
            <dt className="text-[11px] font-semibold text-stone-500">Language</dt>
            <dd className="mt-0.5 font-bold text-ink [overflow-wrap:anywhere]">{room.language ?? languageLine(host)}</dd>
          </div>
          {planned && (
            <div className="rounded-[14px] bg-cream px-3.5 py-2.5">
              <dt className="text-[11px] font-semibold text-stone-500">Planned length</dt>
              <dd className="mt-0.5 font-bold text-ink">About {planned}</dd>
            </div>
          )}
          <div className="rounded-[14px] bg-cream px-3.5 py-2.5">
            <dt className="text-[11px] font-semibold text-stone-500">Consult rate</dt>
            <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
              {discount && host.was && <span className="text-[11.5px] text-[#b0a8b8] line-through">{rupee(host.was)}</span>}
              <b className="text-ink">{rupee(host.price)}/min</b>
              {discount && <span className="text-[10.5px] font-extrabold text-amber-800">{discount}</span>}
            </dd>
          </div>
        </dl>

        <div className="mt-auto pt-6">
          {ended ? (
            <div role="status" className="rounded-2xl border border-line bg-paper px-4 py-3.5">
              <b className="block text-[14px] text-ink">This live has ended</b>
              <p className="mt-1 text-[13px] leading-normal text-stone-600">You can still consult {host.name} one-to-one, or watch another live.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/astrologer/${host.slug}`}
                  className="az-cta inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-bold hover:text-cta-ink hover:no-underline"
                >
                  View profile
                </Link>
                <Link
                  href="/live"
                  className="inline-flex h-10 items-center rounded-full border border-line bg-white px-5 text-[13.5px] font-bold text-ink hover:no-underline"
                >
                  Other lives
                </Link>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void join()}
                disabled={joining || !session.ready}
                className="az-cta h-[52px] w-full rounded-full text-[16px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.32)] disabled:opacity-70"
              >
                {joining ? "Joining…" : signedOut ? "Sign in to join" : "Join live"}
              </button>
              <p className="mt-2.5 text-center text-[12px] leading-normal text-stone-500">
                {signedOut
                  ? "Sign in to watch, chat with the room and send gifts."
                  : "When you join, the room sees your name and photo. Watching is free."}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
