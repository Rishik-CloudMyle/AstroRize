import Image from "next/image";
import Link from "next/link";
import type { Tool } from "@/lib/types";

/** Illustrated free-tool tile. `large` is the bigger version used on /free-tools. */
export default function ToolCard({ tool, large = false }: { tool: Tool; large?: boolean }) {
  const radius = large ? "rounded-[22px]" : "rounded-2xl";
  return (
    <Link
      href={`/free-tools/${tool.id}`}
      className={`az-lift az-sheen relative block overflow-hidden text-left hover:no-underline ${radius} ${
        large ? "h-[250px] shadow-[0_10px_22px_rgba(62,38,18,.08)]" : "h-[150px] shadow-[0_6px_14px_rgba(62,38,18,.07)]"
      }`}
      style={{ background: tool.bg }}
    >
      <Image
        src={tool.art}
        alt=""
        fill
        sizes={large ? "(max-width: 640px) 100vw, 300px" : "(max-width: 640px) 50vw, 180px"}
        className="object-cover"
      />
      <span className={`absolute inset-0 shadow-[inset_0_0_0_1px_rgba(240,228,208,.55)] ${radius}`} />
      <span
        className={`absolute inset-x-0 bottom-0 block ${large ? "pb-4 pl-[18px] pr-14 pt-11" : "pb-[11px] pl-3 pr-9 pt-[26px]"}`}
        style={{ background: `linear-gradient(to top, ${tool.scrim} ${large ? 48 : 46}%, transparent)` }}
      >
        <b
          className={`block font-bold ${large ? "text-[19px] tracking-[-.015em]" : "text-sm tracking-[-.02em]"}`}
          style={{ color: tool.ink }}
        >
          {tool.name}
        </b>
        <span className={`block ${large ? "mt-[3px] text-[13px]" : "mt-px text-[11.5px]"}`} style={{ color: tool.ink }}>
          {tool.sub}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`absolute grid place-items-center rounded-full font-extrabold text-white ${
          large ? "bottom-4 right-3 size-[30px] bg-[#c4a06a] text-sm" : "bottom-[11px] right-2.5 size-[22px] bg-[#c9a227] text-[11px]"
        }`}
      >
        ›
      </span>
    </Link>
  );
}
