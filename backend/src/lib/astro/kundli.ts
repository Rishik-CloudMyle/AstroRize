// A Vedic birth chart (Kundli): grahas with rashi, house, nakshatra and navamsa; the lagna;
// whole-sign houses (the Vedic default) and Sripati bhavas (Bhava Chalit); the Parashari divisional
// charts D1–D60 (vargas.ts); Vimshottari and Yogini dashas; the panchang and avakhada at birth;
// graha dignity and combustion; Mangal dosha and Kalsarpa.

import { GRAHA_NAMES, NAKSHATRAS, RASHIS, RASHI_LORD, nakshatraLord, type GrahaKey } from "./constants.ts";
import { vimshottari, type DashaPeriod } from "./dasha.ts";
import { angles, bhavaOf, grahaPositions, norm360, outsideTestedRange, sripatiBhavas, type NodeKind } from "./ephemeris.ts";
import { offsetLabel, zonedToUtc } from "./time.ts";
import { bhavaChalit, computeVargas, type BhavaChalit, type Vargas } from "./vargas.ts";
import { avakhada, type Avakhada } from "./avakhada.ts";
import { dignityOf, isCombust, type Dignity } from "./dignity.ts";
import { kalsarpa, type Kalsarpa } from "./doshas.ts";
import { mangalDosha, type MangalDosha } from "./matchmaking.ts";
import { birthPanchang, type BirthPanchang } from "./panchang.ts";
import { yoginiDasha, type YoginiDasha } from "./yogini.ts";
import { computeAshtakavarga, type Ashtakavarga } from "./ashtakvarga.ts";
import { computeKp, type KpChart } from "./kp.ts";
import { computeShadbala, type Shadbala } from "./shadbala.ts";

const NAK_SPAN = 360 / 27;

export interface BirthInput {
  /** "YYYY-MM-DD", the local calendar date at the birthplace. */
  date: string;
  /** "HH:MM" or "HH:MM:SS", local clock time at the birthplace (24-hour). */
  time: string;
  latitude: number;
  longitude: number;
  /** IANA time zone of the birthplace, e.g. "Asia/Kolkata". */
  timezone: string;
  /** Lunar node: "mean" (default, most Indian almanacs) or "true". */
  node?: NodeKind;
}

export interface SignInfo {
  /** 0 = Aries … 11 = Pisces. */
  index: number;
  name: string;
  sanskrit: string;
  lord: GrahaKey;
}

export interface NakshatraInfo {
  /** 0 = Ashwini … 26 = Revati. */
  index: number;
  name: string;
  /** 1–4. */
  pada: number;
  lord: GrahaKey;
}

/** Everything about one point (a graha or the lagna) in the zodiac. */
export interface ZodiacPoint {
  longitude: number;
  sign: SignInfo;
  /** Degrees within the sign, 0–30. */
  degree: number;
  /** "12°14′05″" */
  dms: string;
  nakshatra: NakshatraInfo;
  /** Navamsa (D9) sign. */
  navamsa: SignInfo;
}

export interface KundliGraha extends ZodiacPoint {
  key: GrahaKey;
  name: string;
  sanskrit: string;
  abbr: string;
  /** Whole-sign house from the lagna, 1–12. */
  house: number;
  /** Sripati bhava, 1–12. */
  bhava: number;
  speed: number;
  retrograde: boolean;
  /** Within the classical orb of the Sun (dignity.ts); null for the Sun, Rahu and Ketu. */
  combust: boolean | null;
  /** Exalted … debilitated (dignity.ts); null for Rahu and Ketu. */
  dignity: Dignity | null;
}

