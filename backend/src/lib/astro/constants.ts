// Fixed names and tables of Vedic astrology used across the engine. Pure data, no maths.

export type GrahaKey = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn" | "rahu" | "ketu";

export const GRAHAS: readonly GrahaKey[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];

export const GRAHA_NAMES: Record<GrahaKey, { en: string; sa: string; abbr: string }> = {
  sun: { en: "Sun", sa: "Surya", abbr: "Su" },
  moon: { en: "Moon", sa: "Chandra", abbr: "Mo" },
  mars: { en: "Mars", sa: "Mangal", abbr: "Ma" },
  mercury: { en: "Mercury", sa: "Budh", abbr: "Me" },
  jupiter: { en: "Jupiter", sa: "Guru", abbr: "Ju" },
  venus: { en: "Venus", sa: "Shukra", abbr: "Ve" },
  saturn: { en: "Saturn", sa: "Shani", abbr: "Sa" },
  rahu: { en: "Rahu", sa: "Rahu", abbr: "Ra" },
  ketu: { en: "Ketu", sa: "Ketu", abbr: "Ke" },
};

/** The twelve rashis, index 0 = Mesha (Aries). */
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

/** Lord of each rashi (index 0 = Aries). */
export const RASHI_LORD: readonly GrahaKey[] = [
  "mars", "venus", "mercury", "moon", "sun", "mercury", "venus", "mars", "jupiter", "saturn", "saturn", "jupiter",
];

export const NAKSHATRAS: readonly string[] = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
  "Uttara Bhadrapada", "Revati",
];

/** Vimshottari order of nakshatra lords (Ashwini → Ketu, Bharani → Venus, …, repeating every 9). */
export const DASHA_ORDER: readonly GrahaKey[] = ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"];

/** Vimshottari mahadasha lengths in years (total 120). */
export const DASHA_YEARS: Record<GrahaKey, number> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};

export const nakshatraLord = (nakshatra: number): GrahaKey => DASHA_ORDER[nakshatra % 9]!;

/** Tithi names within a paksha; index 14 is Purnima (Shukla) or Amavasya (Krishna). */
export const TITHI_NAMES: readonly string[] = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami",
  "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi",
];

export const YOGAS: readonly string[] = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula",
  "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan",
  "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];

/** The seven movable karanas; they repeat eight times from the 2nd half-tithi of Shukla Pratipada. */
export const MOVABLE_KARANAS: readonly string[] = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"];

export const VARAS: readonly { en: string; sa: string; lord: GrahaKey }[] = [
  { en: "Sunday", sa: "Ravivara", lord: "sun" },
  { en: "Monday", sa: "Somavara", lord: "moon" },
  { en: "Tuesday", sa: "Mangalavara", lord: "mars" },
  { en: "Wednesday", sa: "Budhavara", lord: "mercury" },
  { en: "Thursday", sa: "Guruvara", lord: "jupiter" },
  { en: "Friday", sa: "Shukravara", lord: "venus" },
  { en: "Saturday", sa: "Shanivara", lord: "saturn" },
];

/**
 * Which eighth of the daytime (sunrise → sunset, 1-based) is Rahu Kaal, Yamaganda and Gulika
 * on each weekday (Sunday first). The usual North and South Indian convention.
 */
export const RAHU_KAAL_PART = [8, 2, 7, 5, 6, 4, 3] as const;
export const YAMAGANDA_PART = [5, 4, 3, 2, 1, 7, 6] as const;
export const GULIKA_PART = [7, 6, 5, 4, 3, 2, 1] as const;

// ── Ashtakoota (guna milan) tables ──

/** Varna of each Moon sign: 4 Brahmin, 3 Kshatriya, 2 Vaishya, 1 Shudra. */
export const VARNA: readonly number[] = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
export const VARNA_NAMES: Record<number, string> = { 4: "Brahmin", 3: "Kshatriya", 2: "Vaishya", 1: "Shudra" };

export type VashyaGroup = "chatushpada" | "manava" | "jalachara" | "vanachara" | "keeta";
export const VASHYA_NAMES: Record<VashyaGroup, string> = {
  chatushpada: "Chatushpada (quadruped)",
  manava: "Manava (human)",
  jalachara: "Jalachara (water)",
  vanachara: "Vanachara (wild)",
  keeta: "Keeta (insect)",
};

/**
 * Vashya group of a sidereal Moon longitude. Sagittarius is Manava in its first half and
 * Chatushpada in its second; Capricorn is Chatushpada in its first half and Jalachara in its second.
 */
export function vashyaGroup(moonLongitude: number): VashyaGroup {
  const sign = Math.floor(moonLongitude / 30) % 12;
  const firstHalf = moonLongitude % 30 < 15;
  switch (sign) {
    case 0: case 1: return "chatushpada";
    case 2: case 5: case 6: case 10: return "manava";
    case 3: case 11: return "jalachara";
    case 4: return "vanachara";
    case 7: return "keeta";
    case 8: return firstHalf ? "manava" : "chatushpada";
    default: return firstHalf ? "chatushpada" : "jalachara"; // 9, Capricorn
  }
}

