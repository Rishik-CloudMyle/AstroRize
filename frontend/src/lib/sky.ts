// Where the nine grahas are in the sky, in the Vedic (sidereal, Lahiri) zodiac, for the home
// hero's sky. Positions come from astronomy-engine (MIT, accurate to about an arcminute):
// geocentric apparent ecliptic longitude of date, so the planets' retrograde loops are real.
// Rahu is the mean lunar node (Meeus); Ketu is always exactly opposite.

import { Body, Ecliptic, EclipticGeoMoon, GeoVector, MakeTime, SunPosition } from "astronomy-engine";

export type GrahaKey = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn" | "rahu" | "ketu";

export const GRAHA_KEYS: readonly GrahaKey[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];

export interface GrahaSample {
  /** Sidereal ecliptic longitude, 0–360°, 0 = start of Mesha. */
  longitude: number;
  /**
   * Distance from the Earth within the body's own range: 0 = as close as it ever comes,
   * 1 = as far. Lets a drawing swing planets in and out a little, which turns the
   * backwards stretches into the loops seen in the real sky.
   */
  nearFar: number;
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;

/** Julian centuries (TT ≈ UT here; the 69 s difference is far below what this is used for) since J2000.0. */
function centuries(date: Date): number {
  return (date.getTime() / DAY_MS + 2440587.5 - 2451545.0) / 36525;
}

/**
 * Lahiri (Chitrapaksha) ayanamsa: 23.857092° at J2000 (the Swiss Ephemeris value), carried
 * forward by the IAU 2006 general precession in longitude.
 */
export function lahiriAyanamsa(date: Date): number {
  const T = centuries(date);
  return 23.857092 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

/** Mean longitude of the Moon's ascending node (Meeus, ch. 47), tropical. */
function meanRahu(date: Date): number {
  const T = centuries(date);
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}

// Closest and farthest geocentric distances (AU), to scale `nearFar`.
const RANGE: Record<"sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn", [number, number]> = {
  sun: [0.983, 1.017],
  moon: [0.00237, 0.00272],
  mercury: [0.54, 1.46],
  venus: [0.26, 1.74],
  mars: [0.37, 2.68],
  jupiter: [3.93, 6.47],
  saturn: [7.99, 11.1],
};

const PLANET_BODIES = { mercury: Body.Mercury, venus: Body.Venus, mars: Body.Mars, jupiter: Body.Jupiter, saturn: Body.Saturn } as const;

const scale = (key: keyof typeof RANGE, au: number) => {
  const [lo, hi] = RANGE[key];
  return Math.min(1, Math.max(0, (au - lo) / (hi - lo)));
};

/** The sidereal position of every graha at `date`. */
export function grahaSamples(date: Date): Record<GrahaKey, GrahaSample> {
  const time = MakeTime(date);
  const ay = lahiriAyanamsa(date);
  const out = {} as Record<GrahaKey, GrahaSample>;

  const sun = SunPosition(time);
  out.sun = { longitude: norm(sun.elon - ay), nearFar: scale("sun", sun.vec.Length()) };

  const moon = EclipticGeoMoon(time);
  out.moon = { longitude: norm(moon.lon - ay), nearFar: scale("moon", moon.dist) };

  for (const key of Object.keys(PLANET_BODIES) as (keyof typeof PLANET_BODIES)[]) {
    const vec = GeoVector(PLANET_BODIES[key], time, true);
    out[key] = { longitude: norm(Ecliptic(vec).elon - ay), nearFar: scale(key, vec.Length()) };
  }

  const rahu = norm(meanRahu(date) - ay);
  out.rahu = { longitude: rahu, nearFar: 0.5 };
  out.ketu = { longitude: norm(rahu + 180), nearFar: 0.5 };
  return out;
}

/** Each graha's name in English and in Sanskrit, for the wheel's labels. */
export const GRAHA_NAMES: Record<GrahaKey, { en: string; sa: string }> = {
  sun: { en: "Sun", sa: "Surya" },
  moon: { en: "Moon", sa: "Chandra" },
  mars: { en: "Mars", sa: "Mangala" },
  mercury: { en: "Mercury", sa: "Budha" },
  jupiter: { en: "Jupiter", sa: "Guru" },
  venus: { en: "Venus", sa: "Shukra" },
  saturn: { en: "Saturn", sa: "Shani" },
  rahu: { en: "North node", sa: "Rahu" },
  ketu: { en: "South node", sa: "Ketu" },
};

/** The twelve rashi, from 0° (Mesha) in steps of 30°. */
export const RASHI = ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"] as const;

/** The twenty-seven nakshatras, from 0° in steps of 13°20′. */
export const NAKSHATRA = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

/** Where a sidereal longitude falls: its rashi, the whole degree within it, and its nakshatra. */
export function placeOf(longitude: number): { rashi: string; degree: number; nakshatra: string } {
  const lon = norm(longitude);
  return {
    rashi: RASHI[Math.floor(lon / 30) % 12]!,
    degree: Math.floor(lon % 30),
    nakshatra: NAKSHATRA[Math.floor(lon / (360 / 27)) % 27]!,
  };
}
