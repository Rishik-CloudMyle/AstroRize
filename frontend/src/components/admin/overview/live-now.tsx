"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { LiveStat } from "@/lib/admin/types";

const POLL_MS = 30000;

/** "16:42:05" in IST. */
function istClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * "Live right now" strip. Every 30 s it re-renders the overview on the server, so these tiles,
 * the KPIs and the charts all come back fresh from the database; "Updated" is the time the API
 * computed them. Paused while the tab is hidden.
 */
export default function LiveNow({ stats, generatedAt }: { stats: LiveStat[]; generatedAt: string }) {
  const router = useRouter();

  useEffect(() => {
    const poll = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [router]);

  return (
    <>
      <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[16px] font-bold text-ink">Live right now</h2>
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-[#fff1e8] px-2.5 text-[10.5px] font-extrabold tracking-[.06em] text-rose-700 uppercase">
          <span className="az-live-dot inline-block h-1.5 w-1.5 rounded-full bg-rose-700" />
          Live
        </span>
        <span className="text-[11.5px] font-semibold text-mauve" aria-live="off">
          Updated <time dateTime={generatedAt}>{istClock(generatedAt)} IST</time> · refreshes every 30 s
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {stats.map((s) => (
          <div key={s.label} className="az-panel min-w-0 rounded-[14px] border border-line px-[15px] py-[13px]">
            <div className="text-[10px] font-extrabold tracking-[.09em] text-mauve uppercase">
              <span
                className="az-live-dot mr-1.5 inline-block h-[7px] w-[7px] rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </div>
            <b className="mt-[3px] block text-[26px] leading-[1.1] font-bold tabular-nums" style={{ color: s.color }}>
              {s.value}
            </b>
            <span className="text-[11px] font-semibold text-[#57534e]">{s.sub}</span>
          </div>
        ))}
      </div>
    </>
  );
}
