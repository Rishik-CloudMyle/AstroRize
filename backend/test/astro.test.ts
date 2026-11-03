// Accuracy proof for the AstroRize astrology engine (lib/astro). No database, no network.
//   node test/astro.test.ts
// Every reference value below comes from an independent published source, cited next to it.
// Prints a table of measured errors and exits 1 if any check is outside its tolerance.

import {
  CombineRotation, HorizonFromVector, MakeTime, Observer, RotateVector, Rotation_ECT_EQD, Rotation_EQD_HOR, Vector,
} from "astronomy-engine";
import { NAKSHATRA_YONI, YONI_POINTS, type GrahaKey } from "../src/lib/astro/constants.ts";
import { vimshottari } from "../src/lib/astro/dasha.ts";
import { astrorizeEngine as engine } from "../src/lib/astro/engine.ts";
import { angles, grahaPositions, outsideTestedRange, trueLahiri } from "../src/lib/astro/ephemeris.ts";
import { buildHoroscope } from "../src/lib/astro/horoscope.ts";
import { navamsaSign } from "../src/lib/astro/kundli.ts";
import { scoreKootas } from "../src/lib/astro/matchmaking.ts";
import { buildPanchang } from "../src/lib/astro/panchang.ts";
import { offsetLabel, timezoneAt, zonedToUtc, type Stamp } from "../src/lib/astro/time.ts";
import { VARGA_CODES, bhavaChalit, computeVargas, vargaDegree, vargaSign, type VargaCode } from "../src/lib/astro/vargas.ts";
import { NAME_SYLLABLES, payaOf, yunjaOf } from "../src/lib/astro/avakhada.ts";
import { dignityOf, isCombust } from "../src/lib/astro/dignity.ts";
import { kalsarpa, sadeSati } from "../src/lib/astro/doshas.ts";
import { completeKundli, type Kundli } from "../src/lib/astro/kundli.ts";
import { mangalDosha } from "../src/lib/astro/matchmaking.ts";
import { kundliReading } from "../src/lib/astro/readings.ts";
import { YOGINIS, firstYogini } from "../src/lib/astro/yogini.ts";
import { ASHTAKA_PLANETS, BAV_TABLE, BAV_TOTALS, SAV_TOTAL, computeAshtakavarga } from "../src/lib/astro/ashtakvarga.ts";
import { computeKp, kpCusps, kpLords, placidusTropical, subBoundaries } from "../src/lib/astro/kp.ts";
import { NAISARGIKA, ayanaBala, computeShadbala, drishti, uchchaBala } from "../src/lib/astro/shadbala.ts";

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

