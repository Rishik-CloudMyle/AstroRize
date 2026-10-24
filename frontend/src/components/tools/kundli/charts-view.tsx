"use client";

import { useRef, useState } from "react";
import { RASHIS, VARGA_CODES, type GrahaKey, type SavedChart } from "@/lib/astro";
import KundliChart, { type ChartPlacement } from "../kundli-chart";
import { SectionTitle } from "../tool-ui";
import { CHART_HELP, type ChartKey } from "./explain";
import { ChartFigure, GRAHA_EN, GRAHA_ORDER, Help, RetroBadge, fmtDm, ordinal } from "./shared";

/** The picker's order: Rashi, Bhava Chalit, Sun and Moon charts, today's transits, then D2…D60. */
const PICKER: { key: ChartKey; code: string; label: string }[] = [
  { key: "D1", code: "D1", label: "Rashi" },
  { key: "chalit", code: "Chalit", label: "Bhava Chalit" },
  { key: "sun", code: "Sun", label: "Surya lagna" },
  { key: "moon", code: "Moon", label: "Chandra lagna" },
  { key: "transit-lagna", code: "Transit", label: "from lagna" },
  { key: "transit-moon", code: "Transit", label: "from Moon" },
  ...VARGA_CODES.filter((c) => c !== "D1").map((c) => ({ key: c as ChartKey, code: c, label: CHART_HELP[c].title.replace(/ \(D\d+\)$/, "") })),
];

interface Row {
  key: GrahaKey | "lagna";
  name: string;
  abbr: string;
  sign: number;
  house: number;
  /** Degree inside the sign of this chart; null where none is defined (D30). */
  degree: number | null;
  retrograde: boolean;
  note?: string;
}

/** Everything one chart needs: its "lagna" sign, the rows (lagna first) and a caption. */
function chartData(chart: SavedChart, key: ChartKey): { lagnaSign: number; lagnaLabel: string; rows: Row[]; title: string } {
  const k = chart.kundli;
  const byKey = new Map(k.grahas.map((g) => [g.key, g]));
  const ordered = GRAHA_ORDER.map((g) => byKey.get(g)!).filter(Boolean);
  const lagnaRow = (sign: number, degree: number | null, house = 1): Row => ({ key: "lagna", name: "Lagna", abbr: "As", sign, house, degree, retrograde: false });
  const houseFrom = (from: number, sign: number) => ((sign - from + 12) % 12) + 1;

  if (key === "chalit") {
    const L = k.lagna.sign.index;
    return {
      lagnaSign: L,
      lagnaLabel: "Lagna",
      title: "Chalit",
      rows: [
        lagnaRow(L, k.lagna.degree),
        ...ordered.map((g) => ({
          key: g.key,
          name: g.name,
          abbr: g.abbr,
          // Drawn in the sign of the matching whole-sign house.
          sign: (L + g.bhava - 1) % 12,
          house: g.bhava,
          degree: g.degree,
          retrograde: g.retrograde,
          note: g.bhava !== g.house ? `house ${g.house} by sign` : undefined,
        })),
      ],
    };
  }
  if (key === "sun" || key === "moon") {
    const ref = byKey.get(key)!;
    const L = ref.sign.index;
    return {
      lagnaSign: L,
      lagnaLabel: key === "sun" ? "Surya lagna" : "Chandra lagna",
      title: key === "sun" ? "Surya" : "Chandra",
      rows: [
        { ...lagnaRow(k.lagna.sign.index, k.lagna.degree, houseFrom(L, k.lagna.sign.index)), name: "Birth lagna" },
        ...ordered.map((g) => ({ key: g.key, name: g.name, abbr: g.abbr, sign: g.sign.index, house: houseFrom(L, g.sign.index), degree: g.degree, retrograde: g.retrograde })),
      ],
    };
  }
  if (key === "transit-lagna" || key === "transit-moon") {
    const fromMoon = key === "transit-moon";
    const L = fromMoon ? k.moonSign.index : k.lagna.sign.index;
    return {
      lagnaSign: L,
      lagnaLabel: fromMoon ? "Natal Moon" : "Natal lagna",
      title: "Gochara",
      rows: chart.today.transit.map((t) => ({
        key: t.key,
        name: t.name,
        abbr: t.abbr,
        sign: t.sign.index,
        house: fromMoon ? t.houseFromMoon : t.houseFromLagna,
        degree: t.degree,
        retrograde: t.retrograde,
      })),
    };
  }
  const v = k.vargas[key];
  const signOf = new Map(v.houses.flatMap((h) => h.grahas.map((g) => [g, h] as const)));
  const deg = (d: number | null | undefined) => (d === undefined ? null : d);
  return {
    lagnaSign: v.lagnaSign,
    lagnaLabel: `${key} lagna`,
    title: key === "D1" ? "Rasi" : key,
    rows: [
      lagnaRow(v.lagnaSign, deg(v.lagnaDegree)),
      ...ordered.map((g) => {
        const h = signOf.get(g.key)!;
        return { key: g.key, name: g.name, abbr: g.abbr, sign: h.sign, house: h.house, degree: deg(v.degrees?.[g.key]), retrograde: g.retrograde };
      }),
    ],
  };
}

function placements(rows: Row[]): ChartPlacement[] {
  return rows
    .filter((r) => r.key !== "lagna")
    .map((r) => ({ sign: r.sign, abbr: r.abbr, retrograde: r.retrograde, ...(r.degree !== null ? { degree: Math.floor(r.degree) } : {}) }));
}

