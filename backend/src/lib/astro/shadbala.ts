// Shadbala: the six-fold strength of the seven grahas, in virupas (60 virupas = 1 rupa).
// Pure function of a Kundli's birth instant/place, lagna, angles and graha longitudes; no database.
//
// Method: Brihat Parashara Hora Shastra ch. 27 "Shadbala" (R. Santhanam's translation, Ranjan
// Publications, vol. 1), in the form worked out in B. V. Raman, "Graha and Bhava Balas" (the BPHS/Raman
// convention, also Jagannatha Hora's default). Where traditions differ the choice is noted beside the
// formula and listed for the client in SHADBALA_CONVENTIONS.
//
// 1. STHANA BALA (positional)
//    · Uchcha: arc between the graha and its deep debilitation point (≤ 180°) ÷ 3. Exaltation points
//      (BPHS ch. 3): Sun 10° Ar, Moon 3° Ta, Mars 28° Cp, Mercury 15° Vi, Jupiter 5° Cn, Venus 27° Pi,
//      Saturn 20° Li; debilitation = exaltation + 180°.
//    · Saptavargaja: in each of D1, D2, D3, D7, D9, D12, D30 (vargas.ts): moolatrikona 45 (D1 only, in
//      the MT degrees), own sign 30, great friend 20, friend 15, neutral 10, enemy 4, great enemy 2,
//      judged by the compound (natural + temporal) relation to the varga sign's lord. Temporal
//      friendship is taken from the D1 chart (grahas 2, 3, 4, 10, 11, 12 signs away are friends).
//      Moolatrikona (BPHS ch. 3): Sun Leo 0–20°, Moon Taurus 3–30°, Mars Aries 0–12°, Mercury Virgo
//      15–20°, Jupiter Sagittarius 0–10°, Venus Libra 0–15°, Saturn Aquarius 0–20°.
//    · Ojhayugma: 15 for Moon/Venus in an even sign, for the others in an odd sign; once for the D1
//      sign and once for the navamsa sign.
//    · Kendradi: 60 in a kendra (1, 4, 7, 10), 30 in a panaphara (2, 5, 8, 11), 15 in an apoklima;
//      houses are whole-sign from the lagna (the client's confirmed house setting).
//    · Drekkana: 15 to male grahas (Sun, Mars, Jupiter) in the 1st decanate, neuter (Mercury, Saturn)
//      in the 2nd, female (Moon, Venus) in the 3rd.
// 2. DIG BALA (directional): arc from the graha's powerless point ÷ 3. Sun and Mars are strongest at
//    the MC (powerless at the IC); Jupiter and Mercury at the ascendant (powerless at the descendant);
//    Moon and Venus at the IC (powerless at the MC); Saturn at the descendant (powerless at the ascendant).
// 3. KALA BALA (temporal)
//    · Nathonnatha: distance of the Sun from midnight by hour angle (apparent solar time), as 0–60:
//      Sun, Jupiter, Venus get 60 at noon → 0 at midnight; Moon, Mars, Saturn the reverse; Mercury 60.
//    · Paksha: Moon–Sun elongation folded to 0–180°, ÷ 3 for benefics (Moon, Mercury, Jupiter, Venus);
//      malefics (Sun, Mars, Saturn) get 60 minus that. The Moon's paksha bala is doubled.
//    · Tribhaga: day (sunrise→sunset) in thirds ruled by Mercury, Sun, Saturn; night (sunset→sunrise)
//      by Moon, Venus, Mars; the ruler of the current third gets 60; Jupiter always 60.
//    · Abda / Masa / Vara / Hora: 15 / 30 / 45 / 60 to the lord of the year, month, weekday and hora.
//      Year and month lords are the weekday lords of the first day of the current 360-day year and
//      30-day month, counted (ahargana) from the Kali Yuga epoch, JD 588465.5, a Friday. Weekday and
//      hora run from sunrise (dayframe.ts).
//    · Ayana: from the declination δ of the graha's tropical longitude: (24° + δ) × 60/48 for Sun, Mars,
//      Jupiter, Venus; (24° − δ) × 60/48 for Moon and Saturn; (24° + |δ|) × 60/48 for Mercury. The
//      Sun's ayana bala is doubled.
//    · Yuddha: when two of Mars…Saturn are within 1° of longitude, the one with the larger
//      Sthana + Dig + Kala bala wins; the difference of those sums ÷ the difference of their disc
//      diameters (Surya Siddhanta: Mars 9.4, Mercury 6.6, Jupiter 190.4, Venus 16.6, Saturn 158.0) is
//      added to the winner and taken from the loser (Raman).
// 4. CHESHTA BALA (motional): the cheshta kendra (0–180°) ÷ 3. Classically the kendra is the
//    seeghrochcha minus the mean of the mean and true longitudes; it is 180° when the graha is
//    opposite its seeghrochcha (deepest retrogression) and 0° at conjunction. We take the modern
//    geometric equivalent from the real ephemeris: the angle between the graha's true heliocentric
//    longitude and the Sun's geocentric longitude (= 180° at opposition/inferior conjunction, when the
//    graha is fastest retrograde; 0° at superior conjunction, when it is fastest direct). The
//    graha's daily speed is reported beside it. Sun: its (single) ayana bala; Moon: its (single)
//    paksha bala — the BPHS/Raman convention.
// 5. NAISARGIKA BALA (natural, fixed): Sun 60, Moon 51.43, Venus 42.86, Jupiter 34.29, Mercury 25.71,
//    Mars 17.14, Saturn 8.57 (60 × n/7).
// 6. DRIK BALA (aspectual): for each other graha's aspect on this one, the BPHS drishti value from the
//    angle d = aspected − aspecting: 0–30° 0; 30–60° (d−30)/2; 60–90° d−60+15; 90–120° (120−d)/2+30;
//    120–150° 150−d; 150–180° (d−150)×2; 180–300° (300−d)/2; 300–360° 0; plus the special aspects
//    (Mars +15 at 90–120° and 210–240°, Jupiter +30 at 120–150° and 240–270°, Saturn +45 at 60–90° and
//    270–300°), each aspect capped at 60 (a full aspect). Drik bala = (Σ benefic aspects − Σ malefic aspects) ÷ 4. Benefics: Jupiter, Venus,
//    Mercury, and the Moon when waxing; malefics: Sun, Mars, Saturn, and the Moon when waning.
//
// Required minimum (BPHS ch. 27), in rupas: Sun 5, Moon 6, Mars 5, Mercury 7, Jupiter 6.5, Venus 5.5,
// Saturn 5. Ratio = total ÷ required; rank 1 = highest ratio.

