"use client";

import Link from "next/link";
import type { Astrologer } from "@/lib/types";
import { showsFreeCalls, usableWelcome, useSession } from "@/lib/session-store";

// The welcome free call on the website: a "Free call" badge on astrologers who take free calls
// and are available now, and a banner for a customer who still holds theirs. Both disappear once
// it has been used. Numbers come from the API (the campaign's length, the astrologer's quota).

/** "Free call" on an astrologer who can take the customer's free call right now. */
export function FreeCallBadge({ astrologer, className = "" }: { astrologer: Astrologer; className?: string }) {
  const session = useSession();
  if (!astrologer.freeCall || !showsFreeCalls(session)) return null;
  const welcome = usableWelcome(session);
  return (
    <span
      title="Your first call with an astrologer marked “Free call” is free (Chat or Voice)"
      className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-[9px] text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 ${className}`}
    >
      🎁 Free call{welcome ? ` · ${Math.round(welcome.freeSeconds / 60)} min` : ""}
    </span>
  );
}

/** "1 free call · 5 min" for a signed-in customer who still holds their welcome free call. */
export function WelcomeBanner({ className = "", showLink = true }: { className?: string; showLink?: boolean }) {
  const session = useSession();
  const welcome = usableWelcome(session);
  if (!welcome) return null;
  const mins = Math.round(welcome.freeSeconds / 60);
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[20px] border border-emerald-200 bg-[linear-gradient(120deg,#ecfdf5,#fffdf8_70%)] px-4 py-3.5 sm:px-5 ${className}`}
    >
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-xl text-white shadow-[0_6px_16px_rgba(4,120,87,.25)]">
        🎁
      </span>
      <div className="min-w-0 flex-[1_1_220px]">
        <b className="block text-[15px] text-emerald-900">1 free call · {mins} min</b>
        <span className="block text-[12.5px] leading-normal text-emerald-900/80">
          Complimentary {mins} minutes of Chat or Voice with any astrologer marked “Free call”. Video and Instant Call stay paid.
        </span>
      </div>
      {showLink && (
        <Link
          href="/astrologers?availability=Free%20call"
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-emerald-700 px-4 text-[13.5px] font-bold text-white hover:bg-emerald-800 hover:text-white hover:no-underline"
        >
          Use it now ›
        </Link>
      )}
    </div>
  );
}
