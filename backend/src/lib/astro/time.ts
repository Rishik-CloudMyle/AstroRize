// Civil time ↔ UTC for any IANA time zone, including historical offsets (local mean time in the
// 1800s, Indian war time 1942–45, old DST rules…). Uses the tz database that ships with Node (ICU).

import tzLookup from "@photostructure/tz-lookup";

export const DAY_MS = 86_400_000;

/** Julian day number (UT) of an instant. */
export const julianDay = (date: Date) => date.getTime() / DAY_MS + 2440587.5;

/** True when `tz` is an IANA zone this runtime knows. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * IANA zone for a point on Earth, offline (@photostructure/tz-lookup, CC0; zone boundaries from
 * timezone-boundary-builder). "UTC" only if the lookup somehow fails.
 */
export function timezoneAt(latitude: number, longitude: number): string {
  try {
    const tz = tzLookup(latitude, longitude);
    return isValidTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall-clock reading in `tz` at an instant (to the second). */
export function localParts(date: Date, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  // JavaScript dates before year 1 aren't supported by this engine anyway.
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}

/** Offset of `tz` from UTC at an instant, in seconds (IST = +19800). Whole seconds only. */
export function utcOffsetSeconds(date: Date, tz: string): number {
  const whole = new Date(Math.floor(date.getTime() / 1000) * 1000);
  const p = localParts(whole, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - whole.getTime()) / 1000);
}

export interface ZonedResult {
  utc: Date;
  /** Offset used, seconds east of UTC. */
  offsetSeconds: number;
  /**
   * "ok"; "gap" when that wall-clock time never happened (clocks jumped forward; the time is read
   * with the offset in force before the jump); "ambiguous" when it happened twice (clocks went back;
   * the earlier one is used).
   */
  status: "ok" | "gap" | "ambiguous";
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Parses "YYYY-MM-DD"; null when malformed or not a real calendar date. */
export function parseDate(text: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Parses "HH:MM" or "HH:MM:SS" (24-hour); null when malformed. */
export function parseTime(text: string): { hour: number; minute: number; second: number } | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  const [hour, minute, second] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

/**
 * The UTC instant of a wall-clock date and time in an IANA zone. Iterates on the zone's real
 * offset at the candidate instant, so historical offsets (e.g. Asia/Kolkata +6:30 in 1942–45,
 * +5:21:10 Madras time before 1906) come out right.
 */
export function zonedToUtc(date: string, time: string, tz: string): ZonedResult {
  const d = parseDate(date);
  const t = parseTime(time);
  if (!d || !t) throw new RangeError("Invalid date or time");
  const wall = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute, t.second);

  // Offsets that could apply: the zone's offset a day either side covers every transition.
  const candidates = new Set<number>();
  for (const probe of [wall - DAY_MS, wall, wall + DAY_MS]) candidates.add(utcOffsetSeconds(new Date(probe), tz));
  const matches = [...candidates]
    .map((off) => wall - off * 1000)
    .filter((utc) => utcOffsetSeconds(new Date(utc), tz) * 1000 === wall - utc)
    .sort((a, b) => a - b);

  if (matches.length > 0) {
    const utc = matches[0]!;
    return { utc: new Date(utc), offsetSeconds: (wall - utc) / 1000, status: matches.length > 1 ? "ambiguous" : "ok" };
  }
  // A skipped time: read it with the offset in force just before the jump.
  const before = utcOffsetSeconds(new Date(wall - DAY_MS / 2), tz);
  return { utc: new Date(wall - before * 1000), offsetSeconds: before, status: "gap" };
}

/** "YYYY-MM-DD" of an instant in `tz`. */
export function localDateString(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "HH:MM" (24-hour) of an instant in `tz`. */
export function localTimeString(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** An instant as the API returns it: ISO UTC plus the local date and time at the place. */
export interface Stamp {
  iso: string;
  date: string;
  time: string;
}

export function stamp(date: Date, tz: string): Stamp {
  // Round to the nearest minute for display, so 06:24:40 reads 06:25 as almanacs print it.
  const rounded = new Date(Math.round(date.getTime() / 60_000) * 60_000);
  return { iso: date.toISOString(), date: localDateString(rounded, tz), time: localTimeString(rounded, tz) };
}

/** "UTC+05:30" style label for an offset in seconds. */
export function offsetLabel(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `UTC${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}${s ? `:${String(s).padStart(2, "0")}` : ""}`;
}
