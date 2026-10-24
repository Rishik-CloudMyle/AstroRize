import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import KundliExample from "@/components/tools/kundli-example";
import ToolHubCard from "@/components/tools/tool-hub-card";
import ToolsHubMobile from "@/components/tools/tools-hub-mobile";
import { TOOL_BENEFITS, getTool, getTools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Free tools",
  description: "Free Kundli, horoscope, matchmaking, panchang, numerology, tarot and daily insight. Log in free to see your Kundli.",
};

const PROMISES = ["Free, always", "Real planetary positions", "Kundli kept private to you"];

export default async function FreeToolsPage() {
  const [tools, kundli] = await Promise.all([getTools(), getTool("kundli")]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      {/* Phones and tablets: the app's "All Tools" screen. */}
      <div className="lg:hidden">
        <ToolsHubMobile tools={tools} />
      </div>
      <div className="max-lg:hidden">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Free tools" }]} />
      <h1 className="font-display text-[38px] font-semibold leading-tight text-ink sm:text-[42px]">Free tools</h1>
      <p className="mt-1.5 max-w-[62ch] text-[14.5px] leading-normal text-stone-600">
        All free. Results are calculated by Astrorize&apos;s own astrology engine from real planetary positions (sidereal,
        Lahiri). Your Kundli needs a free account and is saved privately to it; the other tools need no login, and
        horoscope, daily insight, panchang and tarot results have a link you can share.
      </p>
      <ul className="mb-6 mt-4 flex flex-wrap gap-2">
        {PROMISES.map((p) => (
          <li
            key={p}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#ecd49a] bg-paper px-3 text-[12.5px] font-semibold text-amber-900"
          >
            <span aria-hidden="true" className="text-[11px] text-amber-600">
              ✦
            </span>
            {p}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(auto-fit,minmax(230px,1fr))] sm:gap-4">
        {tools.map((t, i) => (
          <ToolHubCard key={t.id} tool={t} benefit={TOOL_BENEFITS[t.id]} priority={i === 0} />
        ))}
      </div>
      </div>

      <div className="max-lg:px-4">{kundli && <KundliExample tool={kundli} />}</div>
    </div>
  );
}
