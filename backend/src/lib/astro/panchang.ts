// Panchang for a civil date at a place: the five limbs (tithi, vara, nakshatra, yoga, karana) as
// they stand at local sunrise, each with the time it ends (and whatever follows before the next
// sunrise), plus sunrise/sunset/moonrise/moonset and the day's Rahu Kaal, Yamaganda, Gulika and
// Abhijit muhurta.
//
// Rise and set times are astronomy-engine's: the upper limb of the disc touching the horizon with
// the standard 34′ refraction, at sea level — the convention used by almanacs and timeanddate.com.

import { Body, MakeTime, Observer, SearchMoonPhase, SearchRiseSet } from "astronomy-engine";
import {
  DASHA_ORDER, GULIKA_PART, MOVABLE_KARANAS, NAKSHATRAS, RAHU_KAAL_PART, TITHI_NAMES, VARAS, YAMAGANDA_PART, YOGAS,
} from "./constants.ts";
import { findCrossing, norm360, outsideTestedRange, siderealLongitude } from "./ephemeris.ts";
import { signInfo, type SignInfo } from "./kundli.ts";
import { DAY_MS, localParts, offsetLabel, parseDate, stamp, utcOffsetSeconds, zonedToUtc, type Stamp } from "./time.ts";

export interface PanchangInput {
  /** "YYYY-MM-DD", civil date at the place. */
  date: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** One limb's value and when it ends (null when it outlasts the search window). */
export interface Limb {
  index: number;
  name: string;
  end: Stamp | null;
}

export interface TithiLimb extends Limb {
  paksha: "Shukla" | "Krishna";
  /** 1–15 within the paksha. */
  number: number;
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
  /** Limbs from sunrise to the next sunrise, in order; [0] is the one prevailing at sunrise. */
  tithi: TithiLimb[];
  nakshatra: (Limb & { pada: number })[];
  yoga: Limb[];
  karana: Limb[];
  paksha: "Shukla" | "Krishna";
  /** Lunar month, amanta (month ends at new moon) and purnimanta (ends at full moon) reckoning. */
  month: { amanta: string; purnimanta: string; adhika: boolean };
  sunSign: SignInfo;
  moonSign: SignInfo;
  rahuKaal: Span | null;
  yamaganda: Span | null;
  gulika: Span | null;
  /** The 8th of 15 daytime muhurtas. Traditionally not observed on Wednesdays. */
  abhijit: Span | null;
  /** The date is outside 1700–2200, where the ephemeris is less certain. */
  outsideTestedRange: boolean;
  /** Set when the Sun doesn't rise or set that day at this latitude. */
  note?: string;
}

export const LUNAR_MONTHS = [
  "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada",
  "Ashwin", "Kartika", "Margashirsha", "Pausha", "Magha", "Phalguna",
];

const NAK = 360 / 27;

/** Moon − Sun, 0–360°; the same in either zodiac. */
export const elongation = (d: Date) => {
  const t = MakeTime(d);
  return norm360(siderealLongitude("moon", t) - siderealLongitude("sun", t));
};
const moonSid = (d: Date) => siderealLongitude("moon", MakeTime(d));
const yogaSum = (d: Date) => {
  const t = MakeTime(d);
  return norm360(siderealLongitude("moon", t) + siderealLongitude("sun", t));
};

export function tithiName(index: number): { name: string; paksha: "Shukla" | "Krishna"; number: number } {
  const paksha = index < 15 ? "Shukla" : "Krishna";
  const n = index % 15;
  const name = n === 14 ? (paksha === "Shukla" ? "Purnima" : "Amavasya") : TITHI_NAMES[n]!;
  return { name, paksha, number: n + 1 };
}

/** Karana from its index in the lunar month (0–59). */
export function karanaName(index: number): string {
  if (index === 0) return "Kimstughna";
  if (index >= 57) return ["Shakuni", "Chatushpada", "Naga"][index - 57]!;
  return MOVABLE_KARANAS[(index - 1) % 7]!;
}

/** Walks a steadily increasing angle from `from` to `until`, cutting it into spans of `size` degrees. */
function segments(f: (d: Date) => number, size: number, count: number, from: Date, until: Date) {
  const out: { index: number; end: Date | null }[] = [];
  let index = Math.floor(f(from) / size) % count;
  let t = from;
  for (let guard = 0; guard < 6; guard++) {
    const end = findCrossing(f, ((index + 1) % count) * size, t, 2);
    out.push({ index, end });
    if (!end || end >= until) break;
    t = new Date(end.getTime() + 1000);
    index = (index + 1) % count;
  }
  return out;
}

function lunarMonth(at: Date) {
  // The amanta month is named from the Sun's sidereal sign at the new moon that began it:
  // Sun in Meena (Pisces) at that new moon → Chaitra, and so on. Two new moons in one sign → adhika.
  const prevNew = SearchMoonPhase(0, at, -32);
  const nextNew = prevNew ? SearchMoonPhase(0, prevNew.AddDays(1), 32) : null;
  if (!prevNew || !nextNew) return { amanta: "", purnimanta: "", adhika: false };
  const sunAtPrev = Math.floor(siderealLongitude("sun", prevNew) / 30);
  const sunAtNext = Math.floor(siderealLongitude("sun", nextNew) / 30);
  const monthIndex = (sunAtPrev + 1) % 12;
  const adhika = sunAtPrev === sunAtNext;
  // Purnimanta months run full moon to full moon, so the dark fortnight belongs to the next month.
  const krishna = elongation(at) >= 180;
  const purnIndex = krishna && !adhika ? (monthIndex + 1) % 12 : monthIndex;
  return { amanta: LUNAR_MONTHS[monthIndex]!, purnimanta: LUNAR_MONTHS[purnIndex]!, adhika };
}

export function buildPanchang(input: PanchangInput): Panchang {
  const d = parseDate(input.date);
  if (!d) throw new RangeError("Invalid date");
  const tz = input.timezone;
  const observer = new Observer(input.latitude, input.longitude, 0);
  const midnight = zonedToUtc(input.date, "00:00", tz).utc;
  const nextDay = new Date(Date.UTC(d.year, d.month - 1, d.day) + DAY_MS).toISOString().slice(0, 10);
  const nextMidnight = zonedToUtc(nextDay, "00:00", tz).utc;

  const within = (t: ReturnType<typeof SearchRiseSet>, end: Date) => (t && t.date < end ? t.date : null);
  const sunrise = within(SearchRiseSet(Body.Sun, observer, +1, midnight, 1), nextMidnight);
  const sunset = within(SearchRiseSet(Body.Sun, observer, -1, sunrise ?? midnight, 1), nextMidnight);
  const nextSunrise = SearchRiseSet(Body.Sun, observer, +1, sunrise ? new Date(sunrise.getTime() + 60_000) : nextMidnight, 2)?.date ?? null;
  const moonrise = within(SearchRiseSet(Body.Moon, observer, +1, midnight, 1), nextMidnight);
  const moonset = within(SearchRiseSet(Body.Moon, observer, -1, midnight, 1), nextMidnight);

  // Limbs are read at sunrise (the Vedic day begins then); without one, at local midnight.
  const from = sunrise ?? midnight;
  const until = nextSunrise ?? new Date(from.getTime() + DAY_MS);
  const st = (x: Date | null) => (x ? stamp(x, tz) : null);

  const tithi = segments(elongation, 12, 30, from, until).map((s) => ({ index: s.index, ...tithiName(s.index), end: st(s.end) }));
  const nakshatra = segments(moonSid, NAK, 27, from, until).map((s) => ({
    index: s.index,
    name: NAKSHATRAS[s.index]!,
    pada: Math.floor((moonSid(from) - s.index * NAK) / (NAK / 4)) + 1,
    end: st(s.end),
  }));
  // Pada only makes sense for the nakshatra at sunrise; later ones start at pada 1.
  nakshatra.forEach((n, i) => {
    if (i > 0) n.pada = 1;
    n.pada = Math.min(4, Math.max(1, n.pada));
  });
  const yoga = segments(yogaSum, NAK, 27, from, until).map((s) => ({ index: s.index, name: YOGAS[s.index]!, end: st(s.end) }));
  const karana = segments(elongation, 6, 60, from, until).map((s) => ({ index: s.index, name: karanaName(s.index), end: st(s.end) }));

  const weekday = localParts(new Date(Date.UTC(d.year, d.month - 1, d.day, 12)), "UTC").weekday;
  const vara = VARAS[weekday]!;

  let rahuKaal: Span | null = null;
  let yamaganda: Span | null = null;
  let gulika: Span | null = null;
  let abhijit: Span | null = null;
  if (sunrise && sunset) {
    const day = sunset.getTime() - sunrise.getTime();
    const part = (n: number): Span => ({
      start: stamp(new Date(sunrise.getTime() + ((n - 1) * day) / 8), tz),
      end: stamp(new Date(sunrise.getTime() + (n * day) / 8), tz),
    });
    rahuKaal = part(RAHU_KAAL_PART[weekday]!);
    yamaganda = part(YAMAGANDA_PART[weekday]!);
    gulika = part(GULIKA_PART[weekday]!);
    abhijit = {
      start: stamp(new Date(sunrise.getTime() + (7 * day) / 15), tz),
      end: stamp(new Date(sunrise.getTime() + (8 * day) / 15), tz),
    };
  }

  const t = MakeTime(from);
  return {
    date: input.date,
    timezone: tz,
    utcOffset: offsetLabel(utcOffsetSeconds(from, tz)),
    latitude: input.latitude,
    longitude: input.longitude,
    vara: { index: weekday, name: vara.en, sanskrit: vara.sa },
    sunrise: st(sunrise),
    sunset: st(sunset),
    moonrise: st(moonrise),
    moonset: st(moonset),
    tithi,
    nakshatra,
    yoga,
    karana,
    paksha: tithi[0]!.paksha,
    month: lunarMonth(from),
    sunSign: signInfo(Math.floor(siderealLongitude("sun", t) / 30)),
    moonSign: signInfo(Math.floor(siderealLongitude("moon", t) / 30)),
    rahuKaal,
    yamaganda,
    gulika,
    abhijit,
    outsideTestedRange: outsideTestedRange(input.date),
    ...(sunrise && sunset ? {} : { note: "The Sun does not both rise and set on this date at this latitude; limbs are given from local midnight." }),
  };
}

/** The five limbs at one instant (a birth), not at sunrise. */
export interface BirthPanchang {
  tithi: { index: number; name: string; paksha: "Shukla" | "Krishna"; number: number };
  /**
   * The Vedic weekday: the day runs from sunrise to sunrise, so a birth before that date's sunrise
   * belongs to the previous weekday (`beforeSunrise` true). Without a sunrise (polar day/night) the
   * civil weekday is used.
   */
  vara: { index: number; name: string; sanskrit: string; lord: string; civil: string; beforeSunrise: boolean };
  nakshatra: { index: number; name: string; pada: number; lord: string };
  yoga: { index: number; name: string };
  karana: { index: number; name: string };
  sunrise: Stamp | null;
  sunset: Stamp | null;
}

/** Panchang limbs at the birth moment `utc`, plus that civil date's sunrise and sunset at the place. */
export function birthPanchang(date: string, utc: Date, latitude: number, longitude: number, tz: string): BirthPanchang {
  const d = parseDate(date);
  if (!d) throw new RangeError("Invalid date");
  const observer = new Observer(latitude, longitude, 0);
  const midnight = zonedToUtc(date, "00:00", tz).utc;
  const nextDay = new Date(Date.UTC(d.year, d.month - 1, d.day) + DAY_MS).toISOString().slice(0, 10);
  const nextMidnight = zonedToUtc(nextDay, "00:00", tz).utc;
  const within = (t: ReturnType<typeof SearchRiseSet>) => (t && t.date < nextMidnight ? t.date : null);
  const sunrise = within(SearchRiseSet(Body.Sun, observer, +1, midnight, 1));
  const sunset = within(SearchRiseSet(Body.Sun, observer, -1, sunrise ?? midnight, 1));

  const civil = localParts(new Date(Date.UTC(d.year, d.month - 1, d.day, 12)), "UTC").weekday;
  const beforeSunrise = sunrise !== null && utc < sunrise;
  const weekday = beforeSunrise ? (civil + 6) % 7 : civil;
  const v = VARAS[weekday]!;

  const tithiIndex = Math.floor(elongation(utc) / 12) % 30;
  const moon = moonSid(utc);
  const nakIndex = Math.min(26, Math.floor(moon / NAK));
  const yogaIndex = Math.floor(yogaSum(utc) / NAK) % 27;
  const karanaIndex = Math.floor(elongation(utc) / 6) % 60;
  return {
    tithi: { index: tithiIndex, ...tithiName(tithiIndex) },
    vara: { index: weekday, name: v.en, sanskrit: v.sa, lord: v.lord, civil: VARAS[civil]!.en, beforeSunrise },
    nakshatra: {
      index: nakIndex,
      name: NAKSHATRAS[nakIndex]!,
      pada: Math.min(4, Math.floor((moon - nakIndex * NAK) / (NAK / 4)) + 1),
      lord: DASHA_ORDER[nakIndex % 9]!,
    },
    yoga: { index: yogaIndex, name: YOGAS[yogaIndex]! },
    karana: { index: karanaIndex, name: karanaName(karanaIndex) },
    sunrise: sunrise ? stamp(sunrise, tz) : null,
    sunset: sunset ? stamp(sunset, tz) : null,
  };
}
