"use client";

// KP (Krishnamurti Paddhati) view for a Kundli result tab.
//
//   <KpView k={chart.kundli} style={chartStyle} />
//
// Props
//   k      the Kundli (needs k.kp, k.birth, k.grahas) — from GET/POST /api/astro/kundli
//   style  "north" | "south" — the same chart style the rest of the Kundli uses
//
// Shows the Placidus cusps and the planets with sign, star, sub and sub-sub lords, the planets drawn
// by Placidus house (KP chalit), and the ruling planets at birth — plus, on request, the ruling
// planets now at the birthplace (GET /api/astro/kp/ruling-planets).

import { useState } from "react";
import { GRAHA_LABEL, RASHIS, kpRulingPlanetsNow, type GrahaKey, type KpRulingPlanets, type Kundli } from "@/lib/astro";
import KundliChart, { type ChartPlacement } from "../kundli-chart";
import { SectionTitle } from "../tool-ui";
import { Figure, Intro, NAKSHATRA_NAMES, ScrollTable, dmsInSign, td, tdBare, th } from "./advanced-ui";

const RULING_ROWS: { key: keyof Omit<KpRulingPlanets, "at">; label: string }[] = [
  { key: "lagnaSignLord", label: "Ascendant sign lord" },
  { key: "lagnaStarLord", label: "Ascendant star lord" },
  { key: "lagnaSubLord", label: "Ascendant sub lord" },
  { key: "moonSignLord", label: "Moon sign lord" },
  { key: "moonStarLord", label: "Moon star lord" },
  { key: "moonSubLord", label: "Moon sub lord" },
  { key: "dayLord", label: "Day lord" },
];

/** Cells that may wrap (the ruling-planets table must fit a phone without scrolling). */
const thWrap = th.replace("whitespace-nowrap", "");
const tdWrapBare = tdBare.replace("whitespace-nowrap", "");

const ABBR: Record<GrahaKey, string> = { sun: "Su", moon: "Mo", mars: "Ma", mercury: "Me", jupiter: "Ju", venus: "Ve", saturn: "Sa", rahu: "Ra", ketu: "Ke" };

