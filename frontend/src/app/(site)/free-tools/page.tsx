import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import ToolCard from "@/components/tool-card";
import KundliExample from "@/components/tools/kundli-example";
import { getTool, getTools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Free tools",
  description: "Free Kundli, horoscope, matchmaking, panchang, numerology, tarot and daily insight. Log in free to see your Kundli.",
};

export default async function FreeToolsPage() {
  const [tools, kundli] = await Promise.all([getTools(), getTool("kundli")]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Free tools" }]} />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px]">Free tools</h1>
      <p className="mb-6 mt-1.5 max-w-[60ch] text-sm text-stone-600">
        All free. Results are calculated by Astrorize&apos;s own astrology engine from real planetary positions (sidereal,
        Lahiri). Your Kundli needs a free account and is saved privately to it; the other tools need no login, and
        horoscope, daily insight, panchang and tarot results have a link you can share.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-4">
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} large />
        ))}
      </div>

      {kundli && <KundliExample tool={kundli} />}
    </div>
  );
}
