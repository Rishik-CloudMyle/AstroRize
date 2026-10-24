"use client";

// The Live tab on phones and tablets (< 1024px), as the app's "Live Room" screen: the title pill,
// "Search Live", and every room on air as a two-column (three on a tablet) grid of cards — the
// host's portrait with LIVE NOW and the watching count, name, topic, skills, the host's own rate and
// rating, and "Join Live" (which opens the room's preview). Kept current while the tab is visible.
// Desktop (≥ 1024px) keeps its own /live page.

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import type { Astrologer, LiveRoom } from "@/lib/types";
import { VerifiedTick } from "../astrologer/parts";
import AppButton from "../mobile/button";
import EmptyState from "../mobile/empty-state";
import { IconLive } from "../mobile/icons";
import { AppPageTitle } from "../mobile/page-title";
import SearchPill from "../mobile/search-pill";

/** How often the list re-reads the rooms on air. */
const REFRESH_MS = 20_000;

export default function LiveListing({ rooms: initialRooms, hosts }: { rooms: LiveRoom[]; hosts: Astrologer[] }) {
  const [rooms, setRooms] = useState(initialRooms);
  const [query, setQuery] = useState("");

  // Rooms open and close through the day: re-read while the screen is visible, and on coming back.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api
        .get<{ rooms: LiveRoom[] }>("/live-rooms")
        .then((r) => !cancelled && setRooms(r.rooms))
        .catch(() => {
          // Keep the last list; the next check tries again.
        });
    };
    const id = setInterval(load, REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const byId = useMemo(() => new Map(hosts.map((h) => [h.id, h])), [hosts]);
  const onAir = rooms.flatMap((room) => {
    const host = byId.get(room.astrologerId);
    return host ? [{ room, host }] : [];
  });
  const q = query.trim().toLowerCase();
  const shown = q
    ? onAir.filter(({ room, host }) =>
        [host.name, room.title, room.topic, room.category ?? "", room.language ?? "", ...host.skills].join(" ").toLowerCase().includes(q),
      )
    : onAir;

  return (
    <div className="px-4 pt-2 pb-6">
      <AppPageTitle>Live Room</AppPageTitle>
      <SearchPill
        className="mt-3"
        placeholder="Search Live"
        label="Search live rooms"
        value={query}
        onValueChange={setQuery}
        trailing={
          query ? (
            <button type="button" onClick={() => setQuery("")} className="shrink-0 text-[12px] font-bold text-app-accent">
              Clear
            </button>
          ) : null
        }
      />

      {onAir.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<IconLive />}
          title="No one is live right now"
          body="Live rooms open through the day. Meanwhile, you can consult an astrologer one-to-one."
          action={
            <AppButton href="/astrologers" size="sm">
              Browse astrologers
            </AppButton>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState className="mt-6" role="status" title="No rooms match." body="Try another name or topic, or clear the search." />
      ) : (
        <ul className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Live now">
          {shown.map(({ room, host }) => (
            <li key={room.id} className="min-w-0">
              <LiveCard room={room} host={host} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Three little bars, as in the app's LIVE NOW flag. */
function LiveBars() {
  return (
    <span aria-hidden="true" className="inline-flex h-[11px] items-end gap-[1.5px]">
      <b className="block h-[5px] w-0.5 rounded-full bg-[#f0d48a] motion-safe:animate-[azPulseDot_.9s_ease-in-out_infinite]" />
      <b className="block h-[11px] w-0.5 rounded-full bg-[#f0d48a] motion-safe:animate-[azPulseDot_.9s_ease-in-out_.15s_infinite]" />
      <b className="block h-[7px] w-0.5 rounded-full bg-[#f0d48a] motion-safe:animate-[azPulseDot_.9s_ease-in-out_.3s_infinite]" />
    </span>
  );
}

function LiveCard({ room, host }: { room: LiveRoom; host: Astrologer }) {
  const href = `/live?room=${encodeURIComponent(room.id)}`;
  const ratings = host.ratingDistribution.reduce((n, c) => n + c, 0);
  const watching = room.viewers.toLocaleString("en-IN");
  const topic = room.title || room.topic;
  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#f0e4d0] bg-[#fefaf7] shadow-[0_6px_14px_rgba(62,38,18,.06)]">
      {/* The picture opens the room too (the "Join Live" link below is the one for keyboards and screen readers). */}
      <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block h-[158px] w-full overflow-hidden bg-[#120f18]">
        <Image src={host.photo} alt="" fill sizes="(min-width: 1024px) 1px, (min-width: 640px) 33vw, 50vw" className="object-cover object-[center_18%]" />
        <span className="absolute top-[7px] left-[7px] z-[2] inline-flex h-5 items-center gap-1 rounded-full bg-[#361d4d] pr-[7px] pl-1.5 text-[8px] font-extrabold tracking-[.04em] text-[#f0d48a]">
          <LiveBars />
          LIVE NOW
        </span>
        <span className="absolute top-[7px] right-[7px] z-[2] inline-flex h-5 max-w-[calc(100%-86px)] items-center gap-[3px] overflow-hidden rounded-full bg-[#2f1846] pr-1.5 pl-1 text-[8px] font-[650] whitespace-nowrap text-white tabular-nums">
          <span aria-hidden="true" className="grid size-[13px] shrink-0 place-items-center rounded-full border border-white/90">
            <svg viewBox="0 0 24 24" className="size-[9px]" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 6.6C7.2 6.6 3.4 9.5 2.2 12 3.4 14.5 7.2 17.4 12 17.4s8.6-2.9 9.8-5.4C20.6 9.5 16.8 6.6 12 6.6zm0 8.4A3 3 0 1 1 12 9a3 3 0 0 1 0 6zm0-1.9A1.1 1.1 0 1 0 12 10.9 1.1 1.1 0 0 0 12 13.1z"
              />
            </svg>
          </span>
          {watching}
          <span className="font-[550]">&nbsp;watching</span>
        </span>
      </Link>
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5 pb-3">
        <div className="flex min-w-0 items-start gap-[5px] text-[14px] leading-[1.25] font-bold text-[#2a1848]">
          <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">{host.name}</span>
          <span className="mt-0.5">
            <VerifiedTick size={15} />
          </span>
        </div>
        {topic && <p className="m-0 mt-[3px] line-clamp-2 text-[12px] leading-[1.3] font-medium text-[#6d6478] [overflow-wrap:anywhere]">{topic}</p>}
        {host.skills.length > 0 && (
          <p className="m-0 mt-[5px] flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-[1.25] font-medium text-[#a8a1b8]">
            {host.skills.slice(0, 3).map((s) => (
              <span key={s} className="whitespace-nowrap">
                {s}
              </span>
            ))}
          </p>
        )}
        <div className="mt-auto flex w-full min-w-0 items-start justify-between gap-1.5 pt-2.5">
          <span className="flex min-w-0 flex-col items-start tabular-nums">
            {host.was && host.was > host.price ? <s className="text-[11px] text-[#9a93a3]">{rupee(host.was)}/min</s> : null}
            <b className="text-[16px] font-extrabold tracking-[-.02em] text-[#2a1848]">{rupee(host.price)}/min</b>
          </span>
          <span className="mt-px inline-flex shrink-0 items-center gap-1 text-[12px] font-bold whitespace-nowrap text-[#2a1848]">
            {host.rating !== null ? (
              <>
                <span aria-hidden="true" className="text-[12px] text-[#e0b445]">
                  ★
                </span>
                <b>{host.rating.toFixed(1)}</b>
                {ratings > 0 && <em className="text-[11px] font-medium text-[#8a8296] not-italic">({ratings})</em>}
                <span className="sr-only"> rating</span>
              </>
            ) : (
              <span className="text-[11px] font-semibold text-[#8a8296]">New</span>
            )}
          </span>
        </div>
        <Link
          href={href}
          className="mt-2.5 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-full bg-[#e2a83e] px-3 text-[13px] font-bold tracking-[.01em] text-app-ink hover:text-app-ink hover:no-underline"
        >
          <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M8.7 8.35a4.85 4.85 0 0 0 0 7.3M15.3 8.35a4.85 4.85 0 0 1 0 7.3M6.15 6.35a8.15 8.15 0 0 0 0 11.3M17.85 6.35a8.15 8.15 0 0 1 0 11.3" />
          </svg>
          <span>
            Join Live<span className="sr-only"> with {host.name}, {watching} watching</span>
          </span>
          <span aria-hidden="true" className="text-[18px] leading-none font-medium">
            ›
          </span>
        </Link>
      </div>
    </article>
  );
}