// ── 10. Divisional charts (vargas) ──
// Rules: Brihat Parashara Hora Shastra ch. 6 (R. Santhanam tr., 1984; G. C. Sharma tr., 1994),
// as tabulated in K. S. Charak, "Elements of Vedic Astrology" ch. 6 — see the header of
// src/lib/astro/vargas.ts. Each expected sign below is worked by hand from those rules;
// "−1″" means one arcsecond before a division edge, an exact edge belongs to the next division.
{
  const g = "Vargas (Parashari, hand-worked)";
  const [Ar, Ta, Ge, Cn, Le, Vi, Li, Sc, Sg, Cp, Aq, Pi] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const NAME = ["Ar", "Ta", "Ge", "Cn", "Le", "Vi", "Li", "Sc", "Sg", "Cp", "Aq", "Pi"];
  const END = (sign: number) => sign * 30 + 30 - 1 / 3600; // 29°59′59″
  const cases: [VargaCode, string, number, number][] = [
    // D1: plain sign.
    ["D1", "0° Ar", 0, Ar], ["D1", "29°59′59″ Ar", END(Ar), Ar], ["D1", "0° Ta (edge)", 30, Ta],
    // D2 hora: odd 0–15 Leo, 15–30 Cancer; even 0–15 Cancer, 15–30 Leo.
    ["D2", "0° Ar (odd, 1st half) → Le", 0, Le], ["D2", "14°59′59″ Ar → Le", dms(Ar, 14, 59, 59), Le], ["D2", "15° Ar (edge) → Cn", dms(Ar, 15, 0), Cn],
    ["D2", "0° Ta (even, 1st half) → Cn", dms(Ta, 0, 0), Cn], ["D2", "15° Ta → Le", dms(Ta, 15, 0), Le], ["D2", "29°59′59″ Ta → Le", END(Ta), Le],
    // D3: 0–10 the sign, 10–20 the 5th, 20–30 the 9th.
    ["D3", "9°59′59″ Ar → Ar", dms(Ar, 9, 59, 59), Ar], ["D3", "10° Ar → Le (5th)", dms(Ar, 10, 0), Le], ["D3", "20° Ar → Sg (9th)", dms(Ar, 20, 0), Sg],
    ["D3", "25° Ta → Cp (9th)", dms(Ta, 25, 0), Cp],
    // D4: 7°30′ parts → the sign, 4th, 7th, 10th.
    ["D4", "7°29′59″ Ar → Ar", dms(Ar, 7, 29, 59), Ar], ["D4", "7°30′ Ar → Cn", dms(Ar, 7, 30), Cn], ["D4", "22°30′ Ar → Cp", dms(Ar, 22, 30), Cp],
    ["D4", "29°59′59″ Cn → Ar (10th)", END(Cn), Ar],
    // D7: 4°17′08.6″ parts; odd from the sign, even from the 7th.
    ["D7", "0° Ar → Ar", 0, Ar], ["D7", "30/7° Ar −1″ → Ar", 30 / 7 - 1 / 3600, Ar], ["D7", "30/7° Ar (edge) → Ta", 30 / 7, Ta],
    ["D7", "0° Ta (even) → Sc", dms(Ta, 0, 0), Sc], ["D7", "29°59′59″ Ta → Ta (7th part from Sc)", END(Ta), Ta],
    // D9: movable from the sign, fixed from the 9th, dual from the 5th.
    ["D9", "3°20′ Ar → Ta", dms(Ar, 3, 20), Ta], ["D9", "3°19′59″ Ar → Ar", dms(Ar, 3, 19, 59), Ar], ["D9", "10/3° (float edge) → Ta", 10 / 3, Ta],
    ["D9", "0° Ta (fixed) → Cp", dms(Ta, 0, 0), Cp], ["D9", "0° Ge (dual) → Li", dms(Ge, 0, 0), Li], ["D9", "29°59′59″ Pi → Pi", END(Pi), Pi],
    // D10: 3° parts; odd from the sign, even from the 9th.
    ["D10", "2°59′59″ Ar → Ar", dms(Ar, 2, 59, 59), Ar], ["D10", "3° Ar → Ta", dms(Ar, 3, 0), Ta], ["D10", "0° Ta (even) → Cp", dms(Ta, 0, 0), Cp],
    ["D10", "29°59′59″ Ta → Li", END(Ta), Li],
    // D12: 2°30′ parts from the sign.
    ["D12", "2°30′ Ar → Ta", dms(Ar, 2, 30), Ta], ["D12", "2°29′59″ Ar → Ar", dms(Ar, 2, 29, 59), Ar], ["D12", "29°59′59″ Le → Cn", END(Le), Cn],
    // D16: 1°52′30″ parts; movable from Ar, fixed from Le, dual from Sg.
    ["D16", "1°52′30″ Ar → Ta", dms(Ar, 1, 52, 30), Ta], ["D16", "0° Ta (fixed) → Le", dms(Ta, 0, 0), Le], ["D16", "0° Ge (dual) → Sg", dms(Ge, 0, 0), Sg],
    ["D16", "29°59′59″ Ar → Cn (16th)", END(Ar), Cn],
    // D20: 1°30′ parts; movable from Ar, fixed from Sg, dual from Le.
    ["D20", "1°30′ Ar → Ta", dms(Ar, 1, 30), Ta], ["D20", "0° Ta (fixed) → Sg", dms(Ta, 0, 0), Sg], ["D20", "0° Ge (dual) → Le", dms(Ge, 0, 0), Le],
    ["D20", "29°59′59″ Ta → Cn (20th from Sg)", END(Ta), Cn],
    // D24: 1°15′ parts; odd from Le, even from Cn.
    ["D24", "0° Ar → Le", 0, Le], ["D24", "1°15′ Ar → Vi", dms(Ar, 1, 15), Vi], ["D24", "0° Ta → Cn", dms(Ta, 0, 0), Cn],
    ["D24", "29°59′59″ Ta → Ge (24th from Cn)", END(Ta), Ge],
    // D27: 1°06′40″ parts; fiery from Ar, earthy from Cn, airy from Li, watery from Cp.
    ["D27", "0° Ar → Ar", 0, Ar], ["D27", "1°06′40″ Ar → Ta", dms(Ar, 1, 6, 40), Ta], ["D27", "0° Ta (earth) → Cn", dms(Ta, 0, 0), Cn],
    ["D27", "0° Ge (air) → Li", dms(Ge, 0, 0), Li], ["D27", "0° Cn (water) → Cp", dms(Cn, 0, 0), Cp], ["D27", "0° Le (fire) → Ar", dms(Le, 0, 0), Ar],
    // D30: unequal parts.
    ["D30", "4°59′59″ Ar → Ar (Mars)", dms(Ar, 4, 59, 59), Ar], ["D30", "5° Ar → Aq (Saturn)", dms(Ar, 5, 0), Aq], ["D30", "10° Ar → Sg (Jupiter)", dms(Ar, 10, 0), Sg],
    ["D30", "18° Ar → Ge (Mercury)", dms(Ar, 18, 0), Ge], ["D30", "25° Ar → Li (Venus)", dms(Ar, 25, 0), Li], ["D30", "29°59′59″ Ar → Li", END(Ar), Li],
    ["D30", "0° Ta → Ta (Venus)", dms(Ta, 0, 0), Ta], ["D30", "5° Ta → Vi (Mercury)", dms(Ta, 5, 0), Vi], ["D30", "11°59′59″ Ta → Vi", dms(Ta, 11, 59, 59), Vi],
    ["D30", "12° Ta → Pi (Jupiter)", dms(Ta, 12, 0), Pi], ["D30", "20° Ta → Cp (Saturn)", dms(Ta, 20, 0), Cp], ["D30", "25° Ta → Sc (Mars)", dms(Ta, 25, 0), Sc],
    // D40: 0°45′ parts; odd from Ar, even from Li.
    ["D40", "0° Ar → Ar", 0, Ar], ["D40", "0°45′ Ar → Ta", dms(Ar, 0, 45), Ta], ["D40", "0° Ta → Li", dms(Ta, 0, 0), Li],
    ["D40", "29°59′59″ Ar → Cn (40th)", END(Ar), Cn],
    // D45: 0°40′ parts; movable from Ar, fixed from Le, dual from Sg.
    ["D45", "0°40′ Ar → Ta", dms(Ar, 0, 40), Ta], ["D45", "0° Ta (fixed) → Le", dms(Ta, 0, 0), Le], ["D45", "0° Ge (dual) → Sg", dms(Ge, 0, 0), Sg],
    ["D45", "29°59′59″ Ar → Sg (45th)", END(Ar), Sg],
    // D60: 0°30′ parts from the sign.
    ["D60", "0°29′59″ Ar → Ar", dms(Ar, 0, 29, 59), Ar], ["D60", "0°30′ Ar → Ta", dms(Ar, 0, 30), Ta], ["D60", "15° Cn → Cp (31st)", dms(Cn, 15, 0), Cp],
    ["D60", "29°59′59″ Ta → Ar (60th)", END(Ta), Ar],
  ];
  for (const [code, label, lon, want] of cases) equal(g, `${code} ${label}`, NAME[vargaSign(code, lon)], NAME[want]);

  // Structure: sweeping each sign in 0.5″ steps, every varga changes sign exactly (parts − 1) times
  // per rashi (D30 has 5 unequal parts); and D9/D27 equal continuous counting from Aries.
  const PARTS: Record<VargaCode, number> = { D1: 1, D2: 2, D3: 3, D4: 4, D7: 7, D9: 9, D10: 10, D12: 12, D16: 16, D20: 20, D24: 24, D27: 27, D30: 5, D40: 40, D45: 45, D60: 60 };
  for (const code of VARGA_CODES) {
    let ok = true;
    for (let s = 0; s < 12 && ok; s++) {
      let changes = 0;
      let prev = vargaSign(code, s * 30);
      for (let i = 1; i < 30 * 7200; i++) {
        const v = vargaSign(code, s * 30 + i / 7200);
        if (v !== prev) changes++;
        prev = v;
      }
      if (changes !== PARTS[code] - 1) ok = false;
    }
    equal("Vargas (structure)", `${code}: ${PARTS[code]} parts in every sign`, ok, true);
  }
  let d9same = true;
  let d27same = true;
  for (let i = 0; i < 36000; i++) {
    const lon = i / 100 + 0.004;
    if (vargaSign("D9", lon) !== navamsaSign(lon)) d9same = false;
    if (vargaSign("D27", lon) !== Math.floor((lon * 27) / 30) % 12) d27same = false;
  }
  equal("Vargas (structure)", "D9 identical to the existing navamsaSign", d9same, true);
  equal("Vargas (structure)", "D27 = continuous count from Aries", d27same, true);

  // Near a sign change: 1e-12° before 30° is still Aries (as D1 floor), and its D9 stays in the last
  // Aries navamsa (Sagittarius) instead of jumping ahead; exactly 30° is Taurus / D9 Capricorn.
  equal(g, "1e-12° before Taurus: D1 Ar, D9 Sg", `${NAME[vargaSign("D1", 30 - 1e-12)]} ${NAME[vargaSign("D9", 30 - 1e-12)]}`, "Ar Sg");
  equal(g, "exactly 30°: D1 Ta, D9 Cp", `${NAME[vargaSign("D1", 30)]} ${NAME[vargaSign("D9", 30)]}`, "Ta Cp");
  equal(g, "359.9999999999° (end of Pisces): D60 Aq (Pi+59)", NAME[vargaSign("D60", 360 - 1e-10)], "Aq");
  equal(g, "exactly 360° wraps to 0° Aries: D60 Ar", NAME[vargaSign("D60", 360)], "Ar");
}

