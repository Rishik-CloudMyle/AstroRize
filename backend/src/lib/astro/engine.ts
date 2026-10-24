// The astrology engine behind /api/astro. Routes only talk to the AstroEngine interface, so a
// different engine (another ephemeris or school of calculation) can be plugged in later by
// implementing it and returning it from getAstroEngine(). Pure functions: no database, no network.

import { MakeTime } from "astronomy-engine";
import { GRAHA_NAMES, type GrahaKey } from "./constants.ts";
import { currentDasha, type DashaPeriod } from "./dasha.ts";
import { grahaPositions, trueLahiri, type NodeKind } from "./ephemeris.ts";
import { buildHoroscope, type Horoscope, type HoroscopeInput } from "./horoscope.ts";
import { buildKundli, completeKundli, zodiacPoint, type BirthInput, type Kundli, type ZodiacPoint } from "./kundli.ts";
import { kundliToday, type KundliToday } from "./kundli-live.ts";
import { kundliReading, type KundliReading } from "./readings.ts";
import { matchmaking, type Match, type MatchPerson } from "./matchmaking.ts";
import { buildPanchang, type Panchang, type PanchangInput } from "./panchang.ts";

export const ENGINE_NAME = "astrorize-astro";
export const ENGINE_VERSION = "1.0";
/** Stored with every saved chart so old results can be told apart after an engine change. */
export const ENGINE_LABEL = `${ENGINE_NAME} ${ENGINE_VERSION} · astronomy-engine 2.1.19`;

export interface TransitGraha extends ZodiacPoint {
  key: GrahaKey;
  name: string;
  speed: number;
  retrograde: boolean;
}

export interface Transit {
  at: string;
  ayanamsa: number;
  grahas: TransitGraha[];
}

export interface CurrentDasha {
  mahadasha: { lord: GrahaKey; name: string; start: string; end: string };
  antardasha: DashaPeriod | null;
}

export interface AstroEngine {
  readonly label: string;
  kundli(input: BirthInput): Kundli;
  /** A saved Kundli with any fields added since it was saved worked out from its stored data. */
  completeKundli(stored: Kundli): Kundli;
  /** Transits in the chart's houses, Sade Sati and the running Yogini dasha at `at`. */
  kundliToday(k: Kundli, at: Date): KundliToday;
  /** Ascendant summary and per-graha readings (deterministic phrase library). */
  kundliReading(k: Kundli): KundliReading;
  /** Dasha running at `at` for a kundli's mahadashas. */
  currentDasha(mahadashas: DashaPeriod[], at: Date): CurrentDasha | null;
  matchmaking(boy: MatchPerson, girl: MatchPerson): Match;
  panchang(input: PanchangInput): Panchang;
  horoscope(input: HoroscopeInput): Horoscope;
  transit(at: Date, node?: NodeKind): Transit;
}

export const astrorizeEngine: AstroEngine = {
  label: ENGINE_LABEL,
  kundli: buildKundli,
  completeKundli,
  kundliToday,
  kundliReading,
  currentDasha,
  matchmaking,
  panchang: buildPanchang,
  horoscope: buildHoroscope,
  transit(at, node = "mean") {
    return {
      at: at.toISOString(),
      ayanamsa: trueLahiri(MakeTime(at)),
      grahas: grahaPositions(at, node).map((p) => ({
        key: p.key,
        name: GRAHA_NAMES[p.key].en,
        ...zodiacPoint(p.longitude),
        speed: p.speed,
        retrograde: p.retrograde,
      })),
    };
  },
};

export function getAstroEngine(): AstroEngine {
  return astrorizeEngine;
}
