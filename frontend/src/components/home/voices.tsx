"use client";

import { useEffect, useState } from "react";
import { VOICES } from "@/lib/mock/home";

/** "In their words" quote that rotates every 7 s, with dots to jump to a quote. */
export default function Voices() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  // Bumped when a dot is clicked, so the 7-second timer restarts.
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setVisible(false);
      fadeTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % VOICES.length);
        setVisible(true);
      }, 350);
    }, 7000);
    return () => {
      clearInterval(id);
      clearTimeout(fadeTimer);
    };
  }, [cycle]);

  const voice = VOICES[index];

  return (
    <section aria-label="What customers say" className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-linear-140 from-amber-50 to-amber-100 p-6 sm:p-[30px]">
        <div className="text-[10px] font-bold uppercase tracking-[.14em] text-amber-800">In their words</div>
        <blockquote
          className="mt-3.5 max-w-[52ch] font-display text-[23px] font-semibold leading-[1.3] text-ink transition-opacity duration-350 sm:text-[27px]"
          style={{ opacity: visible ? 1 : 0 }}
        >
          &ldquo;{voice.quote}&rdquo;
        </blockquote>
        <div
          className="mt-3.5 text-[12.5px] font-bold text-stone-500 transition-opacity duration-350"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {voice.who}
        </div>
        <div className="mt-[18px] flex gap-1.5">
          {VOICES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show quote ${i + 1}`}
              aria-current={i === index}
              onClick={() => {
                setIndex(i);
                setVisible(true);
                setCycle((c) => c + 1);
              }}
              className="size-2 rounded-full p-0"
              style={{ background: i === index ? "#b45309" : "#d6c9ae" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
