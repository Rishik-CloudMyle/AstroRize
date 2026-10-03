import Link from "next/link";
import type { Astrologer } from "@/lib/types";
import { languageLine, modeTiles, ratingLabel, rupee, skillLine } from "@/lib/format";
import { AvailabilityBadge, DiscountBadge, Portrait, RecognitionBadge, VerifiedTick, WasPrice, priceNote } from "./parts";

/** Glassy astrologer card from the home page "Featured astrologers" row. */
export default function FeaturedCard({ astrologer: a }: { astrologer: Astrologer }) {
  return (
    <div className="az-lift relative rounded-[20px] border border-[rgba(240,228,208,.9)] bg-[rgba(255,252,248,.84)] px-3.5 pb-3 pt-2.5 font-card shadow-[0_10px_26px_rgba(90,62,40,.09),inset_0_1px_0_rgba(255,255,255,.8)] backdrop-blur-[14px] backdrop-saturate-[1.2]">
      <div className="flex items-center justify-between gap-2">
        <AvailabilityBadge astrologer={a} small />
        <RecognitionBadge astrologer={a} />
      </div>
      <div className="mt-2.5 flex items-start gap-3">
        <Portrait astrologer={a} size={72} rays />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <b className="truncate font-name text-base font-bold tracking-[-.02em] text-plum">{a.name}</b>
            <VerifiedTick />
          </div>
          <div className="mt-0.5 truncate text-xs font-medium text-mauve">{skillLine(a)}</div>
          <div className="mt-[3px] text-[11px] text-mauve">{languageLine(a)}</div>
          <div className="mt-[7px] inline-flex items-center gap-1.5 rounded-full bg-[#f7f2ea] px-2 py-0.5">
            <b className="text-[11px] font-bold text-plum">★ {ratingLabel(a)}</b>
            <span className="h-3 w-px bg-[#e4d9c8]" />
            <span className="text-[11px] font-semibold text-mauve">
              <b className="text-plum">{a.consults.toLocaleString("en-IN")}</b> consults
            </span>
          </div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1">
        {modeTiles(a).map((m) => (
          <div key={m.label} className="flex flex-col items-center gap-px">
            <span className="text-base leading-none text-[#3f4f9a]">{m.icon}</span>
            <b className="text-[10px] font-bold text-[#3f4f9a]">{m.label}</b>
            <span className="text-[10px] font-[650]" style={{ color: m.stateFg }}>
              {m.state}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#f3e9d8] pt-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <WasPrice astrologer={a} className="text-[11px] font-medium" />
            <span className="text-[17px] font-bold tracking-[-.02em] tabular-nums text-plum">{rupee(a.price)}</span>
            <span className="text-[10px] font-semibold text-mauve">/min</span>
            <DiscountBadge astrologer={a} className="h-[18px] px-1.5 text-[9px]" />
          </div>
          <div className="mt-0.5 text-[10px] text-mauve">{priceNote(a)}</div>
        </div>
        <Link
          href={`/astrologer/${a.slug}`}
          className="az-cta az-sheen inline-flex h-[34px] shrink-0 items-center gap-1 rounded-full px-3.5 text-[12.5px] font-bold hover:-translate-y-0.5 hover:text-cta-ink hover:no-underline hover:shadow-[0_10px_20px_rgba(255,140,26,.38)]"
        >
          Consult ›
        </Link>
      </div>
    </div>
  );
}
