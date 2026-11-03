"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { IconMessage, IconPhone } from "@/components/mobile/icons";
import type { Offer } from "@/lib/offers";
import { usableWelcome, useSession } from "@/lib/session-store";

// The marketing banner at the very top of the home page, on every screen size (client, Nov 2026: "a
// marketing design like the big astrology apps, full screen with no space left and right, the rest
// of the page below it"). Edge-to-edge rotating slides for what brings customers in: the free
// minutes on joining (or the customer's own free minutes), open offers, messaging and calls,
// recharging any amount, matchmaking with pros and cons, and live rooms. The text lines up with
// the page content; the background and picture run to both edges. It moves on by itself every few
// seconds (not while hovered, focused or touched, nor with reduced motion); swipe, the arrows and
// the dots move it too. Every slide has the same fixed height, so nothing below it ever jumps.
// Client, Nov 2026 (second round): a premium finish (gold hairlines, a soft shadow), Chat / Call /
// Video always in view in a band under the slides, the chat-or-call slide first, and clear space
// between the banner and the page below it.

/** What a new mobile number gets, from the API's Config (null: unknown, so the slide is left out). */
export interface WelcomeOffer {
  enabled: boolean;
  joiningBonusMinutes: number;
  weeklyMinutes: number;
}

interface PromoSlide {
  id: string;
  kicker: string;
  title: string;
  lead: string;
  cta: string;
  href: string;
  /** An optional second, outlined button beside the first. */
  cta2?: { label: string; href: string };
  art: string;
  /** Where the picture's subject sits (object-position). */
  focus?: string;
  /** Slide background: a warm gradient per slide. */
  bg: string;
  /** Kicker and accent colour. */
  accent: string;
}

const ADVANCE_MS = 6000;
/** A horizontal swipe longer than this (px) changes slide. */
const SWIPE_PX = 40;

const AMBER = { bg: "linear-gradient(105deg,#fff4dc 0%,#ffe2b0 55%,#ffd28a 100%)", accent: "#b45309" };

function useSlides(offer: WelcomeOffer | null): PromoSlide[] {
  const session = useSession();
  const welcome = usableWelcome(session);
  const offers = useOpenOffers(session.ready);
  const slides: PromoSlide[] = [];

  // Chat and calls first (client: "highlighting chat/call"), with a button for each.
  slides.push({
    id: "chat",
    kicker: "Chat or call",
    title: "Chat, call or video — your choice",
    lead: "Vedic, KP, Nadi, tarot and more. Messages are free; chats and calls are by the minute, first 60 seconds free, and your number always stays private.",
    cta: "Chat now",
    href: "/astrologers?mode=Chat",
    cta2: { label: "Call now", href: "/astrologers?mode=Voice" },
    art: "/assets/tools/horoscope.jpg",
    bg: "linear-gradient(105deg,#f6efff 0%,#e9dcff 55%,#dac6ff 100%)",
    accent: "#6d28d9",
  });

  if (welcome) {
    slides.push({
      id: "free",
      kicker: "Your free minutes",
      title: `${welcome.remaining} free minutes waiting for you`,
      lead: "Use them to Chat or Voice call astrologers marked “Free call”. Your weekly minutes come first, then your joining bonus.",
      cta: "Find free-call astrologers",
      href: "/astrologers?availability=Free%20call",
      art: "/assets/spotlight/spotlight-welcome.jpg",
      ...AMBER,
    });
  } else if (!session.loggedIn && offer?.enabled && offer.joiningBonusMinutes > 0) {
    // Visitors (and the first paint, before the session is known) see what joining gets them.
    const weekly = offer.weeklyMinutes > 0 ? ", plus free minutes every week" : "";
    slides.push({
      id: "free",
      kicker: "New here? Join free",
      title: `${offer.joiningBonusMinutes} minutes free when you join`,
      lead: `Every new mobile number gets ${offer.joiningBonusMinutes} free minutes${weekly} to Chat or Voice call astrologers marked “Free call”.`,
      cta: "Sign up free",
      href: "/signup",
      art: "/assets/spotlight/spotlight-welcome.jpg",
      ...AMBER,
    });
  }

  for (const o of offers) {
    slides.push({
      id: `offer-${o.id}`,
      kicker: "AstroRize offer",
      title: o.name,
      lead: o.summary,
      cta: "See offer",
      href: "/offers",
      art: "/assets/tools/kundli.jpg",
      bg: "linear-gradient(105deg,#fff8e6 0%,#fde9c0 55%,#f9d995 100%)",
      accent: "#a16207",
    });
  }

  slides.push(
    {
      id: "wallet",
      kicker: "Wallet",
      title: "Recharge any amount you like",
      lead: "Pick a pack with bonus credit, or type your own amount. GST is shown before you pay — never again on a session.",
      cta: "Add money",
      href: "/wallet#add-money",
      art: "/assets/tools/daily-mountains.jpg",
      bg: "linear-gradient(105deg,#ecfdf5 0%,#d1fae5 55%,#b7f0d6 100%)",
      accent: "#047857",
    },
    {
      id: "match",
      kicker: "Free tool",
      title: "Kundli matching with pros & cons",
      lead: "All eight kootas, Mangal dosha and a plain-language list of what works and what to watch — free.",
      cta: "Match kundlis",
      href: "/free-tools/matchmaking",
      art: "/assets/tools/matchmaking.jpg",
      bg: "linear-gradient(105deg,#fff1f2 0%,#ffe0e5 55%,#fecdd6 100%)",
      accent: "#be123c",
    },
    {
      id: "live",
      kicker: "Live rooms",
      title: "Watch astrologers live, free",
      lead: "Ask in the chat, send a blessing if you like, and consult privately only if you choose.",
      cta: "Watch live",
      href: "/live",
      art: "/assets/spotlight/spotlight-live.jpg",
      bg: "linear-gradient(105deg,#fff7ed 0%,#ffe4cc 55%,#ffd0a8 100%)",
      accent: "#c2410c",
    },
  );
  return slides;
}