export interface Kundli {
  birth: {
    date: string;
    time: string;
    timezone: string;
    utcOffset: string;
    utc: string;
    latitude: number;
    longitude: number;
    /** "gap" / "ambiguous" when the clock time fell in a DST change (see time.ts). */
    timeNote: "ok" | "gap" | "ambiguous";
  };
  settings: { zodiac: "sidereal"; ayanamsa: "Lahiri (Chitrapaksha)"; ayanamsaDegrees: number; houses: "whole-sign"; node: NodeKind };
  lagna: ZodiacPoint;
  grahas: KundliGraha[];
  /** Whole-sign houses: house n holds sign (lagna + n − 1). */
  houses: { house: number; sign: SignInfo; grahas: GrahaKey[] }[];
  /** Navamsa chart: the D9 lagna sign and which grahas fall in each D9 sign. */
  navamsa: { lagna: SignInfo; houses: { house: number; sign: SignInfo; grahas: GrahaKey[] }[] };
  bhavas: { madhya: number[]; sandhi: number[] };
  /** Bhava Chalit: grahas by Sripati bhava (a separate view from the whole-sign Rashi chart). */
  bhavaChalit: BhavaChalit;
  /** Parashari divisional charts D1…D60 (signs as 0–11). Charts saved before these existed get them filled in from the stored longitudes. */
  vargas: Vargas;
  /** The birth date is outside 1700–2200, where the ephemeris is less certain (see ephemeris.ts). */
  outsideTestedRange: boolean;
  moonSign: SignInfo;
  sunSign: SignInfo;
  birthNakshatra: NakshatraInfo;
  dasha: { balance: { lord: GrahaKey; years: number; months: number; days: number }; mahadashas: DashaPeriod[] };
  /** Tithi, vara, nakshatra, yoga and karana at the birth moment, with that day's sunrise and sunset. */
  birthPanchang: BirthPanchang;
  avakhada: Avakhada;
  yogini: YoginiDasha;
  doshas: { manglik: MangalDosha; kalsarpa: Kalsarpa };
  /** Bhinnashtakavarga of the seven grahas and the Sarvashtakavarga (ashtakvarga.ts). */
  ashtakavarga: Ashtakavarga;
  /** KP: Placidus cusps, star/sub lords, ruling planets at birth (kp.ts). */
  kp: KpChart;
  /** Six-fold strength of the seven grahas (shadbala.ts). */
  shadbala: Shadbala;
}

export function signInfo(index: number): SignInfo {
  const i = ((index % 12) + 12) % 12;
  return { index: i, name: RASHIS[i]!.en, sanskrit: RASHIS[i]!.sa, lord: RASHI_LORD[i]! };
}

export function nakshatraInfo(longitude: number): NakshatraInfo {
  const lon = norm360(longitude);
  const index = Math.min(26, Math.floor(lon / NAK_SPAN));
  const pada = Math.min(4, Math.floor((lon - index * NAK_SPAN) / (NAK_SPAN / 4)) + 1);
  return { index, name: NAKSHATRAS[index]!, pada, lord: nakshatraLord(index) };
}

/** D9: each sign is split into nine parts of 3°20′, counted continuously from Aries. */
export const navamsaSign = (longitude: number) => Math.floor((norm360(longitude) * 9) / 30) % 12;

export function dms(degreesInSign: number): string {
  let totalSec = Math.floor(degreesInSign * 3600 + 1e-6);
  const d = Math.floor(totalSec / 3600);
  totalSec -= d * 3600;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}

export function zodiacPoint(longitude: number): ZodiacPoint {
  const lon = norm360(longitude);
  const sign = Math.floor(lon / 30);
  const degree = lon - sign * 30;
  return { longitude: lon, sign: signInfo(sign), degree, dms: dms(degree), nakshatra: nakshatraInfo(lon), navamsa: signInfo(navamsaSign(lon)) };
}

export function buildKundli(input: BirthInput): Kundli {
  const node = input.node ?? "mean";
  const z = zonedToUtc(input.date, input.time, input.timezone);
  const ang = angles(z.utc, input.latitude, input.longitude);
  const lagna = zodiacPoint(ang.ascendant);
  const bhavas = sripatiBhavas(ang.ascendant, ang.midheaven);

  const grahas: KundliGraha[] = grahaPositions(z.utc, node).map((p) => {
    const point = zodiacPoint(p.longitude);
    const names = GRAHA_NAMES[p.key];
    return {
      key: p.key,
      name: names.en,
      sanskrit: names.sa,
      abbr: names.abbr,
      ...point,
      house: ((point.sign.index - lagna.sign.index + 12) % 12) + 1,
      bhava: bhavaOf(p.longitude, bhavas.sandhi),
      speed: p.speed,
      retrograde: p.retrograde,
      combust: null,
      dignity: null,
    };
  });
  withCondition(grahas);

  const houses = Array.from({ length: 12 }, (_, i) => {
    const sign = signInfo(lagna.sign.index + i);
    return { house: i + 1, sign, grahas: grahas.filter((g) => g.sign.index === sign.index).map((g) => g.key) };
  });
  const d9Lagna = lagna.navamsa;
  const d9Houses = Array.from({ length: 12 }, (_, i) => {
    const sign = signInfo(d9Lagna.index + i);
    return { house: i + 1, sign, grahas: grahas.filter((g) => g.navamsa.index === sign.index).map((g) => g.key) };
  });

  const moon = grahas.find((g) => g.key === "moon")!;
  const sun = grahas.find((g) => g.key === "sun")!;
  const dasha = vimshottari(moon.longitude, z.utc);

  return {
    birth: {
      date: input.date,
      time: input.time,
      timezone: input.timezone,
      utcOffset: offsetLabel(z.offsetSeconds),
      utc: z.utc.toISOString(),
      latitude: input.latitude,
      longitude: input.longitude,
      timeNote: z.status,
    },
    settings: { zodiac: "sidereal", ayanamsa: "Lahiri (Chitrapaksha)", ayanamsaDegrees: ang.ayanamsa, houses: "whole-sign", node },
    lagna,
    grahas,
    houses,
    navamsa: { lagna: d9Lagna, houses: d9Houses },
    bhavas,
    bhavaChalit: bhavaChalit(bhavas, grahas),
    vargas: computeVargas(lagna.longitude, grahas),
    outsideTestedRange: outsideTestedRange(input.date),
    moonSign: moon.sign,
    sunSign: sun.sign,
    birthNakshatra: moon.nakshatra,
    dasha,
    ...birthExtras({ birth: { date: input.date, utc: z.utc.toISOString(), latitude: input.latitude, longitude: input.longitude, timezone: input.timezone }, lagna, grahas }),
    ashtakavarga: computeAshtakavarga(lagna.sign.index, grahas),
    kp: computeKp({ utc: z.utc.toISOString(), latitude: input.latitude, longitude: input.longitude, timezone: input.timezone }, grahas),
    shadbala: computeShadbala({ birth: { utc: z.utc.toISOString(), latitude: input.latitude, longitude: input.longitude, timezone: input.timezone }, lagnaLongitude: lagna.longitude, madhya: bhavas.madhya, grahas }),
  };
}

