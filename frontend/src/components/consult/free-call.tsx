"use client";

import Link from "next/link";
import type { Astrologer } from "@/lib/types";
import { FREE_CALL_DIRECTORY, fittingLengths, lengthsLabel, minutesHeadline, resetDay } from "@/lib/free-calls";
import { showsFreeCalls, usableWelcome, useSession } from "@/lib/session-store";

// The weekly free minutes on the website: a "Free call" badge on astrologers who take free calls
// and are available now, and a banner for a customer who still has free minutes this week. Neither
// starts anything: the customer chooses free minutes (and a length) or a paid call in the consult
// sheet. Numbers come from the API (minutes per week, the lengths a free call can be).

/** "Free call" on an astrologer who can take the customer's free call right now. */
export function FreeCallBadge({ astrologer, className = "" }: { astrologer: Astrologer; className?: string }) {
  const session = useSession();
  if (!astrologer.freeCall || !showsFreeCalls(session)) return null;
  return (
    <span
      title="Takes free calls: use your weekly free minutes with them for a Voice call, or pay per minute"
      className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-[9px] text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 ${className}`}
    >
      🎁 Free call
    </span>
  );
}

/**
 * "Free minutes: 25 of 30 left this week · resets Mon" for a signed-in customer who can still take a
 * free call this week, with a link to the astrologers taking free calls (it never starts a call).
 * With `showUsedUp` (the wallet page), one who has used them sees when they reset.
 */
export function WelcomeBanner({ className = "", showLink = true, showUsedUp = false }: { className?: string; showLink?: boolean; showUsedUp?: boolean }) {
  const session = useSession();
  const welcome = usableWelcome(session);
  const held = session.loggedIn && session.role === "customer" ? session.wallet.welcome : null;
  if (!welcome) {
    if (!showUsedUp || !held || held.status !== "consumed") return null;
    return (
      <div role="status" className={`rounded-[20px] border border-line bg-white px-4 py-3.5 text-[13px] text-stone-600 sm:px-5 ${className}`}>
        <b className="text-ink">
          Free minutes: {held.weekly.remaining} of {held.weekly.total} left this week.
        </b>{" "}
        {held.weekly.remaining > 0 ? "That's less than the shortest free call. " : ""}Your free minutes reset on {resetDay(held.weekly.resetsAt)}.
      </div>
    );
  }
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[20px] border border-emerald-200 bg-[linear-gradient(120deg,#ecfdf5,#fffdf8_70%)] px-4 py-3.5 sm:px-5 ${className}`}
    >
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-700 text-xl text-white shadow-[0_6px_16px_rgba(4,120,87,.25)]">
        🎁
      </span>
      <div className="min-w-0 flex-[1_1_220px]">
        <b className="block text-[15px] text-emerald-900">{minutesHeadline(welcome)}</b>
        <span className="block text-[12.5px] leading-normal text-emerald-900/80">
          Voice calls with astrologers marked “Free call”. When you start a consultation, choose “Use free minutes” and a length (
          {lengthsLabel(fittingLengths(welcome))}) — the full length is used — or pay per minute.
        </span>
      </div>
      {showLink && (
        <Link
          href={FREE_CALL_DIRECTORY}
          className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-emerald-700 bg-white px-4 text-[13.5px] font-bold text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 hover:no-underline"
        >
          Find astrologers taking free calls ›
        </Link>
      )}
    </div>
  );
}
