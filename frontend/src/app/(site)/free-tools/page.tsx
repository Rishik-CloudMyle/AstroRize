import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import ToolCard from "@/components/tool-card";
import KundliExample from "@/components/tools/kundli-example";
import { getTools } from "@/lib/mock/tools";

export const metadata: Metadata = {
  title: "Free tools",
  description: "Free Kundli, horoscope, matchmaking, panchang, numerology, tarot and daily insight — no login needed.",
};

export default async function FreeToolsPage() {
  const tools = await getTools();

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Free tools" }]} />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px]">Free tools</h1>
      <p className="mb-6 mt-1.5 max-w-[60ch] text-sm text-stone-600">
        Free, no login needed. Every result has its own link you can share, and an “ask an astrologer” button that
        takes your chart with you.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-4">
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} large />
        ))}
      </div>

      <KundliExample />
    </div>
  );
}
