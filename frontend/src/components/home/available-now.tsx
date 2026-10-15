// Home hero: the "Available right now" rail — a frosted band along the bottom of the hero with a
// compact card for each astrologer who is online (up to four; the rest are one click away). On
// phones the cards scroll sideways inside the band, never the page.

import Link from "next/link";
import { Portrait } from "@/components/astrologer/parts";
import { rupee, skillLine } from "@/lib/format";
import type { Astrologer } from "@/lib/types";

export default function AvailableNow({
  astrologers,
  online,
  total,
  className = "",
}: {
  /** The astrologers to show (already limited by the page). */
  astrologers: Astrologer[];
  /** How many are online in all. */
  online: number;
  /** How many astrologers there are in all. */
  total: number;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="available-now-title"
      className={`az-glass relative flex min-w-0 flex-col gap-3 rounded-[22px] p-3 sm:p-4 ${className}`}
    >
      {/* A thin gold light along the top edge of the glass. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-amber-400/70 to-transparent" />
      <div className="flex min-w-0 items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id="available-now-title" className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-amber-800">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${online > 0 ? "az-live-dot bg-emerald-600" : "bg-stone-400"}`}
            />
            Available right now
          </h2>
          {online > 0 && (
            <p className="mt-0.5 text-[12.5px] text-stone-600">
              {online} {online === 1 ? "astrologer" : "astrologers"} online
            </p>
          )}
        </div>
        {/* With nobody online the empty state below carries the link instead. */}
        {astrologers.length > 0 && (
          <Link href="/astrologers" className="shrink-0 text-[13px] font-bold text-amber-800 underline-offset-2 hover:text-amber-900 hover:underline">
            See all {total}
            <span className="max-sm:hidden"> astrologers</span> →
          </Link>
        )}
      </div>

      {astrologers.length === 0 ? (
        // Nobody is online: say so plainly, and keep the way to every profile.
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3 rounded-2xl border border-dashed border-amber-900/20 bg-white/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
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
        <ul className="-mx-3 flex min-w-0 flex-1 snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-3 px-3 pb-1 [scrollbar-width:none] sm:-mx-4 sm:scroll-px-4 sm:px-4 lg:mx-0 lg:snap-none lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
          {astrologers.map((a) => (
            <li key={a.id} className="w-[min(264px,78vw)] shrink-0 snap-start lg:w-auto lg:max-w-[calc((100%-30px)/4)] lg:flex-1 lg:basis-0">
              <Link
                href={`/astrologer/${a.slug}`}
                aria-label={`${a.name}, ${skillLine(a)}, ${rupee(a.price)} per minute — consult now`}
                className="az-lift group flex h-full items-center gap-3 rounded-2xl border border-amber-900/10 bg-white/80 p-2.5 pr-3 hover:bg-white hover:no-underline"
              >
                <Portrait astrologer={a} size={48} statusDot />
                <span className="block min-w-0 flex-1">
                  <b className="block truncate font-name text-[14.5px] font-bold tracking-[-.02em] text-plum">{a.name}</b>
                  <span className="mt-px block truncate text-[11.5px] text-mauve">{skillLine(a)}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold tabular-nums text-plum">
                      {rupee(a.price)}
                      <span className="text-[10.5px] font-semibold text-mauve">/min</span>
                    </span>
                    <span className="az-cta inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-bold">Consult now ›</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {/* On wide screens, room left over by a short list becomes a quiet pointer to everyone else. */}
          {astrologers.length < 4 && total > astrologers.length && (
            <li className="hidden min-w-0 lg:flex lg:flex-1 lg:basis-0">
              <Link
                href="/astrologers"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-amber-900/20 px-4 py-3 text-center text-[13px] text-stone-600 hover:bg-white/50 hover:text-stone-700 hover:no-underline"
              >
                <span>
                  More astrologers come online through the day.{" "}
                  <b className="whitespace-nowrap font-bold text-amber-800">Browse all {total} →</b>
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
