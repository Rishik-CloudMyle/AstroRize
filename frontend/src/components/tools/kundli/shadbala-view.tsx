"use client";

// Shadbala view for a Kundli result tab.
//
//   <ShadbalaView k={chart.kundli} />
//
// Props
//   k  the Kundli (needs k.shadbala) — from GET/POST /api/astro/kundli
//
// Shows each planet's total strength in rupas against its required minimum as a bar (to scale), and
// the table of the six balas (with the Sthana and Kala parts on request), in virupas.

import { GRAHA_LABEL, type Kundli, type ShadbalaRow } from "@/lib/astro";
import { SectionTitle } from "../tool-ui";
import { Intro, ScrollTable, td, tdBare, th } from "./advanced-ui";

const v = (n: number) => n.toFixed(1);

const MAIN_ROWS: { label: string; hint: string; get: (r: ShadbalaRow) => number }[] = [
  { label: "Sthana", hint: "position", get: (r) => r.sthana.total },
  { label: "Dig", hint: "direction", get: (r) => r.dig },
  { label: "Kala", hint: "time", get: (r) => r.kala.total },
  { label: "Cheshta", hint: "motion", get: (r) => r.cheshta },
  { label: "Naisargika", hint: "natural", get: (r) => r.naisargika },
  { label: "Drik", hint: "aspects", get: (r) => r.drik },
];

const STHANA_ROWS: { label: string; get: (r: ShadbalaRow) => number }[] = [
  { label: "Uchcha (exaltation)", get: (r) => r.sthana.uchcha },
  { label: "Saptavargaja (7 vargas)", get: (r) => r.sthana.saptavargaja },
  { label: "Ojhayugma (odd/even)", get: (r) => r.sthana.ojhayugma },
  { label: "Kendradi (house type)", get: (r) => r.sthana.kendra },
  { label: "Drekkana (decanate)", get: (r) => r.sthana.drekkana },
];

const KALA_ROWS: { label: string; get: (r: ShadbalaRow) => number }[] = [
  { label: "Nathonnatha (day/night)", get: (r) => r.kala.nathonnatha },
  { label: "Paksha (lunar phase)", get: (r) => r.kala.paksha },
  { label: "Tribhaga (third of day)", get: (r) => r.kala.tribhaga },
  { label: "Abda (year lord)", get: (r) => r.kala.abda },
  { label: "Masa (month lord)", get: (r) => r.kala.masa },
  { label: "Vara (weekday lord)", get: (r) => r.kala.vara },
  { label: "Hora (hour lord)", get: (r) => r.kala.hora },
  { label: "Ayana (declination)", get: (r) => r.kala.ayana },
  { label: "Yuddha (planetary war)", get: (r) => r.kala.yuddha },
];

