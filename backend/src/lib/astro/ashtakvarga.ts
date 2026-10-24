// Ashtakavarga: Bhinnashtakavarga (BAV) of the seven grahas and the Sarvashtakavarga (SAV).
// Pure function of the D1 signs of the seven grahas and the lagna; no database.
//
// Source of the tables: Brihat Parashara Hora Shastra, the "Ashtakavarga" chapter (ch. 66 in
// R. Santhanam's translation, Ranjan Publications, vol. 2), the same tables as B. V. Raman,
// "Ashtakavarga System of Prediction", and the Ashtakavarga of Jagannatha Hora. Every row was
// transcribed twice and its count checked against the row totals noted beside each planet. Each row lists the houses, counted from the reference (the graha or the
// lagna, the reference itself = 1), where that reference gives a bindu (benefic point) in the BAV.
//
// Invariants (every chart): the BAV totals are fixed by the tables — Sun 48, Moon 49, Mars 39,
// Mercury 54, Jupiter 56, Venus 52, Saturn 39 — and the SAV sums to 337. test/astro.test.ts asserts
// them for several charts and hand-checks one row.
//
// Variant we deliberately do NOT use: some software leaves out the lagna's contribution (then the
// totals are 42/45/34/47/47/44/33 = 292). BPHS includes it, so we do.

import type { GrahaKey } from "./constants.ts";

export type AshtakaRef = Exclude<GrahaKey, "rahu" | "ketu"> | "lagna";
export type AshtakaPlanet = Exclude<GrahaKey, "rahu" | "ketu">;

export const ASHTAKA_PLANETS: readonly AshtakaPlanet[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];
export const ASHTAKA_REFS: readonly AshtakaRef[] = [...ASHTAKA_PLANETS, "lagna"];

/** BAV of `planet`: for each reference, the houses (1–12 counted from that reference) that get a bindu. */
export const BAV_TABLE: Record<AshtakaPlanet, Record<AshtakaRef, readonly number[]>> = {
  // Sun: 8+4+8+7+4+3+8+6 = 48
  sun: {
    sun: [1, 2, 4, 7, 8, 9, 10, 11],
    moon: [3, 6, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11],
    mercury: [3, 5, 6, 9, 10, 11, 12],
    jupiter: [5, 6, 9, 11],
    venus: [6, 7, 12],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    lagna: [3, 4, 6, 10, 11, 12],
  },
  // Moon: 6+6+7+8+7+7+4+4 = 49
  moon: {
    sun: [3, 6, 7, 8, 10, 11],
    moon: [1, 3, 6, 7, 10, 11],
    mars: [2, 3, 5, 6, 9, 10, 11],
    mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    jupiter: [1, 4, 7, 8, 10, 11, 12],
    venus: [3, 4, 5, 7, 9, 10, 11],
    saturn: [3, 5, 6, 11],
    lagna: [3, 6, 10, 11],
  },
  // Mars: 5+3+7+4+4+4+7+5 = 39
  mars: {
    sun: [3, 5, 6, 10, 11],
    moon: [3, 6, 11],
    mars: [1, 2, 4, 7, 8, 10, 11],
    mercury: [3, 5, 6, 11],
    jupiter: [6, 10, 11, 12],
    venus: [6, 8, 11, 12],
    saturn: [1, 4, 7, 8, 9, 10, 11],
    lagna: [1, 3, 6, 10, 11],
  },
  // Mercury: 5+6+8+8+4+8+8+7 = 54
  mercury: {
    sun: [5, 6, 9, 11, 12],
    moon: [2, 4, 6, 8, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11],
    mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    jupiter: [6, 8, 11, 12],
    venus: [1, 2, 3, 4, 5, 8, 9, 11],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  // Jupiter: 9+5+7+8+8+6+4+9 = 56
  jupiter: {
    sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    moon: [2, 5, 7, 9, 11],
    mars: [1, 2, 4, 7, 8, 10, 11],
    mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    venus: [2, 5, 6, 9, 10, 11],
    saturn: [3, 5, 6, 12],
    lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  // Venus: 3+9+6+5+5+9+7+8 = 52
  venus: {
    sun: [8, 11, 12],
    moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    mars: [3, 5, 6, 9, 11, 12],
    mercury: [3, 5, 6, 9, 11],
    jupiter: [5, 8, 9, 10, 11],
    venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    saturn: [3, 4, 5, 8, 9, 10, 11],
    lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  // Saturn: 7+3+6+6+4+3+4+6 = 39
  saturn: {
    sun: [1, 2, 4, 7, 8, 10, 11],
    moon: [3, 6, 11],
    mars: [3, 5, 6, 10, 11, 12],
    mercury: [6, 8, 9, 10, 11, 12],
    jupiter: [5, 6, 11, 12],
    venus: [6, 11, 12],
    saturn: [3, 5, 6, 11],
    lagna: [1, 3, 4, 6, 10, 11],
  },
};

/** The fixed BAV totals (and 337 for the SAV) that every chart must reproduce. */
export const BAV_TOTALS: Record<AshtakaPlanet, number> = { sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39 };
export const SAV_TOTAL = 337;

export interface Bhinnashtakavarga {
  planet: AshtakaPlanet;
  /** Bindus in each sign, index 0 = Aries … 11 = Pisces. */
  bySign: number[];
  /** Bindus in each whole-sign house from the lagna, index 0 = house 1. */
  byHouse: number[];
  /** Which references gave a bindu in each sign (index 0 = Aries), for the 8 × 12 table. */
  contributors: AshtakaRef[][];
  total: number;
}

export interface Ashtakavarga {
  /** Lagna sign used for the house view, 0–11. */
  lagnaSign: number;
  bav: Bhinnashtakavarga[];
  sav: { bySign: number[]; byHouse: number[]; total: number };
}

/** Ashtakavarga from the D1 signs (0–11) of the seven grahas and the lagna. */
export function computeAshtakavarga(lagnaSign: number, grahas: { key: GrahaKey; sign: { index: number } }[]): Ashtakavarga {
  const refSign = {} as Record<AshtakaRef, number>;
  for (const p of ASHTAKA_PLANETS) {
    const g = grahas.find((x) => x.key === p);
    if (!g) throw new Error(`ashtakavarga: missing ${p}`);
    refSign[p] = g.sign.index;
  }
  refSign.lagna = lagnaSign;

  const toHouses = (bySign: number[]) => Array.from({ length: 12 }, (_, h) => bySign[(lagnaSign + h) % 12]!);

  const bav = ASHTAKA_PLANETS.map((planet): Bhinnashtakavarga => {
    const contributors: AshtakaRef[][] = Array.from({ length: 12 }, () => []);
    for (const ref of ASHTAKA_REFS) {
      for (const house of BAV_TABLE[planet][ref]) contributors[(refSign[ref] + house - 1) % 12]!.push(ref);
    }
    const bySign = contributors.map((c) => c.length);
    return { planet, bySign, byHouse: toHouses(bySign), contributors, total: bySign.reduce((a, b) => a + b, 0) };
  });

  const savSign = Array.from({ length: 12 }, (_, s) => bav.reduce((sum, b) => sum + b.bySign[s]!, 0));
  return {
    lagnaSign,
    bav,
    sav: { bySign: savSign, byHouse: toHouses(savSign), total: savSign.reduce((a, b) => a + b, 0) },
  };
}
