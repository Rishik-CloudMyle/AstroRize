// Engraved gold line icons for the free tools, and the twelve rashi glyphs (the same strokes as
// the home page's zodiac wheel, components/home/hero-sky.tsx), for tool cards, headings and charts.

/** The twelve rashi glyphs as strokes in a 20 × 20 box centred on 0,0; index 0 = Aries … 11 = Pisces. */
export const RASHI_GLYPHS = [
  "M0 8V-1C0-7-2.5-9-5-9S-9-6.5-8.5-4-6-1-5-1M0-1C0-7 2.5-9 5-9S9-6.5 8.5-4 6-1 5-1",
  "M-8-9C-7-4-4-2.5 0-2.5S7-4 8-9M5.2 3.5A5.2 5.2 0 1 1-5.2 3.5 5.2 5.2 0 1 1 5.2 3.5",
  "M-8-8C-3-6 3-6 8-8M-8 8C-3 6 3 6 8 8M-3.2-6.4V6.4M3.2-6.4V6.4",
  "M9-2.5C6-8.5-3-9.5-8.5-4.5M-9 2.5C-6 8.5 3 9.5 8.5 4.5M-2-3A3 3 0 1 1-8-3 3 3 0 1 1-2-3M8 3A3 3 0 1 1 2 3 3 3 0 1 1 8 3",
  "M-1.5 4C-1.5-1-4-3-4-6-4-9.5 4.5-9.5 4.5-5 4.5-1 1.5 2 1.5 6 1.5 9 5.5 9.5 7 7M-1.5 4A3 3 0 1 1-7.5 4 3 3 0 1 1-1.5 4",
  "M-9-7C-8-7-7.5-6-7.5-4.5V7M-7.5-4C-7.5-8.5-2.5-8.5-2.5-4V7M-2.5-4C-2.5-8.5 2.5-8.5 2.5-4V5.5C2.5 8 4 9.5 6 9.5M2.5 1.5C5-1.5 9-1 8.5 2.5 8 6 4 8.5 0 9.5",
  "M-9 7.5H9M-9 3H-3.5C-6.5 0-6-6.5 0-6.5S6.5 0 3.5 3H9",
  "M-9-7C-8-7-7.5-6-7.5-4.5V7M-7.5-4C-7.5-8.5-2.5-8.5-2.5-4V7M-2.5-4C-2.5-8.5 2.5-8.5 2.5-4V5C2.5 7.5 4 8.5 6 8.5H9M6.5 6 9 8.5 6.5 11",
  "M-8 8 8-8M1.5-8H8V-1.5M-6.5-1.5 1.5 6.5",
  "M-9-7H-6.5L-3 6 1-5C2-8.5 6-8.5 6-5V4C6 7.5 9.5 8.5 9.5 5 9.5 2 6.5 1.5 4.5 4S-1 9.5-3.5 8.5",
  "M-9-1-5.5-5-2-1 1.5-5 5-1 8.5-5M-9 6-5.5 2-2 6 1.5 2 5 6 8.5 2",
  "M-7-9C-2-4.5-2 4.5-7 9M7-9C2-4.5 2 4.5 7 9M-4.5 0H4.5",
] as const;

/** One rashi glyph as an inline SVG (inherits the text colour). */
export function RashiGlyph({ sign, className = "size-5", strokeWidth = 1.6 }: { sign: number; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true" fill="none">
      <path d={RASHI_GLYPHS[sign % 12]} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Line drawings in a 24 × 24 box, one per tool id. */
const TOOL_PATHS: Record<string, React.ReactNode> = {
  kundli: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <path d="M3.5 3.5 20.5 20.5M20.5 3.5 3.5 20.5M12 3.5 20.5 12 12 20.5 3.5 12Z" />
    </>
  ),
  horoscope: (
    <>
      <path d="M15.5 4.2A8.2 8.2 0 1 0 19.8 15 6.6 6.6 0 0 1 15.5 4.2Z" />
      <path d="M18 3.5v3M16.5 5h3" />
    </>
  ),
  matchmaking: (
    <>
      <circle cx="9" cy="12" r="5.6" />
      <circle cx="15" cy="12" r="5.6" />
    </>
  ),
  panchang: (
    <>
      <path d="M3 17.5h18M6.5 17.5a5.5 5.5 0 0 1 11 0" />
      <path d="M12 5.5v2.2M5.2 9.2l1.5 1.4M18.8 9.2l-1.5 1.4M6 20.5h12" />
    </>
  ),
  numerology: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 8h6l-4 8.5" />
    </>
  ),
  tarot: (
    <>
      <rect x="4" y="5.5" width="10" height="15" rx="1.5" transform="rotate(-8 9 13)" />
      <rect x="10" y="3.5" width="10" height="15" rx="1.5" />
      <path d="m15 8.2.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9Z" />
    </>
  ),
  daily: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
};

export function ToolGlyph({ id, className = "size-5" }: { id: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TOOL_PATHS[id] ?? TOOL_PATHS.daily}
    </svg>
  );
}

/** The tool's glyph in a small engraved gold medallion. */
export function ToolMedallion({ id, size = "md" }: { id: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-7" : "size-10";
  const icon = size === "sm" ? "size-4" : "size-[22px]";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full border border-[#d6a84a] bg-[radial-gradient(circle_at_35%_30%,#fffaf0_0%,#f8e7bd_70%,#eccf8a_100%)] text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_2px_6px_rgba(146,64,14,.15)] ${box}`}
    >
      <ToolGlyph id={id} className={icon} />
    </span>
  );
}