// Full chart: Barack Obama (Astro-Databank AA, cited in section 4). No published Parashari varga
// table we can cite reliably, so the varga lagnas are worked by hand: tropical Asc 18°03′ Aquarius
// (318°03′) − Lahiri 23°19′06″ (1961-08-05 UT) = 294°43′54″ = 24°43′54″ Capricorn (sidereal; Vedic
// sources give Obama a Capricorn lagna).
//   D9: 3°20′ parts → part 8 (23°20′–26°40′); Capricorn is movable → count from itself: Cp+7 = Leo.
//   D10: 3° parts → part 9 (24°–27°); Capricorn is even → from the 9th (Virgo): Vi+8 = Taurus.
//   D60: 0°30′ parts → part 50 (24°30′–25°00′); from the sign: Cp+49 = Aquarius.
// The engine's lagna must sit inside those same parts (it is ≥ 13′ from every edge used).
{
  const g = "Vargas: Obama chart (hand-worked)";
  const k = engine.kundli({ date: "1961-08-04", time: "19:24", latitude: 21 + 18 / 60, longitude: -(157 + 52 / 60), timezone: "Pacific/Honolulu" });
  const NAME = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  near(g, "sidereal lagna 24°43′54″ Capricorn", k.lagna.longitude, dms(9, 24, 43, 54), 60);
  equal(g, "D1 lagna", NAME[k.vargas.D1.lagnaSign], "Capricorn");
  equal(g, "D9 lagna", NAME[k.vargas.D9.lagnaSign], "Leo");
  equal(g, "D9 lagna matches the navamsa chart", k.vargas.D9.lagnaSign, k.navamsa.lagna.index);
  equal(g, "D10 lagna", NAME[k.vargas.D10.lagnaSign], "Taurus");
  equal(g, "D60 lagna", NAME[k.vargas.D60.lagnaSign], "Aquarius");
  // Every varga holds all nine grahas once, and D9 placements match each graha's navamsa.
  let complete = true;
  for (const code of VARGA_CODES) if (k.vargas[code].houses.flatMap((h) => h.grahas).length !== 9) complete = false;
  equal(g, "all 16 vargas place 9 grahas", complete, true);
  equal(g, "D9 houses = navamsa houses", JSON.stringify(k.vargas.D9.houses.map((h) => h.grahas)), JSON.stringify(k.navamsa.houses.map((h) => h.grahas)));
  // Saved charts from before vargas existed: recomputing from the stored longitudes gives the same.
  equal(g, "recomputed from stored longitudes", JSON.stringify(computeVargas(k.lagna.longitude, k.grahas)), JSON.stringify(k.vargas));
  // Bhava Chalit (Sripati): each graha is in exactly one bhava, the one kundli.ts reports.
  const chalit = bhavaChalit(k.bhavas, k.grahas);
  equal(g, "Bhava Chalit places 9 grahas", chalit.houses.flatMap((h) => h.grahas).length, 9);
  equal(g, "Bhava Chalit = graha.bhava", k.grahas.every((x) => chalit.houses[x.bhava - 1]!.grahas.includes(x.key)), true);
}

// True node: the Kundli built with node "true" uses the osculating node (checked against Drik
// Panchang in section 3) for Rahu, keeps Ketu opposite, and places it in the vargas by that longitude.
{
  const g = "Vargas: true node";
  const input = { date: "2025-10-20", time: "12:00", latitude: 28 + 38 / 60 + 8 / 3600, longitude: 77 + 13 / 60 + 28 / 3600, timezone: "Asia/Kolkata" };
  const t = engine.kundli({ ...input, node: "true" });
  const m = engine.kundli(input);
  const rahuT = t.grahas.find((x) => x.key === "rahu")!;
  const ketuT = t.grahas.find((x) => x.key === "ketu")!;
  equal(g, "settings.node", t.settings.node, "true");
  near(g, "Rahu (true) vs Drik 23°42′09.5″ Aquarius", rahuT.longitude, dms(10, 23, 42, 9.5), 60);
  equal(g, "true and mean Rahu differ (~1°54′)", Math.round(wrap(rahuT.longitude - m.grahas.find((x) => x.key === "rahu")!.longitude) * 10) / 10, 1.9);
  equal(g, "Ketu opposite the true Rahu", Math.round(wrap(rahuT.longitude - ketuT.longitude)), -180);
  equal(g, "D9 Rahu from the true longitude", t.vargas.D9.houses.find((h) => h.grahas.includes("rahu"))!.sign, navamsaSign(rahuT.longitude));
  equal(g, "D60 Rahu from the true longitude", t.vargas.D60.houses.find((h) => h.grahas.includes("rahu"))!.sign, vargaSign("D60", rahuT.longitude));
}

// Date-range disclosure: 1700–2200 is the fully trusted range (ephemeris.ts TESTED_YEARS).
{
  const g = "Date range flag";
  equal(g, "1650 outside", outsideTestedRange("1650-06-01"), true);
  equal(g, "1700-01-01 inside", outsideTestedRange("1700-01-01"), false);
  equal(g, "2200-12-31 inside", outsideTestedRange("2200-12-31"), false);
  equal(g, "2201-01-01 outside", outsideTestedRange("2201-01-01"), true);
  const old = engine.kundli({ date: "1650-03-10", time: "06:00", latitude: 18.52, longitude: 73.86, timezone: "Asia/Kolkata" });
  equal(g, "Kundli for 1650 is calculated and flagged", old.outsideTestedRange, true);
  const noTime = engine.matchmaking(
    { date: "1995-08-15", latitude: 18.52, longitude: 73.86, timezone: "Asia/Kolkata" },
    { date: "1996-01-10", time: "08:00", latitude: 19.08, longitude: 72.88, timezone: "Asia/Kolkata" },
  );
  equal(g, "matchmaking flags the assumed noon", `${noTime.boy.timeAssumed} ${noTime.girl.timeAssumed}`, "true false");
}

// Full Kundli round trip runs without error and puts the lagna in house 1.
{
  const k = engine.kundli({ date: "1990-05-15", time: "14:30", latitude: 18.52, longitude: 73.86, timezone: "Asia/Kolkata" });
  equal("Kundli", "houses: lagna sign is house 1", k.houses[0]!.sign.index, k.lagna.sign.index);
  equal("Kundli", "nine grahas", k.grahas.length, 9);
  equal("Kundli", "Rahu–Ketu opposite", Math.round(wrap(k.grahas[7]!.longitude - k.grahas[8]!.longitude)), -180);
}