/** Charts tab: the Rashi and Navamsa side by side, then every other chart from a picker. */
export default function ChartsView({ chart, style }: { chart: SavedChart; style: "north" | "south" }) {
  const k = chart.kundli;
  const d1 = chartData(chart, "D1");
  const d9 = chartData(chart, "D9");
  return (
    <div>
      <SectionTitle>Lagna and Navamsa</SectionTitle>
      <Help className="-mt-1 mb-4">
        {CHART_HELP.D1.purpose} {CHART_HELP.D9.purpose}
      </Help>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 sm:gap-5">
        <ChartFigure title="Lagna chart (D1)" caption={<>Lagna {k.lagna.sign.name} {fmtDm(k.lagna.degree)}</>}>
          <KundliChart style={style} lagnaSign={d1.lagnaSign} placements={placements(d1.rows)} title="Rasi" />
        </ChartFigure>
        <ChartFigure title="Navamsa (D9)" caption={<>Lagna {RASHIS[d9.lagnaSign]!.en}{d9.rows[0]!.degree !== null ? ` ${fmtDm(d9.rows[0]!.degree)}` : ""}</>}>
          <KundliChart style={style} lagnaSign={d9.lagnaSign} placements={placements(d9.rows)} title="Navamsa" />
        </ChartFigure>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-stone-600">
        {style === "north" ? "Numbers are signs (1 = Aries … 12 = Pisces); the top diamond is house 1. " : ""}
        The number after each planet is its degree in that chart&apos;s sign. <span className="font-bold text-rose-700">Red R</span> = retrograde.
      </p>
      <ChartPicker chart={chart} style={style} />
    </div>
  );
}

function ChartPicker({ chart, style }: { chart: SavedChart; style: "north" | "south" }) {
  const [selected, setSelected] = useState<ChartKey>("chalit");
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const index = PICKER.findIndex((p) => p.key === selected);
  const help = CHART_HELP[selected];
  const data = chartData(chart, selected);
  const transit = selected === "transit-lagna" || selected === "transit-moon";
  const at = new Date(chart.today.at);

  function choose(i: number, focus: boolean) {
    const next = PICKER[(i + PICKER.length) % PICKER.length]!;
    setSelected(next.key);
    const el = chips.current[PICKER.indexOf(next)];
    if (focus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: PICKER.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      choose(moves[e.key]!, true);
    }
  }

  return (
    <section className="mt-8" aria-labelledby="varga-heading">
      <SectionTitle>
        <span id="varga-heading">More charts</span>
      </SectionTitle>
      <div
        role="radiogroup"
        aria-label="Choose a chart"
        onKeyDown={onKey}
        className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] lg:flex-wrap lg:overflow-visible"
      >
        {PICKER.map((p, i) => {
          const on = p.key === selected;
          return (
            <button
              key={p.key}
              ref={(el) => {
                chips.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(i, false)}
              title={CHART_HELP[p.key].title}
              className={`flex shrink-0 snap-start flex-col items-start rounded-xl border px-3 py-1.5 text-left leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
                on ? "border-amber-500 bg-linear-to-b from-[#fff3cf] to-[#fbdf9a] text-ink shadow-[0_4px_10px_rgba(180,83,9,.16)]" : "border-line-warm bg-white text-stone-700 hover:border-amber-300"
              }`}
            >
              <b className="text-[13px]">{p.code}</b>
              <span className="text-[11.5px] text-stone-600">{p.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-2 md:gap-7">
        <ChartFigure title={help.title} caption={<>{data.lagnaLabel} {RASHIS[data.lagnaSign]!.en}</>}>
          <KundliChart style={style} lagnaSign={data.lagnaSign} placements={placements(data.rows)} title={data.title} />
        </ChartFigure>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{help.title}</p>
          <Help className="mt-1">
            <b className="font-semibold text-stone-700">What it shows:</b> {help.purpose}
          </Help>
          <Help className="mt-1">
            <b className="font-semibold text-stone-700">How to read it:</b> {help.read}
          </Help>
          {transit && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900">
              Planets as of {at.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} (your
              device&apos;s time). Reopen the Kundli to refresh.
            </p>
          )}
          <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1.5 min-[400px]:grid-cols-2">
            {data.rows.map((r) => (
              <li
                key={r.key}
                className={`flex min-w-0 items-baseline justify-between gap-2 rounded-xl border px-3 py-1.5 text-[13px] ${
                  r.key === "lagna" ? "border-amber-200 bg-amber-50/70" : "border-line-warm bg-white"
                }`}
              >
                <b className="shrink-0 text-ink">
                  {r.key === "lagna" ? r.name : GRAHA_EN[r.key]}
                  {r.retrograde && <RetroBadge />}
                </b>
                <span className="min-w-0 text-right text-stone-600">
                  {selected === "chalit" && r.key !== "lagna" ? `Bhava ${r.house}` : `${RASHIS[r.sign]!.en.slice(0, 3)} ${r.degree !== null ? fmtDm(r.degree) : "—"}`}
                  <span className="text-stone-500"> · {ordinal(r.house)}</span>
                  {r.note && <span className="block text-[11.5px] text-stone-500">{r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-stone-500">
            Each row: sign and degree inside that sign, then the house counted from {data.lagnaLabel.toLowerCase().replace(/^d(\d+)/, "D$1")}.
            {selected === "chalit" && style === "south" ? " In the South Indian style each bhava is drawn in the sign of the matching whole-sign house." : ""}
            {selected === "D30" ? " D30 has unequal parts, so no degree is given (—)." : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
