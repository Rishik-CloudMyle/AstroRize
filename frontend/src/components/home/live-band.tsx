"use client";

import { useEffect, useState } from "react";
import { LIVE_FEED, LIVE_STATS } from "@/lib/mock/home";

/**
 * Dark "Live now" band on the home page. The numbers drift every 5 s and the
 * "Just now" line rotates every 4 s, like the prototype. (Mock activity: the
 * real numbers will come from the backend.)
 */
export default function LiveBand() {
  const [values, setValues] = useState(LIVE_STATS.map((s) => s.value));
  const [feedIndex, setFeedIndex] = useState(0);
  const [feedVisible, setFeedVisible] = useState(true);

  useEffect(() => {
    const nums = setInterval(() => {
      setValues(LIVE_STATS.map((s) => Math.max(0, s.value + Math.round((Math.random() - 0.5) * 2 * s.drift))));
    }, 5000);
    let fadeTimer: ReturnType<typeof setTimeout>;
    const feed = setInterval(() => {
      setFeedVisible(false);
      fadeTimer = setTimeout(() => {
        setFeedIndex((i) => (i + 1) % LIVE_FEED.length);
        setFeedVisible(true);
      }, 300);
    }, 4000);
    return () => {
      clearInterval(nums);
      clearInterval(feed);
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <section aria-label="Live activity" className="bg-linear-180 from-ink to-[#231d16] text-[#f8f4ec]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-[26px] gap-y-4 px-4 py-[22px] sm:px-6">
        <span className="inline-flex h-[26px] items-center gap-[7px] rounded-full bg-urgent/15 px-3 text-[10.5px] font-extrabold uppercase tracking-[.09em] text-orange-400">
          <span className="az-live-dot inline-block size-1.5 rounded-full bg-urgent" />
          Live now
        </span>
        <div className="grid w-full min-w-0 grid-cols-2 gap-x-[30px] gap-y-3 sm:flex sm:w-auto sm:flex-1 sm:flex-wrap">
          {LIVE_STATS.map((s, i) => (
            <div key={s.key}>
              <b className="block text-2xl font-bold leading-[1.1] tabular-nums">
                {values[i].toLocaleString("en-IN")}
                {s.suffix}
              </b>
              <span className="text-[11.5px] font-semibold text-muted">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="min-w-[230px] max-w-[340px] flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-[.1em] text-stone-500">Just now</div>
          <div
            aria-live="polite"
            className="mt-[3px] min-h-[38px] text-[12.5px] leading-normal text-line transition-opacity duration-300"
            style={{ opacity: feedVisible ? 1 : 0 }}
          >
            {LIVE_FEED[feedIndex]}
          </div>
        </div>
      </div>
    </section>
  );
}
