// Avakhada chakra: the Moon-based summary printed at the top of an Indian birth chart. Varna,
// vashya, yoni, gana and nadi reuse the guna-milan tables in constants.ts (so a Kundli and a match
// never disagree); the rest is below. Pure functions.

import {
  NAKSHATRA_GANA, NAKSHATRA_YONI, VARNA, VARNA_NAMES, VASHYA_NAMES, YONI_ANIMALS, nakshatraNadi, vashyaGroup,
} from "./constants.ts";
import { nakshatraInfo, signInfo, type NakshatraInfo, type SignInfo } from "./kundli.ts";

/**
 * Naming syllables (Avakahada / Hoda chakra): one syllable per nakshatra pada, 27 × 4 = 108, as
 * printed in Hindi almanacs ("नक्षत्र नामाक्षर"; e.g. the Thakur Prasad and Lala Ramswaroop
 * panchangs) and in drikpanchang.com's nakshatra pages. Abhijit is not used, so Shravana keeps
 * खी खू खे खो (tables that insert Abhijit give it जू जे जो खा). Roman spelling is the plain one
 * (ū → u, ī → i): e.g. Shravana pada 2 खू = "Khu" (also written "Khoo").
 * Checked pada by pada against the Devanagari table: every row below is [Roman, Devanagari].
 */
export const NAME_SYLLABLES: readonly (readonly [string, string])[][] = [
  [["Chu", "चू"], ["Che", "चे"], ["Cho", "चो"], ["La", "ला"]], // Ashwini
  [["Li", "ली"], ["Lu", "लू"], ["Le", "ले"], ["Lo", "लो"]], // Bharani
  [["A", "अ"], ["I", "ई"], ["U", "उ"], ["E", "ए"]], // Krittika
  [["O", "ओ"], ["Va", "वा"], ["Vi", "वी"], ["Vu", "वू"]], // Rohini
  [["Ve", "वे"], ["Vo", "वो"], ["Ka", "का"], ["Ki", "की"]], // Mrigashira
  [["Ku", "कू"], ["Gha", "घ"], ["Nga", "ङ"], ["Chha", "छ"]], // Ardra
  [["Ke", "के"], ["Ko", "को"], ["Ha", "हा"], ["Hi", "ही"]], // Punarvasu
  [["Hu", "हू"], ["He", "हे"], ["Ho", "हो"], ["Da", "डा"]], // Pushya
  [["Di", "डी"], ["Du", "डू"], ["De", "डे"], ["Do", "डो"]], // Ashlesha
  [["Ma", "मा"], ["Mi", "मी"], ["Mu", "मू"], ["Me", "मे"]], // Magha
  [["Mo", "मो"], ["Ta", "टा"], ["Ti", "टी"], ["Tu", "टू"]], // Purva Phalguni
  [["Te", "टे"], ["To", "टो"], ["Pa", "पा"], ["Pi", "पी"]], // Uttara Phalguni
  [["Pu", "पू"], ["Sha", "ष"], ["Na", "ण"], ["Tha", "ठ"]], // Hasta
  [["Pe", "पे"], ["Po", "पो"], ["Ra", "रा"], ["Ri", "री"]], // Chitra
  [["Ru", "रू"], ["Re", "रे"], ["Ro", "रो"], ["Ta", "ता"]], // Swati
  [["Ti", "ती"], ["Tu", "तू"], ["Te", "ते"], ["To", "तो"]], // Vishakha
  [["Na", "ना"], ["Ni", "नी"], ["Nu", "नू"], ["Ne", "ने"]], // Anuradha
  [["No", "नो"], ["Ya", "या"], ["Yi", "यी"], ["Yu", "यू"]], // Jyeshtha
  [["Ye", "ये"], ["Yo", "यो"], ["Bha", "भा"], ["Bhi", "भी"]], // Mula
  [["Bhu", "भू"], ["Dha", "धा"], ["Pha", "फा"], ["Dha", "ढा"]], // Purva Ashadha
  [["Bhe", "भे"], ["Bho", "भो"], ["Ja", "जा"], ["Ji", "जी"]], // Uttara Ashadha
  [["Khi", "खी"], ["Khu", "खू"], ["Khe", "खे"], ["Kho", "खो"]], // Shravana
  [["Ga", "गा"], ["Gi", "गी"], ["Gu", "गू"], ["Ge", "गे"]], // Dhanishta
  [["Go", "गो"], ["Sa", "सा"], ["Si", "सी"], ["Su", "सू"]], // Shatabhisha
  [["Se", "से"], ["So", "सो"], ["Da", "दा"], ["Di", "दी"]], // Purva Bhadrapada
  [["Du", "दू"], ["Tha", "थ"], ["Jha", "झ"], ["Na", "ञ"]], // Uttara Bhadrapada
  [["De", "दे"], ["Do", "दो"], ["Cha", "चा"], ["Chi", "ची"]], // Revati
];

