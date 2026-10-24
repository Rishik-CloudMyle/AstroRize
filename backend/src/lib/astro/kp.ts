// KP (Krishnamurti Paddhati): Placidus house cusps, star lords, sub lords and sub-sub lords of the
// cusps and grahas, the Placidus bhava of each graha, and the ruling planets. Pure functions.
//
// Ayanamsa (client decision): KP here uses our true Lahiri (Chitrapaksha) ayanamsa, the same as the
// rest of the Kundli, so a graha's sign and nakshatra agree across every view. Classic KP uses the
// Krishnamurti ayanamsa, about 6′ smaller than Lahiri, which can move a point lying within 6′ of a
// sub boundary into the neighbouring sub. Switching would be a one-line change below.
//
// Placidus (tropical, then made sidereal by subtracting the ayanamsa). A Placidus cusp is the ecliptic
// point whose hour angle is a fixed fraction of its own semi-arc: cusps 11 and 12 lie 1/3 and 2/3 of
// the diurnal semi-arc east of the meridian; cusps 2 and 3 lie 1/3 and 2/3 of the nocturnal semi-arc
// past the eastern horizon. With RAMC, obliquity ε and latitude φ, for a point of declination δ:
//   DSA = 90° + asin(tan φ · tan δ)   (diurnal semi-arc),   NSA = 180° − DSA
//   cusp 11: RA = RAMC + DSA/3        cusp 12: RA = RAMC + 2·DSA/3
//   cusp 2:  RA = RAMC + DSA + NSA/3  cusp 3:  RA = RAMC + DSA + 2·NSA/3
// and the ecliptic longitude with that RA is λ = atan2(sin RA, cos RA · cos ε), δ = asin(sin ε · sin λ).
// δ depends on λ, so this is iterated to convergence (Meeus-style fixed point; ~10 steps). Cusp 1 = ASC,
// 10 = MC, and 4–9 are the opposite points. Verified in test/astro.test.ts against Astrotheme's
// published Placidus cusps for Barack Obama and by the semi-arc property itself.
//
// Placidus is undefined where some ecliptic points never rise or set (|φ| beyond about 66°33′): there
// the iteration has no solution. We then fall back to Porphyry (each quadrant between the angles
// trisected — the same madhyas as our Sripati bhavas) and say so with `fallback`.
//
// Sub lords: each nakshatra (13°20′) is divided into nine subs in Vimshottari order starting from the
// nakshatra's own lord, each sub's length proportional to its lord's dasha years (years/120 × 13°20′).
// Sub-subs divide each sub the same way, starting from the sub lord.

import { DASHA_ORDER, DASHA_YEARS, RASHI_LORD, type GrahaKey } from "./constants.ts";
import { dayFrame } from "./dayframe.ts";
import { angles, bhavaOf, grahaPositions, norm360, type NodeKind } from "./ephemeris.ts";

const RAD = Math.PI / 180;
const NAK_SPAN = 360 / 27;
const EPS = 1e-9;

export interface KpLords {
  /** Sidereal longitude, degrees. */
  longitude: number;
  sign: number;
  signLord: GrahaKey;
  /** Nakshatra index 0–26. */
  star: number;
  starLord: GrahaKey;
  subLord: GrahaKey;
  subSubLord: GrahaKey;
}

/** The sign, star, sub and sub-sub lords of a sidereal longitude. */
export function kpLords(longitude: number): KpLords {
  const lon = norm360(longitude);
  const sign = Math.min(11, Math.floor(lon / 30 + EPS));
  const star = Math.min(26, Math.floor(lon / NAK_SPAN + EPS));
  const starLord = DASHA_ORDER[star % 9]!;
  const [subLord, subStart, subSpan] = divide(starLord, star * NAK_SPAN, NAK_SPAN, lon);
  const [subSubLord] = divide(subLord, subStart, subSpan, lon);
  return { longitude: lon, sign, signLord: RASHI_LORD[sign]!, star, starLord, subLord, subSubLord };
}

/** Splits [start, start+span) in Vimshottari proportions from `first`; returns the part holding lon. */
function divide(first: GrahaKey, start: number, span: number, lon: number): [GrahaKey, number, number] {
  const i0 = DASHA_ORDER.indexOf(first);
  const offset = norm360(lon - start);
  let edge = 0;
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(i0 + i) % 9]!;
    const len = (span * DASHA_YEARS[lord]) / 120;
    if (offset + EPS < edge + len || i === 8) return [lord, start + edge, len];
    edge += len;
  }
  throw new Error("unreachable");
}

