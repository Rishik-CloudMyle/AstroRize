// Accuracy proof for the Astrorize astrology engine (lib/astro). No database, no network.
//   node test/astro.test.ts
// Every reference value below comes from an independent published source, cited next to it.
// Prints a table of measured errors and exits 1 if any check is outside its tolerance.

import {
  CombineRotation, HorizonFromVector, MakeTime, Observer, RotateVector, Rotation_ECT_EQD, Rotation_EQD_HOR, Vector,
} from "astronomy-engine";
import { NAKSHATRA_YONI, YONI_POINTS, type GrahaKey } from "../src/lib/astro/constants.ts";
import { vimshottari } from "../src/lib/astro/dasha.ts";
import { astrorizeEngine as engine } from "../src/lib/astro/engine.ts";
import { angles, grahaPositions, trueLahiri } from "../src/lib/astro/ephemeris.ts";
import { buildHoroscope } from "../src/lib/astro/horoscope.ts";
import { navamsaSign } from "../src/lib/astro/kundli.ts";
import { scoreKootas } from "../src/lib/astro/matchmaking.ts";
import { buildPanchang } from "../src/lib/astro/panchang.ts";
import { offsetLabel, timezoneAt, zonedToUtc, type Stamp } from "../src/lib/astro/time.ts";

// ── Tiny harness ──

interface Row { group: string; name: string; measured: string; tolerance: string; ok: boolean }
const rows: Row[] = [];
const arcsec = (deg: number) => deg * 3600;
const wrap = (d: number) => ((((d % 360) + 540) % 360) - 180);

function near(group: string, name: string, got: number, want: number, tolArcsec: number) {
  const err = arcsec(wrap(got - want));
  rows.push({ group, name, measured: `${err >= 0 ? "+" : ""}${err.toFixed(1)}″`, tolerance: `±${tolArcsec}″`, ok: Math.abs(err) <= tolArcsec });
}
function nearMinutes(group: string, name: string, got: Date | null, want: Date, tolMin: number) {
  if (!got) {
    rows.push({ group, name, measured: "missing", tolerance: `±${tolMin} min`, ok: false });
    return;
  }
  const err = (got.getTime() - want.getTime()) / 60000;
  rows.push({ group, name, measured: `${err >= 0 ? "+" : ""}${err.toFixed(2)} min`, tolerance: `±${tolMin} min`, ok: Math.abs(err) <= tolMin });
}
function equal(group: string, name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  rows.push({ group, name, measured: ok ? String(got) : `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`, tolerance: "exact", ok });
}
const dms = (sign: number, d: number, m: number, s = 0) => sign * 30 + d + m / 60 + s / 3600;
/** A wall-clock time in India as a Date. */
const ist = (date: string, time: string) => zonedToUtc(date, time, "Asia/Kolkata").utc;
const at = (s: Stamp | null) => (s ? new Date(s.iso) : null);
const tropical = (key: GrahaKey, date: Date) => {
  const p = grahaPositions(date).find((g) => g.key === key)!;
  return p.longitude + trueLahiri(MakeTime(date));
};

