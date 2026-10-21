import { useId } from "react";
import { RASHIS } from "@/lib/astro";
import { RASHI_GLYPHS } from "./tool-icons";

// North and South Indian chart drawings (300 × 300 SVG) in an engraved gold double frame. Fed with
// the lagna's sign and the grahas placed by sign; with `empty` only the frame is drawn (the
// logged-out view).

export interface ChartPlacement {
  /** Sign the graha occupies in this chart, 0 = Aries … 11 = Pisces. */
  sign: number;
  /** Two-letter abbreviation, e.g. "Sa". */
  abbr: string;
  /** Whole degrees within the sign, shown after the abbreviation (left out in the Navamsa). */
  degree?: number;
  /** Retrograde grahas are drawn in red with a small "R". */
  retrograde?: boolean;
}

interface ChartData {
  lagnaSign: number;
  placements: ChartPlacement[];
  /** Middle caption of the South chart, e.g. "Rasi" or "Navamsa". */
  title: string;
}

const LINE = "#c99a3c";
const LABEL = "#8a6a2e";
const PLANET = "#7c3a0c";
const RETRO = "#be123c";

/** The chart is drawn in this 284-unit square, inset inside the double frame. */
const INSET = 8;
const SCALE = (300 - INSET * 2) / 300;

/** Lines of placements for a cell: one per line, or two per line when crowded. */
function rows(items: ChartPlacement[], perLine: number): ChartPlacement[][] {
  const out: ChartPlacement[][] = [];
  for (let i = 0; i < items.length; i += perLine) out.push(items.slice(i, i + perLine));
  return out;
}

function PlacementText({ items, x, y, size, perLine }: { items: ChartPlacement[]; x: number; y: number; size: number; perLine: number }) {
  const lines = rows(items, perLine);
  const step = size + 3.5;
  const top = y - ((lines.length - 1) * step) / 2;
  const small = Math.round(size * 0.78 * 10) / 10;
  return (
    <>
      {lines.map((line, li) => (
        <text key={li} x={x} y={top + li * step} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight="700">
          {line.map((p, i) => (
            <tspan key={i} fill={p.retrograde ? RETRO : PLANET}>
              {i > 0 ? "  " : ""}
              {p.abbr}
              {p.degree !== undefined && (
                <tspan fontSize={small} fontWeight="600">
                  {` ${p.degree}°`}
                </tspan>
              )}
              {p.retrograde && (
                <tspan fontSize={small} fontWeight="800">
                  {" R"}
                </tspan>
              )}
            </tspan>
          ))}
        </text>
      ))}
    </>
  );
}

/** The engraved frame and parchment fill shared by both styles; the chart sits inside it. */
function Frame({ id, children, label }: { id: string; children: React.ReactNode; label: string }) {
  const metal = `${id}-metal`;
  const paper = `${id}-paper`;
  return (
    <svg viewBox="0 0 300 300" className="block size-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a580a" />
          <stop offset=".28" stopColor="#d9a93e" />
          <stop offset=".5" stopColor="#a36f14" />
          <stop offset=".72" stopColor="#e0b450" />
          <stop offset="1" stopColor="#7d4f08" />
        </linearGradient>
        <radialGradient id={paper} cx=".5" cy=".5" r=".72">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset=".7" stopColor="#fdf5e2" />
          <stop offset="1" stopColor="#f8e9c6" />
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="297" height="297" rx="6" fill={`url(#${paper})`} stroke={`url(#${metal})`} strokeWidth="3" />
      <rect x={INSET - 2.5} y={INSET - 2.5} width={300 - (INSET - 2.5) * 2} height={300 - (INSET - 2.5) * 2} rx="3" fill="none" stroke={`url(#${metal})`} strokeWidth=".8" />
      <g transform={`translate(${INSET} ${INSET}) scale(${SCALE})`}>{children}</g>
    </svg>
  );
}

/** North Indian (diamond) chart: houses are fixed, house 1 at the top; each shows its sign number. */
const NORTH: { center: [number, number]; num: [number, number]; kind: "kendra" | "top" | "side" }[] = [
  { center: [150, 70], num: [150, 132], kind: "kendra" }, // 1
  { center: [75, 28], num: [75, 64], kind: "top" }, // 2
  { center: [26, 75], num: [62, 79], kind: "side" }, // 3
  { center: [70, 150], num: [132, 154], kind: "kendra" }, // 4
  { center: [26, 225], num: [62, 229], kind: "side" }, // 5
  { center: [75, 272], num: [75, 238], kind: "top" }, // 6
  { center: [150, 230], num: [150, 170], kind: "kendra" }, // 7
  { center: [225, 272], num: [225, 238], kind: "top" }, // 8
  { center: [274, 225], num: [238, 229], kind: "side" }, // 9
  { center: [230, 150], num: [168, 154], kind: "kendra" }, // 10
  { center: [274, 75], num: [238, 79], kind: "side" }, // 11
  { center: [225, 28], num: [225, 64], kind: "top" }, // 12
];

