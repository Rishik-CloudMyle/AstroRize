// The Vedic day around an instant at a place: the sunrise that began it, sunset, the next sunrise,
// the weekday lord (the Vedic weekday runs sunrise to sunrise) and the hora lord. Used by KP ruling
// planets (day lord) and Shadbala (Tribhaga, Vara and Hora bala).
//
// Rise/set as in panchang.ts: astronomy-engine, upper limb with standard refraction, sea level.
// Horas are equal 60-minute periods from sunrise (BPHS: one hora = 2½ ghatikas); the first is
// ruled by the weekday lord and the rest follow the Chaldean order Sun, Venus, Mercury, Moon,
// Saturn, Jupiter, Mars.
// Where the Sun does not rise or set (polar day/night) there is no Vedic sunrise; we fall back to
// 06:00 local mean time (longitude-based) as the start of the day and say so with `polar: true`.

import { Body, Observer, SearchRiseSet } from "astronomy-engine";
import { VARAS, type GrahaKey } from "./constants.ts";
import { DAY_MS, localParts } from "./time.ts";

const CHALDEAN: readonly GrahaKey[] = ["sun", "venus", "mercury", "moon", "saturn", "jupiter", "mars"];
const HOUR_MS = 3_600_000;

export interface DayFrame {
  sunrise: Date;
  sunset: Date;
  nextSunrise: Date;
  /** True when `at` is between sunrise and sunset. */
  isDay: boolean;
  /** Vedic weekday (0 = Sunday) of the day that began at `sunrise`. */
  weekday: number;
  dayLord: GrahaKey;
  horaLord: GrahaKey;
  /** No real sunrise/sunset at this latitude and date; 06:00/18:00 local mean time were used. */
  polar: boolean;
}

export function dayFrame(at: Date, latitude: number, longitude: number, timezone: string): DayFrame {
  const obs = new Observer(latitude, longitude, 0);
  const t = at.getTime();
  let sunrise: Date | null = null;
  let r = SearchRiseSet(Body.Sun, obs, +1, new Date(t - 2 * DAY_MS), 2.5);
  for (let i = 0; r && r.date.getTime() <= t && i < 5; i++) {
    sunrise = r.date;
    r = SearchRiseSet(Body.Sun, obs, +1, new Date(r.date.getTime() + 60_000), 2);
  }
  const nextSunrise = r?.date ?? null;
  const sunset = sunrise ? (SearchRiseSet(Body.Sun, obs, -1, sunrise, 1)?.date ?? null) : null;

  let frame: Omit<DayFrame, "dayLord" | "horaLord" | "weekday"> & { weekdayAt: Date };
  if (sunrise && sunset && nextSunrise && sunset.getTime() < nextSunrise.getTime() && t - sunrise.getTime() < DAY_MS * 1.1) {
    frame = { sunrise, sunset, nextSunrise, isDay: t < sunset.getTime(), polar: false, weekdayAt: sunrise };
  } else {
    // Local mean time: UTC + longitude/15 hours. The day runs 06:00 → 06:00 LMT.
    const lmtOffset = (longitude / 15) * HOUR_MS;
    const lmt = t + lmtOffset;
    const lmtMidnight = Math.floor(lmt / DAY_MS) * DAY_MS;
    let start = lmtMidnight + 6 * HOUR_MS - lmtOffset;
    if (start > t) start -= DAY_MS;
    frame = {
      sunrise: new Date(start),
      sunset: new Date(start + DAY_MS / 2),
      nextSunrise: new Date(start + DAY_MS),
      isDay: t < start + DAY_MS / 2,
      polar: true,
      weekdayAt: new Date(start),
    };
  }
  const weekday = localParts(frame.weekdayAt, timezone).weekday;
  const dayLord = VARAS[weekday]!.lord;
  const hora = Math.floor((t - frame.sunrise.getTime()) / HOUR_MS);
  const horaLord = CHALDEAN[(CHALDEAN.indexOf(dayLord) + hora) % 7]!;
  return { sunrise: frame.sunrise, sunset: frame.sunset, nextSunrise: frame.nextSunrise, isDay: frame.isDay, weekday, dayLord, horaLord, polar: frame.polar };
}