import { Body, Ecliptic, HelioVector, MakeTime, SunPosition } from "astronomy-engine";
import { FRIENDS, RASHI_LORD, type GrahaKey } from "./constants.ts";
import { dayFrame } from "./dayframe.ts";
import { angleDiff, angles, norm360 } from "./ephemeris.ts";
import { julianDay, localParts } from "./time.ts";
import { vargaSign, type VargaCode } from "./vargas.ts";

export type ShadbalaPlanet = "sun" | "moon" | "mars" | "mercury" | "jupiter" | "venus" | "saturn";
export const SHADBALA_PLANETS: readonly ShadbalaPlanet[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/** Choices where schools differ; shown to the client (and in the API) so they can confirm them. */
export const SHADBALA_CONVENTIONS = [
  "Kendradi bala uses whole-sign houses (Raman uses Sripati bhavas).",
  "Mercury counts as a benefic in Paksha and Drik bala (some count it malefic when joined with malefics).",
  "The Moon's Paksha bala is doubled in Kala bala; its Cheshta bala is the single Paksha bala.",
  "The Sun's Ayana bala is doubled in Kala bala; its Cheshta bala is the single Ayana bala.",
  "Cheshta bala of Mars–Saturn uses the true heliocentric geometry (modern equivalent of the cheshta kendra).",
  "Abda and Masa lords are counted from the Kali Yuga epoch (Friday); some texts count from the creation epoch.",
  "Drik bala takes one quarter of every aspect (some Raman tables add Jupiter's and Mercury's aspects in full).",
  "Nathonnatha bala uses local apparent (sundial) time.",
] as const;

const EXALTATION: Record<ShadbalaPlanet, number> = { sun: 10, moon: 33, mars: 298, mercury: 165, jupiter: 95, venus: 357, saturn: 200 };
const MOOLATRIKONA: Record<ShadbalaPlanet, [sign: number, from: number, to: number]> = {
  sun: [4, 0, 20], moon: [1, 3, 30], mars: [0, 0, 12], mercury: [5, 15, 20], jupiter: [8, 0, 10], venus: [6, 0, 15], saturn: [10, 0, 20],
};
export const NAISARGIKA: Record<ShadbalaPlanet, number> = {
  sun: 60, moon: (60 * 6) / 7, venus: (60 * 5) / 7, jupiter: (60 * 4) / 7, mercury: (60 * 3) / 7, mars: (60 * 2) / 7, saturn: 60 / 7,
};
export const REQUIRED_RUPAS: Record<ShadbalaPlanet, number> = { sun: 5, moon: 6, mars: 5, mercury: 7, jupiter: 6.5, venus: 5.5, saturn: 5 };
const DISC: Partial<Record<ShadbalaPlanet, number>> = { mars: 9.4, mercury: 6.6, jupiter: 190.4, venus: 16.6, saturn: 158.0 };
const SAPTAVARGAS: readonly VargaCode[] = ["D1", "D2", "D3", "D7", "D9", "D12", "D30"];
const KALI_EPOCH_JD = 588465.5;

export interface ShadbalaRow {
  planet: ShadbalaPlanet;
  sthana: { uchcha: number; saptavargaja: number; ojhayugma: number; kendra: number; drekkana: number; total: number };
  dig: number;
  kala: {
    nathonnatha: number;
    paksha: number;
    tribhaga: number;
    abda: number;
    masa: number;
    vara: number;
    hora: number;
    ayana: number;
    yuddha: number;
    total: number;
  };
  cheshta: number;
  naisargika: number;
  drik: number;
  /** Sum of the six, virupas. */
  total: number;
  rupas: number;
  required: number;
  /** rupas ÷ required; ≥ 1 means the graha has its minimum strength. */
  ratio: number;
  /** 1 = strongest by ratio. */
  rank: number;
  /** Degrees per day (negative = retrograde), for reference beside Cheshta bala. */
  speed: number;
}

export interface Shadbala {
  planets: ShadbalaRow[];
  lords: { year: ShadbalaPlanet; month: ShadbalaPlanet; weekday: ShadbalaPlanet; hora: ShadbalaPlanet };
  /** No real sunrise/sunset at the birthplace that day (dayframe.ts fallback was used). */
  polarDay: boolean;
  conventions: readonly string[];
}

// ── Small pieces, exported for the tests ──

/** Shortest arc between two longitudes, 0–180°. */
export const arc = (a: number, b: number) => Math.abs(angleDiff(a, b));

export function uchchaBala(planet: ShadbalaPlanet, lon: number): number {
  return arc(lon, EXALTATION[planet] + 180) / 3;
}

type Compound = "great friend" | "friend" | "neutral" | "enemy" | "great enemy";
/** Compound relation of `of` towards `to`: natural (FRIENDS) plus temporal from their D1 signs. */
export function compoundRelation(of: ShadbalaPlanet, to: ShadbalaPlanet, signOf: number, signTo: number): Compound {
  const f = FRIENDS[of]!;
  const natural = f.friends.includes(to) ? 1 : f.enemies.includes(to) ? -1 : 0;
  const dist = ((signTo - signOf + 12) % 12) + 1;
  const temporal = [2, 3, 4, 10, 11, 12].includes(dist) ? 1 : -1;
  const sum = natural + temporal;
  return sum === 2 ? "great friend" : sum === 1 ? "friend" : sum === 0 ? "neutral" : sum === -1 ? "enemy" : "great enemy";
}
const RELATION_POINTS: Record<Compound, number> = { "great friend": 20, friend: 15, neutral: 10, enemy: 4, "great enemy": 2 };

export function isMoolatrikona(planet: ShadbalaPlanet, lon: number): boolean {
  const [sign, from, to] = MOOLATRIKONA[planet];
  const s = Math.floor(norm360(lon) / 30);
  const d = norm360(lon) - s * 30;
  return s === sign && d >= from && d < to;
}

/** BPHS drishti (0–60) of a graha at `from` on a point at `to`, with the special aspects. */
export function drishti(aspecting: ShadbalaPlanet, from: number, to: number): number {
  const d = norm360(to - from);
  let v: number;
  if (d < 30) v = 0;
  else if (d < 60) v = (d - 30) / 2;
  else if (d < 90) v = d - 60 + 15;
  else if (d < 120) v = (120 - d) / 2 + 30;
  else if (d < 150) v = 150 - d;
  else if (d < 180) v = (d - 150) * 2;
  else if (d < 300) v = (300 - d) / 2;
  else v = 0;
  if (aspecting === "mars" && ((d >= 90 && d <= 120) || (d >= 210 && d <= 240))) v += 15;
  if (aspecting === "jupiter" && ((d >= 120 && d <= 150) || (d >= 240 && d <= 270))) v += 30;
  if (aspecting === "saturn" && ((d >= 60 && d <= 90) || (d >= 270 && d <= 300))) v += 45;
  return Math.min(60, v);
}

/** Ayana bala before the Sun's doubling: (24° ± δ) × 60/48, δ the declination of the tropical longitude. */
export function ayanaBala(planet: ShadbalaPlanet, tropicalLon: number, obliquity: number): number {
  const dec = (Math.asin(Math.sin((obliquity * Math.PI) / 180) * Math.sin((tropicalLon * Math.PI) / 180)) * 180) / Math.PI;
  const k = planet === "moon" || planet === "saturn" ? 24 - dec : planet === "mercury" ? 24 + Math.abs(dec) : 24 + dec;
  return (k * 60) / 48;
}

/** Weekday (0 = Sunday) of day number `n` counted from the Kali Yuga epoch (day 0 = Friday). */
const kaliWeekday = (n: number) => (((5 + n) % 7) + 7) % 7;
const WEEKDAY_LORD: readonly ShadbalaPlanet[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

/** Year (360-day) and month (30-day) lords from the ahargana of the Vedic day that began at `sunrise`. */
export function abdaMasaLords(sunrise: Date, timezone: string): { year: ShadbalaPlanet; month: ShadbalaPlanet; ahargana: number } {
  const p = localParts(sunrise, timezone);
  const civilJd = julianDay(new Date(Date.UTC(p.year, p.month - 1, p.day)));
  const ahargana = Math.round(civilJd - KALI_EPOCH_JD);
  return {
    year: WEEKDAY_LORD[kaliWeekday(ahargana - (ahargana % 360))]!,
    month: WEEKDAY_LORD[kaliWeekday(ahargana - (ahargana % 30))]!,
    ahargana,
  };
}

const HELIO_BODY = { mars: Body.Mars, mercury: Body.Mercury, jupiter: Body.Jupiter, venus: Body.Venus, saturn: Body.Saturn } as const;

/** Cheshta kendra (0–180°) of Mars…Saturn: angle between the true heliocentric longitude and the geocentric Sun. */
export function cheshtaKendra(planet: keyof typeof HELIO_BODY, utc: Date): number {
  const t = MakeTime(utc);
  const helio = Ecliptic(HelioVector(HELIO_BODY[planet], t)).elon;
  return arc(helio, SunPosition(t).elon);
}

// ── The whole computation ──

export interface ShadbalaInput {
  birth: { utc: string; latitude: number; longitude: number; timezone: string };
  lagnaLongitude: number;
  /** Bhava madhyas from kundli.bhavas: [0] ascendant, [3] IC, [6] descendant, [9] MC. */
  madhya: number[];
  grahas: { key: GrahaKey; longitude: number; speed: number }[];
}

export function computeShadbala(input: ShadbalaInput): Shadbala {
  const utc = new Date(input.birth.utc);
  const { latitude, longitude, timezone } = input.birth;
  const ang = angles(utc, latitude, longitude);
  const lon = {} as Record<ShadbalaPlanet, number>;
  const speed = {} as Record<ShadbalaPlanet, number>;
  for (const p of SHADBALA_PLANETS) {
    const g = input.grahas.find((x) => x.key === p);
    if (!g) throw new Error(`shadbala: missing ${p}`);
    lon[p] = norm360(g.longitude);
    speed[p] = g.speed;
  }
  const sign = (l: number) => Math.floor(norm360(l) / 30);
  const lagnaSign = sign(input.lagnaLongitude);
  const d1 = Object.fromEntries(SHADBALA_PLANETS.map((p) => [p, sign(lon[p])])) as Record<ShadbalaPlanet, number>;

  // Time pieces.
  const frame = dayFrame(utc, latitude, longitude, timezone);
  const { year, month } = abdaMasaLords(frame.sunrise, timezone);
  const weekdayLord = frame.dayLord as ShadbalaPlanet;
  const horaLord = frame.horaLord as ShadbalaPlanet;
  const sunTropical = lon.sun + ang.ayanamsa;
  // Hour angle of the Sun: RAMC − RA(Sun). 0 = local apparent noon, ±180 = midnight.
  const sunRa = (Math.atan2(Math.sin((sunTropical * Math.PI) / 180) * Math.cos((ang.obliquity * Math.PI) / 180), Math.cos((sunTropical * Math.PI) / 180)) * 180) / Math.PI;
  const hourAngle = angleDiff(sunRa, ang.ramc);
  const dayStrength = (180 - Math.abs(hourAngle)) / 3; // 60 at noon, 0 at midnight
  const elong = arc(lon.moon, lon.sun); // 0–180
  const waxing = norm360(lon.moon - lon.sun) < 180;

  let third: ShadbalaPlanet;
  const t = utc.getTime();
  if (frame.isDay) {
    const part = Math.min(2, Math.floor(((t - frame.sunrise.getTime()) / (frame.sunset.getTime() - frame.sunrise.getTime())) * 3));
    third = (["mercury", "sun", "saturn"] as const)[part]!;
  } else {
    const part = Math.min(2, Math.floor(((t - frame.sunset.getTime()) / (frame.nextSunrise.getTime() - frame.sunset.getTime())) * 3));
    third = (["moon", "venus", "mars"] as const)[part]!;
  }

  const IC = input.madhya[3]!;
  const DSC = input.madhya[6]!;
  const MC = input.madhya[9]!;
  const ASC = input.madhya[0]!;
  const POWERLESS: Record<ShadbalaPlanet, number> = { sun: IC, mars: IC, jupiter: DSC, mercury: DSC, moon: MC, venus: MC, saturn: ASC };
  const BENEFIC_PAKSHA: Record<ShadbalaPlanet, boolean> = { sun: false, moon: true, mars: false, mercury: true, jupiter: true, venus: true, saturn: false };
  const isBeneficForDrik = (p: ShadbalaPlanet) => (p === "moon" ? waxing : p === "jupiter" || p === "venus" || p === "mercury");

  type Partial = Omit<ShadbalaRow, "total" | "rupas" | "ratio" | "rank" | "required">;
  const rows: Partial[] = SHADBALA_PLANETS.map((p) => {
    const l = lon[p];
    const degInSign = l - d1[p] * 30;

    // Sthana
    const uchcha = uchchaBala(p, l);
    let saptavargaja = 0;
    for (const code of SAPTAVARGAS) {
      const vs = vargaSign(code, l);
      const lord = RASHI_LORD[vs] as ShadbalaPlanet; // sign lords are always one of the seven
      if (code === "D1" && isMoolatrikona(p, l)) saptavargaja += 45;
      else if (lord === p) saptavargaja += 30;
      else saptavargaja += RELATION_POINTS[compoundRelation(p, lord, d1[p], d1[lord])];
    }
    const female = p === "moon" || p === "venus";
    const oddSign = (s: number) => s % 2 === 0;
    const ojhayugma = (oddSign(d1[p]) !== female ? 15 : 0) + (oddSign(vargaSign("D9", l)) !== female ? 15 : 0);
    const house = ((d1[p] - lagnaSign + 12) % 12) + 1;
    const kendra = [1, 4, 7, 10].includes(house) ? 60 : [2, 5, 8, 11].includes(house) ? 30 : 15;
    const decanate = Math.min(2, Math.floor(degInSign / 10));
    const wantDecanate = p === "sun" || p === "mars" || p === "jupiter" ? 0 : p === "mercury" || p === "saturn" ? 1 : 2;
    const drekkana = decanate === wantDecanate ? 15 : 0;

    // Dig
    const dig = arc(l, POWERLESS[p]) / 3;

    // Kala
    const nathonnatha = p === "mercury" ? 60 : p === "sun" || p === "jupiter" || p === "venus" ? dayStrength : 60 - dayStrength;
    const pakshaSingle = BENEFIC_PAKSHA[p] ? elong / 3 : 60 - elong / 3;
    const paksha = p === "moon" ? pakshaSingle * 2 : pakshaSingle;
    const tribhaga = p === "jupiter" || p === third ? 60 : 0;
    const abda = p === year ? 15 : 0;
    const masa = p === month ? 30 : 0;
    const vara = p === weekdayLord ? 45 : 0;
    const hora = p === horaLord ? 60 : 0;
    const ayanaSingle = ayanaBala(p, l + ang.ayanamsa, ang.obliquity);
    const ayana = p === "sun" ? ayanaSingle * 2 : ayanaSingle;

    // Cheshta
    const cheshta = p === "sun" ? ayanaSingle : p === "moon" ? pakshaSingle : cheshtaKendra(p, utc) / 3;

    // Drik
    let drik = 0;
    for (const q of SHADBALA_PLANETS) {
      if (q === p) continue;
      const v = drishti(q, lon[q], l);
      drik += isBeneficForDrik(q) ? v : -v;
    }
    drik /= 4;

    const sthanaTotal = uchcha + saptavargaja + ojhayugma + kendra + drekkana;
    const kalaNoYuddha = nathonnatha + paksha + tribhaga + abda + masa + vara + hora + ayana;
    return {
      planet: p,
      sthana: { uchcha, saptavargaja, ojhayugma, kendra, drekkana, total: sthanaTotal },
      dig,
      kala: { nathonnatha, paksha, tribhaga, abda, masa, vara, hora, ayana, yuddha: 0, total: kalaNoYuddha },
      cheshta,
      naisargika: NAISARGIKA[p],
      drik,
      speed: speed[p],
    };
  });

  // Yuddha (planetary war) between Mars…Saturn within 1°.
  const warriors = rows.filter((r) => DISC[r.planet] !== undefined);
  for (let i = 0; i < warriors.length; i++) {
    for (let j = i + 1; j < warriors.length; j++) {
      const a = warriors[i]!;
      const b = warriors[j]!;
      if (arc(lon[a.planet], lon[b.planet]) >= 1) continue;
      const sa = a.sthana.total + a.dig + a.kala.total;
      const sb = b.sthana.total + b.dig + b.kala.total;
      const [win, lose] = sa >= sb ? [a, b] : [b, a];
      const diam = Math.abs(DISC[a.planet]! - DISC[b.planet]!) || 1;
      const y = Math.abs(sa - sb) / diam;
      win.kala.yuddha += y;
      lose.kala.yuddha -= y;
    }
  }
  for (const r of rows) r.kala.total += r.kala.yuddha;

  const full: ShadbalaRow[] = rows.map((r) => {
    const total = r.sthana.total + r.dig + r.kala.total + r.cheshta + r.naisargika + r.drik;
    const rupas = total / 60;
    const required = REQUIRED_RUPAS[r.planet];
    return { ...r, total, rupas, required, ratio: rupas / required, rank: 0 };
  });
  [...full].sort((a, b) => b.ratio - a.ratio).forEach((r, i) => (r.rank = i + 1));

  return {
    planets: full,
    lords: { year, month, weekday: weekdayLord, hora: horaLord },
    polarDay: frame.polar,
    conventions: SHADBALA_CONVENTIONS,
  };
}
