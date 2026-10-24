import Link from "next/link";
import type { GrahaKey, Stamp } from "@/lib/astro";

// Small pieces shared by the Kundli result tabs.

export const GRAHA_EN: Record<GrahaKey, string> = {
  sun: "Sun",
  moon: "Moon",
  mars: "Mars",
  mercury: "Mercury",
  jupiter: "Jupiter",
  venus: "Venus",
  saturn: "Saturn",
  rahu: "Rahu",
  ketu: "Ketu",
};

export const GRAHA_ORDER: GrahaKey[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];

/** 16.4502 → "16°27′00″" (truncated, like almanacs). */
export function fmtDms(deg: number): string {
  let total = Math.floor(deg * 3600 + 1e-6);
  const d = Math.floor(total / 3600);
  total -= d * 3600;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}

/** 16.4502 → "16°27′". */
export function fmtDm(deg: number): string {
  const total = Math.floor(deg * 60 + 1e-6);
  return `${Math.floor(total / 60)}°${String(total % 60).padStart(2, "0")}′`;
}

/** 28.6328, 77.2198 → "28°37′58″ N, 77°13′11″ E". */
export function coordsDms(lat: number, lon: number): string {
  return `${fmtDms(Math.abs(lat))} ${lat >= 0 ? "N" : "S"}, ${fmtDms(Math.abs(lon))} ${lon >= 0 ? "E" : "W"}`;
}

/** A Stamp's local clock time with seconds ("7:13:52 am"), in the place's time zone. */
export function stampSeconds(s: Stamp, timeZone: string): string {
  return new Date(s.iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone });
}

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** The muted "what is this / how to read it" line under a heading. */
export function Help({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`max-w-[72ch] text-[13px] leading-normal text-stone-600 ${className}`}>{children}</p>;
}

export function RetroBadge() {
  return (
    <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-rose-50 px-1.5 align-[1px] text-[10.5px] font-bold text-rose-700" title="Retrograde">
      R<span className="sr-only">etrograde</span>
    </span>
  );
}

export function ChartFigure({ title, caption, children }: { title: string; caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="m-0 min-w-0">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <b className="min-w-0 truncate text-[14px] font-bold text-ink">{title}</b>
          <span className="shrink-0 text-[12px] text-stone-500">{caption}</span>
        </div>
        <div className="aspect-square w-full drop-shadow-[0_8px_18px_rgba(120,72,10,.14)]">{children}</div>
      </div>
    </figure>
  );
}

/** A label / value list (birth details, panchang, avakhada), with an optional help line per row. */
export function FactList({ rows }: { rows: { term: string; value: React.ReactNode; help?: string }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-6 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.term} className="flex min-w-0 flex-col gap-0.5 border-b border-line-soft py-2.5">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[12.5px] font-semibold text-stone-500">{r.term}</dt>
            <dd className="m-0 min-w-0 break-words text-right text-[14px] font-semibold text-ink">{r.value}</dd>
          </div>
          {r.help && <p className="text-[12px] leading-snug text-stone-500">{r.help}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Where a reader might expect remedies: the client's decision is to send them to an astrologer. */
export function AskAstrologer({ children = "Talk to an astrologer about this" }: { children?: React.ReactNode }) {
  return (
    <Link href="/astrologers" className="inline-flex items-center gap-1 text-[13px] font-bold text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-900">
      {children} →
    </Link>
  );
}

/** A soft card used for sub-sections inside a tab. */
export function Block({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line-warm bg-white px-4 py-4 sm:px-5 ${className}`}>{children}</div>;
}
