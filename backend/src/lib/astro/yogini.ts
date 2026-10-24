// Yogini dasha: a 36-year cycle of eight yoginis, started from the Moon's birth nakshatra.
//
// Source: the yogini dasha as taught in the Mansagari tradition (it is also described in later
// texts on dashas and implemented the same way by Jagannatha Hora and Drik Panchang):
//   Mangala 1 yr (Moon), Pingala 2 (Sun), Dhanya 3 (Jupiter), Bhramari 4 (Mars), Bhadrika 5
//   (Mercury), Ulka 6 (Saturn), Siddha 7 (Venus), Sankata 8 (Rahu) — 36 years in all.
//   First yogini = (birth nakshatra number, Ashwini = 1, + 3) mod 8, where 1 = Mangala … and
//   0 = Sankata. So Ardra (6) → 9 mod 8 = 1 Mangala, Ashwini (1) → 4 Bhramari, Pushya (8) → 3 Dhanya.
// The balance at birth is the unrun part of the Moon's nakshatra × the first yogini's years, exactly
// like Vimshottari; years are 365.25 days (dasha.ts). Antardashas start with the mahadasha's own
// yogini and run in order, each lasting (MD years × AD years / 36).

import type { GrahaKey } from "./constants.ts";
import { DASHA_YEAR_DAYS } from "./dasha.ts";
import { norm360 } from "./ephemeris.ts";

const YEAR_MS = DASHA_YEAR_DAYS * 86_400_000;
const NAK_SPAN = 360 / 27;

export const YOGINIS: readonly { name: string; years: number; lord: GrahaKey }[] = [
  { name: "Mangala", years: 1, lord: "moon" },
  { name: "Pingala", years: 2, lord: "sun" },
  { name: "Dhanya", years: 3, lord: "jupiter" },
  { name: "Bhramari", years: 4, lord: "mars" },
  { name: "Bhadrika", years: 5, lord: "mercury" },
  { name: "Ulka", years: 6, lord: "saturn" },
  { name: "Siddha", years: 7, lord: "venus" },
  { name: "Sankata", years: 8, lord: "rahu" },
];

/** Index into YOGINIS (0 = Mangala) of the first yogini for a nakshatra index (0 = Ashwini). */
export const firstYogini = (nakshatra: number) => (((nakshatra + 1 + 3) % 8) + 7) % 8;

export interface YoginiPeriod {
  name: string;
  lord: GrahaKey;
  years: number;
  start: string;
  end: string;
  antardashas?: YoginiPeriod[];
}

const period = (i: number, start: number, end: number): YoginiPeriod => ({
  name: YOGINIS[i]!.name,
  lord: YOGINIS[i]!.lord,
  years: YOGINIS[i]!.years,
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
});

export interface YoginiDasha {
  balance: { name: string; years: number; months: number; days: number };
  /** Mahadashas from the one running at birth, covering at least 108 years (three cycles). */
  mahadashas: YoginiPeriod[];
}

export function yoginiDasha(moonLongitude: number, birth: Date): YoginiDasha {
  const lon = norm360(moonLongitude);
  const nak = Math.min(26, Math.floor(lon / NAK_SPAN));
  const elapsed = (lon - nak * NAK_SPAN) / NAK_SPAN;
  const first = firstYogini(nak);
  let start = birth.getTime() - elapsed * YOGINIS[first]!.years * YEAR_MS;
  const until = birth.getTime() + 108 * YEAR_MS;
  const mahadashas: YoginiPeriod[] = [];
  for (let n = 0; start < until; n++) {
    const i = (first + n) % 8;
    const len = YOGINIS[i]!.years * YEAR_MS;
    const md = period(i, start, start + len);
    const subs: YoginiPeriod[] = [];
    let t = start;
    for (let k = 0; k < 8; k++) {
      const j = (i + k) % 8;
      const subLen = ((YOGINIS[i]!.years * YOGINIS[j]!.years) / 36) * YEAR_MS;
      subs.push(period(j, t, t + subLen));
      t += subLen;
    }
    md.antardashas = subs;
    mahadashas.push(md);
    start += len;
  }
  const balanceYears = (1 - elapsed) * YOGINIS[first]!.years;
  const years = Math.floor(balanceYears);
  const monthsF = (balanceYears - years) * 12;
  const months = Math.floor(monthsF);
  const days = Math.floor((monthsF - months) * (DASHA_YEAR_DAYS / 12));
  return { balance: { name: YOGINIS[first]!.name, years, months, days }, mahadashas };
}

/** The yogini mahadasha and antardasha running at `at`. */
export function currentYogini(dasha: YoginiDasha, at: Date) {
  const t = at.toISOString();
  const md = dasha.mahadashas.find((m) => m.start <= t && t < m.end);
  if (!md) return null;
  const ad = md.antardashas?.find((a) => a.start <= t && t < a.end) ?? null;
  return { mahadasha: { name: md.name, lord: md.lord, start: md.start, end: md.end }, antardasha: ad ? { name: ad.name, lord: ad.lord, start: ad.start, end: ad.end } : null };
}