/** The nine sub boundaries of a nakshatra (start longitudes, then the end), for tests and tables. */
export function subBoundaries(nakshatra: number): { lord: GrahaKey; start: number; end: number }[] {
  const lord0 = DASHA_ORDER[nakshatra % 9]!;
  const i0 = DASHA_ORDER.indexOf(lord0);
  let s = nakshatra * NAK_SPAN;
  return Array.from({ length: 9 }, (_, i) => {
    const lord = DASHA_ORDER[(i0 + i) % 9]!;
    const len = (NAK_SPAN * DASHA_YEARS[lord]) / 120;
    const out = { lord, start: s, end: s + len };
    s += len;
    return out;
  });
}

/** RA (degrees) of the ecliptic point λ (latitude 0) → its longitude, and declination of λ. */
const lonFromRa = (ra: number, eps: number) => norm360(Math.atan2(Math.sin(ra * RAD), Math.cos(ra * RAD) * Math.cos(eps * RAD)) / RAD);
const decOf = (lon: number, eps: number) => Math.asin(Math.sin(eps * RAD) * Math.sin(lon * RAD)) / RAD;
export const raOf = (lon: number, eps: number) => norm360(Math.atan2(Math.sin(lon * RAD) * Math.cos(eps * RAD), Math.cos(lon * RAD)) / RAD);

/** Diurnal semi-arc (degrees) of declination δ at latitude φ, or null if it never rises/sets. */
export function diurnalSemiArc(dec: number, lat: number): number | null {
  const x = Math.tan(lat * RAD) * Math.tan(dec * RAD);
  if (!(Math.abs(x) <= 1)) return null;
  return 90 + Math.asin(x) / RAD;
}

/**
 * Tropical Placidus cusps 1–12 (index 0 = cusp 1) for RAMC, true obliquity and latitude, or null where
 * Placidus has no solution. `asc` and `mc` are the tropical ascendant and midheaven.
 */
export function placidusTropical(ramc: number, eps: number, lat: number, asc: number, mc: number): number[] | null {
  const solve = (cusp: 11 | 12 | 2 | 3): number | null => {
    const f = cusp === 11 || cusp === 2 ? 1 / 3 : 2 / 3;
    const below = cusp === 2 || cusp === 3;
    let lon = lonFromRa(ramc + (below ? 90 + 90 * f : 90 * f), eps);
    for (let i = 0; i < 100; i++) {
      const dsa = diurnalSemiArc(decOf(lon, eps), lat);
      if (dsa === null) return null;
      const ra = below ? ramc + dsa + (180 - dsa) * f : ramc + dsa * f;
      const next = lonFromRa(ra, eps);
      const diff = Math.abs(((next - lon + 540) % 360) - 180);
      lon = next;
      if (diff < 1e-10) return lon;
    }
    return null;
  };
  const c11 = solve(11);
  const c12 = solve(12);
  const c2 = solve(2);
  const c3 = solve(3);
  if (c11 === null || c12 === null || c2 === null || c3 === null) return null;
  const cusps = [asc, c2, c3, mc + 180, c11 + 180, c12 + 180, asc + 180, c2 + 180, c3 + 180, mc, c11, c12].map(norm360);
  // The cusps must run in zodiacal order all the way round (sum of the gaps = 360°).
  let total = 0;
  for (let i = 0; i < 12; i++) total += norm360(cusps[(i + 1) % 12]! - cusps[i]!);
  return Math.abs(total - 360) < 1e-6 ? cusps : null;
}

export type RulingKey = "lagnaSignLord" | "lagnaStarLord" | "lagnaSubLord" | "moonSignLord" | "moonStarLord" | "moonSubLord" | "dayLord";

export interface RulingPlanets {
  at: string;
  lagnaSignLord: GrahaKey;
  lagnaStarLord: GrahaKey;
  lagnaSubLord: GrahaKey;
  moonSignLord: GrahaKey;
  moonStarLord: GrahaKey;
  moonSubLord: GrahaKey;
  /** Lord of the Vedic weekday (sunrise to sunrise) at the place. */
  dayLord: GrahaKey;
}

