import { RASHIS } from "@/lib/astro";

// North and South Indian chart drawings (300 × 300 SVG). Fed with the lagna's sign and a label
// per graha placed by sign; with `empty` only the frame is drawn (the logged-out view).

export interface ChartPlacement {
  /** Sign the graha occupies in this chart, 0 = Aries … 11 = Pisces. */
  sign: number;
  /** Short label, e.g. "Sa 14°(R)". */
  label: string;
  /** Retrograde grahas are drawn in a different colour. */
  retrograde?: boolean;
}

interface ChartData {
  lagnaSign: number;
  placements: ChartPlacement[];
  /** Middle caption of the South chart, e.g. "Rasi" or "Navamsa". */
  title: string;
}

const LINE = "#d6a84a";
const LABEL = "#a1824a";
const PLANET = "#92400e";
const RETRO = "#be123c";

/** Lines of labels for a cell: one per line, or two per line when crowded. */
function rows(items: ChartPlacement[], perLine: number): ChartPlacement[][] {
  const out: ChartPlacement[][] = [];
  for (let i = 0; i < items.length; i += perLine) out.push(items.slice(i, i + perLine));
  return out;
}

function PlacementText({ items, x, y, size, perLine }: { items: ChartPlacement[]; x: number; y: number; size: number; perLine: number }) {
  const lines = rows(items, perLine);
  const step = size + 2;
  const top = y - ((lines.length - 1) * step) / 2;
  return (
    <>
      {lines.map((line, li) => (
        <text key={li} x={x} y={top + li * step} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight="700">
          {line.map((p, i) => (
            <tspan key={i} fill={p.retrograde ? RETRO : PLANET}>
              {i > 0 ? " " : ""}
              {p.label}
            </tspan>
          ))}
        </text>
      ))}
    </>
  );
}

/** North Indian (diamond) chart: houses are fixed, house 1 at the top; each shows its sign number. */
const NORTH: { center: [number, number]; num: [number, number]; side: boolean }[] = [
  { center: [150, 66], num: [150, 132], side: false }, // 1
  { center: [75, 26], num: [75, 64], side: false }, // 2
  { center: [24, 75], num: [62, 79], side: true }, // 3
  { center: [66, 150], num: [132, 154], side: false }, // 4
  { center: [24, 225], num: [62, 229], side: true }, // 5
  { center: [75, 276], num: [75, 242], side: false }, // 6
  { center: [150, 234], num: [150, 170], side: false }, // 7
  { center: [225, 276], num: [225, 242], side: false }, // 8
  { center: [276, 225], num: [238, 229], side: true }, // 9
  { center: [234, 150], num: [168, 154], side: false }, // 10
  { center: [276, 75], num: [238, 79], side: true }, // 11
  { center: [225, 26], num: [225, 64], side: false }, // 12
];

function NorthChart({ data }: { data: ChartData | null }) {
  return (
    <svg
      viewBox="0 0 300 300"
      className="size-full"
      role="img"
      aria-label={data ? `North Indian ${data.title} chart` : "Empty North Indian chart"}
    >
      <rect x="1" y="1" width="298" height="298" fill="#fffbeb" stroke={LINE} strokeWidth="2" />
      <path d="M1 1 L299 299 M299 1 L1 299 M150 1 L299 150 L150 299 L1 150 Z" fill="none" stroke={LINE} strokeWidth="1.5" />
      {data &&
        NORTH.map((cell, i) => {
          const sign = (data.lagnaSign + i) % 12;
          const items = data.placements.filter((p) => p.sign === sign);
          const size = cell.side ? 8.5 : items.length > 4 ? 8.5 : 9.5;
          const perLine = cell.side ? 1 : items.length > 3 ? 2 : 1;
          return (
            <g key={i}>
              <text x={cell.num[0]} y={cell.num[1]} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={LABEL} fontWeight="600">
                {sign + 1}
              </text>
              {i === 0 && (
                <text x="150" y="116" textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={LABEL} fontWeight="700">
                  Asc
                </text>
              )}
              {items.length > 0 && <PlacementText items={items} x={cell.center[0]} y={cell.center[1]} size={size} perLine={perLine} />}
            </g>
          );
        })}
    </svg>
  );
}

/** South Indian chart: signs are fixed in a 4 × 4 ring, starting with Pisces top-left. */
const SOUTH_CELLS: [number, number, number][] = [
  [11, 0, 0], [0, 1, 0], [1, 2, 0], [2, 3, 0],
  [10, 0, 1], [3, 3, 1],
  [9, 0, 2], [4, 3, 2],
  [8, 0, 3], [7, 1, 3], [6, 2, 3], [5, 3, 3],
];

function SouthChart({ data }: { data: ChartData | null }) {
  const c = 75;
  return (
    <svg
      viewBox="0 0 300 300"
      className="size-full"
      role="img"
      aria-label={data ? `South Indian ${data.title} chart` : "Empty South Indian chart"}
    >
      <rect x="1" y="1" width="298" height="298" fill="#fffbeb" stroke={LINE} strokeWidth="2" />
      {SOUTH_CELLS.map(([sign, col, row]) => {
        const items = data ? data.placements.filter((p) => p.sign === sign) : [];
        const x = col * c;
        const y = row * c;
        const asc = data?.lagnaSign === sign;
        return (
          <g key={sign}>
            <rect x={x + 1} y={y + 1} width={c - 1} height={c - 1} fill="none" stroke={LINE} strokeWidth="1" />
            {asc && <line x1={x + 1} y1={y + 18} x2={x + 18} y2={y + 1} stroke={LINE} strokeWidth="1.5" />}
            {data && (
              <text x={x + (asc ? 20 : 6)} y={y + 13} fontSize="9" fill={LABEL} fontWeight="600">
                {RASHIS[sign].en.slice(0, 3)}
                {asc ? " · Asc" : ""}
              </text>
            )}
            {items.length > 0 && (
              <PlacementText
                items={items}
                x={x + c / 2}
                y={y + c / 2 + 7}
                size={items.length > 4 ? 8 : 9}
                perLine={items.length > 4 ? 2 : 1}
              />
            )}
          </g>
        );
      })}
      {data && (
        <>
          <text x="150" y="146" textAnchor="middle" fontSize="13" fill={PLANET} fontWeight="700">
            {data.title}
          </text>
          <text x="150" y="163" textAnchor="middle" fontSize="10" fill={LABEL}>
            South Indian
          </text>
        </>
      )}
    </svg>
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
  const data = empty ? null : { lagnaSign, placements, title };
  return style === "north" ? <NorthChart data={data} /> : <SouthChart data={data} />;
}