// ── 1. Tropical positions vs NASA JPL Horizons (DE441) ──
// Source: JPL Horizons API, geocentric (500@399), QUANTITIES=31 "Observer-centered IAU76/80
// ecliptic-of-date longitude … apparent position", fetched 2026-10-16, e.g.
// https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='301'&CENTER='500@399'&EPHEM_TYPE=OBSERVER&QUANTITIES='31'&START_TIME='1990-05-15 09:00'&STOP_TIME='1990-05-15 09:01'&STEP_SIZE='1m'&ANG_FORMAT='DEG'&EXTRA_PREC='YES'
const JPL: [string, Record<Exclude<GrahaKey, "rahu" | "ketu">, number>][] = [
  ["1950-01-01T00:00:00Z", { sun: 280.0048301, moon: 61.4154091, mars: 182.2111967, mercury: 299.4472523, jupiter: 306.5053249, venus: 316.9794775, saturn: 169.4374218 }],
  ["1990-05-15T09:00:00Z", { sun: 54.2755655, moon: 295.6195136, mars: 348.2409959, mercury: 38.0280756, jupiter: 99.5180914, venus: 12.6757335, saturn: 295.2515022 }],
  ["2025-10-20T06:30:00Z", { sun: 207.1249053, moon: 193.3917714, mars: 229.1767754, mercury: 229.1678016, jupiter: 114.3411609, venus: 187.9324719, saturn: 356.4222694 }],
  ["2040-07-01T12:00:00Z", { sun: 100.2591709, moon: 11.1330336, mars: 153.1108609, mercury: 91.7198725, jupiter: 174.6493486, venus: 108.8398138, saturn: 185.7511488 }],
];
for (const [when, bodies] of JPL) {
  for (const [key, lon] of Object.entries(bodies) as [GrahaKey, number][]) {
    // astronomy-engine's Moon (truncated ELP/ILE) is good to a few tens of arcseconds; planets to a few.
    near("Tropical longitude vs JPL", `${key} ${when.slice(0, 10)}`, tropical(key, new Date(when)), lon, key === "moon" ? 40 : 20);
  }
}

// ── 2. Lahiri ayanamsa vs Swiss Ephemeris / Jagannatha Hora ──
// Source: "Historical Lahiri ayanamsa values" — jagannathhora.com/historical-lahiri-ayanamsa-values-tables/
// (true Lahiri incl. nutation, Swiss Ephemeris, 1 January 00:00 UT). Values are rounded to 1″.
const AYANAMSA: [string, number, number, number][] = [
  ["1900", 22, 27, 55], ["1950", 23, 9, 28], ["1975", 23, 30, 45], ["2000", 23, 51, 12], ["2025", 24, 12, 23], ["2026", 24, 13, 19], ["2050", 24, 33, 35],
];
for (const [year, d, m, s] of AYANAMSA) {
  near("Lahiri ayanamsa vs Swiss Ephemeris", `${year}-01-01`, trueLahiri(MakeTime(new Date(`${year}-01-01T00:00:00Z`))), d + m / 60 + s / 3600, 3);
}

// ── 3. Sidereal positions vs Drik Panchang ──
// Source: drikpanchang.com "Planetary Positions (Sidereal)", New Delhi (28°38′08″N 77°13′28″E),
// 20 Oct 2025 12:00 IST, Lahiri, mean nodes (true node listed separately).
// Drik's Lahiri runs ~+19″ ahead of Swiss Ephemeris Lahiri (JPL + SE ayanamsa above agree with us),
// so these are held to 1′.
const DRIK_AT = ist("2025-10-20", "12:00");
const DRIK: [GrahaKey, number][] = [
  ["sun", dms(6, 2, 54, 5.06)], ["moon", dms(5, 19, 10, 35.95)], ["mars", dms(6, 24, 57, 11.45)], ["mercury", dms(6, 24, 56, 40.64)],
  ["jupiter", dms(3, 0, 7, 1.27)], ["venus", dms(5, 13, 42, 32.96)], ["saturn", dms(11, 2, 11, 52.98)], ["rahu", dms(10, 21, 47, 46.32)],
  ["ketu", dms(4, 21, 47, 46.32)],
];
const drikPos = grahaPositions(DRIK_AT);
for (const [key, lon] of DRIK) near("Sidereal vs Drik Panchang", key, drikPos.find((g) => g.key === key)!.longitude, lon, 60);
near("Sidereal vs Drik Panchang", "rahu (true node)", grahaPositions(DRIK_AT, "true").find((g) => g.key === "rahu")!.longitude, dms(10, 23, 42, 9.5), 60);

