"use client";

// Ashtakavarga view for a Kundli result tab.
//
//   <AshtakavargaView k={chart.kundli} style={chartStyle} />
//
// Props
//   k      the Kundli (needs k.ashtakavarga, k.lagna) — from GET/POST /api/astro/kundli
//   style  "north" | "south" — the same chart style the rest of the Kundli uses
//
// Shows the Sarvashtakavarga (or one planet's Bhinnashtakavarga, picked with the chips) as bindu
// numbers drawn in the North/South chart, and the 8 × 12 table of every planet by house.

import { useState } from "react";
import { GRAHA_LABEL, RASHIS, type Kundli, type SevenGraha } from "@/lib/astro";
import KundliChart, { type ChartPlacement } from "../kundli-chart";
import { SectionTitle } from "../tool-ui";
import { ChipPicker, Figure, Intro, ScrollTable, SIGN_SHORT, tdBare, th } from "./advanced-ui";

type Pick = "sav" | SevenGraha;

const OPTIONS: { key: Pick; code: string; name: string }[] = [
  { key: "sav", code: "SAV", name: "All (Sarva)" },
  { key: "sun", code: "Su", name: "Sun" },
  { key: "moon", code: "Mo", name: "Moon" },
  { key: "mars", code: "Ma", name: "Mars" },
  { key: "mercury", code: "Me", name: "Mercury" },
  { key: "jupiter", code: "Ju", name: "Jupiter" },
  { key: "venus", code: "Ve", name: "Venus" },
  { key: "saturn", code: "Sa", name: "Saturn" },
];

export default function AshtakavargaView({ k, style }: { k: Kundli; style: "north" | "south" }) {
  const [pick, setPick] = useState<Pick>("sav");
  const a = k.ashtakavarga;
  if (!a) return <p className="text-[14px] text-stone-600">Ashtakavarga isn&apos;t available for this chart.</p>;

  const bav = pick === "sav" ? null : a.bav.find((b) => b.planet === pick)!;
  const bySign = bav ? bav.bySign : a.sav.bySign;
  const total = bav ? bav.total : a.sav.total;
  const placements: ChartPlacement[] = bySign.map((n, sign) => ({ sign, abbr: String(n) }));
  const title = bav ? `${GRAHA_LABEL[bav.planet]} · Bhinnashtakavarga` : "Sarvashtakavarga";

  // Strongest and weakest houses of what is shown.
  const byHouse = bav ? bav.byHouse : a.sav.byHouse;
  const max = Math.max(...byHouse);
  const min = Math.min(...byHouse);
  const strong = byHouse.flatMap((n, i) => (n === max ? [i + 1] : []));
  const weak = byHouse.flatMap((n, i) => (n === min ? [i + 1] : []));
  const average = bav ? 4 : 28;

  return (
    <div className="min-w-0">
      <Intro>
        Ashtakavarga scores every sign by the support it gets from the seven planets and the ascendant. Each planet&apos;s own
        chart gives a sign 0 to 8 points; added together they make the Sarvashtakavarga, where about 28 points is average and a
        higher score means that house&apos;s matters tend to go more smoothly.
      </Intro>

      <div className="mt-5">
        <ChipPicker label="Choose an Ashtakavarga" options={OPTIONS} value={pick} onChange={setPick} />
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-2 md:gap-7">
        <Figure title={title} caption={<>Total {total} · Lagna {RASHIS[a.lagnaSign]!.en}</>}>
          <KundliChart style={style} lagnaSign={a.lagnaSign} placements={placements} title={bav ? GRAHA_LABEL[bav.planet] : "SAV"} />
        </Figure>
        <div className="min-w-0 text-[14px] leading-relaxed text-stone-600">
          <p>
            <b className="text-ink">{title}</b> — the number in each house is its points{bav ? " in this planet's chart (0–8)" : " from all seven planets"}.
            {" "}An average house has about {average}.
          </p>
          <dl className="mt-3 grid gap-1.5">
            <div className="flex flex-wrap gap-x-2 rounded-xl border border-line-warm bg-white px-3 py-2">
              <dt className="text-stone-500">Strongest</dt>
              <dd className="m-0 font-semibold text-ink">
                {strong.map((h) => `House ${h}`).join(", ")} · {max}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2 rounded-xl border border-line-warm bg-white px-3 py-2">
              <dt className="text-stone-500">Weakest</dt>
              <dd className="m-0 font-semibold text-ink">
                {weak.map((h) => `House ${h}`).join(", ")} · {min}
              </dd>
            </div>
          </dl>
          {bav && (
            <p className="mt-3 text-[13px] text-stone-500">
              Transits of {GRAHA_LABEL[bav.planet]} through signs with 4 or more points are traditionally favourable.
            </p>
          )}
        </div>
      </div>

      <section className="mt-8" aria-labelledby="av-table-heading">
        <SectionTitle>
          <span id="av-table-heading">Points by house</span>
        </SectionTitle>
        <ScrollTable label="Ashtakavarga points by house" minWidth={620}>
          <thead>
            <tr>
              <th scope="col" className={`${th} sticky left-0 z-10`}>
                House
              </th>
              {a.sav.byHouse.map((_, i) => (
                <th key={i} scope="col" className={`${th} text-center`}>
                  {i + 1}
                  <span className="block text-[10px] font-semibold normal-case tracking-normal text-amber-800/80">{SIGN_SHORT[(a.lagnaSign + i) % 12]}</span>
                </th>
              ))}
              <th scope="col" className={`${th} text-right`}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {a.bav.map((b) => {
              const on = pick === b.planet;
              return (
                <tr key={b.planet} className={on ? "bg-amber-50" : undefined}>
                  <th scope="row" className={`${tdBare} sticky left-0 z-10 text-left font-semibold text-ink ${on ? "bg-amber-50" : "bg-white"}`}>
                    {GRAHA_LABEL[b.planet]}
                  </th>
                  {b.byHouse.map((n, i) => (
                    <td key={i} className={`${tdBare} text-center tabular-nums ${n >= 5 ? "font-bold text-emerald-800" : n <= 2 ? "text-rose-700" : "text-stone-600"}`}>
                      {n}
                    </td>
                  ))}
                  <td className={`${tdBare} text-right font-semibold tabular-nums text-ink`}>{b.total}</td>
                </tr>
              );
            })}
            <tr className={pick === "sav" ? "bg-amber-50" : "bg-[#fdf8ec]"}>
              <th scope="row" className={`${tdBare} sticky left-0 z-10 text-left font-bold text-ink ${pick === "sav" ? "bg-amber-50" : "bg-[#fdf8ec]"}`}>
                Total (SAV)
              </th>
              {a.sav.byHouse.map((n, i) => (
                <td key={i} className={`${tdBare} text-center font-bold tabular-nums ${n >= 28 ? "text-emerald-800" : "text-rose-700"}`}>
                  {n}
                </td>
              ))}
              <td className={`${tdBare} text-right font-bold tabular-nums text-ink`}>{a.sav.total}</td>
            </tr>
          </tbody>
        </ScrollTable>
        <p className="mt-2 text-[12.5px] text-stone-500">
          Green: 5 or more points for a planet, 28 or more in the total. Red: 2 or fewer for a planet, under 28 in the total.
        </p>
      </section>
    </div>
  );
}
