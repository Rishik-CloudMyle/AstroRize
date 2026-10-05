"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { LiveStat } from "@/lib/admin/types";

const POLL_MS = 30000;

/**
 * "Live right now" strip: re-reads the counters from the overview API every 30 s and says how
 * fresh they are. (The API has no dedicated live feed yet; a lighter endpoint can replace this.)
 */
export default function LiveNow({ initial }: { initial: LiveStat[] }) {
  const [stats, setStats] = useState(initial);
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const { overview } = await api.get<{ overview: { metrics: { live: LiveStat[] } } }>("/admin/overview");
        setStats(overview.metrics.live);
        setAgo(0);
      } catch {
        // Keep the last counters; the "updated Xs ago" label shows they are getting stale.
      }
    }, POLL_MS);
    const tick = setInterval(() => setAgo((s) => s + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  return (
    <>
      <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[16px] font-bold text-ink">Live right now</h2>
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-[#fff1e8] px-2.5 text-[10.5px] font-extrabold tracking-[.06em] text-rose-700 uppercase">
          <span className="az-live-dot inline-block h-1.5 w-1.5 rounded-full bg-rose-700" />
          Live
        </span>
        <span className="text-[11.5px] font-semibold text-mauve" aria-live="off">
          {ago === 0 ? "updated just now" : `updated ${ago}s ago`}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-3">
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
