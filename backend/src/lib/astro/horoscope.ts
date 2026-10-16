// Daily and weekly horoscope by Moon sign, worked out from the real transits of the day(s) and
// worded from the curated library in phrases.ts. Deterministic: same sign + date → same text.

import { MakeTime } from "astronomy-engine";
import { GRAHA_NAMES, NAKSHATRAS, type GrahaKey } from "./constants.ts";
import { grahaPositions, siderealLongitude } from "./ephemeris.ts";
import { signInfo, type SignInfo } from "./kundli.ts";
import { elongation, tithiName } from "./panchang.ts";
import { JUPITER_HOUSE, MOON_HOUSE, SATURN_HOUSE, tithiLine, weekOpening, type Tone } from "./phrases.ts";
import { DAY_MS, localParts, localTimeString, parseDate, zonedToUtc } from "./time.ts";

export type Period = "daily" | "weekly";

export interface HoroscopeInput {
  /** Moon sign, 0 = Aries … 11 = Pisces. */
  sign: number;
  period: Period;
  /** "YYYY-MM-DD" in `timezone`. */
  date: string;
  /** Defaults to India time. */
  timezone?: string;
}

export interface TransitHouse {
  graha: GrahaKey;
  name: string;
  sign: SignInfo;
  /** House counted from the reader's Moon sign. */
  house: number;
  retrograde: boolean;
}

export interface DayOutlook {
  date: string;
  weekday: string;
  moonSign: SignInfo;
  house: number;
  theme: string;
  tone: Tone;
}