/** Offers anyone can still claim (or the customer has claimed and can still use), at most 2. Empty on any error. */
function useOpenOffers(ready: boolean): Offer[] {
  const [offers, setOffers] = useState<Offer[]>([]);
  const session = useSession();
  const who = session.loggedIn ? `${session.role}:${session.email}:${session.phone}` : "";
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    api
      .get<{ offers: Offer[] }>("/offers")
      .then((r) => {
        if (!cancelled) setOffers(r.offers.filter((o) => o.open && o.eligible && (!o.claim || o.claim.status === "ACTIVE")).slice(0, 2));
      })
      .catch(() => {
        // No offer slides; the rest of the banner stays.
      });
    return () => {
      cancelled = true;
    };
  }, [ready, who]);
  return offers;
}

export default function PromoBanner({ welcomeOffer }: { welcomeOffer: WelcomeOffer | null }) {
  const slides = useSlides(welcomeOffer);
  const count = slides.length;
  // The slide shown is remembered by id, so a slide added or removed (offers loading, the session
  // becoming known) never leaves the banner pointing past the end or jumping to another slide.
  const [currentId, setCurrentId] = useState(slides[0]?.id ?? "");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const touchX = useRef<number | null>(null);
  const found = slides.findIndex((s) => s.id === currentId);
  const at = found < 0 ? 0 : found;
  const go = useCallback((i: number) => setCurrentId(slides[((i % count) + count) % count].id), [slides, count]);
  const paused = hovered || focused || touching;

  useEffect(() => {
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => go(at + 1), ADVANCE_MS);
    return () => clearTimeout(id);
  }, [at, paused, go, count]);

  return (
    // The cream space under the banner keeps it apart from the section below (client: "leave some space").
    <div className="bg-cream pb-4 sm:pb-5 lg:pb-7">
    <div className="relative shadow-[0_14px_28px_-16px_rgba(92,58,12,.45)]">
    <GoldRule className="top-0" />
    <section
      aria-roledescription="carousel"
      aria-label="AstroRize offers"
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
        setTouching(true);
      }}
      onTouchEnd={(e) => {
        const from = touchX.current;
        touchX.current = null;
        setTouching(false);
        if (from === null) return;
        const dx = e.changedTouches[0].clientX - from;
        if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? at + 1 : at - 1);
      }}
      onTouchCancel={() => {
        touchX.current = null;
        setTouching(false);
      }}
    >
      <div
        className="flex touch-pan-y transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${at * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${s.title}`}
            inert={i !== at}
            className="relative h-[256px] w-full flex-none overflow-hidden sm:h-[280px] md:h-[300px] lg:h-[340px] xl:h-[380px]"
            style={{ background: s.bg }}
          >
            {/* The picture runs to the right edge and fades into the slide's colour. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-[46%] [mask-image:linear-gradient(90deg,transparent,#000_45%)] sm:w-[50%] lg:w-[52%]"
            >
              <Image
                src={s.art}
                alt=""
                fill
                sizes="(min-width: 1024px) 52vw, 50vw"
                className="object-cover"
                style={{ objectPosition: s.focus ?? "center" }}
                priority={i === 0}
              />
            </div>
            <div className="relative z-[2] mx-auto flex h-full max-w-[1240px] items-center px-4 sm:px-14 lg:px-16 min-[1400px]:px-6">
              <div className="flex w-[66%] min-w-0 flex-col items-start pb-5 max-[359px]:w-[86%] sm:w-[60%] sm:pb-4 lg:w-[56%] lg:pb-2">
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-[3px] text-[9.5px] font-extrabold tracking-[.12em] uppercase sm:px-3 sm:py-1 sm:text-[11px]"
                  style={{ color: s.accent }}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true" className="size-2 shrink-0 sm:size-2.5">
                    <path fill="currentColor" d="M6 0.4 7.15 4.5 11.6 6 7.15 7.5 6 11.6 4.85 7.5 0.4 6l4.45-1.5z" />
                  </svg>
                  <span className="truncate">{s.kicker}</span>
                </span>
                <h2 className="mt-2 line-clamp-3 font-display text-[24px] leading-[1.04] font-semibold max-[359px]:text-[20px] tracking-[-.02em] text-balance break-words text-ink sm:mt-3 sm:text-[32px] md:text-[36px] lg:mt-3.5 lg:max-w-[18ch] lg:text-[44px] xl:text-[50px]">
                  {s.title}
                </h2>
                <p className="mt-1.5 line-clamp-3 max-w-[50ch] text-[12px] leading-[1.35] text-stone-700 sm:mt-2.5 sm:line-clamp-2 sm:text-[14px] lg:mt-3 lg:line-clamp-3 lg:text-[15.5px]">
                  {s.lead}
                </p>
                <div className="mt-3 flex max-w-full flex-wrap items-center gap-2 sm:mt-4 lg:mt-5">
                <Link
                  href={s.href}
                  className="az-cta inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-4 text-[13px] font-bold whitespace-nowrap max-[359px]:h-auto max-[359px]:min-h-9 max-[359px]:py-1.5 max-[359px]:whitespace-normal max-[359px]:leading-tight shadow-[0_8px_20px_rgba(255,140,26,.3)] hover:text-cta-ink hover:no-underline sm:h-11 sm:px-5 sm:text-[14.5px] lg:h-12 lg:px-6 lg:text-[15px]"
                >
                  <span className="truncate max-[359px]:whitespace-normal">{s.cta}</span> <span aria-hidden="true">→</span>
                </Link>
                {s.cta2 && (
                  <Link
                    href={s.cta2.href}
                    className="inline-flex h-9 max-w-full items-center rounded-full border border-ink/15 bg-white/85 px-4 text-[13px] font-bold whitespace-nowrap text-ink hover:bg-white hover:text-ink hover:no-underline max-[359px]:px-3 sm:h-11 sm:px-5 sm:text-[14.5px] lg:h-12 lg:px-6 lg:text-[15px]"
                  >
                    {s.cta2.label}
                  </Link>
                )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          {/* Arrows from tablet width up; on phones the slides are swiped (and the dots tapped). */}
          <button
            type="button"
            onClick={() => go(at - 1)}
            aria-label="Previous offer"
            className="absolute top-1/2 left-2 z-[3] hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[20px] leading-none font-bold text-ink shadow-md hover:bg-white sm:grid lg:left-4"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go(at + 1)}
            aria-label="Next offer"
            className="absolute top-1/2 right-2 z-[3] hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[20px] leading-none font-bold text-ink shadow-md hover:bg-white sm:grid lg:right-4"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-0.5 z-[3] flex justify-center sm:bottom-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show offer ${i + 1} of ${count}`}
                aria-current={i === at ? "true" : undefined}
                className="grid h-6 w-6 place-items-center"
              >
                <span className={`block h-1.5 rounded-full transition-all sm:h-2 ${i === at ? "w-5 bg-ink/80 sm:w-6" : "w-1.5 bg-ink/25 sm:w-2"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
    <ConsultBand />
    <GoldRule className="bottom-0" />
    </div>
    </div>
  );
}

