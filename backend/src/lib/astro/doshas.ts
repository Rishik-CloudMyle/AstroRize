// Doshas shown with a Kundli: Kalsarpa and Sade Sati (Mangal dosha is matchmaking.ts mangalDosha,
// so a Kundli and a match never disagree). Pure functions, no database.

import { MakeTime } from "astronomy-engine";
import type { GrahaKey } from "./constants.ts";
import { norm360, siderealLongitude } from "./ephemeris.ts";

// ── Kalsarpa ──
//
// Rule (as commonly applied by Indian almanac software): Kalsarpa is formed when all seven grahas
// (Sun … Saturn) lie on ONE side of the Rahu–Ketu axis. We test by longitude: a graha is on the
// "Rahu → Ketu" side when it is 0°–180° ahead of Rahu in the zodiac, otherwise on the
// "Ketu → Rahu" side. All seven Rahu → Ketu is the classical form; all seven Ketu → Rahu is the
// same hemming the other way (some authors call it Kalamrita) — both are reported as Kalsarpa
// with the direction given.
// PARTIAL: if the seven are split only because one or more grahas share a sign with Rahu or Ketu
// (conjoining a node, so not cleanly hemmed in), it is reported as "partial".
// The type is named by Rahu's whole-sign house from the lagna: 1 Anant, 2 Kulik, 3 Vasuki,
// 4 Shankhpal, 5 Padma, 6 Mahapadma, 7 Takshak, 8 Karkotak, 9 Shankhachud, 10 Ghatak,
// 11 Vishdhar, 12 Sheshnag.

export const KALSARPA_TYPES = [
  "Anant", "Kulik", "Vasuki", "Shankhpal", "Padma", "Mahapadma", "Takshak", "Karkotak", "Shankhachud", "Ghatak", "Vishdhar", "Sheshnag",
] as const;

