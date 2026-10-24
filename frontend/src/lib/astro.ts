"use client";

import { api } from "./api/client";
import { readResponse } from "./api/errors";

// Browser client for Astrorize's astrology engine (/api/astro on the Node API). The shapes
// below mirror backend/src/lib/astro/* (kundli.ts, panchang.ts, matchmaking.ts, horoscope.ts).

export type GrahaKey = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn" | "rahu" | "ketu";

export interface SignInfo {
  /** 0 = Aries … 11 = Pisces. */
  index: number;
  name: string;
  sanskrit: string;
  lord: GrahaKey;
}

export interface NakshatraInfo {
  index: number;
  name: string;
  pada: number;
  lord: GrahaKey;
}

/** An instant: ISO UTC plus the local date and "HH:MM" time at the place. */
export interface Stamp {
  iso: string;
  date: string;
  time: string;
}

// ── Places ──

export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Places found before, for suggestions while typing (never asks OpenStreetMap). */
export function suggestPlaces(q: string) {
  return api.get<{ places: Place[] }>(`/astro/places/suggest?q=${encodeURIComponent(q)}`);
}

/** A submitted search (cache, then OpenStreetMap once). Only on an explicit Search / Enter. */
export function searchPlaces(q: string) {
  return api.get<{ places: Place[]; attribution: string }>(`/astro/places?q=${encodeURIComponent(q)}`);
}

// ── Kundli ──

export interface ZodiacPoint {
  longitude: number;
  sign: SignInfo;
  degree: number;
  /** "12°14′05″" */
  dms: string;
  nakshatra: NakshatraInfo;
  navamsa: SignInfo;
}

export interface KundliGraha extends ZodiacPoint {
  key: GrahaKey;
  name: string;
  sanskrit: string;
  abbr: string;
  house: number;
  bhava: number;
  speed: number;
  retrograde: boolean;
  /** Within the classical orb of the Sun; null for the Sun, Rahu and Ketu. */
  combust: boolean | null;
  /** null for Rahu and Ketu (no agreed dignity). */
  dignity: Dignity | null;
}

export type Dignity = "exalted" | "moolatrikona" | "own" | "friend" | "neutral" | "enemy" | "debilitated";

export const DIGNITY_LABEL: Record<Dignity, string> = {
  exalted: "Exalted",
  moolatrikona: "Moolatrikona",
  own: "Own sign",
  friend: "Friendly sign",
  neutral: "Neutral sign",
  enemy: "Enemy sign",
  debilitated: "Debilitated",
};

export interface ChartHouse {
  house: number;
  sign: SignInfo;
  grahas: GrahaKey[];
}

export interface DashaPeriod {
  lord: GrahaKey;
  name: string;
  start: string;
  end: string;
  antardashas?: DashaPeriod[];
}

export const VARGA_CODES = ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"] as const;
export type VargaCode = (typeof VARGA_CODES)[number];

/** Names and one-line purposes of the Parashari divisional charts (mirrors backend lib/astro/vargas.ts). */
export const VARGA_INFO: Record<VargaCode, { name: string; purpose: string }> = {
  D1: { name: "Rashi", purpose: "the body and life as a whole" },
  D2: { name: "Hora", purpose: "wealth" },
  D3: { name: "Drekkana", purpose: "siblings and courage" },
  D4: { name: "Chaturthamsa", purpose: "home, property and fortune" },
  D7: { name: "Saptamsa", purpose: "children" },
  D9: { name: "Navamsa", purpose: "marriage and dharma" },
  D10: { name: "Dasamsa", purpose: "career and status" },
  D12: { name: "Dwadasamsa", purpose: "parents" },
  D16: { name: "Shodasamsa", purpose: "vehicles and comforts" },
  D20: { name: "Vimsamsa", purpose: "spiritual practice" },
  D24: { name: "Chaturvimsamsa", purpose: "learning and education" },
  D27: { name: "Bhamsa", purpose: "strengths and weaknesses" },
  D30: { name: "Trimsamsa", purpose: "misfortunes and health" },
  D40: { name: "Khavedamsa", purpose: "maternal legacy" },
  D45: { name: "Akshavedamsa", purpose: "paternal legacy and character" },
  D60: { name: "Shashtiamsa", purpose: "past karma; needs an exact birth time" },
};

export interface VargaChart {
  /** 0 = Aries … 11 = Pisces. */
  lagnaSign: number;
  houses: { house: number; sign: number; grahas: GrahaKey[] }[];
  /** Degree inside the varga sign ((degree × n) mod 30); null for D30 (unequal parts). */
  lagnaDegree: number | null;
  degrees: Partial<Record<GrahaKey, number | null>>;
}