function NorthChart({ data, id }: { data: ChartData | null; id: string }) {
  return (
    <Frame id={id} label={data ? `North Indian ${data.title} chart` : "Empty North Indian chart"}>
      <rect x="0" y="0" width="300" height="300" fill="none" stroke={LINE} strokeWidth="1.6" />
      <path d="M0 0 L300 300 M300 0 L0 300 M150 0 L300 150 L150 300 L0 150 Z" fill="none" stroke={LINE} strokeWidth="1.4" />
      {data &&
        NORTH.map((cell, i) => {
          const sign = (data.lagnaSign + i) % 12;
          const items = data.placements.filter((p) => p.sign === sign);
          const crowded = items.length > 3;
          const size = cell.kind === "kendra" ? (crowded ? 11.5 : 13) : cell.kind === "top" ? (crowded ? 10.5 : 12) : crowded ? 10 : 11.5;
          const perLine = cell.kind === "side" ? (items.length > 4 ? 2 : 1) : crowded ? 2 : 1;
          return (
            <g key={i}>
              <text x={cell.num[0]} y={cell.num[1]} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill={LABEL} fontWeight="600">
                {sign + 1}
              </text>
              {i === 0 && (
                <text x="150" y="114" textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fill={LABEL} fontWeight="700" letterSpacing=".6">
                  ASC
                </text>
              )}
              {items.length > 0 && <PlacementText items={items} x={cell.center[0]} y={cell.center[1]} size={size} perLine={perLine} />}
            </g>
          );
        })}
    </Frame>
  );
}

/** South Indian chart: signs are fixed in a 4 × 4 ring, starting with Pisces top-left. */
const SOUTH_CELLS: [number, number, number][] = [
  [11, 0, 0], [0, 1, 0], [1, 2, 0], [2, 3, 0],
  [10, 0, 1], [3, 3, 1],
  [9, 0, 2], [4, 3, 2],
  [8, 0, 3], [7, 1, 3], [6, 2, 3], [5, 3, 3],
];

function SouthChart({ data, id }: { data: ChartData | null; id: string }) {
  const c = 75;
  return (
    <Frame id={id} label={data ? `South Indian ${data.title} chart` : "Empty South Indian chart"}>
      <rect x="0" y="0" width="300" height="300" fill="none" stroke={LINE} strokeWidth="1.6" />
      {SOUTH_CELLS.map(([sign, col, row]) => {
        const items = data ? data.placements.filter((p) => p.sign === sign) : [];
        const x = col * c;
        const y = row * c;
        const asc = data?.lagnaSign === sign;
        const crowded = items.length > 3;
        return (
          <g key={sign}>
            <rect x={x} y={y} width={c} height={c} fill={asc ? "rgba(245,158,11,.10)" : "none"} stroke={LINE} strokeWidth="1" />
            {asc && <line x1={x} y1={y + 20} x2={x + 20} y2={y} stroke={LINE} strokeWidth="1.6" />}
            {data && (
              <>
                <text x={x + (asc ? 21 : 6)} y={y + 13} fontSize="9.5" fill={LABEL} fontWeight="700">
                  {RASHIS[sign].en.slice(0, 3)}
                  {asc ? " · Asc" : ""}
                </text>
                <path
                  d={RASHI_GLYPHS[sign]}
                  transform={`translate(${x + c - 11} ${y + 11}) scale(.42)`}
                  fill="none"
                  stroke={LINE}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity=".75"
                />
              </>
            )}
            {items.length > 0 && (
              <PlacementText items={items} x={x + c / 2} y={y + c / 2 + 8} size={crowded ? 9.5 : 11} perLine={crowded ? 2 : 1} />
            )}
          </g>
        );
      })}
      {data && (
        <>
          <text x="150" y="142" textAnchor="middle" fontSize="22" fill={PLANET} fontWeight="600" style={{ fontFamily: "var(--font-display)" }}>
            {data.title}
          </text>
          <text x="150" y="162" textAnchor="middle" fontSize="10" fill={LABEL} fontWeight="600" letterSpacing="1.2">
            SOUTH INDIAN
          </text>
        </>
      )}
    </Frame>
  );
}

/** `empty`: just the chart frame (no houses, signs or planets), shown before the customer logs in. */
export default function KundliChart({
  style,
  empty = false,
  lagnaSign = 0,
  placements = [],
  title = "Rasi",
}: {
  style: "north" | "south";
  empty?: boolean;
} & Partial<ChartData>) {
  // Gradient ids must be unique per drawing; useId's punctuation isn't safe inside url(#…).
  const id = `kc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const data = empty ? null : { lagnaSign, placements, title };
  return style === "north" ? <NorthChart data={data} id={id} /> : <SouthChart data={data} id={id} />;
}
