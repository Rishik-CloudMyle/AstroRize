"use client";

import Image from "next/image";
import Link from "next/link";
import { rupee } from "@/lib/format";
import type { Astrologer, FeaturedReview, LiveRoom, Tool } from "@/lib/types";
import AppAstroCard, { AppVerifiedTick, STAR_ICON } from "../astrologer/app-astro-card";
import { useBelowDesktop, useCurrentAstrologers } from "../directory/use-current-astrologers";
import { CATEGORIES } from "../directory/filters";
import { Chip, ChipRow } from "../mobile/chips";
import EmptyState from "../mobile/empty-state";
import { IconFilter } from "../mobile/icons";
import SearchPill from "../mobile/search-pill";
import SectionHeader from "../mobile/section-header";
import { consultationLabel } from "./review-text";

// The home page on phones and tablets (< 1024px), laid out like the client's customer app Home:
// search, Live Now, Astrologers for you, Free tools and customer reviews. The marketing banner
// (promo-banner.tsx) sits above it, edge to edge on every screen size, in place of the app's
// Spotlight card. Everything is real: live rooms, astrologers and reviews come from the API.
// Rendered inside `lg:hidden` (the desktop home is unchanged), so it polls only while it is the
// visible layout.

export interface HomeRoom {
  room: LiveRoom;
  host: Astrologer;
}