export default function ShadbalaView({ k }: { k: Kundli }) {
  const s = k.shadbala;
  if (!s) return <p className="text-[14px] text-stone-600">Shadbala isn&apos;t available for this chart.</p>;
  const planets = s.planets;
  const scale = Math.max(...planets.map((p) => Math.max(p.rupas, p.required))) * 1.08;
  const pct = (x: number) => `${Math.max(0, (x / scale) * 100)}%`;

  return (
    <div className="min-w-0">
      <Intro>
        Shadbala measures each planet&apos;s strength from six sources: its position, direction, the time of birth, its motion,
        its natural power and the aspects it receives. A planet that reaches its required minimum can give its results fully;
        the bars show how far above or below that line each planet stands.
      </Intro>

      <section className="mt-6" aria-labelledby="sb-bars-heading">
        <SectionTitle>
          <span id="sb-bars-heading">Strength against the minimum</span>
        </SectionTitle>
        <ul className="grid gap-3">
          {planets.map((p) => {
            const ok = p.ratio >= 1;
            return (
              <li key={p.planet} className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13.5px]">
                  <b className="text-ink">
                    {GRAHA_LABEL[p.planet]} <span className="text-[12px] font-semibold text-stone-500">· rank {p.rank}</span>
                  </b>
                  <span className="tabular-nums text-stone-600">
                    <b className={ok ? "text-emerald-800" : "text-rose-700"}>{p.rupas.toFixed(2)}</b> of {p.required} rupas ·{" "}
                    {(p.ratio * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="relative mt-1 h-3 rounded-full bg-[#f3ead8]"
                  role="img"
                  aria-label={`${GRAHA_LABEL[p.planet]}: ${p.rupas.toFixed(2)} rupas, needs ${p.required}`}
                >
                  <div className={`h-full rounded-full ${ok ? "bg-linear-to-r from-amber-400 to-amber-600" : "bg-linear-to-r from-rose-300 to-rose-500"}`} style={{ width: pct(p.rupas) }} />
                  <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink/70" style={{ left: pct(p.required) }} title={`Required ${p.required} rupas`} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-stone-500">
          <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded bg-ink/70" /> the planet&apos;s required minimum. 1 rupa = 60 virupas.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="sb-table-heading">
        <SectionTitle>
          <span id="sb-table-heading">The six strengths</span>
        </SectionTitle>
        <ScrollTable label="Shadbala in virupas" minWidth={660}>
          <thead>
            <tr>
              <th scope="col" className={`${th} sticky left-0 z-10`}>Virupas</th>
              {planets.map((p) => (
                <th key={p.planet} scope="col" className={`${th} text-right`}>
                  {GRAHA_LABEL[p.planet]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MAIN_ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-white text-left font-semibold text-ink`}>
                  {row.label} <span className="font-normal text-stone-500">· {row.hint}</span>
                </th>
                {planets.map((p) => (
                  <td key={p.planet} className={`${td} text-right tabular-nums`}>{v(row.get(p))}</td>
                ))}
              </tr>
            ))}
            <tr className="bg-[#fdf8ec]">
              <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-[#fdf8ec] text-left font-bold text-ink`}>Total</th>
              {planets.map((p) => (
                <td key={p.planet} className={`${tdBare} text-right font-bold tabular-nums text-ink`}>{v(p.total)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-white text-left font-semibold text-ink`}>Rupas</th>
              {planets.map((p) => (
                <td key={p.planet} className={`${tdBare} text-right font-semibold tabular-nums ${p.ratio >= 1 ? "text-emerald-800" : "text-rose-700"}`}>
                  {p.rupas.toFixed(2)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-white text-left font-semibold text-ink`}>Required</th>
              {planets.map((p) => (
                <td key={p.planet} className={`${td} text-right tabular-nums`}>{p.required.toFixed(2)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-white text-left font-semibold text-ink`}>Ratio</th>
              {planets.map((p) => (
                <td key={p.planet} className={`${td} text-right tabular-nums`}>{p.ratio.toFixed(2)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-white text-left font-semibold text-ink`}>Rank</th>
              {planets.map((p) => (
                <td key={p.planet} className={`${tdBare} text-right font-semibold tabular-nums text-ink`}>{p.rank}</td>
              ))}
            </tr>
          </tbody>
        </ScrollTable>

        <details className="group mt-4">
          <summary className="cursor-pointer list-none text-[14px] font-semibold text-amber-900 hover:text-amber-700 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
            Sthana and Kala bala in detail
          </summary>
          <div className="mt-3 grid gap-4">
            <BreakdownTable label="Sthana bala parts" planets={planets} rows={STHANA_ROWS} />
            <BreakdownTable label="Kala bala parts" planets={planets} rows={KALA_ROWS} />
          </div>
        </details>
        <p className="mt-3 text-[12.5px] text-stone-500">
          Calculated by the Parashari method (Brihat Parashara Hora Shastra), as worked out in B. V. Raman&apos;s Graha and Bhava Balas.
        </p>
      </section>
    </div>
  );
}

function BreakdownTable({ label, planets, rows }: { label: string; planets: ShadbalaRow[]; rows: { label: string; get: (r: ShadbalaRow) => number }[] }) {
  return (
    <ScrollTable label={label} minWidth={700}>
      <thead>
        <tr>
          <th scope="col" className={`${th} sticky left-0 z-10`}>{label}</th>
          {planets.map((p) => (
            <th key={p.planet} scope="col" className={`${th} text-right`}>
              {GRAHA_LABEL[p.planet]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row" className={`${tdBare} sticky left-0 z-10 bg-white text-left font-normal text-stone-700`}>{row.label}</th>
            {planets.map((p) => (
              <td key={p.planet} className={`${td} text-right tabular-nums`}>{v(row.get(p))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </ScrollTable>
  );
}