const SEVEN: GrahaKey[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

export interface Kalsarpa {
  status: "present" | "partial" | "absent";
  /** Which side the grahas are on (when present or partial). */
  direction: "rahu-to-ketu" | "ketu-to-rahu" | null;
  /** Type named by Rahu's house (when present or partial). */
  type: string | null;
  rahuHouse: number;
  /** Grahas on the other side of the axis (absent) or sharing a sign with a node (partial). */
  outside: GrahaKey[];
}

export function kalsarpa(grahas: { key: GrahaKey; longitude: number; house: number }[]): Kalsarpa {
  const rahu = grahas.find((g) => g.key === "rahu")!;
  const ketu = grahas.find((g) => g.key === "ketu")!;
  const seven = grahas.filter((g) => SEVEN.includes(g.key));
  const ahead = seven.filter((g) => norm360(g.longitude - rahu.longitude) < 180);
  const behind = seven.filter((g) => norm360(g.longitude - rahu.longitude) >= 180);
  const type = KALSARPA_TYPES[rahu.house - 1]!;
  if (behind.length === 0) return { status: "present", direction: "rahu-to-ketu", type, rahuHouse: rahu.house, outside: [] };
  if (ahead.length === 0) return { status: "present", direction: "ketu-to-rahu", type, rahuHouse: rahu.house, outside: [] };
  const sign = (lon: number) => Math.floor(norm360(lon) / 30);
  const nodeSigns = new Set([sign(rahu.longitude), sign(ketu.longitude)]);
  const withNode = (g: { longitude: number }) => nodeSigns.has(sign(g.longitude));
  for (const [minority, direction] of [[behind, "rahu-to-ketu"], [ahead, "ketu-to-rahu"]] as const) {
    if (minority.length < seven.length && minority.every(withNode)) {
      return { status: "partial", direction, type, rahuHouse: rahu.house, outside: minority.map((g) => g.key) };
    }
  }
  const outside = behind.length <= ahead.length ? behind : ahead;
  return { status: "absent", direction: null, type: null, rahuHouse: rahu.house, outside: outside.map((g) => g.key) };
}

// ── Sade Sati ──
//
// Sade Sati ("seven and a half") is Saturn's transit through the 12th, 1st and 2nd signs from the
// natal Moon sign (about 2½ years each, longer with retrogression): phase 1 "rising" (12th),
// 2 "peak" (over the Moon sign), 3 "setting" (2nd). Small Panoti / Dhaiya is Saturn in the 4th
// (Kantaka) or 8th (Ashtama) from the Moon. Saturn's sidereal sign changes are found by stepping
// 3 days and bisecting to the minute (Saturn moves ≤ 0.14°/day, so no sign change is skipped
// except at a station within a few arc-seconds of a sign edge).

export type SaturnPhase = "rising" | "peak" | "setting" | "kantaka" | "ashtama";

/** Saturn's stay in one sidereal sign: [sign, start ISO, end ISO]. */
type Stay = { sign: number; start: number; end: number };

const DAY = 86_400_000;
const saturnSign = (ms: number) => Math.floor(siderealLongitude("saturn", MakeTime(new Date(ms))) / 30);

const staysCache = new Map<string, Stay[]>();
/** Saturn's sign stays between two instants (memoised per whole-day window). */
function saturnStays(from: number, to: number): Stay[] {
  const key = `${Math.floor(from / DAY)}|${Math.floor(to / DAY)}`;
  const hit = staysCache.get(key);
  if (hit) return hit;
  const stays: Stay[] = [];
  let curSign = saturnSign(from);
  let curStart = from;
  let a = from;
  while (a < to) {
    const b = Math.min(a + 3 * DAY, to);
    const sb = saturnSign(b);
    if (sb !== curSign) {
      let lo = a;
      let hi = b;
      while (hi - lo > 60_000) {
        const mid = (lo + hi) / 2;
        if (saturnSign(mid) === curSign) lo = mid;
        else hi = mid;
      }
      stays.push({ sign: curSign, start: curStart, end: hi });
      curSign = sb;
      curStart = hi;
    }
    a = b;
  }
  stays.push({ sign: curSign, start: curStart, end: to });
  if (staysCache.size > 20) staysCache.clear();
  staysCache.set(key, stays);
  return stays;
}

export interface SaturnSpan {
  phase: SaturnPhase;
  /** Saturn's sign, 0 = Aries. */
  sign: number;
  start: string;
  end: string;
  /** The span starts or ends at the edge of the search window, not at a sign change. */
  openStart: boolean;
  openEnd: boolean;
}

export interface SadeSatiPeriod {
  kind: "sade-sati" | "dhaiya";
  start: string;
  end: string;
  openStart: boolean;
  openEnd: boolean;
  /** Saturn's stays inside the period, in order (retrograde re-entries appear as separate spans). */
  spans: SaturnSpan[];
}

export interface SadeSati {
  moonSign: number;
  at: string;
  /** Saturn's sign at `at`. */
  saturnSign: number;
  /** What Saturn is doing relative to the Moon sign at `at` (null = neither Sade Sati nor Dhaiya). */
  current: { kind: "sade-sati" | "dhaiya"; phase: SaturnPhase; since: string; until: string } | null;
  /** Periods overlapping the window, oldest first. */
  periods: SadeSatiPeriod[];
  window: { from: string; to: string };
}

const PHASE_BY_HOUSE: Record<number, SaturnPhase> = { 12: "rising", 1: "peak", 2: "setting", 4: "kantaka", 8: "ashtama" };

/**
 * Sade Sati status at `at` and every Sade Sati / Dhaiya period within ±`years` of it (never before
 * `notBefore`, e.g. the birth instant).
 */
export function sadeSati(moonSign: number, at: Date, notBefore: Date | null = null, years = 30): SadeSati {
  // Round the window to whole days so the memo is shared by every chart read on the same day.
  const day = Math.floor(at.getTime() / DAY) * DAY;
  const windowFrom = day - Math.round(years * 365.25) * DAY;
  const to = day + Math.round(years * 365.25) * DAY + DAY;
  const stays = saturnStays(windowFrom, to);

  const houseOf = (sign: number) => ((sign - moonSign + 12) % 12) + 1;
  const iso = (ms: number) => new Date(ms).toISOString();
  const periods: SadeSatiPeriod[] = [];
  for (const s of stays) {
    const phase = PHASE_BY_HOUSE[houseOf(s.sign)];
    if (!phase) continue;
    const kind = phase === "kantaka" || phase === "ashtama" ? "dhaiya" : "sade-sati";
    const span: SaturnSpan = {
      phase,
      sign: s.sign,
      start: iso(s.start),
      end: iso(s.end),
      openStart: s.start === windowFrom,
      openEnd: s.end === to,
    };
    const last = periods.at(-1);
    // Consecutive stays of the same kind (12th → 1st → 2nd, or a retrograde dip back) form one period.
    if (last && last.kind === kind && last.end === span.start) {
      last.end = span.end;
      last.openEnd = span.openEnd;
      last.spans.push(span);
    } else {
      periods.push({ kind, start: span.start, end: span.end, openStart: span.openStart, openEnd: span.openEnd, spans: [span] });
    }
  }

  // Periods that ended before birth are dropped.
  const visible = notBefore ? periods.filter((p) => p.end > notBefore.toISOString()) : periods;

  const now = at.getTime();
  const curSign = saturnSign(now);
  const curPhase = PHASE_BY_HOUSE[houseOf(curSign)];
  let current: SadeSati["current"] = null;
  if (curPhase) {
    const period = periods.find((p) => p.start <= iso(now) && iso(now) < p.end);
    const span = period?.spans.find((x) => x.start <= iso(now) && iso(now) < x.end);
    if (period && span) current = { kind: period.kind, phase: curPhase, since: period.start, until: period.end };
  }
  return { moonSign, at: at.toISOString(), saturnSign: curSign, current, periods: visible, window: { from: iso(windowFrom), to: iso(to) } };
}
