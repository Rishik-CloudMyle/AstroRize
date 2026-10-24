import type { SavedChart } from "@/lib/astro";
import { SectionTitle } from "../tool-ui";
import { SECTION_HELP } from "./explain";
import { AskAstrologer, Block, Help } from "./shared";

/** Reading tab: ascendant summary and short notes for each planet by sign and by house. */
export default function ReadingView({ chart }: { chart: SavedChart }) {
  const r = chart.reading;
  return (
    <div className="grid gap-6">
      <section aria-labelledby="k-asc">
        <SectionTitle>
          <span id="k-asc">Your ascendant: {r.ascendant.sign}</span>
        </SectionTitle>
        <Block className="bg-linear-to-b from-[#fffaf0] to-white">
          <p className="text-[14.5px] leading-relaxed text-stone-800">{r.ascendant.text}</p>
        </Block>
      </section>

      <section aria-labelledby="k-placements">
        <SectionTitle>
          <span id="k-placements">Planet placements</span>
        </SectionTitle>
        <Help className="-mt-1 mb-3">{SECTION_HELP.reading}</Help>
        <ul className="grid gap-3 lg:grid-cols-2">
          {r.planets.map((p) => (
            <li key={p.key} className="rounded-2xl border border-line-warm bg-white px-4 py-3.5">
              <h4 className="text-[14.5px] font-bold text-ink">{p.signTitle}</h4>
              <p className="mt-1 text-[13.5px] leading-normal text-stone-700">{p.bySign}</p>
              <h4 className="mt-3 text-[14.5px] font-bold text-ink">{p.houseTitle}</h4>
              <p className="mt-1 text-[13.5px] leading-normal text-stone-700">{p.byHouse}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-stone-600">{r.astrologerNote.replace(/ — talk to an astrologer about this\.$/, ".")}</p>
        <div className="mt-1">
          <AskAstrologer />
        </div>
      </section>
    </div>
  );
}