export interface KpChart {
  /** "KP with Lahiri ayanamsa" — see the note at the top of kp.ts. */
  ayanamsa: "Lahiri (Chitrapaksha)";
  ayanamsaDegrees: number;
  houseSystem: "Placidus" | "Porphyry";
  /** Placidus has no solution at this latitude; Porphyry cusps were used instead. */
  fallback: boolean;
  /** Cusps 1–12: sidereal longitude and lords. */
  cusps: (KpLords & { cusp: number })[];
  /** The nine grahas with their lords and the Placidus bhava (cusp n to cusp n+1) they fall in. */
  grahas: (KpLords & { key: GrahaKey; retrograde: boolean; bhava: number })[];
  /** Ruling planets at the birth moment and place. */
  rulingPlanets: RulingPlanets;
}

/** Sidereal Placidus cusps (or the Porphyry fallback) for an instant and place. */
export function kpCusps(utc: Date, latitude: number, longitude: number): { cusps: number[]; fallback: boolean; ayanamsa: number } {
  const a = angles(utc, latitude, longitude);
  const trop = placidusTropical(a.ramc, a.obliquity, latitude, a.ascendant + a.ayanamsa, a.midheaven + a.ayanamsa);
  if (trop) return { cusps: trop.map((c) => norm360(c - a.ayanamsa)), fallback: false, ayanamsa: a.ayanamsa };
  // Porphyry: trisect each quadrant between the (sidereal) angles.
  const asc = a.ascendant;
  const mc = a.midheaven;
  const ic = norm360(mc + 180);
  const dsc = norm360(asc + 180);
  const out: number[] = [];
  for (const [from, to] of [[asc, ic], [ic, dsc], [dsc, mc], [mc, asc]] as const) {
    const span = norm360(to - from);
    for (let i = 0; i < 3; i++) out.push(norm360(from + (span * i) / 3));
  }
  return { cusps: out, fallback: true, ayanamsa: a.ayanamsa };
}

/** KP ruling planets for any moment and place (the birth moment, or "now" for a question). */
export function kpRulingPlanets(at: Date, latitude: number, longitude: number, timezone: string, node: NodeKind = "mean"): RulingPlanets {
  const asc = kpLords(angles(at, latitude, longitude).ascendant);
  const moon = kpLords(grahaPositions(at, node).find((g) => g.key === "moon")!.longitude);
  return rulingFrom(at, asc, moon, dayFrame(at, latitude, longitude, timezone).dayLord);
}

function rulingFrom(at: Date, asc: KpLords, moon: KpLords, dayLord: GrahaKey): RulingPlanets {
  return {
    at: at.toISOString(),
    lagnaSignLord: asc.signLord,
    lagnaStarLord: asc.starLord,
    lagnaSubLord: asc.subLord,
    moonSignLord: moon.signLord,
    moonStarLord: moon.starLord,
    moonSubLord: moon.subLord,
    dayLord,
  };
}

/**
 * The KP chart from a Kundli's birth instant/place and its graha longitudes (as stored, so a saved
 * chart gives the same grahas as its other views). The cusps are recomputed from the instant.
 */
export function computeKp(
  birth: { utc: string; latitude: number; longitude: number; timezone: string },
  grahas: { key: GrahaKey; longitude: number; retrograde: boolean }[],
): KpChart {
  const utc = new Date(birth.utc);
  const { cusps, fallback, ayanamsa } = kpCusps(utc, birth.latitude, birth.longitude);
  const cuspRows = cusps.map((c, i) => ({ cusp: i + 1, ...kpLords(c) }));
  const grahaRows = grahas.map((g) => ({ key: g.key, retrograde: g.retrograde, ...kpLords(g.longitude), bhava: bhavaOf(g.longitude, cusps) }));
  const moon = grahaRows.find((g) => g.key === "moon")!;
  return {
    ayanamsa: "Lahiri (Chitrapaksha)",
    ayanamsaDegrees: ayanamsa,
    houseSystem: fallback ? "Porphyry" : "Placidus",
    fallback,
    cusps: cuspRows,
    grahas: grahaRows,
    rulingPlanets: rulingFrom(utc, cuspRows[0]!, moon, dayFrame(utc, birth.latitude, birth.longitude, birth.timezone).dayLord),
  };
}