export interface Horoscope {
  sign: SignInfo;
  period: Period;
  /** First and last date covered. */
  from: string;
  to: string;
  /** One-sentence reading (what the website shows large). */
  summary: string;
  /** Supporting sentences, in order. */
  details: string[];
  tone: Tone;
  /** Plain statement of the transits the reading is based on. */
  basis: string;
  transits: TransitHouse[];
  /** Weekly only: the Moon's house each day. */
  days?: DayOutlook[];
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const houseFrom = (sign: number, lon: number) => ((Math.floor(lon / 30) - sign + 12) % 12) + 1;

function addDays(date: string, days: number): string {
  const d = parseDate(date)!;
  return new Date(Date.UTC(d.year, d.month - 1, d.day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The reading moment for a civil date: 06:00 local, about sunrise across India. */
const morning = (date: string, tz: string) => zonedToUtc(date, "06:00", tz).utc;

function transitsAt(at: Date, sign: number): TransitHouse[] {
  return grahaPositions(at).map((p) => ({
    graha: p.key,
    name: GRAHA_NAMES[p.key].en,
    sign: signInfo(Math.floor(p.longitude / 30)),
    house: houseFrom(sign, p.longitude),
    retrograde: p.retrograde,
  }));
}

export function buildHoroscope(input: HoroscopeInput): Horoscope {
  const tz = input.timezone ?? "Asia/Kolkata";
  if (!parseDate(input.date)) throw new RangeError("Invalid date");
  const sign = ((input.sign % 12) + 12) % 12;
  return input.period === "daily" ? daily(sign, input.date, tz) : weekly(sign, input.date, tz);
}

function daily(sign: number, date: string, tz: string): Horoscope {
  // The day is read from the sky at local noon; the tithi from the morning, as almanacs do.
  const dawn = morning(date, tz);
  const at = zonedToUtc(date, "12:00", tz).utc;
  const transits = transitsAt(at, sign);
  const moonLon = siderealLongitude("moon", MakeTime(at));
  const nak = Math.floor(moonLon / (360 / 27));
  const moonHouse = houseFrom(sign, moonLon);
  const lines = MOON_HOUSE[moonHouse]!;
  const tithi = tithiName(Math.floor(elongation(dawn) / 12));
  const jupiter = transits.find((x) => x.graha === "jupiter")!;
  const saturn = transits.find((x) => x.graha === "saturn")!;
  const moon = transits.find((x) => x.graha === "moon")!;

  const details = [lines.why];
  // If the Moon changes sign between this morning and tomorrow morning, say when.
  const dawnLon = siderealLongitude("moon", MakeTime(dawn));
  if (Math.floor(dawnLon / 30) !== Math.floor(moonLon / 30)) {
    const ingress = findIngress(dawn, at, Math.floor(moonLon / 30));
    const h = houseFrom(sign, dawnLon);
    details.push(`Until ${localTimeString(ingress, tz)} the Moon is still in ${signInfo(Math.floor(dawnLon / 30)).name}, your ${ordinal(h)} house of ${MOON_HOUSE[h]!.theme}.`);
  }
  const next = morning(addDays(date, 1), tz);
  const nextLon = siderealLongitude("moon", MakeTime(next));
  if (Math.floor(nextLon / 30) !== Math.floor(moonLon / 30)) {
    const ingress = findIngress(at, next, Math.floor(nextLon / 30));
    const h = houseFrom(sign, nextLon);
    details.push(
      `From ${localTimeString(ingress, tz)} the Moon moves into ${signInfo(Math.floor(nextLon / 30)).name}, your ${ordinal(h)} house of ${MOON_HOUSE[h]!.theme}.`,
    );
  }
  details.push(tithiLine(tithi.number, tithi.paksha, tithi.name));
  // Alternate the long-term backdrop by weekday so both slow planets get mentioned across a week.
  const weekday = localParts(at, tz).weekday;
  details.push(weekday % 2 === 0 ? JUPITER_HOUSE[jupiter.house]! : SATURN_HOUSE[saturn.house]!);

  return {
    sign: signInfo(sign),
    period: "daily",
    from: date,
    to: date,
    summary: lines.daily[nak % lines.daily.length]!,
    details,
    tone: lines.tone,
    basis:
      `Based on the transits on ${date}: the Moon in ${moon.sign.name} (${NAKSHATRAS[nak]}), your ${ordinal(moonHouse)} house; ` +
      `Jupiter in your ${ordinal(jupiter.house)}; Saturn in your ${ordinal(saturn.house)}; ${tithi.paksha} ${tithi.name}. ` +
      `A general reading for everyone with this Moon sign.`,
    transits,
  };
}

/** Bisection for the instant the Moon enters `targetSign` between two moments. */
function findIngress(from: Date, to: Date, targetSign: number): Date {
  let lo = from.getTime();
  let hi = to.getTime();
  while (hi - lo > 30_000) {
    const mid = (lo + hi) / 2;
    if (Math.floor(siderealLongitude("moon", MakeTime(new Date(mid))) / 30) === targetSign) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

function weekly(sign: number, date: string, tz: string): Horoscope {
  // The week runs Monday to Sunday around the given date.
  const weekday = localParts(new Date(`${date}T12:00:00Z`), "UTC").weekday;
  const monday = addDays(date, -((weekday + 6) % 7));
  const sunday = addDays(monday, 6);

  const days: DayOutlook[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const lon = siderealLongitude("moon", MakeTime(zonedToUtc(d, "12:00", tz).utc));
    const house = houseFrom(sign, lon);
    const lines = MOON_HOUSE[house]!;
    days.push({ date: d, weekday: WEEKDAY_NAMES[(i + 1) % 7]!, moonSign: signInfo(Math.floor(lon / 30)), house, theme: lines.theme, tone: lines.tone });
  }
  const good = days.filter((d) => d.tone === "favourable");
  const careful = days.filter((d) => d.tone === "careful");
  const transits = transitsAt(morning(monday, tz), sign);
  const jupiter = transits.find((x) => x.graha === "jupiter")!;
  const saturn = transits.find((x) => x.graha === "saturn")!;

  const details: string[] = [];
  const list = (ds: DayOutlook[]) => ds.map((d) => d.weekday).join(", ");
  if (good.length) details.push(`Best days: ${list(good)} — the Moon is in supportive houses for you.`);
  const ashtama = days.filter((d) => d.house === 8);
  if (ashtama.length) details.push(`Go slow on ${list(ashtama)}: the Moon is in your 8th house (Chandrashtama); avoid new ventures and long travel.`);
  const otherCareful = careful.filter((d) => d.house !== 8);
  if (otherCareful.length) details.push(`Keep ${list(otherCareful)} light — rest, home and expenses need attention.`);

  // Planets that change sign during the week.
  const end = transitsAt(zonedToUtc(sunday, "23:59", tz).utc, sign);
  for (const key of ["sun", "mars", "mercury", "venus", "jupiter", "saturn"] as const) {
    const a = transits.find((x) => x.graha === key)!;
    const b = end.find((x) => x.graha === key)!;
    if (a.sign.index !== b.sign.index) details.push(`${a.name} moves into ${b.sign.name}, your ${ordinal(b.house)} house, this week.`);
    else if (key === "mercury" && a.retrograde) details.push("Mercury is retrograde: re-read messages and contracts before you send or sign.");
  }
  details.push(JUPITER_HOUSE[jupiter.house]!, SATURN_HOUSE[saturn.house]!);

  const tone: Tone = good.length >= 4 ? "favourable" : careful.length >= 3 ? "careful" : "mixed";
  return {
    sign: signInfo(sign),
    period: "weekly",
    from: monday,
    to: sunday,
    summary: weekOpening(good.length, careful.length),
    details,
    tone,
    basis:
      `Based on the transits for ${monday} to ${sunday}: the Moon's daily house from ${signInfo(sign).name}, ` +
      `Jupiter in your ${ordinal(jupiter.house)} and Saturn in your ${ordinal(saturn.house)}. A general reading for everyone with this Moon sign.`,
    transits,
    days,
  };
}