export default function AppHome({
  astrologers: initial,
  rooms,
  tools,
  reviews,
}: {
  astrologers: Astrologer[];
  rooms: HomeRoom[];
  tools: Tool[];
  reviews: FeaturedReview[];
}) {
  const below = useBelowDesktop();
  const astrologers = useCurrentAstrologers(initial, below);
  const featured = astrologers.slice(0, 3);

  return (
    <div className="bg-app-bg px-4 pt-3.5 pb-6">
      <SearchPill href="/astrologers?focus=search" placeholder="Search astrologers" />

      {/* ---------- Live Now ---------- */}
      <section aria-labelledby="app-live-title" className="mt-[22px]">
        <SectionHeader
          title={<span id="app-live-title">Live Now</span>}
          href="/live"
          icon={<Image src="/assets/brand/live-now-ico.png" alt="" width={28} height={20} className="h-5 w-7 object-contain" />}
        />
        {rooms.length === 0 ? (
          <div className="rounded-app-card border border-app-line bg-app-surface">
            <EmptyState
              title="No rooms on air right now."
              body="Astrologers go live through the day — join as a viewer, consult only if you choose."
              action={
                <Link
                  href="/astrologers"
                  className="inline-flex min-h-app-hit items-center rounded-app-btn border border-app-line px-4 text-[15px] font-bold text-app-ink hover:text-app-ink hover:no-underline"
                >
                  Browse astrologers
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rooms.map(({ room, host }) => (
              <li key={room.id} className="flex w-[calc(50%-18px)] flex-none snap-start sm:w-[220px]">
                <LiveCard room={room} host={host} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Astrologers for you ---------- */}
      <section aria-labelledby="app-afy-title" className="mt-[22px]">
        <div className="mb-3 flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <p className="m-0 font-card text-[10px] font-medium tracking-[.04em] text-[#9a93a8]">Find Clarity • Live Better</p>
            <h2 id="app-afy-title" className="mt-0.5 font-name text-[26px] leading-[1.15] font-bold tracking-[-.02em] text-[#2a1848]">
              Astrologers for you
            </h2>
            <p className="mt-1 max-w-[240px] font-card text-[12px] leading-[1.35] text-[#8b8498]">
              Connect with trusted astrologers and get personalized guidance
            </p>
          </div>
          <Link
            href="/astrologers"
            className="mt-3.5 inline-flex h-6 shrink-0 items-center gap-[3px] rounded-[7px] border border-app-line-gold-2 bg-app-surface px-[9px] text-[12px] leading-none font-semibold text-app-active hover:text-app-active hover:no-underline"
          >
            See all <span aria-hidden="true">›</span>
          </Link>
        </div>
        <ChipRow label="Filter astrologers">
          <Chip href={`/astrologers?panel=${CATEGORIES[0].id}`} icon={<IconFilter />}>
            Filter
          </Chip>
          {CATEGORIES.filter((c) => c.id !== "orders").map((c) => (
            <Chip key={c.id} href={`/astrologers?panel=${c.id}`}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
        {featured.length === 0 ? (
          <EmptyState title="No astrologers are listed yet." body="Please check back soon." />
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {featured.map((a) => (
              <AppAstroCard key={a.id} astrologer={a} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Free tools ---------- */}
      {tools.length > 0 && (
        <section aria-labelledby="app-tools-title" className="mt-[22px]">
          <SectionHeader title={<span id="app-tools-title">Free tools</span>} href="/free-tools" linkLabel="Explore Self, Find Clarity" variant="chip" />
          <ul className="grid grid-cols-4 gap-2 max-[359px]:grid-cols-2">
            {tools.map((t) => (
              <li key={t.id}>
                <ToolTile href={`/free-tools/${t.id}`} name={t.name} art={t.art} fade={TOOL_FADE[t.id]} />
              </li>
            ))}
            <li>
              <ToolTile href="/free-tools" name="All tools" fade="rgba(247,242,255,.96)" />
            </li>
          </ul>
        </section>
      )}

      {/* ---------- Customer reviews (real, published reviews only) ---------- */}
      {reviews.length > 0 && (
        <section aria-labelledby="app-reviews-title" className="mt-[22px]">
          <SectionHeader title={<span id="app-reviews-title">What customers say</span>} />
          <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {reviews.map((r) => (
              <li key={r.id} className="flex w-[82%] flex-none snap-start sm:w-[320px]">
                <figure className="m-0 flex w-full min-w-0 flex-col rounded-app-card border border-app-line bg-app-surface p-3 shadow-app-card">
                  <div className="text-[13px] tracking-[2px] text-[#f5b301]" role="img" aria-label={`${r.stars} out of 5 stars`}>
                    {"★".repeat(r.stars)}
                    <span className="text-[#e7dcc6]">{"★".repeat(5 - r.stars)}</span>
                  </div>
                  <blockquote className="m-0 mt-1.5 line-clamp-4 text-[14px] leading-[1.45] break-words text-app-ink">“{r.text}”</blockquote>
                  <figcaption className="mt-auto pt-2.5 text-[12px] text-app-ink-3">
                    {r.customerName} · {consultationLabel(r)} with{" "}
                    <Link href={`/astrologer/${r.astrologerSlug}`} className="font-semibold text-app-accent">
                      {r.astrologerName}
                    </Link>{" "}
                    · <span className="whitespace-nowrap">{r.date}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The light fade behind each tool's name, as in the app (dark text on every tile). */
const TOOL_FADE: Record<string, string> = {
  kundli: "rgba(252,244,228,.95)",
  horoscope: "rgba(230,236,252,.94)",
  matchmaking: "rgba(255,232,242,.94)",
  panchang: "rgba(236,246,232,.94)",
  numerology: "rgba(236,226,252,.94)",
  tarot: "rgba(250,240,220,.95)",
  daily: "rgba(252,243,226,.94)",
};

function ToolTile({ href, name, art, fade = "rgba(252,244,228,.95)" }: { href: string; name: string; art?: string; fade?: string }) {
  return (
    <Link
      href={href}
      className="relative block h-[100px] w-full overflow-hidden rounded-app-card bg-[#f6efe4] text-[#241832] shadow-[0_6px_14px_rgba(62,38,18,.07)] after:pointer-events-none after:absolute after:inset-0 after:z-[3] after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(240,228,208,.82)] hover:text-[#241832] hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-selected"
    >
      {art ? (
        <Image src={art} alt="" fill sizes="(min-width: 1024px) 1px, (max-width: 359px) 50vw, (max-width: 640px) 25vw, 200px" className="object-cover" />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,#fbf8ff,#f3ecfc)] pb-5">
          <span className="grid size-[42px] grid-cols-2 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className="block rounded-[4px] bg-[#cbb6f0]" />
            ))}
          </span>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 z-[1] block pt-[18px] pr-[5px] pb-1.5 pl-1.5" style={{ background: `linear-gradient(to top, ${fade} 38%, transparent)` }}>
        <b className="block truncate pr-[17px] text-[clamp(8.5px,2.6vw,10px)] leading-[1.15] max-[359px]:text-[12px] font-bold tracking-[-.05em]">{name}</b>
        <span
          aria-hidden="true"
          className="absolute right-[5px] bottom-1.5 grid size-4 place-items-center rounded-full bg-[#c9a227] text-[9px] leading-none font-bold text-white shadow-[0_2px_6px_rgba(40,24,12,.14)]"
        >
          ›
        </span>
      </span>
    </Link>
  );
}

/** A live room in the Home "Live Now" rail: photo, LIVE NOW, viewers, host, topic, rate, Join Live. */
function LiveCard({ room, host }: HomeRoom) {
  const ratings = host.ratingDistribution.reduce((x, y) => x + y, 0);
  return (
    <article className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#f0e4d0] bg-[#fefaf7] font-card shadow-[0_6px_14px_rgba(62,38,18,.06)]">
      <Link href={`/live?room=${encodeURIComponent(room.id)}`} aria-label={`${host.name}: ${room.title}`} className="relative block h-[158px] overflow-hidden bg-[#120f18]">
        <Image src={room.thumb || host.photo} alt="" fill sizes="(min-width: 1024px) 1px, (max-width: 640px) 50vw, 220px" className="object-cover object-[center_18%]" />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(180deg,transparent,rgba(12,10,18,.72))]" />
        <span className="absolute top-[7px] left-[7px] z-[2] inline-flex h-5 items-center gap-1 rounded-full bg-[#361d4d] pr-[7px] pl-1.5 text-[8px] font-extrabold tracking-[.04em] text-[#f0d48a]">
          <span aria-hidden="true" className="inline-flex h-[11px] items-end gap-[1.5px]">
            <b className="block h-[5px] w-0.5 rounded-full bg-[#f0d48a]" />
            <b className="block h-[11px] w-0.5 rounded-full bg-[#f0d48a]" />
            <b className="block h-[7px] w-0.5 rounded-full bg-[#f0d48a]" />
          </span>
          LIVE NOW
        </span>
        <span className="absolute top-[7px] right-[7px] z-[2] inline-flex h-5 max-w-[calc(100%-86px)] items-center gap-[3px] overflow-hidden rounded-full bg-[#2f1846] pr-1.5 pl-1 text-[8px] font-[650] whitespace-nowrap text-white tabular-nums">
          <span aria-hidden="true">👁</span>
          {room.viewers.toLocaleString("en-IN")} watching
        </span>
      </Link>
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5 pb-3">
        <div className="flex min-w-0 items-start gap-[5px] text-[14px] leading-[1.25] font-bold text-[#2a1848]">
          <span className="line-clamp-2 min-w-0 flex-1 break-words">{host.name}</span>
          <span className="mt-0.5">
            <AppVerifiedTick size={15} />
          </span>
        </div>
        {room.title && <div className="mt-[3px] line-clamp-2 text-[12px] leading-[1.3] font-medium break-words text-[#6d6478]">{room.title}</div>}
        {host.skills.length > 0 && (
          <div className="mt-[5px] flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-[1.25] font-medium text-[#a8a1b8]">
            {host.skills.slice(0, 3).map((s) => (
              <span key={s} className="whitespace-nowrap">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex w-full min-w-0 items-start justify-between gap-1.5 pt-2.5">
          <span className="flex min-w-0 flex-col">
            {host.was && host.was > host.price && <s className="text-[11px] text-[#9a93a3] tabular-nums">{rupee(host.was)}/min</s>}
            <b className="text-[16px] font-extrabold tracking-[-.02em] text-[#2a1848] tabular-nums">{rupee(host.price)}/min</b>
          </span>
          {host.rating !== null && (
            <span className="mt-px inline-flex shrink-0 items-center gap-1 text-[12px] font-bold whitespace-nowrap text-[#2a1848]">
              {STAR_ICON}
              {host.rating.toFixed(1)}
              {ratings > 0 && <em className="text-[11px] font-medium text-[#8a8296] not-italic">({ratings.toLocaleString("en-IN")})</em>}
            </span>
          )}
        </div>
        <Link
          href={`/live?room=${encodeURIComponent(room.id)}`}
          className="mt-2.5 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-full bg-[#e2a83e] px-3 text-[13px] font-bold tracking-[.01em] text-app-ink hover:text-app-ink hover:no-underline"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
            <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M8.7 8.35a4.85 4.85 0 0 0 0 7.3M15.3 8.35a4.85 4.85 0 0 1 0 7.3M6.15 6.35a8.15 8.15 0 0 0 0 11.3M17.85 6.35a8.15 8.15 0 0 1 0 11.3" />
          </svg>
          Join Live
          <span aria-hidden="true" className="text-[18px] leading-none font-medium">›</span>
        </Link>
      </div>
    </article>
  );
}