export interface BirthPanchang {
  tithi: { index: number; name: string; paksha: "Shukla" | "Krishna"; number: number };
  /** Vedic weekday (sunrise to sunrise); `civil` is the calendar weekday. */
  vara: { index: number; name: string; sanskrit: string; lord: GrahaKey; civil: string; beforeSunrise: boolean };
  nakshatra: NakshatraInfo;
  yoga: { index: number; name: string };
  karana: { index: number; name: string };
  sunrise: Stamp | null;
  sunset: Stamp | null;
}

export interface Avakhada {
  varna: string;
  vashya: string;
  yoni: string;
  gana: string;
  nadi: string;
  moonSign: SignInfo;
  nakshatra: NakshatraInfo;
  charan: number;
  tatva: string;
  nameAlphabet: { latin: string; devanagari: string };
  paya: string;
  moonHouse: number;
  yunja: string;
}

export interface YoginiPeriod {
  name: string;
  lord: GrahaKey;
  years: number;
  start: string;
  end: string;
  antardashas?: YoginiPeriod[];
}

export interface MangalDosha {
  present: boolean;
  fromLagna: number | null;
  fromMoon: number;
  marsSign: SignInfo;
  cancellations: string[];
}

export interface Kalsarpa {
  status: "present" | "partial" | "absent";
  direction: "rahu-to-ketu" | "ketu-to-rahu" | null;
  type: string | null;
  rahuHouse: number;
  outside: GrahaKey[];
}

export type SaturnPhase = "rising" | "peak" | "setting" | "kantaka" | "ashtama";

export interface SadeSati {
  moonSign: number;
  at: string;
  saturnSign: number;
  current: { kind: "sade-sati" | "dhaiya"; phase: SaturnPhase; since: string; until: string } | null;
  periods: {
    kind: "sade-sati" | "dhaiya";
    start: string;
    end: string;
    openStart: boolean;
    openEnd: boolean;
    spans: { phase: SaturnPhase; sign: number; start: string; end: string; openStart: boolean; openEnd: boolean }[];
  }[];
  window: { from: string; to: string };
}

export interface TransitPlacement extends ZodiacPoint {
  key: GrahaKey;
  name: string;
  abbr: string;
  retrograde: boolean;
  houseFromLagna: number;
  houseFromMoon: number;
}

export interface KundliToday {
  at: string;
  transit: TransitPlacement[];
  sadeSati: SadeSati;
  yogini: { mahadasha: { name: string; lord: GrahaKey; start: string; end: string }; antardasha: { name: string; lord: GrahaKey; start: string; end: string } | null } | null;
}

export interface KundliReading {
  ascendant: { sign: string; text: string };
  planets: { key: GrahaKey; signTitle: string; bySign: string; houseTitle: string; byHouse: string }[];
  astrologerNote: string;
}

export interface BhavaChalit {
  system: "Sripati";
  houses: { house: number; madhya: number; start: number; grahas: GrahaKey[] }[];
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
    timeNote: "ok" | "gap" | "ambiguous";
  };
  settings: { zodiac: string; ayanamsa: string; ayanamsaDegrees: number; houses: string; node: "mean" | "true" };
  lagna: ZodiacPoint;
  grahas: KundliGraha[];
  houses: ChartHouse[];
  navamsa: { lagna: SignInfo; houses: ChartHouse[] };
  bhavas: { madhya: number[]; sandhi: number[] };
  bhavaChalit: BhavaChalit;
  vargas: Record<VargaCode, VargaChart>;
  /** Birth date outside 1700–2200: less certain. */
  outsideTestedRange: boolean;
  moonSign: SignInfo;
  sunSign: SignInfo;
  birthNakshatra: NakshatraInfo;
  dasha: { balance: { lord: GrahaKey; years: number; months: number; days: number }; mahadashas: DashaPeriod[] };
  birthPanchang: BirthPanchang;
  avakhada: Avakhada;
  yogini: { balance: { name: string; years: number; months: number; days: number }; mahadashas: YoginiPeriod[] };
  doshas: { manglik: MangalDosha; kalsarpa: Kalsarpa };
  /** Bhinnashtakavarga and Sarvashtakavarga (backend lib/astro/ashtakvarga.ts). */
  ashtakavarga: Ashtakavarga;
  /** KP: Placidus cusps, star/sub lords, ruling planets at birth (backend lib/astro/kp.ts). */
  kp: KpChart;
  /** Six-fold planetary strength (backend lib/astro/shadbala.ts). */
  shadbala: Shadbala;
}

export interface CurrentDasha {
  mahadasha: { lord: GrahaKey; name: string; start: string; end: string };
  antardasha: DashaPeriod | null;
}

export interface SavedChart {
  id: string;
  name: string;
  createdAt: string;
  engine: string;
  input: { name: string; date: string; time: string; node?: "mean" | "true"; place: { placeId: string | null; name: string; latitude: number; longitude: number; timezone: string } };
  kundli: Kundli;
  currentDasha: CurrentDasha | null;
  /** Worked out when the chart is read: today's transits, Sade Sati, running Yogini dasha. */
  today: KundliToday;
  reading: KundliReading;
}

