import { KUNDLI_PLANETS } from "@/lib/mock/tools";

// The sample chart has Aries rising, so house N holds sign N.
const ABBR: Record<string, string> = { Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju" };

function planetsInHouse(house: number) {
  return KUNDLI_PLANETS.filter((p) => p.house === house).map((p) => ABBR[p.planet]);
}
function planetsInSign(sign: string) {
  return KUNDLI_PLANETS.filter((p) => p.sign === sign).map((p) => ABBR[p.planet]);
}

/** Where each house's label sits in the North Indian diamond chart (300 × 300). */
const NORTH_HOUSES: [number, number][] = [
  [150, 78], [75, 34], [34, 75], [78, 150], [34, 225], [75, 266],
  [150, 222], [225, 266], [266, 225], [222, 150], [266, 75], [225, 34],
];

function NorthChart() {
  return (
    <svg viewBox="0 0 300 300" className="size-full" role="img" aria-label="North Indian birth chart">
      <rect x="1" y="1" width="298" height="298" fill="#fffbeb" stroke="#d6a84a" strokeWidth="2" />
      <path d="M1 1 L299 299 M299 1 L1 299 M150 1 L299 150 L150 299 L1 150 Z" fill="none" stroke="#d6a84a" strokeWidth="1.5" />
      {NORTH_HOUSES.map(([x, y], i) => {
        const house = i + 1;
        const planets = planetsInHouse(house);
        return (
          <g key={house}>
            <text x={x} y={y - (planets.length ? 7 : 0)} textAnchor="middle" fontSize="11" fill="#a1824a" fontWeight="600">
              {house}
              {house === 1 ? " · Asc" : ""}
            </text>
            {planets.length > 0 && (
              <text x={x} y={y + 9} textAnchor="middle" fontSize="13" fill="#92400e" fontWeight="700">
                {planets.join(" ")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** South Indian chart: signs are fixed in a 4 × 4 ring, starting with Pisces top-left. */
const SOUTH_CELLS: [string, number, number][] = [
  ["Pisces", 0, 0], ["Aries", 1, 0], ["Taurus", 2, 0], ["Gemini", 3, 0],
  ["Aquarius", 0, 1], ["Cancer", 3, 1],
  ["Capricorn", 0, 2], ["Leo", 3, 2],
  ["Sagittarius", 0, 3], ["Scorpio", 1, 3], ["Libra", 2, 3], ["Virgo", 3, 3],
];

function SouthChart() {
  const c = 75;
  return (
    <svg viewBox="0 0 300 300" className="size-full" role="img" aria-label="South Indian birth chart">
      <rect x="1" y="1" width="298" height="298" fill="#fffbeb" stroke="#d6a84a" strokeWidth="2" />
      {SOUTH_CELLS.map(([sign, col, row]) => {
        const planets = planetsInSign(sign);
        const x = col * c;
        const y = row * c;
        return (
          <g key={sign}>
            <rect x={x + 1} y={y + 1} width={c - 1} height={c - 1} fill="none" stroke="#d6a84a" strokeWidth="1" />
            <text x={x + 6} y={y + 15} fontSize="9.5" fill="#a1824a" fontWeight="600">
              {sign.slice(0, 3)}
              {sign === "Aries" ? " · Asc" : ""}
            </text>
            {planets.length > 0 && (
              <text x={x + c / 2} y={y + c / 2 + 8} textAnchor="middle" fontSize="13" fill="#92400e" fontWeight="700">
                {planets.join(" ")}
              </text>
            )}
          </g>
        );
      })}
      <text x="150" y="146" textAnchor="middle" fontSize="13" fill="#92400e" fontWeight="700">
        Rasi
      </text>
      <text x="150" y="163" textAnchor="middle" fontSize="10" fill="#a1824a">
        South Indian
      </text>
    </svg>
  );
}

export default function KundliChart({ style }: { style: "north" | "south" }) {
  return style === "north" ? <NorthChart /> : <SouthChart />;
}
