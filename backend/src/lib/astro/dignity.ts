// Graha condition in the birth chart: combustion (asta) and dignity (exalted, moolatrikona, own,
// friend / neutral / enemy sign, debilitated). Pure functions.
//
// COMBUSTION — a graha is combust when its longitude is within these degrees of the Sun's: the
// classical orbs traced to the Surya Siddhanta (ch. 9, the "kalamsha" distances at which a graha
// disappears in the Sun's glare) and quoted in that form by most Indian almanacs and Kundli
// software: Moon 12°, Mars 17°, Mercury 14° (12° when retrograde), Jupiter 11°, Venus 10° (8° when
// retrograde), Saturn 15°. The Sun itself and the
// nodes (Rahu, Ketu) are never combust. We measure the separation in sidereal longitude (the
// same in either zodiac) and count a graha exactly on the limit as combust (distance ≤ orb).
//
// DIGNITY — Brihat Parashara Hora Shastra ch. 3 (R. Santhanam tr.) for exaltation, debilitation
// and moolatrikona, with BPHS's split of the shared signs:
//   Sun      exalted Aries, debilitated Libra, moolatrikona Leo 0°–20° (own Leo 20°–30°)
//   Moon     exalted Taurus 0°–3°, moolatrikona Taurus 3°–30°; debilitated Scorpio; own Cancer
//   Mars     exalted Capricorn, debilitated Cancer, moolatrikona Aries 0°–12°; own Aries, Scorpio
//   Mercury  Virgo 0°–15° exalted, 15°–20° moolatrikona, 20°–30° own; debilitated Pisces; own Gemini
//   Jupiter  exalted Cancer, debilitated Capricorn, moolatrikona Sagittarius 0°–10°; own Sag., Pisces
//   Venus    exalted Pisces, debilitated Virgo, moolatrikona Libra 0°–15°; own Taurus, Libra
//   Saturn   exalted Libra, debilitated Aries, moolatrikona Aquarius 0°–20°; own Capricorn, Aquarius
// Order of precedence: exalted / debilitated, then moolatrikona, then own sign, then the graha's
// NATURAL (naisargika) friendship with the sign lord (constants.ts FRIENDS, BPHS ch. 3). Temporary
// (tatkalika) friendship and the five-fold compound relation are not used here.
// Rahu and Ketu: authors disagree (Rahu exalted in Taurus or Gemini, Ketu in Scorpio or
// Sagittarius, and different own signs), so no dignity is given for them — the website shows "—".

import { relation, RASHI_LORD, type GrahaKey } from "./constants.ts";
import { angleDiff } from "./ephemeris.ts";

export type Dignity = "exalted" | "moolatrikona" | "own" | "friend" | "neutral" | "enemy" | "debilitated";

export const COMBUSTION_ORB: Partial<Record<GrahaKey, { direct: number; retro: number }>> = {
  moon: { direct: 12, retro: 12 },
  mars: { direct: 17, retro: 17 },
  mercury: { direct: 14, retro: 12 },
  jupiter: { direct: 11, retro: 11 },
  venus: { direct: 10, retro: 8 },
  saturn: { direct: 15, retro: 15 },
};

/** True / false for the five tara grahas and the Moon; null for the Sun, Rahu and Ketu (never combust). */
export function isCombust(key: GrahaKey, longitude: number, sunLongitude: number, retrograde: boolean): boolean | null {
  const orb = COMBUSTION_ORB[key];
  if (!orb) return null;
  return Math.abs(angleDiff(sunLongitude, longitude)) <= (retrograde ? orb.retro : orb.direct);
}

const EXALTED: Partial<Record<GrahaKey, number>> = { sun: 0, moon: 1, mars: 9, mercury: 5, jupiter: 3, venus: 11, saturn: 6 };
/** Moolatrikona sign and degree range [from, to) within it. */
const MOOLATRIKONA: Partial<Record<GrahaKey, [number, number, number]>> = {
  sun: [4, 0, 20],
  moon: [1, 3, 30],
  mars: [0, 0, 12],
  mercury: [5, 15, 20],
  jupiter: [8, 0, 10],
  venus: [6, 0, 15],
  saturn: [10, 0, 20],
};

/** Dignity of a graha at a sidereal longitude; null for Rahu and Ketu. */
export function dignityOf(key: GrahaKey, longitude: number): Dignity | null {
  if (key === "rahu" || key === "ketu") return null;
  const lon = ((longitude % 360) + 360) % 360;
  const sign = Math.min(11, Math.floor(lon / 30));
  const deg = lon - sign * 30;
  const ex = EXALTED[key]!;
  // BPHS splits two signs: the Moon is exalted only in Taurus 0°–3°, Mercury only in Virgo 0°–15°.
  if (sign === ex && !(key === "moon" && deg >= 3) && !(key === "mercury" && deg >= 15)) return "exalted";
  if (sign === (ex + 6) % 12) return "debilitated";
  const mt = MOOLATRIKONA[key]!;
  if (sign === mt[0] && deg >= mt[1] && deg < mt[2]) return "moolatrikona";
  const lord = RASHI_LORD[sign]!;
  if (lord === key) return "own";
  return relation(key, lord);
}

export const DIGNITY_LABEL: Record<Dignity, string> = {
  exalted: "Exalted",
  moolatrikona: "Moolatrikona",
  own: "Own sign",
  friend: "Friend's sign",
  neutral: "Neutral sign",
  enemy: "Enemy's sign",
  debilitated: "Debilitated",
};