export default function KpView({ k, style }: { k: Kundli; style: "north" | "south" }) {
  const [now, setNow] = useState<{ state: "idle" | "loading" | "error"; data?: KpRulingPlanets; message?: string }>({ state: "idle" });
  const kp = k.kp;
  if (!kp) return <p className="text-[14px] text-stone-600">KP details aren&apos;t available for this chart.</p>;

  const lagnaSign = kp.cusps[0]!.sign;
  const placements: ChartPlacement[] = kp.grahas.map((g) => ({ sign: (lagnaSign + g.bhava - 1) % 12, abbr: ABBR[g.key], retrograde: g.retrograde }));
  const timeZone = k.birth.timezone;
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));

  async function loadNow() {
    if (now.state === "loading") return;
    setNow({ state: "loading", data: now.data });
    try {
      const res = await kpRulingPlanetsNow({ latitude: k.birth.latitude, longitude: k.birth.longitude, timezone: k.birth.timezone });
      setNow({ state: "idle", data: res.rulingPlanets });
    } catch (err) {
      setNow({ state: "error", data: now.data, message: err instanceof Error ? err.message : "Couldn't load the ruling planets. Try again." });
    }
  }

  return (
    <div className="min-w-0">
      <Intro>
        Krishnamurti Paddhati (KP) divides every nakshatra into nine unequal parts called subs. The lord of the sub where a house
        cusp or a planet falls is the finer key KP astrologers use for timing events and answering questions; houses here are
        Placidus, as KP uses.
      </Intro>
      {kp.fallback && (
        <p role="note" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          Placidus houses can&apos;t be drawn this close to the pole, so the cusps below split each quarter of the sky evenly
          (Porphyry) instead. Treat the cusp sub lords with caution.
        </p>
      )}

      <section className="mt-6" aria-labelledby="kp-cusps-heading">
        <SectionTitle>
          <span id="kp-cusps-heading">House cusps</span>
        </SectionTitle>
        <ScrollTable label="KP house cusps" minWidth={640}>
          <thead>
            <tr>
              <th scope="col" className={th}>Cusp</th>
              <th scope="col" className={th}>Degree</th>
              <th scope="col" className={th}>Sign lord</th>
              <th scope="col" className={th}>Star · lord</th>
              <th scope="col" className={th}>Sub lord</th>
              <th scope="col" className={th}>Sub-sub</th>
            </tr>
          </thead>
          <tbody>
            {kp.cusps.map((c) => (
              <tr key={c.cusp}>
                <th scope="row" className={`${tdBare} text-left font-semibold tabular-nums text-ink`}>{c.cusp}</th>
                <td className={`${td} tabular-nums`}>
                  {RASHIS[c.sign]!.en} {dmsInSign(c.longitude)}
                </td>
                <td className={td}>{GRAHA_LABEL[c.signLord]}</td>
                <td className={td}>
                  {NAKSHATRA_NAMES[c.star]} · {GRAHA_LABEL[c.starLord]}
                </td>
                <td className={`${tdBare} font-semibold text-ink`}>{GRAHA_LABEL[c.subLord]}</td>
                <td className={td}>{GRAHA_LABEL[c.subSubLord]}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      </section>

      <section className="mt-8" aria-labelledby="kp-planets-heading">
        <SectionTitle>
          <span id="kp-planets-heading">Planets</span>
        </SectionTitle>
        <ScrollTable label="KP planets" minWidth={700}>
          <thead>
            <tr>
              <th scope="col" className={th}>Planet</th>
              <th scope="col" className={th}>Degree</th>
              <th scope="col" className={`${th} text-right`}>House</th>
              <th scope="col" className={th}>Sign lord</th>
              <th scope="col" className={th}>Star · lord</th>
              <th scope="col" className={th}>Sub lord</th>
              <th scope="col" className={th}>Sub-sub</th>
            </tr>
          </thead>
          <tbody>
            {kp.grahas.map((g) => (
              <tr key={g.key}>
                <th scope="row" className={`${tdBare} text-left font-semibold text-ink`}>
                  {GRAHA_LABEL[g.key]}
                  {g.retrograde && (
                    <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-rose-50 px-1.5 text-[10.5px] font-bold text-rose-700" title="Retrograde">
                      R<span className="sr-only">etrograde</span>
                    </span>
                  )}
                </th>
                <td className={`${td} tabular-nums`}>
                  {RASHIS[g.sign]!.en} {dmsInSign(g.longitude)}
                </td>
                <td className={`${tdBare} text-right font-semibold tabular-nums text-ink`}>{g.bhava}</td>
                <td className={td}>{GRAHA_LABEL[g.signLord]}</td>
                <td className={td}>
                  {NAKSHATRA_NAMES[g.star]} · {GRAHA_LABEL[g.starLord]}
                </td>
                <td className={`${tdBare} font-semibold text-ink`}>{GRAHA_LABEL[g.subLord]}</td>
                <td className={td}>{GRAHA_LABEL[g.subSubLord]}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
        <p className="mt-2 text-[12.5px] text-stone-500">House: the Placidus house the planet falls in, from one cusp to the next.</p>
      </section>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-2 md:gap-7">
        <Figure title={`${kp.houseSystem} houses`} caption={<>Lagna {RASHIS[lagnaSign]!.en}</>}>
          <KundliChart style={style} lagnaSign={lagnaSign} placements={placements} title="KP" />
        </Figure>

        <section className="min-w-0" aria-labelledby="kp-ruling-heading">
          <SectionTitle>
            <span id="kp-ruling-heading">Ruling planets</span>
          </SectionTitle>
          <p className="text-[13.5px] leading-relaxed text-stone-600">
            The planets ruling a moment. At birth they confirm the chart; for a question, KP uses those of the moment it is judged.
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-line-warm bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={`${thWrap}`}>
                    <span className="sr-only">Ruler</span>
                  </th>
                  <th scope="col" className={`${thWrap}`}>At birth</th>
                  {now.data && <th scope="col" className={`${thWrap}`}>Now</th>}
                </tr>
              </thead>
              <tbody>
                {RULING_ROWS.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className={`${tdWrapBare} text-left font-normal text-stone-500`}>{r.label}</th>
                    <td className={`${tdWrapBare} font-semibold text-ink`}>{GRAHA_LABEL[kp.rulingPlanets[r.key]]}</td>
                    {now.data && <td className={`${tdWrapBare} font-semibold text-ink`}>{GRAHA_LABEL[now.data[r.key]]}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={loadNow}
              disabled={now.state === "loading"}
              className="inline-flex h-10 items-center rounded-full border border-amber-400 bg-white px-4 text-[13.5px] font-semibold text-amber-900 transition-colors hover:bg-amber-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              {now.state === "loading" ? "Working out…" : now.data ? "Refresh “now”" : "Show ruling planets now"}
            </button>
            {now.data && <span className="text-[12.5px] text-stone-500">Now: {fmtTime(now.data.at)} at the birthplace</span>}
          </div>
          {now.state === "error" && (
            <p role="alert" className="mt-2 text-[13px] text-rose-700">
              {now.message}
            </p>
          )}
          <p className="mt-2 text-[12.5px] text-stone-500">The day lord changes at sunrise, not midnight.</p>
        </section>
      </div>
    </div>
  );
}
