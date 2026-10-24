// Where the grahas and the ascendant are, in the sidereal (Lahiri) zodiac.
//
// Tropical positions come from astronomy-engine (MIT; VSOP87 planets and the Improved Lunar
// Ephemeris, about an arcminute or better): geocentric apparent longitude referred to the true
// equinox and ecliptic of date. Everything Vedic on top is our own code.
//
// Lahiri (Chitrapaksha) ayanamsa — same base constants as frontend/src/lib/sky.ts:
//   mean ayanamsa(T) = 23.857092° + (5028.796195″·T + 1.1054348″·T²) / 3600
//   T = Julian centuries (TT) from J2000.0; 5028.796195″ and 1.1054348″ are the IAU 2006 general
//   precession in longitude. 23.857092° is the Lahiri value at J2000 (= 23°51′25.5″); carried back
//   to 1956-03-21 it gives 23.24555°, matching the Indian Ephemeris definition (23°15′00.66″ − nutation).
// Because astronomy-engine's longitudes include nutation (true equinox), we subtract the TRUE
// ayanamsa = mean ayanamsa + nutation in longitude (Δψ). That is how Swiss-Ephemeris-based
// programs (Jagannatha Hora, Drik Panchang) apply Lahiri; leaving Δψ out shifts everything by up
// to ±17″. (sky.ts, which only draws the home-page sky, leaves it out; the difference is invisible there.)

import {
  Body,
  Ecliptic,
  EclipticGeoMoon,
  GeoMoonState,
  GeoVector,
  MakeTime,
  RotateVector,
  Rotation_EQJ_ECT,
  SiderealTime,
  SunPosition,
  e_tilt,
  Vector,
  type AstroTime,
} from "astronomy-engine";
import type { GrahaKey } from "./constants.ts";

