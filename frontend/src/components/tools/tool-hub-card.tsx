import Image from "next/image";
import Link from "next/link";
import type { Tool } from "@/lib/types";
import { ToolMedallion } from "./tool-icons";

// A tool card on /free-tools. Phones: a compact row (art thumbnail, name, one-line benefit) so the
// seven tools fit in a short scroll. Wider screens: the prototype's tall illustrated card, with the
// tool's gold medallion and the benefit line added in the scrim.

/** `priority`: the first card on the page — its picture is the largest thing on screen, so load it first. */
export default function ToolHubCard({ tool, benefit, priority = false }: { tool: Tool; benefit?: string; priority?: boolean }) {
  return (
    <Link
      href={`/free-tools/${tool.id}`}
      className="az-lift group relative flex min-w-0 items-center gap-3.5 overflow-hidden rounded-[22px] border border-line-warm bg-paper p-2.5 pr-4 text-left shadow-[0_6px_16px_rgba(62,38,18,.06)] hover:no-underline sm:block sm:h-[272px] sm:border-0 sm:p-0 sm:shadow-[0_10px_22px_rgba(62,38,18,.08)]"
      style={{ "--tool-bg": tool.bg, "--tool-ink": tool.ink, "--tool-scrim": tool.scrim } as React.CSSProperties}
    >
      <span className="relative block size-[92px] shrink-0 overflow-hidden rounded-2xl bg-(--tool-bg) sm:absolute sm:inset-0 sm:size-auto sm:rounded-none">
        <Image src={tool.art} alt="" fill priority={priority} sizes="(max-width: 640px) 92px, 300px" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      </span>
      <span className="pointer-events-none absolute inset-0 hidden rounded-[22px] shadow-[inset_0_0_0_1px_rgba(240,228,208,.55)] sm:block" />
      <span className="absolute left-3.5 top-3.5 hidden sm:block">
        <ToolMedallion id={tool.id} size="sm" />
      </span>
      <span className="block min-w-0 flex-1 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-[linear-gradient(to_top,var(--tool-scrim)_58%,transparent)] sm:pb-4 sm:pl-[18px] sm:pr-14 sm:pt-12">
        <span className="flex items-center gap-2">
          <span className="sm:hidden">
            <ToolMedallion id={tool.id} size="sm" />
          </span>
          <b className="block text-[17px] font-bold tracking-[-.015em] text-ink sm:text-[19px] sm:text-(--tool-ink)">{tool.name}</b>
        </span>
        <span className="mt-0.5 block text-[12px] font-semibold uppercase tracking-[.06em] text-amber-800 sm:mt-[3px] sm:text-[12.5px] sm:normal-case sm:tracking-normal sm:text-(--tool-ink)">
          {tool.sub}
        </span>
        {benefit && (
          <span className="mt-1 block text-[13px] leading-snug text-stone-600 sm:text-[12.5px] sm:text-(--tool-ink) sm:opacity-90">
            {benefit}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#c4a06a] text-sm font-extrabold text-white sm:absolute sm:bottom-4 sm:right-3"
      >
        ›
      </span>
    </Link>
  );
}
