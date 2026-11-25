"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lockScroll } from "@/lib/scroll-lock";
import { useSession } from "@/lib/session-store";

const SHOWN_KEY = "astrorize.freecall.popup";

type Period = "daily" | "weekly" | "monthly";
const PERIOD_LABEL: Record<Period, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const PERIOD_WHEN: Record<Period, string> = { daily: "today", weekly: "this week", monthly: "this month" };

// The twelve zodiac glyphs around the emblem.
const ZODIAC = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
// A fixed scatter of stars (same on server and client).
const STARS: [number, number, number, number][] = [
  [8, 10, 3, 0], [22, 5, 2, 1.2], [38, 14, 2, 0.6], [62, 7, 3, 1.8], [80, 12, 2, 0.3], [92, 6, 3, 1],
  [5, 36, 2, 1.4], [94, 34, 2, 0.8], [12, 62, 3, 0.2], [88, 60, 2, 1.6], [6, 84, 2, 1], [93, 86, 3, 0.5],
  [30, 92, 2, 1.3], [70, 94, 2, 0.1],
];

/**
 * Every time a customer opens the app with free minutes still unused, this card reminds them (once per
 * visit). It can be closed with "Later", the × at the top right of the screen, Escape or a tap outside.
 * The Daily / Weekly / Monthly minutes come from the limits the admin sets on Config → Free Calls.
 */
export default function FreeCallPopup() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("weekly");
  const w = session.wallet.welcome;
  const available = !!w && (w.status === "granted" || w.status === "reserved") && ((w.oneTime?.available ?? false) || w.weekly.remaining > 0);
  const customer = session.ready && session.loggedIn && session.role === "customer";

  useEffect(() => {
    if (!customer || !available) return;
    try {
      if (window.sessionStorage.getItem(SHOWN_KEY)) return;
      window.sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // Storage unavailable: show it anyway, once for this page load.
    }
    // Deferred so the first paint isn't blocked by it.
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [customer, available]);

  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || !w) return null;

  const periods = w.periods;
  // Only the periods the admin has set minutes for are shown.
  const setPeriods = (Object.keys(PERIOD_LABEL) as Period[]).filter((p) => (periods?.[p]?.limit ?? 0) > 0);
  const active: Period | null = setPeriods.includes(period) ? period : (setPeriods[0] ?? null);
  const row = active ? periods?.[active] : undefined;
  // What the customer can actually use right now (the smallest of the periods that have a limit).
  const usableNow = w.weekly.remaining;

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center overflow-y-auto bg-[#0d0820]/75 px-4 py-6 backdrop-blur-[3px]" role="presentation" onClick={() => setOpen(false)}>
      {/* The close button sits at the top right of the screen, not inside the card. */}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close"
        className="fixed top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] z-[2] grid size-11 place-items-center rounded-full border border-white/25 bg-white/10 text-[22px] leading-none text-white backdrop-blur hover:bg-white/20"
      >
        ×
      </button>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[460px] overflow-hidden rounded-[28px] border border-amber-300/50 bg-[radial-gradient(120%_80%_at_50%_0%,#4b2a8a_0%,#2b1659_45%,#150b32_100%)] px-6 pt-8 pb-6 text-center text-[#fdf6e3] shadow-[0_30px_80px_rgba(10,5,30,.65),inset_0_0_0_1px_rgba(255,214,102,.18)] sm:px-8"
      >
        {STARS.map(([x, y, size, delay], i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-amber-200 motion-safe:animate-pulse"
            style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `${delay}s`, boxShadow: "0 0 8px 2px rgba(253,224,130,.7)" }}
          />
        ))}

        {/* The emblem: a sun inside a ring of the twelve signs. */}
        <div className="relative mx-auto grid size-[150px] place-items-center" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border border-amber-300/40 shadow-[0_0_40px_rgba(251,191,36,.35)]" />
          {ZODIAC.map((z, i) => (
            <span
              key={z}
              className="absolute text-[14px] text-amber-200/90 [font-variant-emoji:text]"
              style={{ transform: `rotate(${i * 30}deg) translateY(-65px) rotate(${-i * 30}deg)` }}
            >
              {z}
            </span>
          ))}
          <div className="grid size-[92px] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff3b0,#fbbf24_55%,#d97706)] text-[44px] text-[#7a3b00] shadow-[0_0_34px_rgba(251,191,36,.8)] [font-variant-emoji:text]">
            ☀
          </div>
        </div>

        <p className="mt-4 mb-0 text-[11.5px] font-bold tracking-[.22em] text-amber-300 uppercase">A gift from the stars</p>
        <h2 id="fc-title" className="mt-1.5 mb-0 font-display text-[28px] leading-tight font-semibold text-white sm:text-[31px]">
          Your free minutes are waiting
        </h2>

        {/* Daily / Weekly / Monthly: only the ones the admin has set minutes for. */}
        {active && row && (
          <div className="mx-auto mt-5 max-w-[320px] rounded-2xl border border-amber-300/35 bg-white/[.07] p-4">
            <p className="m-0 text-left text-[11.5px] font-bold tracking-[.12em] text-amber-200 uppercase">Free minutes</p>
            {setPeriods.length > 1 && (
              <div role="group" aria-label="Free minutes by period" className={`mt-1.5 grid gap-2 ${setPeriods.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {setPeriods.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active === p}
                    onClick={() => setPeriod(p)}
                    className={`h-10 rounded-xl border text-[13.5px] font-bold transition-colors ${
                      active === p ? "border-amber-300 bg-amber-300 text-[#2a1650]" : "border-amber-300/40 bg-[#1d0f45] text-white hover:bg-[#2a1760]"
                    }`}
                  >
                    {PERIOD_LABEL[p]}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span className="font-display text-[54px] leading-none font-bold text-amber-300 [text-shadow:0_0_22px_rgba(251,191,36,.55)]">{row.remaining ?? row.limit}</span>
              <span className="text-[16px] font-semibold text-amber-100">min</span>
            </div>
            <p className="mt-1.5 mb-0 text-[12.5px] text-[#e4d9f7]">
              {setPeriods.length === 1 ? `${PERIOD_LABEL[active]}: ` : ""}
              {row.used} of {row.limit} min used {PERIOD_WHEN[active]}.
            </p>
          </div>
        )}

        <p className="mx-auto mt-3.5 mb-0 max-w-[34ch] text-[13.5px] leading-snug text-[#e4d9f7]">
          {w.oneTime?.available ? `Plus a free ${w.oneTime.total}-minute welcome call. ` : ""}
          {usableNow > 0 ? `You can use ${usableNow} free minutes right now` : "Use them"} — talk to an astrologer by chat or voice, on us.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-12 rounded-full border border-white/30 bg-white/10 text-[14.5px] font-bold text-white hover:bg-white/20"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/astrologers");
            }}
            className="h-12 rounded-full bg-[linear-gradient(90deg,#ffd233,#ff9a1a)] text-[14.5px] font-bold text-[#2a1650] shadow-[0_6px_18px_rgba(251,191,36,.45)]"
          >
            Use it now
          </button>
        </div>
      </div>
    </div>
  );
}