/** A fine gold line across the full width, over the banner's top or bottom edge. */
function GoldRule({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 z-[4] h-[2px] bg-[linear-gradient(90deg,#b8862b,#f3d58a_30%,#e2b03a_50%,#f3d58a_70%,#b8862b)] ${className}`}
    />
  );
}

const VideoIcon = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="3" y="6.5" width="12.5" height="11" rx="2" />
    <path d="m15.5 10.5 5-3v9l-5-3z" />
  </svg>
);

/** Chat, Call and Video always in view under the slides, whichever slide is showing. */
function ConsultBand() {
  const modes = [
    { label: "Chat", href: "/astrologers?mode=Chat", icon: <IconMessage className="size-[18px] shrink-0" /> },
    { label: "Call", href: "/astrologers?mode=Voice", icon: <IconPhone className="size-[18px] shrink-0" /> },
    { label: "Video", href: "/astrologers?mode=Video", icon: <VideoIcon className="size-[18px] shrink-0" /> },
  ];
  return (
    <nav aria-label="Consult an astrologer" className="relative bg-[linear-gradient(100deg,#1c1917,#2a1848_55%,#1c1917)]">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-2.5 sm:px-14 lg:px-16 lg:py-3 min-[1400px]:px-6">
        <p className="hidden min-w-0 flex-1 text-[13px] leading-snug text-[#f3e3bd] sm:block lg:text-[14.5px]">
          <b className="font-display text-[17px] font-semibold text-[#f3d58a] lg:text-[19px]">Talk to an astrologer now</b>
          <span className="hidden lg:inline"> · by the minute, first 60 seconds free</span>
        </p>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 sm:flex-none sm:gap-2.5">
          {modes.map((m, i) => (
            <Link
              key={m.label}
              href={m.href}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13.5px] font-bold hover:no-underline sm:px-5 lg:h-11 lg:text-[14.5px] ${
                i === 0
                  ? "az-cta text-cta-ink shadow-[0_6px_16px_rgba(255,140,26,.35)] hover:text-cta-ink"
                  : "border border-[#e2b03a]/70 bg-white/[.06] text-[#f8e7bf] hover:bg-white/[.12] hover:text-white"
              }`}
            >
              {m.icon}
              <span className="truncate">{m.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
