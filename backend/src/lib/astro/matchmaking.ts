// Ashtakoota guna milan (36 points) from the two Moons, plus a Mangal (Kuja) dosha check for each.
// Tables are in constants.ts with their sources. Scores are the raw classical totals; traditional
// cancellations (parihara) are listed as notes rather than silently changing the score.

import {
  GRAHA_NAMES, NAKSHATRA_GANA, NAKSHATRA_YONI, RASHI_LORD, VARNA, VARNA_NAMES, VASHYA_NAMES, YONI_ANIMALS,
  YONI_POINTS, ganaPoints, nakshatraNadi, relation, vashyaGroup, vashyaPoints,
} from "./constants.ts";
import { angles, grahaPositions, outsideTestedRange } from "./ephemeris.ts";
import { nakshatraInfo, signInfo, type NakshatraInfo, type SignInfo } from "./kundli.ts";
import { zonedToUtc } from "./time.ts";

export interface MatchPerson {
  name?: string;
  date: string;
  /** Optional; without it the Moon is taken at local noon and the result is flagged if the Moon changed nakshatra that day. */
  time?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface Koota {
  key: string;
  name: string;
  max: number;
  points: number;
  about: string;
  /** What each person has for this koota, e.g. "Brahmin" / "Vaishya". */
  boy: string;
  girl: string;
}

export interface MangalDosha {
  present: boolean;
  /** Mars's house counted from the lagna (null without a birth time) and from the Moon. */
  fromLagna: number | null;
  fromMoon: number;
  marsSign: SignInfo;
  /** Classical reasons the dosha is considered cancelled or reduced. */
  cancellations: string[];
}

export interface PersonMoon {
  name: string;
  moonLongitude: number;
  moonSign: SignInfo;
  nakshatra: NakshatraInfo;
  /** The Moon changed nakshatra or sign during the birth date and no time was given. */
  uncertain: boolean;
  /** No birth time was given, so 12:00 noon local time at the birthplace was used. */
  timeAssumed: boolean;
  /** The birth date is outside 1700–2200, where the ephemeris is less certain. */
  outsideTestedRange: boolean;
  mangal: MangalDosha;
}

export interface Match {
  boy: PersonMoon;
  girl: PersonMoon;
  kootas: Koota[];
  total: number;
  max: 36;
  /** Traditional reading of the total: 28+ excellent, 18+ good (acceptable by tradition), below 18 not advised. */
  verdict: "excellent" | "good" | "below-threshold";
  notes: string[];
  /** Plain-language strengths of this match, from the kootas, Mangal dosha and the total (client, Nov 2026). */
  pros: string[];
  /** Plain-language cautions of this match, from the same data. */
  cons: string[];
}

const DOSHA_HOUSES = new Set([1, 2, 4, 7, 8, 12]);

/**
 * Mangal (Kuja) dosha: Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house counted (whole-sign) from
 * the lagna or from the Moon. `lagnaLongitude` null = no birth time (Moon only). The classical
 * cancellations below are listed, not used to clear the flag. Shared by the Kundli's dosha section.
 */
export function mangalDosha(marsLongitude: number, moonLongitude: number, lagnaLongitude: number | null, jupiterLongitude: number): MangalDosha {
  const moonSign = Math.floor(moonLongitude / 30);
  const marsSign = Math.floor(marsLongitude / 30);
  const fromMoon = ((marsSign - moonSign + 12) % 12) + 1;
  const fromLagna = lagnaLongitude !== null ? ((marsSign - Math.floor(lagnaLongitude / 30) + 12) % 12) + 1 : null;
  const present = DOSHA_HOUSES.has(fromMoon) || (fromLagna !== null && DOSHA_HOUSES.has(fromLagna));
  const cancellations: string[] = [];
  if (present) {
    if (marsSign === 0 || marsSign === 7) cancellations.push(`Mars is in its own sign (${signInfo(marsSign).name}).`);
    if (marsSign === 9) cancellations.push("Mars is exalted in Capricorn.");
    if (Math.floor(jupiterLongitude / 30) === marsSign) cancellations.push("Mars is joined by Jupiter.");
    if (moonSign === marsSign) cancellations.push("Mars is joined by the Moon.");
  }
  return { present, fromLagna, fromMoon, marsSign: signInfo(marsSign), cancellations };
}

function personMoon(p: MatchPerson, fallbackName: string): PersonMoon {
  const time = p.time ?? "12:00";
  const z = zonedToUtc(p.date, time, p.timezone);
  const pos = grahaPositions(z.utc);
  const moon = pos.find((g) => g.key === "moon")!;
  const mars = pos.find((g) => g.key === "mars")!;
  const jupiter = pos.find((g) => g.key === "jupiter")!;

  let uncertain = false;
  if (!p.time) {
    const dayStart = grahaPositions(zonedToUtc(p.date, "00:00", p.timezone).utc).find((g) => g.key === "moon")!;
    const dayEnd = grahaPositions(zonedToUtc(p.date, "23:59:59", p.timezone).utc).find((g) => g.key === "moon")!;
    uncertain =
      nakshatraInfo(dayStart.longitude).index !== nakshatraInfo(dayEnd.longitude).index ||
      Math.floor(dayStart.longitude / 30) !== Math.floor(dayEnd.longitude / 30);
  }

  const moonSign = Math.floor(moon.longitude / 30);
  const lagna = p.time ? angles(z.utc, p.latitude, p.longitude).ascendant : null;
  const mangal = mangalDosha(mars.longitude, moon.longitude, lagna, jupiter.longitude);

  return {
    name: p.name?.trim() || fallbackName,
    moonLongitude: moon.longitude,
    moonSign: signInfo(moonSign),
    nakshatra: nakshatraInfo(moon.longitude),
    uncertain,
    timeAssumed: !p.time,
    outsideTestedRange: outsideTestedRange(p.date),
    mangal,
  };
}

/** Counting from one nakshatra to another, inclusive (1–27). */
const countFrom = (from: number, to: number) => ((to - from + 27) % 27) + 1;
const TARA_NAMES = ["Janma", "Sampat", "Vipat", "Kshema", "Pratyari", "Sadhaka", "Vadha", "Mitra", "Ati-mitra"];

export function scoreKootas(boy: { moonLongitude: number }, girl: { moonLongitude: number }): Koota[] {
  const bSign = Math.floor(boy.moonLongitude / 30);
  const gSign = Math.floor(girl.moonLongitude / 30);
  const bNak = nakshatraInfo(boy.moonLongitude).index;
  const gNak = nakshatraInfo(girl.moonLongitude).index;

  // 1. Varna: the groom's varna should be equal to or higher than the bride's.
  const varna = VARNA[bSign]! >= VARNA[gSign]! ? 1 : 0;

  // 2. Vashya.
  const bV = vashyaGroup(boy.moonLongitude);
  const gV = vashyaGroup(girl.moonLongitude);

  // 3. Tara: count girl → boy and boy → girl; remainders 3, 5, 7 (of 9) are inauspicious. 1.5 each way.
  const taraOf = (n: number) => (n % 9 === 0 ? 9 : n % 9);
  const t1 = taraOf(countFrom(gNak, bNak));
  const t2 = taraOf(countFrom(bNak, gNak));
  const bad = (t: number) => t === 3 || t === 5 || t === 7;
  const tara = (bad(t1) ? 0 : 1.5) + (bad(t2) ? 0 : 1.5);

  // 4. Yoni.
  const bY = NAKSHATRA_YONI[bNak]!;
  const gY = NAKSHATRA_YONI[gNak]!;

  // 5. Graha Maitri: friendship of the Moon-sign lords, both ways.
  const bL = RASHI_LORD[bSign]!;
  const gL = RASHI_LORD[gSign]!;
  let maitri: number;
  if (bL === gL) maitri = 5;
  else {
    const rels = [relation(bL, gL), relation(gL, bL)].sort().join("+");
    maitri = ({ "friend+friend": 5, "friend+neutral": 4, "neutral+neutral": 3, "enemy+friend": 1, "enemy+neutral": 0.5, "enemy+enemy": 0 } as Record<string, number>)[rels]!;
  }

  // 6. Gana.
  const bG = NAKSHATRA_GANA[bNak]!;
  const gG = NAKSHATRA_GANA[gNak]!;

  // 7. Bhakoot: sign distance pairs 2/12, 5/9, 6/8 score 0; 1/1, 3/11, 4/10, 7/7 score 7.
  const d = ((bSign - gSign + 12) % 12) + 1;
  const bhakoot = [2, 12, 5, 9, 6, 8].includes(d) ? 0 : 7;

  // 8. Nadi: the same nadi scores 0.
  const bN = nakshatraNadi(bNak);
  const gN = nakshatraNadi(gNak);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return [
    { key: "varna", name: "Varna", max: 1, points: varna, about: "Spiritual compatibility", boy: VARNA_NAMES[VARNA[bSign]!]!, girl: VARNA_NAMES[VARNA[gSign]!]! },
    { key: "vashya", name: "Vashya", max: 2, points: vashyaPoints(bV, gV), about: "Mutual attraction", boy: VASHYA_NAMES[bV], girl: VASHYA_NAMES[gV] },
    { key: "tara", name: "Tara", max: 3, points: tara, about: "Health and wellbeing", boy: `${TARA_NAMES[t1 - 1]} (from her star)`, girl: `${TARA_NAMES[t2 - 1]} (from his star)` },
    { key: "yoni", name: "Yoni", max: 4, points: YONI_POINTS[bY]![gY]!, about: "Physical compatibility", boy: YONI_ANIMALS[bY]!, girl: YONI_ANIMALS[gY]! },
    { key: "maitri", name: "Graha Maitri", max: 5, points: maitri, about: "Friendship of Moon signs", boy: GRAHA_NAMES[bL].en, girl: GRAHA_NAMES[gL].en },
    { key: "gana", name: "Gana", max: 6, points: ganaPoints(bG, gG), about: "Temperament", boy: cap(bG), girl: cap(gG) },
    { key: "bhakoot", name: "Bhakoot", max: 7, points: bhakoot, about: "Family and finances", boy: signInfo(bSign).name, girl: signInfo(gSign).name },
    { key: "nadi", name: "Nadi", max: 8, points: bN === gN ? 0 : 8, about: "Health of progeny", boy: cap(bN), girl: cap(gN) },
  ];
}

/**
 * Pros and cons in plain words, from the calculated kootas: a koota scoring at least three-quarters
 * of its points is a pro, one scoring a quarter or less is a con (the ones in between are neither).
 * Mangal dosha and the total add their own line; a dosha that tradition cancels says so.
 */
export function prosAndCons(
  boy: PersonMoon,
  girl: PersonMoon,
  kootas: Koota[],
  total: number,
  cancelled: { nadi: boolean; bhakoot: boolean },
): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  const pts = (k: Koota) => `${k.name} ${k.points}/${k.max}`;
  const LINES: Record<string, (k: Koota) => [pro: string, con: string]> = {
    varna: (k) => [`Similar outlook on values and personal growth (${pts(k)}).`, `Different outlooks on values and duty — worth talking through (${pts(k)}).`],
    vashya: (k) => [`Strong natural attraction and influence on each other (${pts(k)}).`, `Little natural pull between ${k.boy} and ${k.girl} signs; closeness may take effort (${pts(k)}).`],
    tara: (k) => [`Birth stars support each other's health and wellbeing (${pts(k)}).`, `Birth stars are unfavourable for each other's wellbeing (${pts(k)}).`],
    yoni: (k) => [`Good physical and emotional compatibility — ${k.boy} and ${k.girl} yoni (${pts(k)}).`, `Physical temperaments clash — ${k.boy} and ${k.girl} yoni (${pts(k)}).`],
    maitri: (k) =>
      k.boy === k.girl
        ? [`Both Moon signs are ruled by ${k.boy} — easy mental understanding (${pts(k)}).`, `Moon-sign lords are not friendly (${pts(k)}).`]
        : [`Moon-sign lords ${k.boy} and ${k.girl} are friendly — easy mental understanding (${pts(k)}).`, `Moon-sign lords ${k.boy} and ${k.girl} are not friendly — differences of opinion are likely (${pts(k)}).`],
    gana: (k) => [
      k.boy === k.girl ? `Matching temperaments — both ${k.boy} gana (${pts(k)}).` : `Compatible temperaments — ${k.boy} and ${k.girl} gana (${pts(k)}).`,
      `Different temperaments — ${k.boy} and ${k.girl} gana may cause friction (${pts(k)}).`,
    ],
    bhakoot: (k) => [
      `Moon signs ${k.boy} and ${k.girl} sit well together for family harmony and finances (${pts(k)}).`,
      cancelled.bhakoot
        ? `Bhakoot dosha between ${k.boy} and ${k.girl}, though tradition treats it as cancelled here (${pts(k)}).`
        : `Bhakoot dosha: ${k.boy} and ${k.girl} fall 2/12, 5/9 or 6/8 apart, which tradition links to strain on family and finances (${pts(k)}).`,
    ],
    nadi: (k) => [
      `Different nadis (${k.boy} and ${k.girl}) — favourable for health and children (${pts(k)}).`,
      cancelled.nadi
        ? `Same nadi (${k.boy}), though tradition treats this Nadi dosha as cancelled here (${pts(k)}).`
        : `Same nadi (${k.boy}) — Nadi dosha, the strongest caution in guna milan, for health and children (${pts(k)}).`,
    ],
  };
  for (const k of kootas) {
    const line = LINES[k.key];
    if (!line) continue;
    const share = k.points / k.max;
    if (share >= 0.75) pros.push(line(k)[0]);
    else if (share <= 0.25) cons.push(line(k)[1]);
  }

