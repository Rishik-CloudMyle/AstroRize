"use client";

import Image from "next/image";
import Link from "next/link";
import type { Astrologer } from "@/lib/types";
import { AVAILABILITY, RECOGNITION, rupee } from "@/lib/format";
import { showsFreeCalls, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";

// The astrologer card of the phone/tablet app look (< 1024px) — the client prototype's
// `.astro-card-std` (Home "Astrologers for you", Consult list, Complimentary list):
// availability badge + recognition on the top rail, the ringed portrait, name, skills,
// languages and experience, the rating/consults pill, the four ways to consult as status tiles,
// and the price with one call to action. Desktop never renders it.
//
// The tiles only show status (as in the app). "Consult Now" opens the consult sheet, which
// handles sign-in, the price and balance check, and explains a busy astrologer; "Join Live"
// opens their live room. `welcome`: the customer's free call view (FREE price, Chat/Voice/Video).

type TileKind = "on" | "busy" | "instant" | "off";

const TILE_ICON: Record<"chat" | "voice" | "video" | "instant", React.ReactNode> = {
  chat: (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-[21px]">
      <circle cx="16" cy="16" r="16" fill="#22A06B" />
      <path fill="#fff" d="M9.2 11.6c0-1.5 1.2-2.7 2.7-2.7h8.2c1.5 0 2.7 1.2 2.7 2.7v6.1c0 1.5-1.2 2.7-2.7 2.7h-4.6L11.4 22v-2.2c-1.3-.5-2.2-1.7-2.2-3.2z" />
      <circle cx="13.2" cy="14.6" r="1.15" fill="#22A06B" />
      <circle cx="16" cy="14.6" r="1.15" fill="#22A06B" />
      <circle cx="18.8" cy="14.6" r="1.15" fill="#22A06B" />
    </svg>
  ),
  voice: (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-[21px]">
      <circle cx="16" cy="16" r="16" fill="#7C5CDB" />
      <path fill="#fff" d="M12.2 8.6h3l.9 2.8-1.8 1.2a9.6 9.6 0 0 0 5.6 5.6l1.2-1.8 2.8.9v2.8A1.6 1.6 0 0 1 22.3 21 12.4 12.4 0 0 1 10.6 10.2a1.6 1.6 0 0 1 1.6-1.6z" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-[21px]">
      <circle cx="16" cy="16" r="16" fill="#E05A8C" />
      <rect x="7.5" y="11.2" width="11.2" height="9.6" rx="1.8" fill="#fff" />
      <path fill="#fff" d="m19.4 13.8 5-2.2v8.8l-5-2.2z" />
    </svg>
  ),
  instant: (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-[21px]">
      <circle cx="16" cy="16" r="16" fill="#DBEAFE" />
      <path fill="#2563EB" d="M17.4 7.2 10.2 16.4h5.6l-.9 8.4 7.2-9.2h-5.6z" />
    </svg>
  ),
};

const TILE_TEXT: Record<TileKind, string> = {
  on: "text-[#16a34a]",
  busy: "text-[#c81e4a]",
  instant: "text-[#2563eb]",
  off: "text-[#9a93a5]",
};

export const PHONE_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[11px]">
    <path fill="currentColor" d="M7.2 3.6h3.4l1.1 3.4-2.1 1.5a12 12 0 0 0 6.8 6.8l1.5-2.1 3.4 1.1v3.2A1.9 1.9 0 0 1 19.4 19 15.2 15.2 0 0 1 5 7.5 1.9 1.9 0 0 1 6.9 5.6Z" />
  </svg>
);

export const STAR_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[11px] text-[#f5b301]">
    <path fill="currentColor" d="m8 1.4 1.8 3.7 4.1.6-3 2.9.7 4.1L8 10.8 4.4 12.7l.7-4.1-3-2.9 4.1-.6z" />
  </svg>
);

/** "1.2K+", "860+", "4". */
export function consultsShort(n: number): string {
  if (n >= 1000) return `${String(Math.round(n / 100) / 10).replace(/\.0$/, "")}K+`;
  if (n >= 10) return `${n}+`;
  return String(n);
}