export const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Years we treat as fully reliable (the chart reviewer's range). test/astro.test.ts checks positions
 * against JPL for 1950–2040 and the ayanamsa for 1900–2050; the planets (VSOP87) stay good for
 * millennia, but ΔT — the Earth-rotation correction that fixes the lagna and the Moon for a clock
 * time — is known from telescope records only since the 1600s and is pure extrapolation for the far
 * future. Results outside the range carry outsideTestedRange: true and the website shows a warning.
 */
export const TESTED_YEARS = { from: 1700, to: 2200 } as const;
/** `date` is "YYYY-MM-DD". */
export const outsideTestedRange = (date: string) => {
  const year = Number(date.slice(0, 4));
  return year < TESTED_YEARS.from || year > TESTED_YEARS.to;
};

const RAD = Math.PI / 180;

/** Julian centuries of Terrestrial Time since J2000.0. */
const centuriesTT = (t: AstroTime) => t.tt / 36525;

/** Mean Lahiri ayanamsa (degrees), without nutation. */
export function meanLahiri(t: AstroTime): number {
  const T = centuriesTT(t);
  return 23.857092 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

/** True Lahiri ayanamsa (degrees): mean + nutation in longitude. Subtract from true-equinox longitudes. */
export function trueLahiri(t: AstroTime): number {
  return meanLahiri(t) + e_tilt(t).dpsi / 3600;
}

/** Mean longitude of the Moon's ascending node (Meeus, Astronomical Algorithms ch. 47), mean equinox of date. */
export function meanNodeTropical(t: AstroTime): number {
  const T = centuriesTT(t);
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}

/**
 * True (osculating) node: where the Moon's instantaneous orbital plane crosses the ecliptic of
 * date. n = ẑ × (r × v) in true-ecliptic coordinates.
 */
export function trueNodeTropical(t: AstroTime): number {
  const s = GeoMoonState(t);
  const rot = Rotation_EQJ_ECT(t);
  const r = RotateVector(rot, new Vector(s.x, s.y, s.z, t));
  const v = RotateVector(rot, new Vector(s.vx, s.vy, s.vz, t));
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  return norm360(Math.atan2(hx, -hy) / RAD);
}

export type NodeKind = "mean" | "true";

const PLANET_BODY = { mars: Body.Mars, mercury: Body.Mercury, jupiter: Body.Jupiter, venus: Body.Venus, saturn: Body.Saturn } as const;

/** Tropical (true equinox of date) apparent geocentric longitude and latitude of a graha. */
function tropical(key: GrahaKey, t: AstroTime, node: NodeKind): { lon: number; lat: number } {
  switch (key) {
    case "sun": {
      const s = SunPosition(t);
      return { lon: s.elon, lat: s.elat };
    }
    case "moon": {
      const m = EclipticGeoMoon(t);
      return { lon: m.lon, lat: m.lat };
    }
    case "rahu":
    case "ketu": {
      // The mean node is referred to the mean equinox; add Δψ to put it on the true equinox like the rest.
      const rahu = node === "true" ? trueNodeTropical(t) : meanNodeTropical(t) + e_tilt(t).dpsi / 3600;
      return { lon: norm360(key === "rahu" ? rahu : rahu + 180), lat: 0 };
    }
    default: {
      const e = Ecliptic(GeoVector(PLANET_BODY[key], t, true));
      return { lon: e.elon, lat: e.elat };
    }
  }
}

export interface GrahaPosition {
  key: GrahaKey;
  /** Sidereal longitude 0–360° (0 = start of Mesha). */
  longitude: number;
  /** Ecliptic latitude, degrees. */
  latitude: number;
  /** Degrees per day (sidereal; negative = retrograde). */
  speed: number;
  retrograde: boolean;
}

/** Sidereal longitude of one graha at an instant. */
export function siderealLongitude(key: GrahaKey, t: AstroTime, node: NodeKind = "mean"): number {
  return norm360(tropical(key, t, node).lon - trueLahiri(t));
}

/** Signed shortest difference b − a in degrees, −180…180. */
export const angleDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** Every graha's sidereal position, speed and retrograde flag at an instant. */
export function grahaPositions(date: Date, node: NodeKind = "mean"): GrahaPosition[] {
  const t = MakeTime(date);
  const before = t.AddDays(-0.5);
  const after = t.AddDays(0.5);
  const keys: GrahaKey[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
  return keys.map((key) => {
    const now = tropical(key, t, node);
    const longitude = norm360(now.lon - trueLahiri(t));
    const speed = angleDiff(siderealLongitude(key, before, node), siderealLongitude(key, after, node));
    // The mean nodes always move backwards; the true node wobbles but is conventionally retrograde too.
    const retrograde = key === "rahu" || key === "ketu" ? true : speed < 0;
    return { key, longitude, latitude: now.lat, speed, retrograde };
  });
}

export interface Angles {
  /** Sidereal ascendant (lagna), degrees. */
  ascendant: number;
  /** Sidereal midheaven (MC), degrees. */
  midheaven: number;
  /** Local apparent sidereal time, degrees (RAMC). */
  ramc: number;
  /** True obliquity of the ecliptic, degrees. */
  obliquity: number;
  ayanamsa: number;
}

/**
 * Ascendant and MC for an instant and place. RAMC = Greenwich apparent sidereal time + east
 * longitude; with the true obliquity ε and geographic latitude φ:
 *   ASC = atan2(cos RAMC, −(sin RAMC·cos ε + tan φ·sin ε))
 *   MC  = atan2(sin RAMC, cos RAMC·cos ε)
 * Both tropical (true equinox) → sidereal by subtracting the true Lahiri ayanamsa.
 */
export function angles(date: Date, latitude: number, longitude: number): Angles {
  const t = MakeTime(date);
  const ramc = norm360(SiderealTime(t) * 15 + longitude);
  const eps = e_tilt(t).tobl * RAD;
  const th = ramc * RAD;
  const phi = latitude * RAD;
  const asc = norm360(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / RAD);
  const mc = norm360(Math.atan2(Math.sin(th), Math.cos(th) * Math.cos(eps)) / RAD);
  const ayanamsa = trueLahiri(t);
  return { ascendant: norm360(asc - ayanamsa), midheaven: norm360(mc - ayanamsa), ramc, obliquity: eps / RAD, ayanamsa };
}

/**
 * Sripati bhavas: the four angles (ASC, IC, DSC, MC) are bhava madhyas 1, 4, 7, 10; each quadrant
 * is trisected for the madhyas between (as Porphyry), and each bhava begins at the sandhi halfway
 * between its madhya and the previous one.
 */
export function sripatiBhavas(ascendant: number, midheaven: number): { madhya: number[]; sandhi: number[] } {
  const ic = norm360(midheaven + 180);
  const dsc = norm360(ascendant + 180);
  const quads: [number, number][] = [
    [ascendant, ic],
    [ic, dsc],
    [dsc, midheaven],
    [midheaven, ascendant],
  ];
  const madhya: number[] = [];
  for (const [from, to] of quads) {
    const span = norm360(to - from);
    for (let i = 0; i < 3; i++) madhya.push(norm360(from + (span * i) / 3));
  }
  const sandhi = madhya.map((m, i) => {
    const prev = madhya[(i + 11) % 12]!;
    return norm360(prev + norm360(m - prev) / 2);
  });
  return { madhya, sandhi };
}

/** Which Sripati bhava (1–12) holds a longitude. */
export function bhavaOf(longitude: number, sandhi: number[]): number {
  for (let i = 0; i < 12; i++) {
    const start = sandhi[i]!;
    const end = sandhi[(i + 1) % 12]!;
    if (norm360(longitude - start) < norm360(end - start)) return i + 1;
  }
  return 1;
}

/**
 * Finds when a steadily increasing angle function crosses `target` (degrees) after `start`,
 * searching up to `maxDays`. `f` must move forward (mod 360) over the window, like the Moon's
 * longitude or the Moon–Sun elongation. Bisection to about a second.
 */
export function findCrossing(f: (d: Date) => number, target: number, start: Date, maxDays: number): Date | null {
  const step = 0.25 * 86_400_000;
  const end = start.getTime() + maxDays * 86_400_000;
  let a = start.getTime();
  let fa = angleDiff(target, f(new Date(a)));
  while (a < end) {
    const b = Math.min(a + step, end);
    const fb = angleDiff(target, f(new Date(b)));
    if (fa < 0 && fb >= 0) {
      let lo = a;
      let hi = b;
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2;
        if (angleDiff(target, f(new Date(mid))) < 0) lo = mid;
        else hi = mid;
      }
      return new Date(hi);
    }
    a = b;
    fa = fb;
  }
  return null;
}
