"use client";

// /free-tools on phones and tablets (< 1024px): the mobile app prototype's "All Tools" screen —
// a scenic header, the tools as a two-column grid of illustrated cards, and Daily insight as a
// wide banner. Desktop keeps its own layout (the page hides this block at >= 1024px).

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Tool } from "@/lib/types";
import { IconBack } from "../mobile/icons";

// This screen exists only below 1024px (hidden on desktop), so on desktop the browser should
// fetch the smallest copy of each picture, not a full-width one.
const PHONE_FULL_WIDTH = "(min-width: 1024px) 1px, 100vw";

/** Each card's light caption scrim and arrow colour, as in the prototype (.tools-all-card.is-…). */
const TONE: Record<string, { scrim: string; go: string }> = {
  kundli: { scrim: "rgba(252,244,228,.96)", go: "#c4a06a" },
  horoscope: { scrim: "rgba(232,236,252,.94)", go: "#7b8fd4" },
  matchmaking: { scrim: "rgba(255,232,242,.94)", go: "#e07aa8" },
  panchang: { scrim: "rgba(236,246,232,.94)", go: "#5a9a6a" },
  numerology: { scrim: "rgba(236,226,252,.94)", go: "#9b6fd4" },
  tarot: { scrim: "rgba(250,240,220,.95)", go: "#c9a15b" },
  daily: { scrim: "rgba(252,243,226,.92)", go: "#8a6a3c" },
};

function Go({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center rounded-full text-white shadow-[0_4px_10px_rgba(40,24,12,.16)]"
      style={{ background: color }}
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </span>
  );
}

export default function ToolsHubMobile({ tools }: { tools: Tool[] }) {
  const router = useRouter();
  const banner = tools.find((t) => t.id === "daily");
  const grid = tools.filter((t) => t !== banner);
  return (
    <div className="-mt-px bg-[#f4ebe0] px-3.5 pb-6">
      <header className="relative -mx-3.5 mb-3 h-[148px] overflow-hidden">
        <Image src="/assets/tools/daily-mountains.jpg" alt="" fill priority sizes={PHONE_FULL_WIDTH} className="object-cover object-[center_42%]" />
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(252,243,226,.78),rgba(252,243,226,.55)_55%,rgba(244,235,224,.92))]" />
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="absolute top-3 left-2 z-[2] grid size-11 place-items-center rounded-[10px] text-[#3c2468] [&>svg]:size-6"
        >
          <IconBack />
        </button>
        <div className="relative z-[1] px-12 pt-9 text-center">
          <h1 className="m-0 font-display text-[32px] leading-[1.05] font-bold tracking-[.01em] text-[#3c2468]">Free Tools</h1>
          <p className="mt-1.5 mb-0 text-[12px] font-medium text-[#5c5568]">Free, always · from real planetary positions</p>
        </div>
      </header>

      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
        {grid.map((t) => {
          const tone = TONE[t.id] ?? TONE.kundli;
          return (
            <li key={t.id}>
              <Link
                href={`/free-tools/${t.id}`}
                className="relative block h-[198px] overflow-hidden rounded-[22px] text-left shadow-[0_10px_22px_rgba(62,38,18,.08)] hover:no-underline sm:h-[248px]"
                style={{ background: t.bg }}
              >
                <Image src={t.art} alt="" fill sizes="(min-width: 1024px) 1px, (max-width: 640px) 50vw, 33vw" className="object-cover" />
                <span
                  className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 pt-[26px] pr-2.5 pb-[11px] pl-3"
                  style={{ background: `linear-gradient(to top, ${tone.scrim} 44%, transparent)` }}
                >
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] leading-[1.15] font-bold tracking-[-.015em] text-[#1f1633]">{t.name}</b>
                    <span className="mt-[3px] block text-[12px] leading-[1.28] font-medium text-[#5c5568]">{t.sub}</span>
                  </span>
                  <Go color={tone.go} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {banner && (
        <Link
          href={`/free-tools/${banner.id}`}
          className="relative mt-3 flex h-24 items-start justify-between overflow-hidden rounded-[22px] px-4 py-4 text-left shadow-[0_10px_22px_rgba(62,38,18,.08)] hover:no-underline"
          style={{ background: banner.bg }}
        >
          <Image src={banner.art} alt="" fill sizes={PHONE_FULL_WIDTH} className="object-cover" />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,rgba(252,243,226,.92)_0%,rgba(252,243,226,.55)_38%,rgba(252,243,226,.08)_70%)]"
          />
          <span className="relative z-[1] min-w-0">
            <b className="block text-[18px] leading-tight font-bold text-[#2a2150]">{banner.name}</b>
            <span className="mt-1 block text-[12px] font-medium text-[#5c5568]">{banner.sub}</span>
          </span>
          <span className="relative z-[1] self-center">
            <Go color={(TONE[banner.id] ?? TONE.daily).go} />
          </span>
        </Link>
      )}

      <p className="mt-3.5 mb-0 text-[12px] leading-[1.45] text-app-ink-2">
        Calculated by Astrorize&apos;s own astrology engine (sidereal, Lahiri). Your Kundli needs a free account and is
        saved privately to it; the other tools need no login.
      </p>
    </div>
  );
}