// ── 4. Ascendant ──
// Source: astrotheme.com / astro.com (Astro-Databank, birth certificate, rating AA): Barack Obama,
// 4 Aug 1961 19:24 HST, Honolulu 21°18′N 157°52′W → Asc 18°03′ Aquarius, Sun 12°33′ Leo,
// Moon 3°21′ Gemini (tropical, rounded to 1′, hence 45″ tolerance).
{
  const utc = zonedToUtc("1961-08-04", "19:24", "Pacific/Honolulu").utc;
  const a = angles(utc, 21 + 18 / 60, -(157 + 52 / 60));
  near("Chart vs Astro-Databank", "Obama ascendant (tropical)", a.ascendant + a.ayanamsa, dms(10, 18, 3), 45);
  near("Chart vs Astro-Databank", "Obama Sun", tropical("sun", utc), dms(4, 12, 33), 45);
  near("Chart vs Astro-Databank", "Obama Moon", tropical("moon", utc), dms(2, 3, 21), 45);
  // Diana, Princess of Wales: 1 Jul 1961 19:45 BST, Sandringham → Sun 9°40′ Cancer, Moon 25°02′ Aquarius (astrotheme.com).
  const dUtc = zonedToUtc("1961-07-01", "19:45", "Europe/London").utc;
  near("Chart vs Astro-Databank", "Diana Sun", tropical("sun", dUtc), dms(3, 9, 40), 45);
  near("Chart vs Astro-Databank", "Diana Moon", tropical("moon", dUtc), dms(10, 25, 2), 45);
}
// Geometric cross-check with an independent code path: the ascendant must be the ecliptic point on
// the eastern horizon (altitude 0, unrefracted) using astronomy-engine's own frame rotations.
for (const [iso, lat, lon] of [["1990-05-15T09:00:00Z", 18.52, 73.86], ["2025-10-20T06:30:00Z", 28.64, 77.22], ["1975-03-02T01:00:00Z", 59.9, 10.75], ["2010-12-01T20:00:00Z", -33.87, 151.21]] as const) {
  const date = new Date(iso);
  const t = MakeTime(date);
  const a = angles(date, lat, lon);
  const rot = CombineRotation(Rotation_ECT_EQD(t), Rotation_EQD_HOR(t, new Observer(lat, lon, 0)));
  const r = ((a.ascendant + a.ayanamsa) * Math.PI) / 180;
  const h = HorizonFromVector(RotateVector(rot, new Vector(Math.cos(r), Math.sin(r), 0, t)), "");
  rows.push({
    group: "Ascendant geometry",
    name: `altitude of lagna ${iso.slice(0, 10)} φ=${lat}`,
    measured: `${(h.lat * 3600).toFixed(2)}″, azimuth ${h.lon.toFixed(1)}°`,
    tolerance: "±1″, east",
    ok: Math.abs(h.lat * 3600) <= 1 && h.lon > 0 && h.lon < 180,
  });
}

