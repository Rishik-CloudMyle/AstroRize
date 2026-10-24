"use client";

import { useRef } from "react";

// Small pieces shared by the Ashtakavarga, KP and Shadbala views (ashtakvarga-view.tsx, kp-view.tsx,
// shadbala-view.tsx): the intro line, a chart figure, a chip picker and a table that scrolls in its own
// box on phones.

export const SIGN_SHORT = ["Ar", "Ta", "Ge", "Cn", "Le", "Vi", "Li", "Sc", "Sg", "Cp", "Aq", "Pi"] as const;

export const NAKSHATRA_NAMES = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

/** "16°33′01″" — degrees, minutes and seconds within the sign of a sidereal longitude. */
export function dmsInSign(longitude: number): string {
  const lon = ((longitude % 360) + 360) % 360;
  let sec = Math.floor((lon % 30) * 3600 + 1e-6);
  const d = Math.floor(sec / 3600);
  sec -= d * 3600;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}

/** The one- or two-sentence plain-English intro at the top of a view. */
export function Intro({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[70ch] text-[14px] leading-relaxed text-stone-600">{children}</p>;
}

export function Figure({ title, caption, children }: { title: string; caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="m-0 min-w-0">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <b className="text-[14px] font-bold text-ink">{title}</b>
          <span className="truncate text-[12px] text-stone-500">{caption}</span>
        </div>
        <div className="aspect-square w-full drop-shadow-[0_8px_18px_rgba(120,72,10,.14)]">{children}</div>
      </div>
    </figure>
  );
}

/** A row of chips acting as a radio group (arrow keys move the choice), scrolling sideways on phones. */
export function ChipPicker<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: K; code: string; name: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  function choose(i: number, focus: boolean) {
    const n = (i + options.length) % options.length;
    onChange(options[n]!.key);
    const el = chips.current[n];
    if (focus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function onKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      choose(moves[e.key]!, true);
    }
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey} className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] lg:flex-wrap lg:overflow-visible">
      {options.map((o, i) => {
        const on = i === index;
        return (
          <button
            key={o.key}
            ref={(el) => {
              chips.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => choose(i, false)}
            className={`flex shrink-0 snap-start flex-col items-start rounded-xl border px-3 py-1.5 text-left leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
              on ? "border-amber-500 bg-linear-to-b from-[#fff3cf] to-[#fbdf9a] text-ink shadow-[0_4px_10px_rgba(180,83,9,.16)]" : "border-line-warm bg-white text-stone-700 hover:border-amber-300"
            }`}
          >
            <b className="text-[13px]">{o.code}</b>
            <span className="text-[11.5px] text-stone-600">{o.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A table that scrolls sideways inside its own rounded box, so the page itself never does. */
export function ScrollTable({ label, children, minWidth = 560 }: { label: string; children: React.ReactNode; minWidth?: number }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto rounded-2xl border border-line-warm bg-white focus-visible:outline-2 focus-visible:outline-amber-600 [scrollbar-width:thin]">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export const th = "border-b border-line-warm bg-[#faf3e3] px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[.06em] text-amber-900 whitespace-nowrap";
/** A body cell without a text colour: add exactly one (two text colours on one element fight). */
export const tdBare = "border-b border-line-soft px-2.5 py-2 whitespace-nowrap";
export const td = `${tdBare} text-stone-600`;