  const boyM = boy.mangal.present;
  const girlM = girl.mangal.present;
  if (!boyM && !girlM) pros.push("Neither has Mangal dosha.");
  else if (boyM && girlM) pros.push("Both have Mangal dosha, which tradition treats as cancelling out.");
  else {
    const who = boyM ? boy : girl;
    // The classical cancellations (Mars in its own sign, exalted, with Jupiter or the Moon) soften it.
    cons.push(
      who.mangal.cancellations.length
        ? `Mangal dosha for ${who.name} only, though reduced: ${who.mangal.cancellations.map((c) => c.replace(/\.$/, "")).join("; ")} — worth confirming with an astrologer.`
        : `Mangal dosha for ${who.name} only — usually checked further by an astrologer.`,
    );
  }

  if (total >= 28) pros.unshift(`Excellent overall score: ${total} of 36 gunas.`);
  else if (total >= 18) pros.unshift(`Acceptable overall score: ${total} of 36 gunas (18 or more is traditionally fine).`);
  else cons.unshift(`Low overall score: ${total} of 36 gunas — below the traditional 18.`);
  return { pros, cons };
}

export function matchmaking(boyIn: MatchPerson, girlIn: MatchPerson): Match {
  const boy = personMoon(boyIn, "Boy");
  const girl = personMoon(girlIn, "Girl");
  const kootas = scoreKootas(boy, girl);
  const total = kootas.reduce((s, k) => s + k.points, 0);
  const notes: string[] = [];
  const cancelled = { nadi: false, bhakoot: false };

  const nadi = kootas.find((k) => k.key === "nadi")!;
  if (nadi.points === 0) {
    cancelled.nadi = true;
    if (boy.moonSign.index === girl.moonSign.index && boy.nakshatra.index !== girl.nakshatra.index) {
      notes.push("Nadi dosha: both Moons share a sign but not a nakshatra, which tradition treats as a cancellation.");
    } else if (boy.nakshatra.index === girl.nakshatra.index && boy.moonSign.index !== girl.moonSign.index) {
      notes.push("Nadi dosha: same nakshatra but different Moon signs, which tradition treats as a cancellation.");
    } else if (boy.nakshatra.index === girl.nakshatra.index && boy.nakshatra.pada !== girl.nakshatra.pada) {
      notes.push("Nadi dosha: same nakshatra in different padas, which some traditions treat as a cancellation.");
    } else {
      cancelled.nadi = false;
      notes.push("Nadi dosha: both have the same nadi.");
    }
  }
  const bhakoot = kootas.find((k) => k.key === "bhakoot")!;
  if (bhakoot.points === 0) {
    const bL = boy.moonSign.lord;
    const gL = girl.moonSign.lord;
    cancelled.bhakoot = bL === gL || (relation(bL, gL) === "friend" && relation(gL, bL) === "friend");
    if (bL === gL) notes.push("Bhakoot dosha: both Moon signs share a lord, which tradition treats as a cancellation.");
    else if (cancelled.bhakoot) notes.push("Bhakoot dosha: the Moon-sign lords are mutual friends, which tradition treats as a cancellation.");
    else notes.push("Bhakoot dosha: the Moon signs fall 2/12, 5/9 or 6/8 from each other.");
  }
  if (boy.mangal.present && girl.mangal.present) notes.push("Both have Mangal dosha, which tradition treats as cancelling out.");
  else if (boy.mangal.present || girl.mangal.present) notes.push(`Mangal dosha for ${boy.mangal.present ? boy.name : girl.name} only.`);
  for (const p of [boy, girl]) {
    if (p.uncertain) notes.push(`${p.name}'s Moon changed nakshatra or sign during the birth date; add a birth time for an exact score.`);
  }

  const verdict = total >= 28 ? "excellent" : total >= 18 ? "good" : "below-threshold";
  return { boy, girl, kootas, total, max: 36, verdict, notes, ...prosAndCons(boy, girl, kootas, total, cancelled) };
}