export interface SavedChartSummary {
  id: string;
  name: string;
  createdAt: string;
  date: string;
  time: string;
  place: string;
  lagna: string;
  moonSign: string;
  nakshatra: string;
}

export function makeKundli(body: { name: string; date: string; time: string; place: { placeId: string }; node?: "mean" | "true" }) {
  return api.post<{ chart: SavedChart }>("/astro/kundli", body);
}

export function listKundlis() {
  return api.get<{ charts: SavedChartSummary[] }>("/astro/kundli");
}

export function getKundli(id: string) {
  return api.get<{ chart: SavedChart }>(`/astro/kundli/${encodeURIComponent(id)}`);
}

export async function deleteKundli(id: string) {
  const res = await fetch(`/api/astro/kundli/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  return readResponse<{ ok: true }>(res);
}

// ── Matchmaking ──

export interface Koota {
  key: string;
  name: string;
  max: number;
  points: number;
  about: string;
  boy: string;
  girl: string;
}

export interface MatchPersonResult {
  name: string;
  moonSign: SignInfo;
  nakshatra: NakshatraInfo;
  uncertain: boolean;
  /** No birth time given: 12:00 noon local time was used. */
  timeAssumed: boolean;
  outsideTestedRange: boolean;
  mangal: { present: boolean; fromLagna: number | null; fromMoon: number; marsSign: SignInfo; cancellations: string[] };
}

export interface Match {
  boy: MatchPersonResult;
  girl: MatchPersonResult;
  kootas: Koota[];
  total: number;
  max: 36;
  verdict: "excellent" | "good" | "below-threshold";
  notes: string[];
}

export interface MatchPersonInput {
  name: string;
  date: string;
  time?: string;
  place: { placeId: string };
}

export function matchCharts(boy: MatchPersonInput, girl: MatchPersonInput) {
  return api.post<{ id: string | null; match: Match; engine: string }>("/astro/matchmaking", { boy, girl });
}

// ── Panchang ──

export interface Limb {
  index: number;
  name: string;
  end: Stamp | null;
}

export interface Span {
  start: Stamp;
  end: Stamp;
}

export interface Panchang {
  date: string;
  timezone: string;
  utcOffset: string;
  latitude: number;
  longitude: number;
  vara: { index: number; name: string; sanskrit: string };
  sunrise: Stamp | null;
  sunset: Stamp | null;
  moonrise: Stamp | null;
  moonset: Stamp | null;
  tithi: (Limb & { paksha: "Shukla" | "Krishna"; number: number })[];
  nakshatra: (Limb & { pada: number })[];
  yoga: Limb[];
  karana: Limb[];
  paksha: "Shukla" | "Krishna";
  month: { amanta: string; purnimanta: string; adhika: boolean };
  sunSign: SignInfo;
  moonSign: SignInfo;
  rahuKaal: Span | null;
  yamaganda: Span | null;
  gulika: Span | null;
  abhijit: Span | null;
  outsideTestedRange: boolean;
  note?: string;
}

export interface PanchangPlace {
  placeId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export function getPanchang(date: string | null, placeId: string | null) {
  const q = new URLSearchParams();
  if (date) q.set("date", date);
  if (placeId) q.set("placeId", placeId);
  return api.get<{ place: PanchangPlace; defaultPlace: boolean; panchang: Panchang }>(`/astro/panchang?${q}`);
}

// ── Horoscope ──

export type Tone = "favourable" | "mixed" | "careful";

export interface Horoscope {
  sign: SignInfo;
  period: "daily" | "weekly";
  from: string;
  to: string;
  summary: string;
  details: string[];
  tone: Tone;
  basis: string;
  /** When the transit positions were read (ISO). */
  positionsAt: string;
  transits: { graha: GrahaKey; name: string; sign: SignInfo; house: number; retrograde: boolean }[];
  days?: { date: string; weekday: string; moonSign: SignInfo; house: number; theme: string; tone: Tone }[];
}

export function getHoroscope(sign: string, period: "daily" | "weekly") {
  return api.get<{ horoscope: Horoscope }>(`/astro/horoscope?sign=${encodeURIComponent(sign)}&period=${period}`);
}

// ── Shared names and formatting ──

/** The twelve rashis in order (index 0 = Aries), as the engine names them. */
export const RASHIS: readonly { en: string; sa: string }[] = [
  { en: "Aries", sa: "Mesha" },
  { en: "Taurus", sa: "Vrishabha" },
  { en: "Gemini", sa: "Mithuna" },
  { en: "Cancer", sa: "Karka" },
  { en: "Leo", sa: "Simha" },
  { en: "Virgo", sa: "Kanya" },
  { en: "Libra", sa: "Tula" },
  { en: "Scorpio", sa: "Vrishchika" },
  { en: "Sagittarius", sa: "Dhanu" },
  { en: "Capricorn", sa: "Makara" },
  { en: "Aquarius", sa: "Kumbha" },
  { en: "Pisces", sa: "Meena" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-10-16" → "16 Oct 2026" (a calendar date; no time zone involved). */
export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-16" → "Friday, 16 October 2026". */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "17:51" → "5:51 pm". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** A local time at the place; adds the date when it falls on another day than `day`. */
export function stampTime(s: Stamp, day: string): string {
  return s.date === day ? clock12(s.time) : `${clock12(s.time)}, ${shortDate(s.date)}`;
}

/** An ISO instant as a calendar date in a time zone ("16 Oct 2026"), for dasha periods. */
export function isoDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone });
}

/** 18.5214, 73.8545 → "18.52° N, 73.85° E". */
export function coords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;
}

/** Today's date ("YYYY-MM-DD") in a time zone. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Dates the API accepts; results outside 1700–2200 are flagged as less accurate (backend ephemeris.ts). */
export const MIN_DATE = "1600-01-01";
export const MAX_DATE = "2500-12-31";
export const DATE_LIMIT_MESSAGE = "Dates from 1600 to 2500 are supported.";
export const DATE_RANGE_NOTE = "Dates outside 1700–2200 may be less accurate.";
export const outsideTestedRange = (ymd: string) => {
  const y = Number(ymd.slice(0, 4));
  return y < 1700 || y > 2200;
};

export const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

// ── Ashtakavarga, KP and Shadbala (mirror backend lib/astro/ashtakvarga.ts, kp.ts, shadbala.ts) ──

export type SevenGraha = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn";
export type AshtakaRef = SevenGraha | "lagna";

export interface Bhinnashtakavarga {
  planet: SevenGraha;
  /** Bindus per sign, index 0 = Aries. */
  bySign: number[];
  /** Bindus per whole-sign house, index 0 = house 1. */
  byHouse: number[];
  /** Which references gave a bindu in each sign (index 0 = Aries). */
  contributors: AshtakaRef[][];
  total: number;
}

export interface Ashtakavarga {
  lagnaSign: number;
  bav: Bhinnashtakavarga[];
  sav: { bySign: number[]; byHouse: number[]; total: number };
}

export interface KpLords {
  longitude: number;
  sign: number;
  signLord: GrahaKey;
  /** Nakshatra index 0–26. */
  star: number;
  starLord: GrahaKey;
  subLord: GrahaKey;
  subSubLord: GrahaKey;
}

export interface KpRulingPlanets {
  at: string;
  lagnaSignLord: GrahaKey;
  lagnaStarLord: GrahaKey;
  lagnaSubLord: GrahaKey;
  moonSignLord: GrahaKey;
  moonStarLord: GrahaKey;
  moonSubLord: GrahaKey;
  dayLord: GrahaKey;
}

export interface KpChart {
  ayanamsa: string;
  ayanamsaDegrees: number;
  houseSystem: "Placidus" | "Porphyry";
  /** Placidus has no solution at this latitude; Porphyry was used. */
  fallback: boolean;
  cusps: (KpLords & { cusp: number })[];
  grahas: (KpLords & { key: GrahaKey; retrograde: boolean; bhava: number })[];
  rulingPlanets: KpRulingPlanets;
}

export interface ShadbalaRow {
  planet: SevenGraha;
  sthana: { uchcha: number; saptavargaja: number; ojhayugma: number; kendra: number; drekkana: number; total: number };
  dig: number;
  kala: { nathonnatha: number; paksha: number; tribhaga: number; abda: number; masa: number; vara: number; hora: number; ayana: number; yuddha: number; total: number };
  cheshta: number;
  naisargika: number;
  drik: number;
  /** Virupas. */
  total: number;
  rupas: number;
  /** Required minimum, rupas. */
  required: number;
  ratio: number;
  rank: number;
  speed: number;
}

export interface Shadbala {
  planets: ShadbalaRow[];
  lords: { year: SevenGraha; month: SevenGraha; weekday: SevenGraha; hora: SevenGraha };
  polarDay: boolean;
  conventions: string[];
}

/** KP ruling planets at a moment (default now) and place — "the time of judgement". */
export function kpRulingPlanetsNow(place: { latitude: number; longitude: number; timezone: string }) {
  const q = `lat=${place.latitude}&lon=${place.longitude}&tz=${encodeURIComponent(place.timezone)}`;
  return api.get<{ rulingPlanets: KpRulingPlanets }>(`/astro/kp/ruling-planets?${q}`);
}

/** English names of the grahas. */
export const GRAHA_LABEL: Record<GrahaKey, string> = {
  sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu",
};
