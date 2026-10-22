"use client";

import Link from "next/link";
import type { Astrologer } from "@/lib/types";
import { allowanceHeadline, allowanceRule, freeLength, freeLengthLong, resetDay } from "@/lib/free-calls";
import { showsFreeCalls, usableWelcome, useSession } from "@/lib/session-store";

// The welcome free calls on the website: a "Free call" badge on astrologers who take free calls
// and are available now, and a banner for a customer who still has free calls to use. Both
// disappear once they're used. Numbers come from the API (how many free calls, per what period,
// how long each is, the astrologer's capacity).

/** "Free call" on an astrologer who can take the customer's free call right now. */
export function FreeCallBadge({ astrologer, className = "" }: { astrologer: Astrologer; className?: string }) {
  const session = useSession();
  if (!astrologer.freeCall || !showsFreeCalls(session)) return null;
  const welcome = usableWelcome(session);
  return (
    <span
      title="Customers' welcome free calls (Chat or Voice) work with astrologers marked “Free call”"
      className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-[9px] text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 ${className}`}
    >
      🎁 Free call{welcome ? ` · ${freeLength(welcome.freeSeconds)}` : ""}
    </span>
  );
}

/**
 * "1 free call · 5 min" for a signed-in customer who still has free calls to use. With `showUsedUp`
 * (the wallet page), a customer whose free calls renew sees when the next one comes.
 */
export function WelcomeBanner({ className = "", showLink = true, showUsedUp = false }: { className?: string; showLink?: boolean; showUsedUp?: boolean }) {
  const session = useSession();
  const welcome = usableWelcome(session);
  const held = session.loggedIn && session.role === "customer" ? session.wallet.welcome : null;
  if (!welcome) {
    if (!showUsedUp || !held || held.status !== "consumed" || !held.allowance.resetsAt) return null;
    return (
      <div role="status" className={`rounded-[20px] border border-line bg-white px-4 py-3.5 text-[13px] text-stone-600 sm:px-5 ${className}`}>
        <b className="text-ink">You&apos;ve used your free calls for now.</b> Your next free call is available from {resetDay(held.allowance.resetsAt)}.
      </div>
    );
  }
  const rule = allowanceRule(welcome);
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[20px] border border-emerald-200 bg-[linear-gradient(120deg,#ecfdf5,#fffdf8_70%)] px-4 py-3.5 sm:px-5 ${className}`}
    >
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-xl text-white shadow-[0_6px_16px_rgba(4,120,87,.25)]">
        🎁
      </span>
      <div className="min-w-0 flex-[1_1_220px]">
        <b className="block text-[15px] text-emerald-900">{allowanceHeadline(welcome)}</b>
        <span className="block text-[12.5px] leading-normal text-emerald-900/80">
          Complimentary {freeLengthLong(welcome.freeSeconds)} of Chat or Voice with any astrologer marked “Free call”. Video and Instant Call stay paid.
          {rule ? ` ${rule}.` : ""}
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