/** Element (tatva) of each sign: fire, earth, air, water repeating from Aries. */
export const TATVA = ["Fire", "Earth", "Air", "Water"] as const;
export const tatvaOf = (sign: number) => TATVA[sign % 4]!;

/**
 * Paya (the "metal" of the birth), by the Moon's whole-sign house counted from the lagna — the
 * rule most North Indian Kundli software prints: 1, 6, 11 Gold (Swarna); 2, 5, 9 Silver (Rajat);
 * 3, 7, 10 Copper (Tamra); 4, 8, 12 Iron (Loha). (Another tradition reads paya from the
 * nakshatra instead; we don't use it.)
 */
export function payaOf(moonHouse: number): "Gold" | "Silver" | "Copper" | "Iron" {
  if ([1, 6, 11].includes(moonHouse)) return "Gold";
  if ([2, 5, 9].includes(moonHouse)) return "Silver";
  if ([3, 7, 10].includes(moonHouse)) return "Copper";
  return "Iron";
}

/**
 * Yunja (nakshatra bhaga, Muhurta Chintamani): six stars from Revati to Mrigashira are Adi
 * (purva, "front"), the twelve from Ardra to Anuradha Madhya, the nine from Jyeshtha to Uttara
 * Bhadrapada Antya (para). Indices are 0 = Ashwini … 26 = Revati.
 */
export function yunjaOf(nakshatra: number): "Adi" | "Madhya" | "Antya" {
  if (nakshatra === 26 || nakshatra <= 4) return "Adi";
  if (nakshatra <= 16) return "Madhya";
  return "Antya";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Avakhada {
  varna: string;
  vashya: string;
  yoni: string;
  gana: string;
  nadi: string;
  moonSign: SignInfo;
  nakshatra: NakshatraInfo;
  /** Nakshatra pada (charan) 1–4. */
  charan: number;
  tatva: string;
  /** The naming syllable of the Moon's pada (Roman and Devanagari). */
  nameAlphabet: { latin: string; devanagari: string };
  paya: string;
  /** Moon's whole-sign house from the lagna, which sets the paya. */
  moonHouse: number;
  yunja: string;
}

export function avakhada(moonLongitude: number, lagnaSign: number): Avakhada {
  const sign = Math.floor((((moonLongitude % 360) + 360) % 360) / 30);
  const nak = nakshatraInfo(moonLongitude);
  const moonHouse = ((sign - lagnaSign + 12) % 12) + 1;
  const syl = NAME_SYLLABLES[nak.index]![nak.pada - 1]!;
  return {
    varna: VARNA_NAMES[VARNA[sign]!]!,
    // Short names ("Jalachara"); the guna-milan labels add the English in brackets.
    vashya: VASHYA_NAMES[vashyaGroup(moonLongitude)].replace(/ \(.*\)$/, ""),
    yoni: YONI_ANIMALS[NAKSHATRA_YONI[nak.index]!]!,
    gana: cap(NAKSHATRA_GANA[nak.index]!),
    nadi: cap(nakshatraNadi(nak.index)),
    moonSign: signInfo(sign),
    nakshatra: nak,
    charan: nak.pada,
    tatva: tatvaOf(sign),
    nameAlphabet: { latin: syl[0], devanagari: syl[1] },
    paya: payaOf(moonHouse),
    moonHouse,
    yunja: yunjaOf(nak.index),
  };
}
