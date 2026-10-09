// Where the nine grahas are in the sky right now, in the Vedic (sidereal, Lahiri) zodiac.
// Low-precision astronomy, accurate to well under a degree — plenty to name each planet's
// rashi. Sources: JPL "Approximate Positions of the Planets" (Keplerian elements, valid
// 1800–2050), Meeus "Astronomical Algorithms" (Sun, Moon, lunar node).

export const RASHIS = [
  "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
  "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
] as const;

export type GrahaKey = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn" | "rahu" | "ketu";

export interface GrahaPosition {
  /** Sidereal ecliptic longitude, 0–360°, 0 = start of Mesha. */
  longitude: number;
  rashi: (typeof RASHIS)[number];
}

const rad = Math.PI / 180;
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Julian centuries since J2000.0 (12:00 TT, 1 Jan 2000). */
function centuries(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return (jd - 2451545.0) / 36525;
}

/** Lahiri ayanamsa: ~23.853° at J2000, growing ~50.29″ a year. */
function ayanamsa(T: number): number {
  return 23.853 + 1.3969 * T;
}

// [a (AU), e, I (°), L (°), long. of perihelion (°), long. of node (°)] and their rates per century.
type Elements = [number, number, number, number, number, number];
const PLANETS: Record<"mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn", [Elements, Elements]> = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};

/** Heliocentric ecliptic x, y, z (AU) of a planet at T. */
function heliocentric(planet: keyof typeof PLANETS, T: number): [number, number, number] {
  const [base, rate] = PLANETS[planet];
  const [a, e, I, L, peri, node] = base.map((v, i) => v + rate[i]! * T) as Elements;
  const w = peri - node; // argument of perihelion
  let M = norm(L - peri);
  if (M > 180) M -= 360;
  // Solve Kepler's equation E - e·sin E = M (degrees).
  const eDeg = e / rad;
  let E = M + eDeg * Math.sin(M * rad);
  for (let i = 0; i < 8; i++) E -= (E - eDeg * Math.sin(E * rad) - M) / (1 - e * Math.cos(E * rad));
  const xp = a * (Math.cos(E * rad) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E * rad);
  const [cw, sw, cO, sO, cI, sI] = [Math.cos(w * rad), Math.sin(w * rad), Math.cos(node * rad), Math.sin(node * rad), Math.cos(I * rad), Math.sin(I * rad)];
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** Geocentric tropical longitude of a planet, from the Earth–planet vector. */
function planetLongitude(planet: Exclude<keyof typeof PLANETS, "earth">, T: number): number {
  const [px, py] = heliocentric(planet, T);
  const [ex, ey] = heliocentric("earth", T);
  return norm(Math.atan2(py - ey, px - ex) / rad);
}

function sunLongitude(T: number): number {
  const L0 = 280.46646 + 36000.76983 * T;
  const M = 357.52911 + 35999.05029 * T;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M * rad) + 0.019993 * Math.sin(2 * M * rad) + 0.000289 * Math.sin(3 * M * rad);
  return norm(L0 + C);
}

function moonLongitude(T: number): number {
  const L = 218.3164477 + 481267.88123421 * T; // mean longitude
  const D = 297.8501921 + 445267.1114034 * T; // mean elongation
  const M = 357.5291092 + 35999.0502909 * T; // Sun's mean anomaly
  const Mm = 134.9633964 + 477198.8675055 * T; // Moon's mean anomaly
  const F = 93.272095 + 483202.0175233 * T; // argument of latitude
  const s = (deg: number) => Math.sin(deg * rad);
  return norm(
    L + 6.288774 * s(Mm) + 1.274027 * s(2 * D - Mm) + 0.658314 * s(2 * D) + 0.213618 * s(2 * Mm) - 0.185116 * s(M) - 0.114332 * s(2 * F) +
      0.058793 * s(2 * D - 2 * Mm) + 0.057066 * s(2 * D - M - Mm) + 0.053322 * s(2 * D + Mm) + 0.045758 * s(2 * D - M),
  );
}

/** Mean lunar node — Rahu. Ketu is always opposite. */
function rahuLongitude(T: number): number {
  return norm(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
}

/** The sidereal position and rashi of each graha at `date`. */
export function grahaPositions(date: Date): Record<GrahaKey, GrahaPosition> {
  const T = centuries(date);
  const ay = ayanamsa(T);
  const tropical: Record<GrahaKey, number> = {
    sun: sunLongitude(T),
    moon: moonLongitude(T),
    mercury: planetLongitude("mercury", T),
    venus: planetLongitude("venus", T),
    mars: planetLongitude("mars", T),
    jupiter: planetLongitude("jupiter", T),
    saturn: planetLongitude("saturn", T),
    rahu: rahuLongitude(T),
    ketu: norm(rahuLongitude(T) + 180),
  };
  const out = {} as Record<GrahaKey, GrahaPosition>;
  for (const [key, lon] of Object.entries(tropical) as [GrahaKey, number][]) {
    const sidereal = norm(lon - ay);
    out[key] = { longitude: sidereal, rashi: RASHIS[Math.floor(sidereal / 30)]! };
  }
  return out;
}