// ── 11. Kundli report: birth details, panchang and avakhada at birth, AstroTalk cross-check ──
// Reference (facts only): AstroTalk's free Kundli report for 01 Jan 1998 06:00 IST, Delhi
// (28.6328 N, 77.2198 E, GMT+05:30), generated 15 Oct 2026 (Lahiri). Their planet table is given
// to the arc-second; held to ±60″ because ayanamsa variants (true vs mean, Drik's +19″) differ.
{
  const g = "Kundli vs AstroTalk (1998-01-01 06:00 Delhi)";
  const k = engine.kundli({ date: "1998-01-01", time: "06:00", latitude: 28.6328, longitude: 77.2198, timezone: "Asia/Kolkata" });
  const lon = (key: GrahaKey) => k.grahas.find((x) => x.key === key)!.longitude;
  near(g, "ascendant 28°29′09″ Scorpio", k.lagna.longitude, dms(7, 28, 29, 9), 60);
  near(g, "Sun 16°33′01″ Sagittarius", lon("sun"), dms(8, 16, 33, 1), 60);
  near(g, "Moon 16°26′50″ Capricorn", lon("moon"), dms(9, 16, 26, 50), 60);
  near(g, "Mars 16°57′16″ Capricorn", lon("mars"), dms(9, 16, 57, 16), 60);
  near(g, "Mercury 24°39′35″ Scorpio", lon("mercury"), dms(7, 24, 39, 35), 60);
  near(g, "Venus 9°33′58″ Capricorn", lon("venus"), dms(9, 9, 33, 58), 60);
  equal(g, "Venus retrograde", k.grahas.find((x) => x.key === "venus")!.retrograde, true);
  equal(g, "Moon nakshatra", `${k.birthNakshatra.name} ${k.birthNakshatra.pada}`, "Shravana 2");
  const p = k.birthPanchang;
  equal(g, "tithi at birth", `${p.tithi.paksha} ${p.tithi.name}`, "Shukla Tritiya");
  equal(g, "karana at birth (Taitil)", p.karana.name, "Taitila");
  equal(g, "yoga at birth", p.yoga.name, "Harshana");
  equal(g, "nakshatra at birth + lord", `${p.nakshatra.name} ${p.nakshatra.lord}`, "Shravana moon");
  // AstroTalk prints sunrise 7:13:52, sunset 17:35:17 for that date and place.
  nearMinutes(g, "sunrise 07:13:52", at(p.sunrise), ist("1998-01-01", "07:13:52"), 1);
  nearMinutes(g, "sunset 17:35:17", at(p.sunset), ist("1998-01-01", "17:35:17"), 1);
  // 06:00 is before sunrise, so the Vedic weekday is still Wednesday (civil date Thursday).
  equal(g, "vara (sunrise to sunrise)", `${p.vara.name} / civil ${p.vara.civil} / before sunrise ${p.vara.beforeSunrise}`, "Wednesday / civil Thursday / before sunrise true");
  const a = k.avakhada;
  // Varna: our guna-milan table (constants.ts VARNA: earth signs Vaishya) gives Vaishya; AstroTalk prints
  // Shudra for a Capricorn Moon. Kept as our documented rule (see report); the rest must agree.
  equal(g, "avakhada varna (our table)", a.varna, "Vaishya");
  equal(g, "avakhada vashya (Jalchar)", a.vashya, "Jalachara");
  equal(g, "avakhada yoni (Vaanar)", a.yoni, "Monkey");
  equal(g, "avakhada gana (Dev)", a.gana, "Deva");
  equal(g, "avakhada nadi", a.nadi, "Antya");
  equal(g, "avakhada sign + lord", `${a.moonSign.name} ${a.moonSign.lord}`, "Capricorn saturn");
  equal(g, "avakhada charan", a.charan, 2);
  equal(g, "avakhada tatva", a.tatva, "Earth");
  equal(g, "avakhada name alphabet (Khoo)", `${a.nameAlphabet.latin} ${a.nameAlphabet.devanagari}`, "Khu खू");
  equal(g, "avakhada paya", a.paya, "Copper");
  equal(g, "avakhada yunja", a.yunja, "Antya");
  equal(g, "ascendant sign", k.lagna.sign.name, "Scorpio");
  // Yogini (AstroTalk p.40): Mangala at birth until 08 Jul 1998; Sankata 08 Jul 2025 – 08 Jul 2033.
  const y = k.yogini.mahadashas;
  equal(g, "yogini at birth", y[0]!.name, "Mangala");
  nearMinutes(g, "Mangala ends 08 Jul 1998", new Date(y[0]!.end), ist("1998-07-08", "12:00"), 24 * 60);
  const sankata = y.find((m) => m.name === "Sankata" && m.start.startsWith("2025"))!;
  nearMinutes(g, "Sankata begins 08 Jul 2025", new Date(sankata.start), ist("2025-07-08", "12:00"), 24 * 60);
  nearMinutes(g, "Sankata ends 08 Jul 2033", new Date(sankata.end), ist("2033-07-08", "12:00"), 24 * 60);
  // AstroTalk's report also says Kalsarpa "Ghatak" present and Non-Manglik; by our documented rules
  // Saturn (Pisces) lies outside the Rahu (Leo) → Ketu (Aquarius) arc, so it is NOT Kalsarpa, and
  // Mars is in the 1st from the Moon, so Mangal dosha is flagged from the Moon (3rd from lagna) with
  // cancellations. Checked here as our rule; the difference is reported.
  equal(g, "kalsarpa (our rule): absent, Saturn outside", `${k.doshas.kalsarpa.status} ${k.doshas.kalsarpa.outside.join(",")} rahu house ${k.doshas.kalsarpa.rahuHouse}`, "absent saturn rahu house 10");
  equal(g, "manglik from lagna / Moon", `${k.doshas.manglik.fromLagna} / ${k.doshas.manglik.fromMoon}`, "3 / 1");
  equal(g, "Mars exalted in Capricorn", k.grahas.find((x) => x.key === "mars")!.dignity, "exalted");
  equal(g, "Jupiter debilitated in Capricorn", k.grahas.find((x) => x.key === "jupiter")!.dignity, "debilitated");

  // Sade Sati for a Capricorn Moon, 2017–2025. Saturn's sidereal (Lahiri) sign changes as published
  // by Drik Panchang ("Shani Gochar"): Sagittarius 26 Jan 2017, back to Scorpio 21 Jun 2017,
  // Sagittarius 26 Oct 2017, Capricorn 24 Jan 2020, Aquarius 29 Apr 2022, back to Capricorn 12 Jul 2022,
  // Aquarius 17 Jan 2023, Pisces 29 Mar 2025. Almanacs give the date only, so ±1.5 days.
  const ss = sadeSati(9, new Date("2026-10-24T00:00:00Z"), new Date(k.birth.utc));
  const main = ss.periods.find((x) => x.kind === "sade-sati" && x.start.startsWith("2017-10"))!;
  const spans = main.spans.map((x) => x.start);
  const day = (date: string) => ist(date, "12:00");
  const dmin = 36 * 60;
  const first = ss.periods.find((x) => x.kind === "sade-sati" && x.start.startsWith("2017-01"))!;
  nearMinutes(g, "Sade Sati begins 26 Jan 2017", new Date(first.start), day("2017-01-26"), dmin);
  nearMinutes(g, "Saturn back to Scorpio 21 Jun 2017", new Date(first.end), day("2017-06-21"), dmin);
  nearMinutes(g, "Sade Sati resumes 26 Oct 2017", new Date(main.start), day("2017-10-26"), dmin);
  nearMinutes(g, "peak (Capricorn) 24 Jan 2020", new Date(spans[1]!), day("2020-01-24"), dmin);
  nearMinutes(g, "setting (Aquarius) 29 Apr 2022", new Date(spans[2]!), day("2022-04-29"), dmin);
  nearMinutes(g, "back to Capricorn 12 Jul 2022", new Date(spans[3]!), day("2022-07-12"), dmin);
  nearMinutes(g, "Aquarius again 17 Jan 2023", new Date(spans[4]!), day("2023-01-17"), dmin);
  nearMinutes(g, "Sade Sati ends 29 Mar 2025", new Date(main.end), day("2025-03-29"), dmin);
  equal(g, "no Sade Sati on 24 Oct 2026 (Saturn in Pisces, 3rd)", ss.current, null);
  const mid = sadeSati(9, new Date("2021-01-01T00:00:00Z"));
  equal(g, "1 Jan 2021: Sade Sati peak", mid.current && `${mid.current.kind} ${mid.current.phase}`, "sade-sati peak");
}

