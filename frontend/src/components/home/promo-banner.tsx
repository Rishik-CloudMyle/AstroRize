"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usableWelcome, useSession } from "@/lib/session-store";

// The marketing banner at the top of the desktop home page (client, Nov 2026: "a marketing design
// like the big astrology apps, with the rest of the page below it"). Large rotating slides for the
// offers and features that bring customers in: the free minutes on joining, recharging any amount,
// matchmaking with pros and cons, and live rooms. Moves on by itself every few seconds (not while
// hovered or focused, nor with reduced motion); the arrows and dots move it too.

interface PromoSlide {
  id: string;
  kicker: string;
  title: string;
  lead: string;
  cta: string;
  href: string;
  art: string;
  /** Slide background: a warm gradient per slide. */
  bg: string;
  /** Kicker and accent colour. */
  accent: string;
}

const ADVANCE_MS = 6000;

function useSlides(): PromoSlide[] {
  const session = useSession();
  const welcome = usableWelcome(session);
  const customer = session.loggedIn && session.role === "customer";
  return [
    welcome
      ? {
          id: "free",
          kicker: "Your free minutes",
          title: `${welcome.remaining} free minutes waiting for you`,
          lead: "Chat or call astrologers marked “Free call”. Your weekly minutes come first, then your joining bonus.",
          cta: "Find free-call astrologers",
          href: "/astrologers?availability=Free%20call",
          art: "/assets/spotlight/spotlight-welcome.jpg",
          bg: "linear-gradient(105deg,#fff4dc 0%,#ffe2b0 55%,#ffd28a 100%)",
          accent: "#b45309",
        }
      : {
          id: "free",
          kicker: "New here? Join free",
          title: "5 minutes free when you join",
          lead: "Every new mobile number gets 5 free minutes, plus free minutes every week. Chat or call astrologers marked “Free call”.",
          cta: customer ? "Find free-call astrologers" : "Sign up free",
          href: customer ? "/astrologers?availability=Free%20call" : "/signup",
          art: "/assets/spotlight/spotlight-welcome.jpg",
          bg: "linear-gradient(105deg,#fff4dc 0%,#ffe2b0 55%,#ffd28a 100%)",
          accent: "#b45309",
        },
    {
      id: "chat",
      kicker: "Chat or call",
      title: "Chat or call, whichever suits you",
      lead: "Vedic, KP, Nadi, tarot and more. Pay by the minute, first 60 seconds free, and your number always stays private.",
      cta: "Consult now",
      href: "/astrologers",
      art: "/assets/tools/horoscope.jpg",
      bg: "linear-gradient(105deg,#f6efff 0%,#e9dcff 55%,#dac6ff 100%)",
      accent: "#6d28d9",
    },
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
      title: "Join live sessions, send blessings from ₹5",
      lead: "Watch astrologers live for free, ask in the chat, and consult privately only if you choose.",
      cta: "Watch live",
      href: "/live",
      art: "/assets/spotlight/spotlight-live.jpg",
      bg: "linear-gradient(105deg,#fff7ed 0%,#ffe4cc 55%,#ffd0a8 100%)",
      accent: "#c2410c",
    },
  ];
}

export default function PromoBanner() {
  const slides = useSlides();
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const go = useCallback((i: number) => setAt(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => go(at + 1), ADVANCE_MS);
    return () => clearTimeout(id);
  }, [at, paused, go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="AstroRize offers"
      className="mx-auto max-w-[1240px] px-4 pt-5 sm:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-[28px] border border-line-warm shadow-[0_14px_34px_rgba(90,62,40,.12)]">
        <div className="flex transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${at * 100}%)` }}>
          {slides.map((s, i) => (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${s.title}`}
              aria-hidden={i !== at}
              className="relative flex h-[300px] w-full flex-none overflow-hidden"
              style={{ background: s.bg }}
            >
              <div className="relative z-[2] flex w-[60%] min-w-0 flex-col items-start justify-center py-8 pr-4 pl-16 xl:pl-20">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[11px] font-extrabold tracking-[.12em] uppercase" style={{ color: s.accent }}>
                  <svg viewBox="0 0 12 12" aria-hidden="true" className="size-2.5">
                    <path fill="currentColor" d="M6 0.4 7.15 4.5 11.6 6 7.15 7.5 6 11.6 4.85 7.5 0.4 6l4.45-1.5z" />
                  </svg>
                  {s.kicker}
                </span>
                <h2 className="mt-3.5 max-w-[18ch] font-display text-[44px] leading-[1.02] font-semibold tracking-[-.02em] text-ink xl:text-[50px]">{s.title}</h2>
                <p className="mt-3 max-w-[50ch] text-[15.5px] leading-normal text-stone-700">{s.lead}</p>
                <Link
                  href={s.href}
                  tabIndex={i === at ? 0 : -1}
                  className="az-cta mt-5 inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold shadow-[0_8px_20px_rgba(255,140,26,.3)] hover:text-cta-ink hover:no-underline"
                >
                  {s.cta} <span aria-hidden="true">→</span>
                </Link>
              </div>
              {/* The picture fades into the slide's colour instead of meeting it at a hard edge. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-[48%] [mask-image:linear-gradient(90deg,transparent,#000_40%)]"
              >
                <Image src={s.art} alt="" fill sizes="600px" className="object-cover object-center" priority={i === 0} />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(at - 1)}
          aria-label="Previous offer"
          className="absolute top-1/2 left-3 z-[3] grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[18px] font-bold text-ink shadow-md hover:bg-white"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => go(at + 1)}
          aria-label="Next offer"
          className="absolute top-1/2 right-3 z-[3] grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-[18px] font-bold text-ink shadow-md hover:bg-white"
        >
          ›
        </button>
        <div className="absolute inset-x-0 bottom-3 z-[3] flex justify-center gap-1">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show offer ${i + 1} of ${count}`}
              aria-current={i === at ? "true" : undefined}
              className="grid size-6 place-items-center"
            >
              <span className={`block h-2 rounded-full transition-all ${i === at ? "w-6 bg-ink/80" : "w-2 bg-ink/25"}`} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
