"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveNow, type LiveNow } from "../live-notifier";

/** "just now", "12 min ago", "2 hr ago". */
function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ago`;
}

const STATS: { key: keyof Pick<LiveNow, "online" | "liveRooms" | "consultationsToday" | "inSession">; one: string; many: string }[] = [
  { key: "online", one: "astrologer online", many: "astrologers online" },
  { key: "liveRooms", one: "live room now", many: "live rooms now" },
  { key: "inSession", one: "consultation in progress", many: "consultations in progress" },
  { key: "consultationsToday", one: "consultation today", many: "consultations today" },
];

/**
 * Dark "Live now" band on the home page: real figures from the API (refreshed every 30 s by
 * the site's live notifier), and a "Just now" line that rotates through what actually
 * happened in the last few hours.
 */
export default function LiveBand() {
  const live = useLiveNow();
  const events = live?.events ?? [];
  const [feedIndex, setFeedIndex] = useState(0);
  const [feedVisible, setFeedVisible] = useState(true);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (events.length < 2) return;
    let fadeTimer: ReturnType<typeof setTimeout>;
    const feed = setInterval(() => {
      setFeedVisible(false);
      fadeTimer = setTimeout(() => {
        setFeedIndex((i) => i + 1);
        setClock(Date.now());
        setFeedVisible(true);
      }, 300);
    }, 5000);
    return () => {
      clearInterval(feed);
      clearTimeout(fadeTimer);
    };
  }, [events.length]);

  // Keep "12 min ago" honest when the line isn't rotating.
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const event = events.length ? events[feedIndex % events.length] : null;
  const someoneLive = (live?.liveRooms ?? 0) > 0;

  return (
    <section aria-label="Live activity" className="bg-linear-180 from-ink to-[#231d16] text-[#f8f4ec]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[26px] gap-y-4 px-4 py-[22px] sm:px-6">
        <span className="inline-flex h-[26px] items-center gap-[7px] rounded-full bg-urgent/15 px-3 text-[10.5px] font-extrabold uppercase tracking-[.09em] text-orange-400">
          <span className={`inline-block size-1.5 rounded-full ${someoneLive ? "az-live-dot bg-urgent" : "bg-stone-500"}`} />
          Live now
        </span>
        <div className="grid w-full min-w-0 grid-cols-2 gap-x-[30px] gap-y-3 sm:flex sm:w-auto sm:flex-1 sm:flex-wrap">
          {STATS.map((s) => {
            const value = live ? live[s.key] : null;
            return (
              <div key={s.key}>
                <b className="block text-2xl font-bold leading-[1.1] tabular-nums">{value === null ? "–" : value.toLocaleString("en-IN")}</b>
                <span className="text-[11.5px] font-semibold text-muted">{value === 1 ? s.one : s.many}</span>
              </div>
            );
          })}
        </div>
        <div className="min-w-[230px] max-w-[340px] flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-[.1em] text-stone-500">Just now</div>
          <div
            aria-live="polite"
            className="mt-[3px] min-h-[38px] text-[12.5px] leading-normal text-line transition-opacity duration-300"
            style={{ opacity: feedVisible ? 1 : 0 }}
          >
            {!live ? (
              <span className="text-stone-400">Checking who&apos;s online…</span>
            ) : event ? (
              <>
                {event.href ? (
                  <Link href={event.href} className="text-line underline decoration-stone-500 underline-offset-2 hover:text-white">
                    {event.text}
                  </Link>
                ) : (
                  event.text
                )}
                <span className="text-stone-500"> · {ago(event.at, clock)}</span>
              </>
            ) : someoneLive ? (
              `${live.live[0].name} is live · ${live.live[0].topic}`
            ) : live.online > 0 && live.available === 0 ? (
              "No one is live right now. Everyone online is in a consultation — check back in a few minutes."
            ) : live.online > 0 ? (
              `No one is live right now. ${live.available === 1 ? "1 astrologer is" : `${live.available} astrologers are`} available to consult.`
            ) : (
              "No one is live right now. Astrologers come online through the day."
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
