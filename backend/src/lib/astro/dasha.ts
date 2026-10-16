// Vimshottari dasha (120-year cycle) from the Moon's position in its birth nakshatra.
// The part of the nakshatra still to run at birth is the balance of the first mahadasha.
// Years are counted as 365.25 days (the common convention; some almanacs use 360 or 365.2425).

import { DASHA_ORDER, DASHA_YEARS, GRAHA_NAMES, type GrahaKey } from "./constants.ts";
import { norm360 } from "./ephemeris.ts";

export const DASHA_YEAR_DAYS = 365.25;
const YEAR_MS = DASHA_YEAR_DAYS * 86_400_000;
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
export function antardashas(lord: GrahaKey, start: number): DashaPeriod[] {
  const out: DashaPeriod[] = [];
  const first = DASHA_ORDER.indexOf(lord);
  let t = start;
  for (let i = 0; i < 9; i++) {
    const sub = DASHA_ORDER[(first + i) % 9]!;
    const len = ((DASHA_YEARS[lord] * DASHA_YEARS[sub]) / 120) * YEAR_MS;
    out.push(period(sub, t, t + len));
    t += len;
  }
  return out;
}

export function vimshottari(moonLongitude: number, birth: Date) {
  const lon = norm360(moonLongitude);
  const nak = Math.min(26, Math.floor(lon / NAK_SPAN));
  const elapsed = (lon - nak * NAK_SPAN) / NAK_SPAN;
  const firstLord = DASHA_ORDER[nak % 9]!;
  // The first mahadasha notionally began before birth; its antardashas are dated from that start.
  let start = birth.getTime() - elapsed * DASHA_YEARS[firstLord] * YEAR_MS;

  const mahadashas: DashaPeriod[] = [];
  for (let i = 0; i < 9; i++) {
    const lord = DASHA_ORDER[(nak + i) % 9]!;
    const end = start + DASHA_YEARS[lord] * YEAR_MS;
    mahadashas.push({ ...period(lord, start, end), antardashas: antardashas(lord, start) });
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
