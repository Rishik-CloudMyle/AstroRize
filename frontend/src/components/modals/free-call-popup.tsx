"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-store";

const SHOWN_KEY = "astrorize.freecall.popup";

/** Every time a customer opens the app with a free call still unused, they are reminded of it (once per visit). */
export default function FreeCallPopup() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  if (!open || !w) return null;
  const parts = [
    w.oneTime?.available ? `a free ${w.oneTime.total}-minute welcome call` : "",
    w.weekly.remaining > 0 ? `${w.weekly.remaining} free minutes this week` : "",
  ].filter(Boolean);
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/55 px-5" role="presentation" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="fc-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-[360px] rounded-2xl bg-white p-5 text-center text-ink shadow-2xl">
        <h2 id="fc-title" className="m-0 text-[18px] font-bold">Your free call is waiting</h2>
        <p className="mt-2 mb-0 text-[13.5px] leading-snug text-stone-600">You have {parts.join(" and ")}. Talk to an astrologer by chat or voice on us.</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-stone-300 bg-white text-[14px] font-bold">Later</button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/astrologers");
            }}
            className="h-11 rounded-xl bg-amber-400 text-[14px] font-bold text-ink"
          >
            Use it now
          </button>
        </div>
      </div>
    </div>
  );
}
