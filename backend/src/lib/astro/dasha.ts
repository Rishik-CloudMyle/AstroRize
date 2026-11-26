// Vimshottari dasha (120-year cycle) from the Moon's position in its birth nakshatra.
// The part of the nakshatra still to run at birth is the balance of the first mahadasha.
// Dasha years are SOLAR years, as parasara.net counts them (checked date for date): a period that is
// y years from birth falls when the sidereal Sun has moved y × 360° from its birth position.
// (DASHA_YEAR_DAYS is only used to express the balance at birth in months and days.)

import { DASHA_ORDER, DASHA_YEARS, GRAHA_NAMES, type GrahaKey } from "./constants.ts";
import { MakeTime } from "astronomy-engine";
import { angleDiff, norm360, siderealLongitude } from "./ephemeris.ts";

export const DASHA_YEAR_DAYS = 365.25;
const SIDEREAL_YEAR_MS = 365.256363 * 86_400_000;
const SUN_DEG_PER_DAY = 360 / 365.256363;

/** Returns "the instant y solar years after (or, negative, before) birth" for one birth. */
export function solarClock(birth: Date): (years: number) => number {
  const sunAt = (ms: number) => siderealLongitude("sun", MakeTime(new Date(ms)), "mean", "parashari");
  const natal = sunAt(birth.getTime());
  const seen = new Map<number, number>();
  return (years) => {
    const key = Math.round(years * 1e9);
    let at = seen.get(key);
    if (at === undefined) {
      const target = norm360(natal + years * 360);
      at = birth.getTime() + years * SIDEREAL_YEAR_MS;
      // The Sun moves 0.953–1.019° a day: a few corrections reach well under a second.
      for (let i = 0; i < 8; i++) {
        const off = angleDiff(target, sunAt(at));
        if (Math.abs(off) < 1e-6) break;
        at -= (off / SUN_DEG_PER_DAY) * 86_400_000;
      }
      at = Math.round(at);
      seen.set(key, at);
    }
    return at;
  };
}
const NAK_SPAN = 360 / 27;

export interface DashaPeriod {
  lord: GrahaKey;
  name: string;
  /** ISO instants. */
  start: string;
  end: string;
  /** Antardashas (bhuktis) inside a mahadasha. */
  antardashas?: DashaPeriod[];
}

const period = (lord: GrahaKey, start: number, end: number): DashaPeriod => ({
  lord,
  name: GRAHA_NAMES[lord].en,
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
});

/** The nine antardashas of a mahadasha: starting with its own lord, each lasting (MD years × AD years / 120). */
export function antardashas(lord: GrahaKey, start: number, at: (years: number) => number): DashaPeriod[] {
  const out: DashaPeriod[] = [];
  const first = DASHA_ORDER.indexOf(lord);
  let t = start;
  for (let i = 0; i < 9; i++) {
    const sub = DASHA_ORDER[(first + i) % 9]!;
    const len = (DASHA_YEARS[lord] * DASHA_YEARS[sub]) / 120;
    out.push(period(sub, at(t), at(t + len)));
    t += len;
  }
  return out;
}

/**
 * The nine sub-periods of one period, for the levels below antardasha (pratyantar, sookshma, prana).
 * `path` picks the period: [mahadasha, antardasha, …] as positions 0–8, in the order listed.
 */
export function subPeriods(moonLongitude: number, birth: Date, path: number[]): DashaPeriod[] {
  const lon = norm360(moonLongitude);
  const nak = Math.min(26, Math.floor(lon / NAK_SPAN));
  const elapsed = (lon - nak * NAK_SPAN) / NAK_SPAN;
  const first = DASHA_ORDER[nak % 9]!;
  // Positions are in solar years from birth.
  let start = -elapsed * DASHA_YEARS[first];
  for (let i = 0; i < path[0]!; i++) start += DASHA_YEARS[DASHA_ORDER[(nak + i) % 9]!];
  let lord: GrahaKey = DASHA_ORDER[(nak + path[0]!) % 9]!;
  let length: number = DASHA_YEARS[lord];
  for (const index of path.slice(1)) {
    const from = DASHA_ORDER.indexOf(lord);
    for (let i = 0; i < index; i++) start += (length * DASHA_YEARS[DASHA_ORDER[(from + i) % 9]!]) / 120;
    lord = DASHA_ORDER[(from + index) % 9]!;
    length = (length * DASHA_YEARS[lord]) / 120;
  }
  const at = solarClock(birth);
  const from = DASHA_ORDER.indexOf(lord);
  return Array.from({ length: 9 }, (_, i) => {
    const sub = DASHA_ORDER[(from + i) % 9]!;
    const len = (length * DASHA_YEARS[sub]) / 120;
    const p = period(sub, at(start), at(start + len));
    start += len;
    return p;
  });
}

export function vimshottari(moonLongitude: number, birth: Date) {
  const lon = norm360(moonLongitude);
  const nak = Math.min(26, Math.floor(lon / NAK_SPAN));
  const elapsed = (lon - nak * NAK_SPAN) / NAK_SPAN;
  const firstLord = DASHA_ORDER[nak % 9]!;
  // The first mahadasha notionally began before birth; its antardashas are dated from that start.
  // `start` is in solar years from birth.
  const at = solarClock(birth);
  let start = -elapsed * DASHA_YEARS[firstLord];

  const mahadashas: DashaPeriod[] = [];
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(nak + i) % 9]!;
    const end = start + DASHA_YEARS[lord];
    mahadashas.push({ ...period(lord, at(start), at(end)), antardashas: antardashas(lord, start, at) });
    start = end;
  }

  const balanceYears = (1 - elapsed) * DASHA_YEARS[firstLord];
  const years = Math.floor(balanceYears);
  const monthsF = (balanceYears - years) * 12;
  const months = Math.floor(monthsF);
  const days = Math.floor((monthsF - months) * (DASHA_YEAR_DAYS / 12));
  return { balance: { lord: firstLord, years, months, days }, mahadashas };
}

/** The mahadasha and antardasha running at `at`, or null outside the 120 years. */
export function currentDasha(mahadashas: DashaPeriod[], at: Date) {
  const t = at.toISOString();
  const md = mahadashas.find((m) => m.start <= t && t < m.end);
  if (!md) return null;
  const ad = md.antardashas?.find((a) => a.start <= t && t < a.end) ?? null;
  return { mahadasha: { lord: md.lord, name: md.name, start: md.start, end: md.end }, antardasha: ad };
}
