// Divisional charts (vargas), Parashari rules from Brihat Parashara Hora Shastra ch. 6 ("Shodasha
// varga"), as translated by R. Santhanam (Ranjan Publications, 1984) and G. C. Sharma (Sagar, 1994),
// cross-checked with the varga tables in K. S. Charak, "Elements of Vedic Astrology" ch. 6, and the
// "Parasara" options of Jagannatha Hora (P. V. R. Narasimha Rao). Pure functions, no database.
//
// Input is a sidereal (Lahiri) longitude; s = sign 0–11 (0 = Aries), d = degrees within the sign.
// Odd signs are Aries, Gemini, Leo… (s even); movable (chara) signs are Aries, Cancer, Libra,
// Capricorn (s % 3 = 0), fixed s % 3 = 1, dual s % 3 = 2; fiery s % 4 = 0, earthy 1, airy 2, watery 3.
// For an n-part varga the part is p = floor(d·n/30), 0-based, and the varga sign = start + p (mod 12).
//
//   D1  Rashi            the sign itself
//   D2  Hora             15° parts. Odd sign: 1st half Leo (Sun), 2nd half Cancer (Moon); even: Cancer, then Leo
//   D3  Drekkana         10° parts: the sign, the 5th from it, the 9th from it
//   D4  Chaturthamsa     7°30′ parts: the sign, the 4th, the 7th, the 10th
//   D7  Saptamsa         30/7° parts. Odd: from the sign itself; even: from the 7th
//   D9  Navamsa          3°20′ parts. Movable: from the sign; fixed: from the 9th; dual: from the 5th
//                        (identical to counting continuously from Aries — kundli.ts navamsaSign)
//   D10 Dasamsa          3° parts. Odd: from the sign; even: from the 9th
//   D12 Dwadasamsa       2°30′ parts from the sign itself
//   D16 Shodasamsa       1°52′30″ parts. Movable from Aries, fixed from Leo, dual from Sagittarius
//   D20 Vimsamsa         1°30′ parts. Movable from Aries, fixed from Sagittarius, dual from Leo
//   D24 Chaturvimsamsa   1°15′ parts (Siddhamsa). Odd from Leo, even from Cancer
//   D27 Bhamsa           1°06′40″ parts (Nakshatramsa). Fiery from Aries, earthy from Cancer, airy from Libra,
//                        watery from Capricorn (identical to counting continuously from Aries)
//   D30 Trimsamsa        unequal parts ruled by the five tara grahas:
//                        odd  0–5 Aries (Mars), 5–10 Aquarius (Saturn), 10–18 Sagittarius (Jupiter),
//                             18–25 Gemini (Mercury), 25–30 Libra (Venus)
//                        even 0–5 Taurus (Venus), 5–12 Virgo (Mercury), 12–20 Pisces (Jupiter),
//                             20–25 Capricorn (Saturn), 25–30 Scorpio (Mars)
//   D40 Khavedamsa       0°45′ parts. Odd from Aries, even from Libra
//   D45 Akshavedamsa     0°40′ parts. Movable from Aries, fixed from Leo, dual from Sagittarius
//   D60 Shashtiamsa      0°30′ parts counted from the sign itself (BPHS 6.33–34: "leave the sign, double
//                        the degrees, divide by 12, add one and count from the sign")
//
// School variants we deliberately do NOT use (all charts here are Parashari):
//   · D2: Kashinatha hora and the "parivritti" (cyclic) hora used by some software spread the horas over
//     all twelve signs instead of only Leo/Cancer.
//   · D3: Jagannatha, Somanatha and parivritti drekkanas (some programs default to one of these).
//   · D30: parivritti trimsamsa (equal 1° parts counted cyclically) is offered by some programs.
//   · D24: a few texts count even signs from Cancer in reverse; D16/D20/D45 have rarer cyclic forms.
//   · D60: some count even signs from the 7th or in reverse; BPHS counts every sign from itself.
//
// Boundaries: a longitude exactly on a division edge belongs to the NEXT division (like the sign rule,
// which uses floor). A tiny epsilon absorbs floating error so that e.g. 10/3° (an exact navamsa edge,
// not representable in binary) does not fall back into the previous part.

import type { GrahaKey } from "./constants.ts";
import { norm360 } from "./ephemeris.ts";

export const VARGA_CODES = ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"] as const;
export type VargaCode = (typeof VARGA_CODES)[number];