// ── 5. Sunrise / sunset / moonrise vs JPL Horizons ──
// Source: JPL Horizons RTS (R_T_S_ONLY='TVH', refracted, upper limb, 1-minute steps), fetched 2026-10-16.
// Horizons flags the first whole minute at/after the event, so the reference is that minute − 30 s.
const RISE: [string, number, number, string, string, string, string][] = [
  // place, lat, lon, tz, date, sunrise, sunset (local)
  ["Mumbai", 19.076, 72.8777, "Asia/Kolkata", "2026-01-01", "07:12", "18:13"],
  ["London", 51.5074, -0.1278, "Europe/London", "2026-06-21", "04:44", "21:22"],
  ["New York", 40.7128, -74.006, "America/New_York", "2026-03-15", "07:08", "19:03"],
  ["New Delhi", 28.6139, 77.209, "Asia/Kolkata", "2025-10-20", "06:26", "17:47"],
  ["Chennai", 13.0827, 80.2707, "Asia/Kolkata", "2026-10-16", "06:00", "17:50"],
  ["Sydney", -33.8688, 151.2093, "Australia/Sydney", "2026-12-21", "05:41", "20:06"],
];
const ref = (date: string, hhmm: string, tz: string) => new Date(zonedToUtc(date, hhmm, tz).utc.getTime() - 30_000);
for (const [place, lat, lon, tz, date, rise, set] of RISE) {
  const p = buildPanchang({ date, latitude: lat, longitude: lon, timezone: tz });
  nearMinutes("Sun/Moon rise vs JPL", `${place} sunrise ${date}`, at(p.sunrise), ref(date, rise, tz), 1);
  nearMinutes("Sun/Moon rise vs JPL", `${place} sunset ${date}`, at(p.sunset), ref(date, set, tz), 1);
}
{
  const p = buildPanchang({ date: "2025-10-20", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" });
  nearMinutes("Sun/Moon rise vs JPL", "New Delhi moonrise 2025-10-20", at(p.moonrise), ref("2025-10-20", "05:13", "Asia/Kolkata"), 1);
  nearMinutes("Sun/Moon rise vs JPL", "New Delhi moonset 2025-10-20", at(p.moonset), ref("2025-10-20", "17:01", "Asia/Kolkata"), 1);
}

// ── 6. Panchang vs Drik Panchang and published festival tithis ──
// Source: drikpanchang.com day Panchang, New Delhi, Monday 20 Oct 2025 (Diwali / Lakshmi Puja):
// Krishna Chaturdashi upto 03:44 PM, Hasta upto 08:17 PM, Vaidhriti upto 02:35 AM (21 Oct),
// Shakuni upto 03:44 PM then Chatushpada upto 04:47 AM (21 Oct); sunrise 06:25, sunset 05:46 PM;
// Rahu Kalam 07:50–09:15, Yamaganda 10:40–12:06, Gulikai 01:31–02:56 PM, Abhijit 11:43–12:28.
// Almanacs print whole minutes, so 2 minutes are allowed.
{
  const p = buildPanchang({ date: "2025-10-20", latitude: 28 + 38 / 60 + 8 / 3600, longitude: 77 + 13 / 60 + 28 / 3600, timezone: "Asia/Kolkata" });
  const g = "Panchang vs Drik (Delhi, Diwali 2025)";
  equal(g, "vara", p.vara.name, "Monday");
  equal(g, "tithi at sunrise", `${p.tithi[0]!.paksha} ${p.tithi[0]!.name}`, "Krishna Chaturdashi");
  nearMinutes(g, "Chaturdashi ends 15:44", at(p.tithi[0]!.end), ist("2025-10-20", "15:44"), 2);
  equal(g, "next tithi", p.tithi[1]!.name, "Amavasya");
  equal(g, "nakshatra", p.nakshatra[0]!.name, "Hasta");
  nearMinutes(g, "Hasta ends 20:17", at(p.nakshatra[0]!.end), ist("2025-10-20", "20:17"), 2);
  equal(g, "yoga", p.yoga[0]!.name, "Vaidhriti");
  nearMinutes(g, "Vaidhriti ends 02:35 (+1)", at(p.yoga[0]!.end), ist("2025-10-21", "02:35"), 2);
  equal(g, "karanas", p.karana.slice(0, 2).map((k) => k.name).join(", "), "Shakuni, Chatushpada");
  nearMinutes(g, "Chatushpada ends 04:47 (+1)", at(p.karana[1]!.end), ist("2025-10-21", "04:47"), 2);
  nearMinutes(g, "sunrise 06:25", at(p.sunrise), ist("2025-10-20", "06:25"), 1);
  nearMinutes(g, "sunset 17:46", at(p.sunset), ist("2025-10-20", "17:46"), 1);
  nearMinutes(g, "Rahu Kaal start 07:50", at(p.rahuKaal!.start), ist("2025-10-20", "07:50"), 1);
  nearMinutes(g, "Rahu Kaal end 09:15", at(p.rahuKaal!.end), ist("2025-10-20", "09:15"), 1);
  nearMinutes(g, "Yamaganda start 10:40", at(p.yamaganda!.start), ist("2025-10-20", "10:40"), 1);
  nearMinutes(g, "Gulika start 13:31", at(p.gulika!.start), ist("2025-10-20", "13:31"), 1);
  nearMinutes(g, "Abhijit start 11:43", at(p.abhijit!.start), ist("2025-10-20", "11:43"), 1);
  nearMinutes(g, "Abhijit end 12:28", at(p.abhijit!.end), ist("2025-10-20", "12:28"), 1);
  // Diwali is Ashwin Amavasya (amanta) = Kartika Amavasya (purnimanta).
  equal(g, "lunar month (amanta / purnimanta)", `${p.month.amanta} / ${p.month.purnimanta}`, "Ashwin / Kartika");
}
{
  // Holi 2026: Phalguna Purnima from 17:55 IST 2 Mar to 17:07 IST 3 Mar (Holika Dahan on 3 Mar);
  // published by amitray.com, hindutone.com, science-divine (Delhi). The full moon itself is the
  // total lunar eclipse of 3 Mar 2026 (greatest eclipse 11:33 UT, NASA).
  const g = "Festival tithis";
  const p = buildPanchang({ date: "2026-03-03", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" });
  equal(g, "Holi 2026: tithi at sunrise 3 Mar", `${p.tithi[0]!.paksha} ${p.tithi[0]!.name}`, "Shukla Purnima");
  nearMinutes(g, "Holi 2026: Purnima ends 3 Mar 17:07", at(p.tithi[0]!.end), ist("2026-03-03", "17:07"), 2);
  equal(g, "Holi 2026: month", p.month.amanta, "Phalguna");
  const before = buildPanchang({ date: "2026-03-02", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" });
  nearMinutes(g, "Holi 2026: Purnima begins 2 Mar 17:55", at(before.tithi[0]!.end), ist("2026-03-02", "17:55"), 2);

  // Dev Uthani (Prabodhini) Ekadashi 2025: Ekadashi from 09:11 IST 1 Nov to 07:31 IST 2 Nov
  // (organiser.org, dynamitenews.com, citing the Hindu Panchang for New Delhi).
  const n1 = buildPanchang({ date: "2025-11-01", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" });
  equal(g, "Dev Uthani 2025: sunrise tithi 1 Nov", `${n1.tithi[0]!.paksha} ${n1.tithi[0]!.name}`, "Shukla Dashami");
  nearMinutes(g, "Dev Uthani 2025: Ekadashi begins 1 Nov 09:11", at(n1.tithi[0]!.end), ist("2025-11-01", "09:11"), 2);
  const n2 = buildPanchang({ date: "2025-11-02", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" });
  equal(g, "Dev Uthani 2025: sunrise tithi 2 Nov", `${n2.tithi[0]!.paksha} ${n2.tithi[0]!.name}`, "Shukla Ekadashi");
  nearMinutes(g, "Dev Uthani 2025: Ekadashi ends 2 Nov 07:31", at(n2.tithi[0]!.end), ist("2025-11-02", "07:31"), 2);
  equal(g, "Dev Uthani 2025: month (amanta)", n2.month.amanta, "Kartika");

  // Diwali 2025 Amavasya ends 21 Oct 17:54 IST (Drik Panchang); the new moon is 21 Oct 12:25 UT (NASA).
  const d21 = buildPanchang({ date: "2025-10-21", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" });
  equal(g, "Diwali 2025: tithi at sunrise 21 Oct", d21.tithi[0]!.name, "Amavasya");
  nearMinutes(g, "Diwali 2025: Amavasya ends 21 Oct 17:54", at(d21.tithi[0]!.end), ist("2025-10-21", "17:54"), 2);

  // The exact syzygies from JPL Horizons apparent longitudes (QUANTITIES=31, 1-minute steps,
  // interpolated where Moon − Sun crosses 0° / 180°): new moon 2025-10-21 12:25:10 UT,
  // full moon 2026-03-03 11:38:06 UT. Printed almanacs above round these to the minute below.
  nearMinutes(g, "new moon vs JPL (2025-10-21 12:25:10 UT)", at(d21.tithi[0]!.end), new Date("2025-10-21T12:25:10Z"), 0.5);
  nearMinutes(g, "full moon vs JPL (2026-03-03 11:38:06 UT)", at(p.tithi[0]!.end), new Date("2026-03-03T11:38:06Z"), 0.5);
}

// ── 7. Guna milan ──
{
  const g = "Guna milan";
  // hindutone.com worked example: bride Rohini (Taurus), groom Pushya (Cancer) →
  // Tara 1.5, Bhakoot 7, Nadi 8, Varna 1, Graha Maitri 0.5.
  const k = scoreKootas({ moonLongitude: dms(3, 10, 0) }, { moonLongitude: dms(1, 15, 0) });
  const pts = (key: string) => k.find((x) => x.key === key)!.points;
  equal(g, "Rohini girl / Pushya boy: Tara", pts("tara"), 1.5);
  equal(g, "Rohini girl / Pushya boy: Bhakoot", pts("bhakoot"), 7);
  equal(g, "Rohini girl / Pushya boy: Nadi", pts("nadi"), 8);
  equal(g, "Rohini girl / Pushya boy: Varna", pts("varna"), 1);
  equal(g, "Rohini girl / Pushya boy: Graha Maitri", pts("maitri"), 0.5);
  // Classical result: two Moons in the same nakshatra and sign score 28 (all full except Nadi 0).
  const same = scoreKootas({ moonLongitude: dms(0, 5, 0) }, { moonLongitude: dms(0, 6, 0) });
  equal(g, "same nakshatra & sign = 28", same.reduce((s, x) => s + x.points, 0), 28);
  equal(g, "maximums add to 36", same.reduce((s, x) => s + x.max, 0), 36);
  // Yoni table is symmetric and the seven sworn-enemy pairs score 0.
  let symmetric = true;
  for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) if (YONI_POINTS[i]![j] !== YONI_POINTS[j]![i]) symmetric = false;
  equal(g, "yoni table symmetric", symmetric, true);
  const zeros = YONI_POINTS.flat().filter((x) => x === 0).length / 2;
  equal(g, "yoni enemy pairs", zeros, 7);
  equal(g, "yoni animals per nakshatra", NAKSHATRA_YONI.length, 27);
}

// ── 8. Dasha, navamsa, time zones ──
{
  const g = "Rules";
  const birth = new Date("2000-01-01T00:00:00Z");
  const d0 = vimshottari(0, birth);
  equal(g, "Moon at 0° Ashwini → full Ketu dasha", `${d0.balance.lord} ${d0.balance.years}y`, "ketu 7y");
  const d = vimshottari(dms(9, 1, 53, 37), birth); // Uttara Ashadha: Sun dasha
  const span = (new Date(d.mahadashas[8]!.end).getTime() - new Date(d.mahadashas[0]!.start).getTime()) / (365.25 * 86_400_000);
  equal(g, "nine mahadashas span 120 years", Math.round(span * 1e6) / 1e6, 120);
  const md = d.mahadashas[1]!;
  equal(g, "antardashas fill their mahadasha", md.antardashas!.at(-1)!.end === md.end && md.antardashas![0]!.start === md.start, true);
  equal(g, "Uttara Ashadha → Sun dasha first", d.mahadashas[0]!.lord, "sun");
  equal(g, "navamsa 0° Aries → Aries", navamsaSign(0), 0);
  equal(g, "navamsa 3°20′ Aries → Taurus", navamsaSign(10 / 3 + 1e-9), 1);
  equal(g, "navamsa 0° Taurus → Capricorn", navamsaSign(30), 9);
  equal(g, "navamsa 0° Cancer → Cancer", navamsaSign(90), 3);
  equal(g, "navamsa 29° Pisces → Pisces", navamsaSign(359), 11);

  // IANA tzdata (Asia/Kolkata): Madras time +5:21:10 until 1906, war time +6:30 Oct 1941–May 1942
  // and Sep 1942–Oct 1945.
  const off = (date: string, time: string, tz: string) => {
    const z = zonedToUtc(date, time, tz);
    return `${offsetLabel(z.offsetSeconds)}${z.status === "ok" ? "" : ` (${z.status})`}`;
  };
  equal(g, "Kolkata 1900", off("1900-06-01", "12:00", "Asia/Kolkata"), "UTC+05:21:10");
  equal(g, "Kolkata 1943 (war time)", off("1943-06-01", "12:00", "Asia/Kolkata"), "UTC+06:30");
  equal(g, "Kolkata 1942-07 (between war-time spells)", off("1942-07-01", "12:00", "Asia/Kolkata"), "UTC+05:30");
  equal(g, "Kolkata 1947-08-15", off("1947-08-15", "00:00", "Asia/Kolkata"), "UTC+05:30");
  equal(g, "New York DST gap", off("2026-03-08", "02:30", "America/New_York"), "UTC-05:00 (gap)");
  equal(g, "New York DST overlap", off("2026-11-01", "01:30", "America/New_York"), "UTC-04:00 (ambiguous)");
  equal(g, "tz from coordinates: Pune", timezoneAt(18.52, 73.85), "Asia/Kolkata");
  equal(g, "tz from coordinates: Kathmandu", timezoneAt(27.7, 85.32), "Asia/Kathmandu");
  equal(g, "tz from coordinates: London", timezoneAt(51.5, -0.12), "Europe/London");
}

// ── 9. Horoscope is deterministic and complete ──
{
  const g = "Horoscope";
  const a = JSON.stringify(buildHoroscope({ sign: 4, period: "daily", date: "2026-10-16" }));
  const b = JSON.stringify(buildHoroscope({ sign: 4, period: "daily", date: "2026-10-16" }));
  equal(g, "same sign + date → same text", a === b, true);
  let complete = true;
  for (let s = 0; s < 12; s++) {
    for (const period of ["daily", "weekly"] as const) {
      const h = buildHoroscope({ sign: s, period, date: "2026-10-16" });
      if (!h.summary || h.details.length < 2 || !h.basis) complete = false;
    }
  }
  equal(g, "all 12 signs × daily/weekly have text", complete, true);
  // The Moon's transit house must agree with the Moon sign the engine reports.
  const h = buildHoroscope({ sign: 0, period: "daily", date: "2026-10-16" });
  const moon = h.transits.find((t) => t.graha === "moon")!;
  equal(g, "Moon house counted from the sign", moon.house, moon.sign.index + 1);
}

// Full Kundli round trip runs without error and puts the lagna in house 1.
{
  const k = engine.kundli({ date: "1990-05-15", time: "14:30", latitude: 18.52, longitude: 73.86, timezone: "Asia/Kolkata" });
  equal("Kundli", "houses: lagna sign is house 1", k.houses[0]!.sign.index, k.lagna.sign.index);
  equal("Kundli", "nine grahas", k.grahas.length, 9);
  equal("Kundli", "Rahu–Ketu opposite", Math.round(wrap(k.grahas[7]!.longitude - k.grahas[8]!.longitude)), -180);
}

// ── Report ──
const groups = [...new Set(rows.map((r) => r.group))];
let failed = 0;
for (const group of groups) {
  console.log(`\n${group}`);
  for (const r of rows.filter((x) => x.group === group)) {
    if (!r.ok) failed++;
    console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.name.padEnd(46)} ${r.measured.padEnd(26)} (${r.tolerance})`);
  }
}
const worst = (group: string) =>
  Math.max(...rows.filter((r) => r.group === group).map((r) => Math.abs(parseFloat(r.measured)) || 0)).toFixed(2);
console.log(`\nWorst errors: JPL ${worst("Tropical longitude vs JPL")}″ · ayanamsa ${worst("Lahiri ayanamsa vs Swiss Ephemeris")}″ · Drik ${worst("Sidereal vs Drik Panchang")}″ · rise/set ${worst("Sun/Moon rise vs JPL")} min`);
console.log(`${rows.length - failed}/${rows.length} checks passed.`);
process.exit(failed ? 1 : 0);