/** The prototype's availability badge: "Available Now", "In consultation", "Live", "Offline". */
export function AppAvailabilityBadge({ astrologer: a }: { astrologer: Pick<Astrologer, "availability"> }) {
  const st = a.availability;
  const tone =
    st === "on" || st === "live" ? "bg-[#e7f8ee] text-[#147a45]" : st === "busy" ? "bg-[#fde8ee] text-[#c81e4a]" : "bg-[#f3f1ef] text-[#7a736c]";
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-full px-[7px] text-[10px] font-bold tracking-[.01em] whitespace-nowrap ${tone}`}>
      {st === "on" ? (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[9px]">
          <path fill="currentColor" d="M8.7 1.5 3.4 8.2H8l-.6 6.3 5.3-6.7H8.2z" />
        </svg>
      ) : st !== "off" ? (
        <i aria-hidden="true" className={`size-1.5 rounded-full bg-current ${st === "live" ? "az-live-dot" : ""}`} />
      ) : null}
      {st === "on" ? "Available Now" : st === "busy" ? "In consultation" : st === "live" ? "Live" : "Offline"}
    </span>
  );
}

/** The recognition pill (Premium, Trusted, Proven Expert, Rising, New) in the app's 20px size. */
export function AppRecognition({ astrologer: a }: { astrologer: Pick<Astrologer, "recognition"> }) {
  const r = RECOGNITION[a.recognition];
  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded-full border pr-2 pl-1.5 font-card text-[9px] leading-none font-bold tracking-[-.01em] whitespace-nowrap"
      style={{ borderColor: r.border, background: r.bg, color: r.fg }}
    >
      <span aria-hidden="true">★</span>
      {r.label}
    </span>
  );
}

/** The ringed portrait with the sun-ray halo and the availability dot. */
export function AppPortrait({ astrologer: a, size = 72 }: { astrologer: Pick<Astrologer, "photo" | "availability">; size?: number }) {
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span aria-hidden="true" className="az-rays absolute -inset-[5px] rounded-full" />
      <span className="relative block size-full overflow-hidden rounded-full border-2 border-[#e2b03a] shadow-[0_0_0_2px_#fff]">
        <Image src={a.photo} alt="" fill sizes={`${size * 2}px`} className="object-cover" />
      </span>
      <span
        aria-hidden="true"
        className="absolute right-0.5 bottom-1 z-[2] size-3 rounded-full border-2 border-white"
        style={{ background: AVAILABILITY[a.availability].dot }}
      />
    </span>
  );
}

export function AppVerifiedTick({ size = 14 }: { size?: number }) {
  return (
    <span
      title="Verified"
      className="inline-grid shrink-0 place-items-center rounded-full bg-[#f0b429] font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size > 15 ? 10 : 8.5 }}
    >
      <span aria-hidden="true">✓</span>
      <span className="sr-only">Verified</span>
    </span>
  );
}

function tileKind(a: Astrologer, mode: "chat" | "voice" | "video" | "instant"): TileKind {
  if (a.availability === "busy") return mode === "instant" ? "off" : "busy";
  if (a.availability !== "on") return "off";
  return mode === "instant" ? "instant" : "on";
}

function tileSub(kind: TileKind, a: Astrologer): string {
  switch (kind) {
    case "on":
      return "Online";
    case "instant":
      return "Ready";
    case "busy":
      return a.eta ? a.eta.replace(/^~\s*/, "~") : "Busy";
    default:
      return a.availability === "live" ? "Live" : "Off";
  }
}

/**
 * An astrologer in the app's lists. "🎁 Free call" marks one the customer can use their weekly free
 * minutes with; the card always shows the paid rate, and "Consult Now" opens the consult sheet,
 * where the customer chooses free minutes (and a length) or a paid call — nothing is applied here.
 */
export default function AppAstroCard({ astrologer: a }: { astrologer: Astrologer }) {
  const { startConsult } = useAppUI();
  const session = useSession();
  const freeTag = a.freeCall && showsFreeCalls(session);
  const skills = a.skills.slice(0, 3).join(" • ");
  const modes = (["chat", "voice", "video", "instant"] as const).map((m) => ({ mode: m, kind: tileKind(a, m) }));
  const label = { chat: "Chat", voice: "Voice", video: "Video", instant: "Instant" };
  const st = a.availability;

  return (
    <article className="relative rounded-[20px] border border-[#f0e4d0] bg-[#fffcf8] px-3 pt-[7px] pb-2 font-card shadow-[0_8px_20px_rgba(90,62,40,.07)]">
      <div className="pointer-events-none absolute top-[7px] right-2 left-2.5 z-[3] flex items-center justify-between gap-1.5">
        <AppAvailabilityBadge astrologer={a} />
        <span className="flex min-w-0 items-center gap-1">
          {freeTag && (
            <span className="inline-flex h-5 items-center rounded-full bg-[#e7f8ee] px-[7px] text-[10px] font-bold whitespace-nowrap text-[#147a45]">
              🎁 Free call
            </span>
          )}
          <AppRecognition astrologer={a} />
        </span>
      </div>

      <Link
        href={`/astrologer/${a.slug}`}
        className="flex w-full items-start gap-2.5 pt-[15px] text-left text-inherit hover:text-inherit hover:no-underline"
      >
        <AppPortrait astrologer={a} />
        <span className="min-w-0 flex-1 pt-3.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <b className="truncate font-name text-[15px] leading-[1.15] font-bold tracking-[-.02em] text-[#2a1848]">{a.name}</b>
            <AppVerifiedTick />
          </span>
          <span className="mt-0.5 block truncate text-[12px] leading-[1.25] font-medium text-[#8a8296]">{skills}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-[5px] text-[11px] leading-[1.15] text-[#8a8296]">
            <span className="inline-flex min-w-0 items-center gap-[3px]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="size-[11px] shrink-0">
                <path d="M12 6.2c-1.7-1.1-4.2-1.4-6.4-.6v12.2c2.2-.7 4.6-.4 6.4.8 1.8-1.2 4.2-1.5 6.4-.8V5.6c-2.2-.8-4.7-.5-6.4.6z" />
                <path d="M12 6.4v12" />
              </svg>
              <span className="truncate">{a.languages.join(", ")}</span>
            </span>
            <i aria-hidden="true" className="h-3 w-px shrink-0 bg-[#ddd6e8]" />
            <span className="inline-flex shrink-0 items-center gap-[3px]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" aria-hidden="true" className="size-[11px] shrink-0">
                <path d="M12 2.6c.55.7.45 1.4 0 2" />
                <path d="M12 4.6v2.6" />
                <rect x="8" y="9.2" width="8" height="3.1" rx=".7" />
                <path d="M6 12.3h12v6.2H6z" />
              </svg>
              {a.years} yrs exp
            </span>
          </span>
        </span>
      </Link>

      <div className="mt-[5px] flex flex-col gap-[5px]">
        <div
          className="inline-flex w-max max-w-full items-center gap-[5px] rounded-full bg-[#f7f2ea] px-1.5 py-0.5 whitespace-nowrap"
          aria-label={`${a.rating === null ? "New" : `Rated ${a.rating.toFixed(1)}`}. ${a.consults} verified consultations`}
        >
          {a.rating === null ? (
            <span className="inline-flex h-[18px] items-center rounded-full bg-app-tint-2 px-1.5 text-[9px] font-bold text-app-active">New</span>
          ) : (
            <span className="inline-flex items-center gap-[3px] text-[11px] font-bold text-[#2a1848] tabular-nums">
              {STAR_ICON}
              {a.rating.toFixed(1)}
            </span>
          )}
          <i aria-hidden="true" className="h-3 w-px bg-[#e4d9c8]" />
          <span className="text-[11px] font-semibold text-[#8a8296]">
            <b className="font-bold text-[#2a1848] tabular-nums">{consultsShort(a.consults)}</b> Verified Consults
          </span>
        </div>
        <ul aria-label="Ways to consult" className="grid grid-cols-4 gap-1">
          {modes.map(({ mode, kind }) => (
            <li key={mode} className={`flex min-w-0 flex-col items-center gap-px text-center ${kind === "off" ? "opacity-[.48]" : ""}`}>
              <span className="grid size-[21px] place-items-center">{TILE_ICON[mode]}</span>
              <b className="text-[10px] leading-[1.1] font-bold text-[#3f4f9a]">{label[mode]}</b>
              <em className={`text-[10px] leading-[1.1] font-[650] whitespace-nowrap not-italic ${TILE_TEXT[kind]}`}>{tileSub(kind, a)}</em>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-[5px] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="inline-flex items-baseline gap-[3px]">
              <span className="text-[15px] leading-[1.15] font-bold tracking-[-.02em] text-[#2a1848] tabular-nums">{rupee(a.price)}</span>
              <span className="text-[10px] font-semibold text-[#8a8296]">/min</span>
            </span>
            {a.was && a.was > a.price && <s className="text-[11px] font-medium text-[#b0a8b8] tabular-nums">{rupee(a.was)}</s>}
          </div>
          {st === "busy" && (
            <div className="mt-0.5 text-[10px] text-[#8a8296]">In consultation{a.eta ? ` ${a.eta}` : ""}</div>
          )}
        </div>
        {st === "live" ? (
          <Link
            href={`/live?room=${encodeURIComponent(a.id)}`}
            className="relative inline-flex min-h-8 shrink-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] items-center justify-center gap-1 rounded-full bg-[linear-gradient(90deg,#ffd233_0%,#ff8c1a_100%)] pr-3 pl-2.5 text-[12px] font-bold text-[#1a1208] shadow-[0_5px_12px_rgba(255,140,26,.26)] hover:text-[#1a1208] hover:no-underline"
          >
            {PHONE_ICON}
            <span>Join Live</span>
            <span aria-hidden="true" className="text-[12px] leading-none font-semibold">›</span>
          </Link>
        ) : st === "off" ? (
          <button
            type="button"
            disabled
            className="relative inline-flex min-h-8 shrink-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] items-center justify-center rounded-full bg-[#ece8e2] px-3 text-[12px] font-bold text-[#8a8296]"
          >
            Offline
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startConsult({ astrologer: a })}
            aria-label={`Consult now with ${a.name}`}
            className="relative inline-flex min-h-8 shrink-0 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] items-center justify-center gap-1 rounded-full bg-[linear-gradient(90deg,#ffd233_0%,#ff8c1a_100%)] pr-3 pl-2.5 text-[12px] font-bold text-[#1a1208] shadow-[0_5px_12px_rgba(255,140,26,.26)]"
          >
            {PHONE_ICON}
            <span>Consult Now</span>
            <span aria-hidden="true" className="text-[12px] leading-none font-semibold">›</span>
          </button>
        )}
      </div>
    </article>
  );
}