/** Sets each graha's combustion and dignity from its longitude (mutates and returns the list). */
function withCondition<T extends { key: GrahaKey; longitude: number; retrograde: boolean; combust?: boolean | null; dignity?: Dignity | null }>(grahas: T[]): T[] {
  const sun = grahas.find((g) => g.key === "sun")!;
  for (const g of grahas) {
    g.combust = isCombust(g.key, g.longitude, sun.longitude, g.retrograde);
    g.dignity = dignityOf(g.key, g.longitude);
  }
  return grahas;
}

type ExtrasSource = Pick<Kundli, "lagna"> & {
  birth: { date: string; utc: string; latitude: number; longitude: number; timezone: string };
  grahas: { key: GrahaKey; longitude: number; house: number }[];
};

/** Everything worked out from the stored birth data, lagna and graha longitudes (no new positions needed). */
function birthExtras(k: ExtrasSource): Pick<Kundli, "birthPanchang" | "avakhada" | "yogini" | "doshas"> {
  const lon = (key: GrahaKey) => k.grahas.find((g) => g.key === key)!.longitude;
  const utc = new Date(k.birth.utc);
  return {
    birthPanchang: birthPanchang(k.birth.date, utc, k.birth.latitude, k.birth.longitude, k.birth.timezone),
    avakhada: avakhada(lon("moon"), k.lagna.sign.index),
    yogini: yoginiDasha(lon("moon"), utc),
    doshas: {
      manglik: mangalDosha(lon("mars"), lon("moon"), k.lagna.longitude, lon("jupiter")),
      kalsarpa: kalsarpa(k.grahas),
    },
  };
}

/**
 * A saved chart brought up to date: charts saved before a feature existed lack its fields, so they
 * are worked out here from the stored longitudes and birth data. The stored row is never rewritten.
 */
export function completeKundli(stored: Kundli): Kundli {
  const grahasDone = stored.grahas.every((g) => g.dignity !== undefined && g.combust !== undefined);
  const vargasDone = stored.vargas !== undefined && stored.vargas.D1.lagnaDegree !== undefined;
  const extrasDone = stored.birthPanchang && stored.avakhada && stored.yogini && stored.doshas;
  if (grahasDone && vargasDone && extrasDone && stored.bhavaChalit && stored.outsideTestedRange !== undefined) return stored;
  const grahas = grahasDone ? stored.grahas : withCondition(stored.grahas.map((g) => ({ ...g })));
  return {
    ...stored,
    grahas,
    vargas: vargasDone ? stored.vargas : computeVargas(stored.lagna.longitude, grahas),
    bhavaChalit: stored.bhavaChalit ?? bhavaChalit(stored.bhavas, grahas),
    outsideTestedRange: stored.outsideTestedRange ?? outsideTestedRange(stored.birth.date),
    ...(extrasDone ? {} : birthExtras({ birth: stored.birth, lagna: stored.lagna, grahas })),
  };
}
