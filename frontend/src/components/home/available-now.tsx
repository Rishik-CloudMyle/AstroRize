// Home hero: the "Available right now" panel — a frosted panel with a compact card for each
// astrologer who is online (up to four; the rest are one click away). It sits between the
// headline and the zodiac wheel: its own column on wide screens, under the headline on laptops,
// and between the text and the wheel on tablets and phones (cards stack; nothing scrolls sideways).
//
// It is live: the server renders the first snapshot (no flash), then the band asks the API again
// every few seconds and whenever the tab comes back, so an astrologer who comes online, goes live
// or starts a session shows up without a reload. Available astrologers come first, then those
// who are live (their card opens the live), then those in a consultation.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Portrait } from "@/components/astrologer/parts";
import { api } from "@/lib/api/client";
import { AVAILABILITY, rupee } from "@/lib/format";
import type { Astrologer, AvailabilityKey } from "@/lib/types";

/** What the band needs of each astrologer (the page passes only this, to keep the page small). */
export type AvailableAstrologer = Pick<Astrologer, "id" | "slug" | "name" | "photo" | "availability" | "skills" | "years" | "price">;

/** How often to ask again (ms). */
const POLL_MS = 10_000;
/** Cards shown in the band. */
const SHOWN = 4;
/** Order in the band: available first, then live, then in a consultation. */
const RANK: Record<AvailabilityKey, number> = { on: 0, live: 1, busy: 2, off: 3 };

const slimAstrologer = (a: AvailableAstrologer): AvailableAstrologer => ({
  id: a.id,
  slug: a.slug,
  name: a.name,
  photo: a.photo,
  availability: a.availability,
  skills: a.skills,
  years: a.years,
  price: a.price,
});

const skills = (a: AvailableAstrologer) => `${a.skills.join(" · ")} · ${a.years} yrs`;

