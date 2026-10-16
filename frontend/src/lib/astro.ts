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
}

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
  moonSign: SignInfo;
  sunSign: SignInfo;
  birthNakshatra: NakshatraInfo;
  dasha: { balance: { lord: GrahaKey; years: number; months: number; days: number }; mahadashas: DashaPeriod[] };
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
  input: { name: string; date: string; time: string; place: { placeId: string | null; name: string; latitude: number; longitude: number; timezone: string } };
  kundli: Kundli;
  currentDasha: CurrentDasha | null;
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

export function makeKundli(body: { name: string; date: string; time: string; place: { placeId: string } }) {
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
  return api.get<{ place: PanchangPlace; panchang: Panchang }>(`/astro/panchang?${q}`);
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

export const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