// ── 12. Rules behind the report (hand-built cases) ──
{
  const g = "Report rules";
  // Yogini start: (nakshatra number + 3) mod 8, 1 = Mangala … 0 = Sankata (yogini.ts).
  const yName = (nak: number) => YOGINIS[firstYogini(nak)]!.name;
  equal(g, "yogini: Ashwini → Bhramari", yName(0), "Bhramari");
  equal(g, "yogini: Ardra → Mangala", yName(5), "Mangala");
  equal(g, "yogini: Pushya → Dhanya", yName(7), "Dhanya");
  equal(g, "yogini: Hasta (13) → 16 mod 8 = 0 Sankata", yName(12), "Sankata");
  equal(g, "yogini: Swati (15) → 18 mod 8 = 2 Pingala", yName(14), "Pingala");
  equal(g, "yogini: Revati → Ulka", yName(26), "Ulka");
  equal(g, "yogini: Purva Bhadrapada (25) → 28 mod 8 = 4 Bhramari", yName(24), "Bhramari");
  equal(g, "yogini years add to 36", YOGINIS.reduce((s, x) => s + x.years, 0), 36);

  // Combustion boundaries (dignity.ts): within the orb (≤) is combust.
  equal(g, "Mercury 13°59′ from Sun (direct) combust", isCombust("mercury", 100 + 13 + 59 / 60, 100, false), true);
  equal(g, "Mercury 14°01′ from Sun (direct) not combust", isCombust("mercury", 100 + 14 + 1 / 60, 100, false), false);
  equal(g, "Mercury 12°30′ retrograde not combust (12°)", isCombust("mercury", 100 - 12.5, 100, true), false);
  equal(g, "Venus 9° retrograde not combust (8°)", isCombust("venus", 9, 0, true), false);
  equal(g, "Venus 9° direct combust (10°), across 0° Aries", isCombust("venus", 359, 8, false), true);
  equal(g, "Mars 16°59′ combust (17°)", isCombust("mars", 16 + 59 / 60, 0, false), true);
  equal(g, "Saturn 15°01′ not combust", isCombust("saturn", 15 + 1 / 60, 0, false), false);
  equal(g, "Sun / Rahu never combust", `${isCombust("sun", 0, 0, false)} ${isCombust("rahu", 1, 0, true)}`, "null null");
  // Dignity (BPHS ch. 3).
  equal(g, "Moon 2° Taurus exalted, 5° moolatrikona", `${dignityOf("moon", 32)} ${dignityOf("moon", 35)}`, "exalted moolatrikona");
  equal(g, "Mercury Virgo 10°/17°/25°", `${dignityOf("mercury", 160)} ${dignityOf("mercury", 167)} ${dignityOf("mercury", 175)}`, "exalted moolatrikona own");
  equal(g, "Sun Leo 10° moolatrikona, 25° own", `${dignityOf("sun", 130)} ${dignityOf("sun", 145)}`, "moolatrikona own");
  equal(g, "Saturn Aries debilitated, Libra exalted", `${dignityOf("saturn", 10)} ${dignityOf("saturn", 190)}`, "debilitated exalted");
  equal(g, "Venus in Leo: enemy (Sun)", dignityOf("venus", 125), "enemy");
  equal(g, "Rahu has no dignity", dignityOf("rahu", 45), null);

  // Kalsarpa (doshas.ts): grahas by longitude; house = sign + 1 from an Aries lagna.
  const chart = (lons: Partial<Record<GrahaKey, number>>, rahu: number) => {
    const all: Record<string, number> = { ...lons, rahu, ketu: (rahu + 180) % 360 };
    return Object.entries(all).map(([key, longitude]) => ({ key: key as GrahaKey, longitude, house: Math.floor(longitude / 30) + 1 }));
  };
  const inside = { sun: 10, moon: 40, mars: 70, mercury: 100, jupiter: 130, venus: 150, saturn: 170 };
  const ks = kalsarpa(chart(inside, 5));
  equal(g, "kalsarpa: all seven Rahu → Ketu, Rahu in 1st = Anant", `${ks.status} ${ks.direction} ${ks.type}`, "present rahu-to-ketu Anant");
  equal(g, "kalsarpa: one graha out → absent", kalsarpa(chart(inside, 275)).status, "absent");
  const back = kalsarpa(chart(inside, 182));
  equal(g, "kalsarpa: all seven Ketu → Rahu, Rahu in 7th = Takshak", `${back.status} ${back.direction} ${back.type}`, "present ketu-to-rahu Takshak");
  const part = kalsarpa(chart({ ...inside, saturn: 3 }, 5));
  equal(g, "kalsarpa: Saturn conjoins Rahu's sign → partial", `${part.status} ${part.outside.join(",")}`, "partial saturn");
  equal(g, "kalsarpa: Rahu in 10th = Ghatak", kalsarpa(chart({ sun: 280, moon: 290, mars: 300, mercury: 320, jupiter: 330, venus: 340, saturn: 350 }, 275)).type, "Ghatak");

  // Mangal dosha (matchmaking.ts mangalDosha, shared with guna milan).
  const m1 = mangalDosha(dms(6, 10, 0), dms(0, 10, 0), dms(3, 0, 0), dms(1, 0, 0)); // Mars Libra: 7th from an Aries Moon, 4th from a Cancer lagna
  equal(g, "manglik: Mars 7th from Moon, 4th from lagna", `${m1.present} ${m1.fromMoon} ${m1.fromLagna}`, "true 7 4");
  const m2 = mangalDosha(dms(2, 10, 0), dms(0, 10, 0), dms(0, 0, 0), dms(5, 0, 0)); // Mars Gemini: 3rd from both
  equal(g, "manglik: Mars 3rd from both → none", `${m2.present} ${m2.cancellations.length}`, "false 0");
  const m3 = mangalDosha(dms(7, 10, 0), dms(7, 1, 0), null, dms(7, 20, 0)); // Mars Scorpio with the Moon and Jupiter
  equal(g, "manglik: own sign + Jupiter + Moon cancellations", m3.cancellations.length, 3);

  // Avakhada tables.
  equal(g, "108 naming syllables", NAME_SYLLABLES.flat().length, 108);
  equal(g, "Ashwini syllables", NAME_SYLLABLES[0]!.map((x) => x[0]).join(" "), "Chu Che Cho La");
  equal(g, "Revati syllables", NAME_SYLLABLES[26]!.map((x) => x[1]).join(" "), "दे दो चा ची");
  const yc = { Adi: 0, Madhya: 0, Antya: 0 };
  for (let n = 0; n < 27; n++) yc[yunjaOf(n)]++;
  equal(g, "yunja groups 6 / 12 / 9", `${yc.Adi} ${yc.Madhya} ${yc.Antya}`, "6 12 9");
  equal(g, "paya by Moon house 1–12", Array.from({ length: 12 }, (_, i) => payaOf(i + 1)[0]).join(""), "GSCISGCISCGI");

  // Varga degrees: (degrees in sign × n) mod 30; D30 none.
  equal(g, "D9 degree of 1° Aries = 9°", vargaDegree("D9", 1), 9);
  equal(g, "D9 degree at a part edge (3°20′) = 0°", vargaDegree("D9", 10 / 3), 0);
  equal(g, "D60 degree of 0°15′ Taurus = 15°", Math.round(vargaDegree("D60", 30.25)! * 1e9) / 1e9, 15);
  equal(g, "D1 degree = degree in sign", vargaDegree("D1", 47.5), 17.5);
  equal(g, "D30 has no varga degree", vargaDegree("D30", 12), null);

  // Old saved charts: removing every new field and completing gives the same chart back.
  const fresh = engine.kundli({ date: "1995-08-15", time: "10:30", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata" });
  const old = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown> & Kundli;
  for (const key of ["birthPanchang", "avakhada", "yogini", "doshas", "vargas", "bhavaChalit", "outsideTestedRange"]) delete old[key];
  for (const gr of old.grahas as unknown as Record<string, unknown>[]) {
    delete gr.dignity;
    delete gr.combust;
  }
  // Compared field by field (key order differs; Ashtakavarga/KP/Shadbala are filled in by the route).
  const done = JSON.parse(JSON.stringify(completeKundli(old))) as Record<string, unknown>;
  const want = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
  const differing = Object.keys(want).filter((key) => !["ashtakavarga", "kp", "shadbala"].includes(key) && JSON.stringify(done[key]) !== JSON.stringify(want[key]));
  equal(g, "old chart completed = freshly built", differing.join(","), "");

  // Readings: every graha in every sign and house has text, and the same chart reads the same.
  let all = true;
  for (let s = 0; s < 12; s++) {
    for (let h = 1; h <= 12; h++) {
      for (const key of ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"] as GrahaKey[]) {
        const r = kundliReading({ lagna: { sign: { index: s, name: "x" } }, grahas: [{ key, sign: { index: s }, house: h, dignity: dignityOf(key, s * 30 + 10), retrograde: false, combust: false }] });
        if (!r.ascendant.text || r.planets[0]!.bySign.length < 40 || r.planets[0]!.byHouse.length < 40) all = false;
      }
    }
  }
  equal(g, "readings for 12 signs × 12 houses × 9 grahas", all, true);
  equal(g, "readings deterministic", JSON.stringify(kundliReading(fresh)) === JSON.stringify(kundliReading(fresh)), true);
}

// ── Ashtakavarga, KP and Shadbala ──
// Charts: 01 Jan 1998 06:00 IST New Delhi (28.6328N 77.2198E — AstroTalk's public KP sample),
// 15 Aug 1995 10:30 IST Pune (18.5204N 73.8567E), and Obama (section 4).
const DELHI_98 = { date: "1998-01-01", time: "06:00", latitude: 28.6328, longitude: 77.2198, timezone: "Asia/Kolkata" };
const PUNE_95 = { date: "1995-08-15", time: "10:30", latitude: 18.5204, longitude: 73.8567, timezone: "Asia/Kolkata" };
const OBAMA = { date: "1961-08-04", time: "19:24", latitude: 21 + 18 / 60, longitude: -(157 + 52 / 60), timezone: "Pacific/Honolulu" };
{
  // Invariants of the BPHS tables (ashtakvarga.ts): BAV totals 48/49/39/54/56/52/39, SAV 337 — for every chart.
  const g = "Ashtakavarga";
  for (const [label, input] of [["Delhi 1998", DELHI_98], ["Pune 1995", PUNE_95], ["Obama 1961", OBAMA]] as const) {
    const a = engine.kundli(input).ashtakavarga;
    equal(g, `${label}: BAV totals`, a.bav.map((b) => b.total).join(","), ASHTAKA_PLANETS.map((p) => BAV_TOTALS[p]).join(","));
    equal(g, `${label}: SAV total 337`, a.sav.total, SAV_TOTAL);
    equal(g, `${label}: SAV house 1 = lagna sign`, a.sav.byHouse[0], a.sav.bySign[a.lagnaSign]);
  }
  equal(g, "BAV tables sum to the totals", ASHTAKA_PLANETS.map((p) => Object.values(BAV_TABLE[p]).reduce((s, r) => s + r.length, 0)).join(","), "48,49,39,54,56,52,39");
  // Hand-worked Sun BAV, Delhi 1998: Sun Sg, Moon/Mars/Jupiter/Venus Cp, Mercury Sc, Saturn Pi, Lagna Sc.
  // From the Sun (Sg) 1,2,4,7,8,9,10,11 → Sg Cp Pi Ge Cn Le Vi Li; Moon (Cp) 3,6,10,11 → Pi Ge Vi Li;
  // Mars (Cp) 1,2,4,7,8,9,10,11 → Cp Aq Ar Cn Le Vi Li Sc; Mercury (Sc) 3,5,6,9,10,11,12 → Cp Pi Ar Cn Le Vi Li;
  // Jupiter (Cp) 5,6,9,11 → Ta Ge Vi Sc; Venus (Cp) 6,7,12 → Ge Cn Sg; Saturn (Pi) 1,2,4,7,8,9,10,11 →
  // Pi Ar Ge Vi Li Sc Sg Cp; Lagna (Sc) 3,4,6,10,11,12 → Cp Aq Ar Le Vi Li. Counting per sign Ar…Pi:
  equal(g, "Delhi 1998: Sun BAV by sign (hand)", engine.kundli(DELHI_98).ashtakavarga.bav[0]!.bySign.join(","), "4,1,5,4,4,6,6,4,3,5,2,4");
}
{
  const g = "KP sub lords";
  const ARC_MIN = 1 / 60;
  // Standard KP sub table, Ashwini: Ke 0°00′–0°46′40″, Ve –3°00′00″, Su –3°40′, Mo –4°46′40″, Ma –5°33′20″…
  equal(g, "0°00′ Aries: star Ketu, sub Ketu", `${kpLords(0).starLord} ${kpLords(0).subLord}`, "ketu ketu");
  equal(g, "0°46′ Aries: sub Ketu", kpLords(46 * ARC_MIN).subLord, "ketu");
  equal(g, "0°47′ Aries: sub Venus", kpLords(47 * ARC_MIN).subLord, "venus");
  equal(g, "2°59′ / 3°01′ Aries: Venus / Sun", `${kpLords(179 * ARC_MIN).subLord} ${kpLords(181 * ARC_MIN).subLord}`, "venus sun");
  equal(g, "3°41′ Aries: sub Moon", kpLords(221 * ARC_MIN).subLord, "moon");
  near(g, "Ashwini Moon sub ends 4°46′40″", subBoundaries(0)[3]!.end, dms(0, 4, 46, 40), 0.001);
  let sumsOk = true;
  for (let n = 0; n < 27; n++) {
    const b = subBoundaries(n);
    const span = b.reduce((s, x) => s + (x.end - x.start), 0);
    if (Math.abs(span - 40 / 3) > 1e-9 || Math.abs(b[0]!.start - (n * 40) / 3) > 1e-9) sumsOk = false;
  }
  equal(g, "every nakshatra's 9 subs sum to 13°20′", sumsOk, true);
  equal(g, "Bharani's first sub is Venus (its star lord)", subBoundaries(1)[0]!.lord, "venus");
  equal(g, "0°00′30″ Aries: sub-sub Ketu", kpLords(30 / 3600).subSubLord, "ketu");
  // The Ketu sub (46′40″) ends with its Mercury sub-sub (17/120 of it = 6′36.7″, from 0°40′03″).
  equal(g, "0°45′59″ Aries: sub-sub Mercury", kpLords(45 * ARC_MIN + 59 / 3600).subSubLord, "mercury");
}
{
  // Placidus vs Astrotheme's published cusps for Barack Obama (Astro-Databank AA chart, see section 4):
  // https://www.astrotheme.com/astrology/Barack_Obama — Placidus, tropical, rounded to 1′:
  // 1 18°03′ Aq, 2 25°54′ Pi, 3 0°18′ Ta, 4 28°53′ Ta, 5 23°59′ Ge, 6 19°01′ Cn, 10 28°53′ Sc, 11 23°59′ Sg, 12 19°01′ Cp.
  const g = "KP / Placidus cusps vs Astrotheme";
  const utc = zonedToUtc(OBAMA.date, OBAMA.time, OBAMA.timezone).utc;
  const a = angles(utc, OBAMA.latitude, OBAMA.longitude);
  const cusps = placidusTropical(a.ramc, a.obliquity, OBAMA.latitude, a.ascendant + a.ayanamsa, a.midheaven + a.ayanamsa)!;
  const REF: [number, number, number, number][] = [
    [1, 10, 18, 3], [2, 11, 25, 54], [3, 1, 0, 18], [4, 1, 28, 53], [5, 2, 23, 59], [6, 3, 19, 1], [10, 7, 28, 53], [11, 8, 23, 59], [12, 9, 19, 1],
  ];
  for (const [n, s, d, m] of REF) near(g, `Obama cusp ${n}`, cusps[n - 1]!, dms(s, d, m), 75);

  // The defining property, checked with independent formulas: each intermediate cusp's hour angle is
  // the stated fraction of its own semi-arc (11: −DSA/3, 12: −2DSA/3, 2: −DSA − NSA/3, 3: −DSA − 2NSA/3).
  const g2 = "Placidus semi-arc property";
  const places = [
    ["Delhi 1998", DELHI_98],
    ["Pune 1995", PUNE_95],
    ["Oslo 1975", { date: "1975-03-02", time: "02:00", latitude: 59.9, longitude: 10.75, timezone: "Europe/Oslo" }],
    ["Sydney 2010", { date: "2010-12-02", time: "07:00", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney" }],
  ] as const;
  for (const [label, input] of places) {
    const u = zonedToUtc(input.date, input.time, input.timezone).utc;
    const an = angles(u, input.latitude, input.longitude);
    const c = placidusTropical(an.ramc, an.obliquity, input.latitude, an.ascendant + an.ayanamsa, an.midheaven + an.ayanamsa)!;
    const e = (an.obliquity * Math.PI) / 180;
    let worst = 0;
    for (const [cusp, frac, below] of [[11, 1 / 3, false], [12, 2 / 3, false], [2, 1 / 3, true], [3, 2 / 3, true]] as const) {
      const l = (c[cusp - 1]! * Math.PI) / 180;
      const ra = (Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) * 180) / Math.PI;
      const dec = Math.asin(Math.sin(e) * Math.sin(l));
      const dsa = 90 + (Math.asin(Math.tan((input.latitude * Math.PI) / 180) * Math.tan(dec)) * 180) / Math.PI;
      const ha = wrap(an.ramc - ra); // west positive
      const want = below ? -(dsa + (180 - dsa) * frac) : -dsa * frac;
      worst = Math.max(worst, Math.abs(wrap(ha - want)));
    }
    rows.push({ group: g2, name: `${label}: worst hour-angle error`, measured: `${(worst * 3600).toFixed(4)}″`, tolerance: "±0.01″", ok: worst * 3600 <= 0.01 });
  }
  // Above the polar circle Placidus has no solution: we fall back to Porphyry and flag it.
  equal(g2, "70°N midsummer noon falls back to Porphyry", kpCusps(new Date("2000-06-21T12:00:00Z"), 70, 20).fallback, true);
  equal(g2, "60°N midsummer noon stays Placidus", kpCusps(new Date("2000-06-21T12:00:00Z"), 60, 20).fallback, false);

  // AstroTalk's public KP sample for Delhi 1998 (comparison only): cusps 238.49 271.30 307.27 341.82 11.19
  // 35.87 58.49 91.30 127.27 161.82 191.19 215.87; cusp 1 Scorpio, Jyeshtha, sub lord Saturn. Our sidereal
  // Placidus cusps (true Lahiri) agree to well under 1′ — so AstroTalk uses Lahiri, not the Krishnamurti
  // ayanamsa (that would shift every cusp by ≈ 6′).
  const g3 = "KP vs AstroTalk sample (Delhi 1998)";
  const kp = engine.kundli(DELHI_98).kp;
  const AT = [238.49, 271.3, 307.27, 341.82, 11.19, 35.87, 58.49, 91.3, 127.27, 161.82, 191.19, 215.87];
  AT.forEach((v, i) => near(g3, `cusp ${i + 1}`, kp.cusps[i]!.longitude, v, 60));
  const c1 = kp.cusps[0]!;
  equal(g3, "cusp 1: Scorpio, Jyeshtha, sub Saturn", `${c1.sign} ${c1.star} ${c1.subLord}`, "7 17 saturn");
  equal(g3, "house system", kp.houseSystem, "Placidus");
  // Birth ruling planets: 06:00 IST is before sunrise (≈07:14), so the Vedic day is still Wednesday → Mercury.
  equal(g3, "day lord at birth (Wednesday until sunrise)", kp.rulingPlanets.dayLord, "mercury");
  equal(g3, "lagna sign/star/sub lords", `${kp.rulingPlanets.lagnaSignLord} ${kp.rulingPlanets.lagnaStarLord} ${kp.rulingPlanets.lagnaSubLord}`, "mars mercury saturn");
}
{
  // Shadbala components, hand-worked (no citable published numeric example was available; see shadbala.ts).
  const g = "Shadbala (hand-worked)";
  equal(g, "Uchcha: Jupiter at 5° Cn = 60", uchchaBala("jupiter", 95), 60);
  equal(g, "Uchcha: Mars at 28° Cn (debilitation) = 0", uchchaBala("mars", 118), 0);
  near(g, "Uchcha: Moon at 18° Ge (135° from 3° Sc) = 45", uchchaBala("moon", 78), 45, 0.001);
  equal(g, "Drishti 90° = 45, 180° = 60, 45° = 7.5, 300° = 0", [90, 180, 45, 300].map((d) => drishti("sun", 0, d)).join(","), "45,60,7.5,0");
  equal(
    g,
    "Special aspects full: Sa 60/270, Ju 120/240, Ma 90/210",
    [drishti("saturn", 0, 60), drishti("saturn", 0, 270), drishti("jupiter", 0, 120), drishti("jupiter", 0, 240), drishti("mars", 0, 90), drishti("mars", 0, 210)].join(","),
    "60,60,60,60,60,60",
  );
  near(g, "Ayana: Sun at tropical 90°, ε 23.44° → (24+23.44)×1.25", ayanaBala("sun", 90, 23.44), (24 + 23.44) * 1.25, 0.001);
  near(g, "Ayana: Moon at tropical 90° → (24−23.44)×1.25", ayanaBala("moon", 90, 23.44), (24 - 23.44) * 1.25, 0.001);
  near(g, "Ayana: Mercury at tropical 270° → (24+23.44)×1.25", ayanaBala("mercury", 270, 23.44), (24 + 23.44) * 1.25, 0.001);
  equal(g, "Naisargika sum = 60×(1+…+7)/7 = 240", Math.round(Object.values(NAISARGIKA).reduce((s, v) => s + v, 0) * 1000) / 1000, 240);
  // Delhi 1998: 06:00 IST is before sunrise, so the Vedic day began at sunrise on Wed 31 Dec 1997.
  // Civil JD of 31 Dec 1997 = 2450813.5 → ahargana 1862348 from the Kali epoch (JD 588465.5, Friday).
  // Year: 1862348 − (1862348 mod 360 = 68) = 1862280 → (5 + 1862280) mod 7 = 5 → Friday → Venus.
  // Month: 1862348 − (mod 30 = 8) = 1862340 → (5 + 1862340) mod 7 = 2 → Tuesday → Mars.
  // Hora: ≈22.8 h after Wednesday's sunrise → 23rd hora; Wednesday's horas run Me Mo Sa Ju Ma Su Ve …;
  // index 22 mod 7 = 1 → Moon.
  const k = engine.kundli(DELHI_98);
  const sb = k.shadbala;
  const row = (p: string) => sb.planets.find((x) => x.planet === p)!;
  equal(g, "Delhi 1998: year / month / weekday / hora lords", `${sb.lords.year} ${sb.lords.month} ${sb.lords.weekday} ${sb.lords.hora}`, "venus mars mercury moon");
  // Tribhaga: last third of the night → Mars 60; Jupiter always 60.
  equal(g, "Delhi 1998: Tribhaga Mars 60, Jupiter 60, Moon 0", `${row("mars").kala.tribhaga} ${row("jupiter").kala.tribhaga} ${row("moon").kala.tribhaga}`, "60 60 0");
  // Saturn 19°56′ Pisces: D1 Pi (Ju: neutral + temporal friend → friend 15), D2 Leo (Sun: enemy + friend → neutral 10),
  // D3 Cancer (Moon: enemy + friend → 10), D7 Capricorn (own 30), D9 Sagittarius (Ju → 15), D12 Libra
  // (Venus: friend + friend → great friend 20), D30 Pisces (Ju → 15) = 115.
  equal(g, "Delhi 1998: Saturn Saptavargaja 115", row("saturn").sthana.saptavargaja, 115);
  equal(g, "Delhi 1998: Kendradi Me (H1) 60, Sa (H5) 30, Ju (H3) 15", `${row("mercury").sthana.kendra} ${row("saturn").sthana.kendra} ${row("jupiter").sthana.kendra}`, "60 30 15");
  equal(g, "Delhi 1998: Drekkana Saturn (2nd decanate) 15", row("saturn").sthana.drekkana, 15);
  equal(g, "Delhi 1998: Ojhayugma Moon (Cp, D9 Ta: both even) 30", row("moon").sthana.ojhayugma, 30);
  const lon = (key: string) => k.grahas.find((x) => x.key === key)!.longitude;
  const elong = Math.abs(wrap(lon("moon") - lon("sun")));
  near(g, "Delhi 1998: Paksha Moon = 2 × elongation/3", row("moon").kala.paksha, (2 * elong) / 3, 0.001);
  near(g, "Delhi 1998: Paksha Sun = 60 − elongation/3", row("sun").kala.paksha, 60 - elong / 3, 0.001);
  near(g, "Delhi 1998: Dig Mercury = arc from descendant / 3", row("mercury").dig, Math.abs(wrap(lon("mercury") - (k.lagna.longitude + 180))) / 3, 0.001);
  near(g, "Delhi 1998: Uchcha Venus = (λ − 177°)/3", row("venus").sthana.uchcha, (lon("venus") - 177) / 3, 0.001);
  // Cheshta: Venus was retrograde near inferior conjunction (16 Jan 1998) → close to the 60 maximum.
  equal(g, "Delhi 1998: Venus retrograde, Cheshta > 50", row("venus").cheshta > 50 && row("venus").speed < 0, true);
  equal(g, "Nathonnatha day + night planets = 60", Math.round(row("sun").kala.nathonnatha + row("moon").kala.nathonnatha), 60);
  let sumsOk = true;
  for (const r of sb.planets) {
    const s = r.sthana.total + r.dig + r.kala.total + r.cheshta + r.naisargika + r.drik;
    if (Math.abs(s - r.total) > 1e-9 || Math.abs(r.rupas - r.total / 60) > 1e-12) sumsOk = false;
  }
  equal(g, "Delhi 1998: totals = sum of the six, rupas = /60", sumsOk, true);
  equal(g, "ranks are 1…7", [...sb.planets].map((r) => r.rank).sort().join(""), "1234567");
  const p = engine.kundli(PUNE_95).shadbala;
  equal(g, "Pune 1995: Moon in the 7th → Kendradi 60", p.planets.find((x) => x.planet === "moon")!.sthana.kendra, 60);
  equal(g, "Pune 1995: Sun's Ayana is doubled (= 2 × Cheshta)", Math.abs(p.planets[0]!.kala.ayana - 2 * p.planets[0]!.cheshta) < 1e-9, true);
}
{
  // Saved charts from before these existed: recomputed from the stored JSON (as routes/astro.ts withDerived does).
  const g = "Ashtakavarga/KP/Shadbala from stored chart";
  const k = engine.kundli(PUNE_95);
  const stored = JSON.parse(JSON.stringify(k)) as typeof k;
  equal(g, "ashtakavarga", JSON.stringify(computeAshtakavarga(stored.lagna.sign.index, stored.grahas)), JSON.stringify(k.ashtakavarga));
  equal(g, "kp", JSON.stringify(computeKp(stored.birth, stored.grahas)), JSON.stringify(k.kp));
  equal(
    g,
    "shadbala",
    JSON.stringify(computeShadbala({ birth: stored.birth, lagnaLongitude: stored.lagna.longitude, madhya: stored.bhavas.madhya, grahas: stored.grahas })),
    JSON.stringify(k.shadbala),
  );
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