export const VARGA_NAMES: Record<VargaCode, { name: string; purpose: string }> = {
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

const EPS = 1e-9;
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Sign (0–11) and degrees within it, the same way as the D1 sign (plain floor). */
function split(longitude: number): { s: number; d: number } {
  const lon = norm360(longitude);
  const s = Math.min(11, Math.floor(lon / 30));
  return { s, d: lon - s * 30 };
}

/** 0-based part of an n-fold equal division of the sign; an exact edge belongs to the next part. */
function part(d: number, n: number): number {
  return Math.min(n - 1, Math.floor((d * n) / 30 + EPS));
}

const isOdd = (s: number) => s % 2 === 0;
const modality = (s: number) => s % 3; // 0 movable, 1 fixed, 2 dual

const TRIMSAMSA_ODD: [number, number][] = [
  [5, 0], // 0–5 Aries (Mars)
  [10, 10], // 5–10 Aquarius (Saturn)
  [18, 8], // 10–18 Sagittarius (Jupiter)
  [25, 2], // 18–25 Gemini (Mercury)
  [30, 6], // 25–30 Libra (Venus)
];
const TRIMSAMSA_EVEN: [number, number][] = [
  [5, 1], // 0–5 Taurus (Venus)
  [12, 5], // 5–12 Virgo (Mercury)
  [20, 11], // 12–20 Pisces (Jupiter)
  [25, 9], // 20–25 Capricorn (Saturn)
  [30, 7], // 25–30 Scorpio (Mars)
];

/** The sign (0 = Aries … 11 = Pisces) a sidereal longitude falls in, in the given varga. */
export function vargaSign(code: VargaCode, longitude: number): number {
  const { s, d } = split(longitude);
  switch (code) {
    case "D1":
      return s;
    case "D2": {
      const first = part(d, 2) === 0;
      return isOdd(s) === first ? 4 : 3; // Leo : Cancer
    }
    case "D3":
      return mod12(s + [0, 4, 8][part(d, 3)]!);
    case "D4":
      return mod12(s + 3 * part(d, 4));
    case "D7":
      return mod12(s + (isOdd(s) ? 0 : 6) + part(d, 7));
    case "D9":
      return mod12(s + [0, 8, 4][modality(s)]! + part(d, 9));
    case "D10":
      return mod12(s + (isOdd(s) ? 0 : 8) + part(d, 10));
    case "D12":
      return mod12(s + part(d, 12));
    case "D16":
      return mod12([0, 4, 8][modality(s)]! + part(d, 16));
    case "D20":
      return mod12([0, 8, 4][modality(s)]! + part(d, 20));
    case "D24":
      return mod12((isOdd(s) ? 4 : 3) + part(d, 24));
    case "D27":
      return mod12([0, 3, 6, 9][s % 4]! + part(d, 27));
    case "D30": {
      const table = isOdd(s) ? TRIMSAMSA_ODD : TRIMSAMSA_EVEN;
      return table.find(([end]) => d + EPS < end)?.[1] ?? table[4]![1];
    }
    case "D40":
      return mod12((isOdd(s) ? 0 : 6) + part(d, 40));
    case "D45":
      return mod12([0, 4, 8][modality(s)]! + part(d, 45));
    case "D60":
      return mod12(s + part(d, 60));
  }
}

/**
 * Degree of a longitude inside its varga sign, 0–30. For the equal-part vargas the part is
 * stretched to a whole sign: (degrees in sign × n) mod 30, which is the same as (longitude × n)
 * mod 30 (the convention of Jagannatha Hora and most Indian software; D1 gives the plain degree).
 * D30's parts are unequal (5°, 5°, 8°, 7°, 5°) and there is no agreed way to stretch them, so it
 * has no varga degree (null; the website shows "—").
 */
export function vargaDegree(code: VargaCode, longitude: number): number | null {
  if (code === "D30") return null;
  const n = Number(code.slice(1));
  const { d } = split(longitude);
  const v = (d * n) % 30;
  // Floating error right at a part edge can give 29.9999999…; that is the next part's 0°.
  return v > 30 - 1e-7 ? 0 : v;
}

export interface VargaHouse {
  house: number;
  /** 0 = Aries … 11 = Pisces. */
  sign: number;
  grahas: GrahaKey[];
}

export interface VargaChart {
  /** The varga lagna's sign, 0 = Aries … 11 = Pisces. */
  lagnaSign: number;
  /** Houses counted whole-sign from the varga lagna. */
  houses: VargaHouse[];
  /** Degree of the lagna inside its varga sign (null for D30; see vargaDegree). */
  lagnaDegree: number | null;
  /** Degree of each graha inside its varga sign (null for D30). */
  degrees: Partial<Record<GrahaKey, number | null>>;
}

export type Vargas = Record<VargaCode, VargaChart>;

/** Every Parashari varga for a lagna and the grahas' sidereal longitudes. */
export function computeVargas(lagnaLongitude: number, grahas: { key: GrahaKey; longitude: number }[]): Vargas {
  const out = {} as Vargas;
  for (const code of VARGA_CODES) {
    const lagnaSign = vargaSign(code, lagnaLongitude);
    const signs = grahas.map((g) => ({ key: g.key, sign: vargaSign(code, g.longitude) }));
    out[code] = {
      lagnaSign,
      houses: Array.from({ length: 12 }, (_, i) => {
        const sign = (lagnaSign + i) % 12;
        return { house: i + 1, sign, grahas: signs.filter((g) => g.sign === sign).map((g) => g.key) };
      }),
      lagnaDegree: vargaDegree(code, lagnaLongitude),
      degrees: Object.fromEntries(grahas.map((g) => [g.key, vargaDegree(code, g.longitude)])),
    };
  }
  return out;
}

export interface BhavaChalit {
  system: "Sripati";
  /** Bhava n: its madhya (middle) and the sandhi where it begins, and the grahas in it. */
  houses: { house: number; madhya: number; start: number; grahas: GrahaKey[] }[];
}

/** Bhava Chalit: grahas placed by Sripati bhava (from each graha's `bhava`) rather than by sign. */
export function bhavaChalit(bhavas: { madhya: number[]; sandhi: number[] }, grahas: { key: GrahaKey; bhava: number }[]): BhavaChalit {
  return {
    system: "Sripati",
    houses: Array.from({ length: 12 }, (_, i) => ({
      house: i + 1,
      madhya: bhavas.madhya[i]!,
      start: bhavas.sandhi[i]!,
      grahas: grahas.filter((g) => g.bhava === i + 1).map((g) => g.key),
    })),
  };
}