const VASHYA_ORDER: readonly VashyaGroup[] = ["chatushpada", "manava", "jalachara", "vanachara", "keeta"];
/**
 * Vashya points, rows = groom's group, columns = bride's group (order as VASHYA_ORDER).
 * Source: onlinejyotish.com "Vashya Kootam" table (published Bride  Groom; transposed here).
 * Traditions differ on a few cells; this is the common North/South Indian calculator table.
 */
const VASHYA_POINTS: readonly (readonly number[])[] = [
  [2, 1, 1, 0, 1],
  [1, 2, 0.5, 0, 0],
  [1, 0.5, 2, 1, 1],
  [0, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];
export const vashyaPoints = (groom: VashyaGroup, bride: VashyaGroup) =>
  VASHYA_POINTS[VASHYA_ORDER.indexOf(groom)]![VASHYA_ORDER.indexOf(bride)]!;

export const YONI_ANIMALS: readonly string[] = [
  "Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat", "Cow", "Buffalo", "Tiger", "Deer", "Monkey", "Mongoose", "Lion",
];
/** Yoni animal (index into YONI_ANIMALS) of each nakshatra. */
export const NAKSHATRA_YONI: readonly number[] = [
  0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1,
];
/** Yoni points between two animals (symmetric; the seven sworn-enemy pairs score 0). */
export const YONI_POINTS: readonly (readonly number[])[] = [
  // Hor Ele She Ser Dog Cat Rat Cow Buf Tig Dee Mon Mgo Lio
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1], // Horse
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0], // Elephant
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1], // Sheep
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2], // Serpent
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1], // Dog
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1], // Cat
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2], // Rat
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1], // Cow
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1], // Buffalo
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1], // Tiger
  [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1], // Deer
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2], // Monkey
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2], // Mongoose
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4], // Lion
];

/** Natural (naisargika) friendship: friends and enemies of each planet; the rest are neutral. */
export const FRIENDS: Partial<Record<GrahaKey, { friends: GrahaKey[]; enemies: GrahaKey[] }>> = {
  sun: { friends: ["moon", "mars", "jupiter"], enemies: ["venus", "saturn"] },
  moon: { friends: ["sun", "mercury"], enemies: [] },
  mars: { friends: ["sun", "moon", "jupiter"], enemies: ["mercury"] },
  mercury: { friends: ["sun", "venus"], enemies: ["moon"] },
  jupiter: { friends: ["sun", "moon", "mars"], enemies: ["mercury", "venus"] },
  venus: { friends: ["mercury", "saturn"], enemies: ["sun", "moon"] },
  saturn: { friends: ["mercury", "venus"], enemies: ["sun", "moon", "mars"] },
};

export type Relation = "friend" | "neutral" | "enemy";
export function relation(of: GrahaKey, to: GrahaKey): Relation {
  const f = FRIENDS[of];
  if (!f) return "neutral";
  if (f.friends.includes(to)) return "friend";
  if (f.enemies.includes(to)) return "enemy";
  return "neutral";
}

export type Gana = "deva" | "manushya" | "rakshasa";
/** Gana of each nakshatra. */
export const NAKSHATRA_GANA: readonly Gana[] = [
  "deva", "manushya", "rakshasa", "manushya", "deva", "manushya", "deva", "deva", "rakshasa",
  "rakshasa", "manushya", "manushya", "deva", "rakshasa", "deva", "rakshasa", "deva", "rakshasa",
  "rakshasa", "manushya", "manushya", "deva", "rakshasa", "rakshasa", "manushya", "manushya", "deva",
];
const GANA_ORDER: readonly Gana[] = ["deva", "manushya", "rakshasa"];
/**
 * Gana points, rows = groom, columns = bride. Source: onlinejyotish.com "Gana Kootam"
 * (published Bride  Groom; transposed here): Deva groom + Manushya bride 5, Deva groom +
 * Rakshasa bride 1, Rakshasa groom + Deva/Manushya bride 0.
 */
const GANA_POINTS: readonly (readonly number[])[] = [
  [6, 5, 1],
  [6, 6, 0],
  [0, 0, 6],
];
export const ganaPoints = (groom: Gana, bride: Gana) => GANA_POINTS[GANA_ORDER.indexOf(groom)]![GANA_ORDER.indexOf(bride)]!;

export type Nadi = "adi" | "madhya" | "antya";
/** Nadi runs Adi, Madhya, Antya, Antya, Madhya, Adi … through the nakshatras (period 6). */
export function nakshatraNadi(nakshatra: number): Nadi {
  return (["adi", "madhya", "antya", "antya", "madhya", "adi"] as const)[nakshatra % 6]!;
}