/** "4 online", or "4 online · 2 available · 1 live · 1 in consultation" once some are not free. */
function countLine(c: Record<AvailabilityKey, number>) {
  const n = c.on + c.live + c.busy;
  if (c.live + c.busy === 0) return `${n} ${n === 1 ? "astrologer" : "astrologers"} online`;
  return [
    `${n} online`,
    c.on > 0 && `${c.on} available`,
    c.live > 0 && `${c.live} live`,
    c.busy > 0 && `${c.busy} in consultation`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function AvailableNow({
  initial,
  initialTotal,
  className = "",
}: {
  /** Every astrologer as the server saw them when the page was rendered. */
  initial: AvailableAstrologer[];
  /** How many astrologers there are in all. */
  initialTotal: number;
  className?: string;
}) {
  const [list, setList] = useState(initial);
  const [total, setTotal] = useState(initialTotal);

  useEffect(() => {
    let timer = 0;
    // Only the newest answer counts, if two requests overlap; none after unmounting.
    let seq = 0;
    const refresh = async () => {
      const mine = ++seq;
      try {
        const res = await api.get<{ astrologers: Astrologer[]; total: number }>("/astrologers");
        if (mine !== seq) return;
        setList(res.astrologers.map(slimAstrologer));
        setTotal(res.total);
      } catch {
        // Keep the last snapshot; the next round tries again.
      }
    };
    const schedule = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, POLL_MS);
    };
    // Back on the tab: refresh at once, then carry on the usual rhythm.
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      seq++;
    };
  }, []);

  const present = list
    .filter((a) => a.availability !== "off")
    .map((a, i) => ({ a, i }))
    .sort((x, y) => RANK[x.a.availability] - RANK[y.a.availability] || x.i - y.i)
    .map(({ a }) => a);
  const counts = { on: 0, live: 0, busy: 0, off: 0 } as Record<AvailabilityKey, number>;
  for (const a of present) counts[a.availability]++;
  const shown = present.slice(0, SHOWN);
  const anyone = present.length > 0;
  const others = total > present.length;
  // A quiet pointer to everyone else fills room a short list leaves: in the tablet grid (two
  // columns) when a row is half empty, next to a single card on laptops, and under the column on
  // wide screens. Never on phones — the link in the header is enough there.
  const filler = others
    ? [
        shown.length % 2 === 1 && "sm:flex",
        shown.length === 1 ? "lg:flex" : "lg:hidden",
        shown.length < SHOWN ? "min-[90rem]:flex" : "min-[90rem]:hidden",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <section
      aria-labelledby="available-now-title"
      className={`az-glass relative flex min-w-0 flex-col gap-3 rounded-[22px] p-3 sm:p-4 min-[90rem]:p-3.5 ${className}`}
    >
      {/* A thin gold light along the top edge of the glass. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-amber-400/70 to-transparent" />
      <div className="flex min-w-0 items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id="available-now-title" className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-amber-800">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${anyone ? "az-live-dot bg-emerald-600" : "bg-stone-400"}`} />
            Available right now
          </h2>
          {/* Announced politely as people come and go. In the narrow wide-screen column it wraps rather than cut off. */}
          <p
            aria-live="polite"
            className={anyone ? "mt-0.5 truncate text-[12.5px] tabular-nums text-stone-600 min-[90rem]:whitespace-normal min-[90rem]:leading-snug" : "sr-only"}
          >
            {anyone ? countLine(counts) : "No one is online right now."}
          </p>
        </div>
        {/* With nobody online the empty state carries the link instead; on wide screens it sits under the list. */}
        {anyone && (
          <Link
            href="/astrologers"
            className="shrink-0 text-[13px] font-bold text-amber-800 underline-offset-2 hover:text-amber-900 hover:underline min-[90rem]:hidden"
          >
            See all {total}
            <span className="max-sm:hidden"> astrologers</span> →
          </Link>
        )}
      </div>

      {!anyone ? (
        // Nobody is online: say so plainly, and keep the way to every profile.
        <div className="flex min-w-0 flex-col items-start gap-3 rounded-2xl border border-dashed border-amber-900/20 bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between min-[90rem]:flex-col min-[90rem]:items-start">
          <p className="min-w-0 text-[13.5px] leading-normal text-stone-600">
            <b className="font-bold text-plum">No one is online right now.</b>{" "}
            {total === 0
              ? "Astrologers will appear here as they come online."
              : "Astrologers come online through the day — book a session or message one from their profile."}
          </p>
          <Link
            href="/astrologers"
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-[#f0d9a8] bg-white px-4 text-[13px] font-bold text-ink hover:text-ink hover:no-underline"
          >
            {total === 0 ? "Browse astrologers" : "Browse all astrologers"}
          </Link>
        </div>
      ) : (
        <>
          {/* One column on phones (three at most), two on tablets (four) and laptops (one row of two),
              one compact column again on wide screens (four). */}
          <ul className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 min-[90rem]:grid-cols-1 min-[90rem]:gap-2">
            {shown.map((a, i) => (
              <li key={a.id} className={`az-fade-in min-w-0 ${i >= 3 ? "max-sm:hidden" : ""} ${i >= 2 ? "lg:max-[90rem]:hidden" : ""}`}>
                <Card a={a} />
              </li>
            ))}
            {filler && (
              <li className={`hidden min-w-0 ${filler}`}>
                <Link
                  href="/astrologers"
                  className="flex min-h-[68px] w-full items-center justify-center rounded-2xl border border-dashed border-amber-900/20 px-4 py-3 text-center text-[13px] leading-snug text-stone-600 hover:bg-white/50 hover:text-stone-700 hover:no-underline"
                >
                  <span>
                    More astrologers come online through the day.{" "}
                    <b className="whitespace-nowrap font-bold text-amber-800">Browse all {total} →</b>
                  </span>
                </Link>
              </li>
            )}
          </ul>
          <Link
            href="/astrologers"
            className="hidden self-start px-1 text-[13px] font-bold text-amber-800 underline-offset-2 hover:text-amber-900 hover:underline min-[90rem]:block"
          >
            See all {total} astrologers →
          </Link>
        </>
      )}
    </section>
  );
}

function Card({ a }: { a: AvailableAstrologer }) {
  const live = a.availability === "live";
  const busy = a.availability === "busy";
  const href = live ? `/live?room=${encodeURIComponent(a.id)}` : `/astrologer/${a.slug}`;
  const action = live ? "watch live" : busy ? "in a consultation — view profile" : "consult now";
  return (
    <Link
      href={href}
      aria-label={`${a.name}, ${skills(a)}, ${rupee(a.price)} per minute — ${action}`}
      className="az-lift group flex h-full items-center gap-3 rounded-2xl border border-amber-900/10 bg-white/80 p-2.5 pr-3 hover:bg-white hover:no-underline min-[90rem]:gap-2.5 min-[90rem]:p-2 min-[90rem]:pr-2.5"
    >
      <Portrait astrologer={a} size={48} statusDot />
      <span className="block min-w-0 flex-1">
        <b className="block truncate font-name text-[14.5px] font-bold tracking-[-.02em] text-plum">{a.name}</b>
        <span className="mt-px block truncate text-[11.5px] text-mauve">{skills(a)}</span>
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold tabular-nums text-plum">
            {rupee(a.price)}
            <span className="text-[10.5px] font-semibold text-mauve">/min</span>
          </span>
          {live ? (
            <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-urgent px-2.5 text-[11.5px] font-bold text-white">
              <span aria-hidden="true" className="az-live-dot size-1.5 rounded-full bg-white" />
              Live · Join ›
            </span>
          ) : busy ? (
            <span
              className="inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-bold"
              style={{ background: AVAILABILITY.busy.bg, color: AVAILABILITY.busy.fg }}
            >
              In consultation
            </span>
          ) : (
            <span className="az-cta inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-bold">Consult now ›</span>
          )}
        </span>
      </span>
    </Link>
  );
}
