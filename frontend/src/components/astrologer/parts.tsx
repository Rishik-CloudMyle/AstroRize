import Image from "next/image";
import type { Astrologer } from "@/lib/types";
import { AVAILABILITY, RECOGNITION, discountLabel, rupee } from "@/lib/format";

/** Round portrait with the gold ring, optionally with the "sun ray" halo behind it. */
export function Portrait({
  astrologer,
  size,
  rays = false,
  ring = 2,
  statusDot = false,
  priority = false,
}: {
  astrologer: Pick<Astrologer, "photo" | "name" | "availability">;
  size: number;
  rays?: boolean;
  ring?: number;
  statusDot?: boolean;
  priority?: boolean;
}) {
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      {rays && <span className="az-rays absolute rounded-full" style={{ inset: size > 90 ? -6 : -5 }} />}
      <span
        className="relative block size-full overflow-hidden rounded-full border-2 border-gold"
        style={{ boxShadow: `0 0 0 ${ring}px #fff` }}
      >
        <Image
          src={astrologer.photo}
          alt={astrologer.name}
          fill
          sizes={`${size * 2}px`}
          priority={priority}
          className="object-cover"
        />
      </span>
      {statusDot && (
        <span
          className="absolute bottom-1 right-0.5 size-3.5 rounded-full border-2 border-white"
          style={{ background: AVAILABILITY[astrologer.availability].dot }}
        />
      )}
    </span>
  );
}

export function VerifiedTick({ size = 14 }: { size?: number }) {
  return (
    <span
      title="Verified"
      className="grid shrink-0 place-items-center rounded-full bg-[#f0b429] font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size > 16 ? 11 : 9 }}
    >
      ✓
    </span>
  );
}

export function RecognitionBadge({ astrologer, large = false }: { astrologer: Astrologer; large?: boolean }) {
  const r = RECOGNITION[astrologer.recognition];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-bold ${
        large ? "h-[22px] pl-[7px] pr-[9px] text-[10px]" : "h-5 pl-1.5 pr-2 text-[9px]"
      }`}
      style={{ borderColor: r.border, background: r.bg, color: r.fg }}
    >
      ★ {r.label}
    </span>
  );
}

export function AvailabilityBadge({ astrologer, small = false }: { astrologer: Astrologer; small?: boolean }) {
  const a = AVAILABILITY[astrologer.availability];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-bold ${
        small ? "h-5 gap-1 px-[7px] text-[10px]" : "h-[22px] gap-[5px] px-[9px] text-[11px]"
      }`}
      style={{ background: a.bg, color: a.fg }}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {a.label}
    </span>
  );
}

/** "▶ Intro": the astrologer has an intro video on their profile. */
export function IntroBadge({ astrologer, small = false }: { astrologer: Pick<Astrologer, "introVideoUrl">; small?: boolean }) {
  if (!astrologer.introVideoUrl) return null;
  return (
    <span
      title="Has an intro video on their profile"
      className={`inline-flex items-center whitespace-nowrap rounded-full bg-[#fdf2f8] font-bold text-plum ${
        small ? "h-5 gap-1 px-[7px] text-[10px]" : "h-[22px] gap-[5px] px-[9px] text-[11px]"
      }`}
    >
      <span aria-hidden="true" className="text-[0.8em]">▶</span>
      Intro<span className="sr-only"> video</span>
    </span>
  );
}

export function DiscountBadge({ astrologer, className = "" }: { astrologer: Astrologer; className?: string }) {
  const label = discountLabel(astrologer.price, astrologer.was);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-amber-100 font-extrabold text-amber-800 ${className}`}
    >
      {label}
    </span>
  );
}

/** Struck-through original price, shown only when there is a real discount. */
export function WasPrice({ astrologer, className = "" }: { astrologer: Astrologer; className?: string }) {
  if (!discountLabel(astrologer.price, astrologer.was) || !astrologer.was) return null;
  return <span className={`text-[#b0a8b8] line-through tabular-nums ${className}`}>{rupee(astrologer.was)}</span>;
}

export function priceNote(a: Astrologer): string {
  return discountLabel(a.price, a.was) ? "Effective rate · quote valid 120 s" : "Standard rate";
}
