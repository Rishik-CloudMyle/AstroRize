// Astrology API (/api/astro): Kundli, dasha, matchmaking, panchang, horoscope, transits and
// birthplace search. The maths lives in lib/astro (pure, no database); this file validates input,
// resolves places, saves charts and logs failures.

import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { HttpError, badRequest, notFound } from "../lib/errors.ts";
import { rateLimit } from "../lib/safety.ts";
import { RASHIS } from "../lib/astro/constants.ts";
import type { DashaPeriod } from "../lib/astro/dasha.ts";
import { getAstroEngine } from "../lib/astro/engine.ts";
import { getPlace, searchPlaces, suggestPlaces } from "../lib/astro/geo.ts";
import type { Kundli } from "../lib/astro/kundli.ts";
import { isValidTimeZone, localDateString, parseDate, parseTime, timezoneAt } from "../lib/astro/time.ts";
import { requireRole } from "../middleware/auth.ts";

export const astroRouter = Router();
const engine = () => getAstroEngine();

// ── Input shapes ──

const MIN_DATE = "1800-01-01";
const MAX_DATE = "2200-12-31";

const dateField = z
  .string()
  .refine((s) => parseDate(s) !== null, "Enter a valid date (YYYY-MM-DD).")
  .refine((s) => s >= MIN_DATE && s <= MAX_DATE, "Dates from 1800 to 2200 are supported.");
const timeField = z.string().refine((s) => parseTime(s) !== null, "Enter a valid time (HH:MM, 24-hour).");
const tzField = z.string().max(64).refine(isValidTimeZone, "Unknown time zone.");

/** A place is either one found by /places (placeId) or explicit coordinates. */
const placeField = z.union([
  z.object({ placeId: z.string().min(1).max(40) }).strict(),
  z
    .object({
      name: z.string().trim().max(200).optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      timezone: tzField.optional(),
    })
    .strict(),
]);
type PlaceInput = z.infer<typeof placeField>;

interface ResolvedPlace {
  placeId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

async function resolvePlace(p: PlaceInput): Promise<ResolvedPlace> {
  if ("placeId" in p) {
    const found = await getPlace(p.placeId);
    if (!found) throw badRequest("That place wasn't found. Search for it again.");
    return { placeId: found.id, name: found.name, latitude: found.latitude, longitude: found.longitude, timezone: found.timezone };
  }
  return {
    placeId: null,
    name: p.name || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`,
    latitude: p.latitude,
    longitude: p.longitude,
    timezone: p.timezone ?? timezoneAt(p.latitude, p.longitude),
  };
}

/** Runs a calculation; anything unexpected is logged and answered with a clear message. */
function calculate<T>(what: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof RangeError) throw badRequest("Those birth details couldn't be read. Check the date, time and place.");
    console.error(`[astro] ${what} failed:`, err);
    throw new HttpError(500, "We couldn't calculate this right now. Please try again.", "server_error");
  }
}

const ip = (req: Request) => req.ip ?? "unknown";

/** Small memo for deterministic public answers (panchang, horoscope). */
const memo = new Map<string, unknown>();
function memoised<T>(key: string, fn: () => T): T {
  if (memo.has(key)) return memo.get(key) as T;
  const value = fn();
  if (memo.size >= 500) memo.delete(memo.keys().next().value!);
  memo.set(key, value);
  return value;
}

const todayIn = (tz: string) => localDateString(new Date(), tz);

// ── Engine info ──

astroRouter.get("/engine", (_req, res) => {
  res.json({ engine: engine().label, zodiac: "sidereal", ayanamsa: "Lahiri (Chitrapaksha)", houses: "whole-sign" });
});

// ── Places ──

const qField = z.string().trim().min(2, "Type at least 2 letters.").max(120);

/** Suggestions while typing: only places already found before (never calls OpenStreetMap). */
astroRouter.get("/places/suggest", async (req, res) => {
  rateLimit(`places-suggest:${ip(req)}`, 120, 60_000, "Too many searches. Wait a moment.");
  const q = qField.parse(req.query.q);
  res.json({ places: await suggestPlaces(q) });
});

/** A submitted place search (cache first, then OpenStreetMap once). */
astroRouter.get("/places", async (req, res) => {
  const q = qField.parse(req.query.q);
  rateLimit(`places:${ip(req)}`, 15, 60_000, "Too many place searches. Wait a minute and try again.");
  res.json({ places: await searchPlaces(q), attribution: "© OpenStreetMap contributors" });
});

// ── Kundli (signed-in customers) ──

const kundliBody = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(80),
    date: dateField,
    time: timeField,
    place: placeField,
    node: z.enum(["mean", "true"]).optional(),
  })
  .strict();

interface StoredKundliInput {
  name: string;
  date: string;
  time: string;
  place: ResolvedPlace;
  node: "mean" | "true";
}

function chartView(c: { id: string; label: string; engine: string; createdAt: Date; input: unknown; result: unknown }) {
  const kundli = c.result as unknown as Kundli;
  return {
    id: c.id,
    name: c.label,
    createdAt: c.createdAt.toISOString(),
    engine: c.engine,
    input: c.input as StoredKundliInput,
    kundli,
    currentDasha: engine().currentDasha(kundli.dasha.mahadashas, new Date()),
  };
}

astroRouter.post("/kundli", async (req, res) => {
  const auth = requireRole(req, "customer");
  rateLimit(`kundli:${auth.user.id}`, 20, 10 * 60_000, "You've made a lot of charts in a short time. Try again in a few minutes.");
  const body = kundliBody.parse(req.body);
  const place = await resolvePlace(body.place);
  const node = body.node ?? "mean";
  const kundli = calculate("kundli", () =>
    engine().kundli({ date: body.date, time: body.time, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone, node }),
  );
  const input: StoredKundliInput = { name: body.name, date: body.date, time: body.time, place, node };
  const chart = await db.chart.create({
    data: { userId: auth.user.id, kind: "kundli", label: body.name, input: input as object, result: kundli as object, engine: engine().label },
  });
  res.status(201).json({ chart: chartView(chart) });
});

/** The signed-in customer's saved charts, newest first (summary only). */
astroRouter.get("/kundli", async (req, res) => {
  const auth = requireRole(req, "customer");
  const charts = await db.chart.findMany({ where: { userId: auth.user.id, kind: "kundli" }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({
    charts: charts.map((c) => {
      const k = c.result as unknown as Kundli;
      const input = c.input as unknown as StoredKundliInput;
      return {
        id: c.id,
        name: c.label,
        createdAt: c.createdAt.toISOString(),
        date: input.date,
        time: input.time,
        place: input.place.name,
        lagna: k.lagna.sign.name,
        moonSign: k.moonSign.name,
        nakshatra: k.birthNakshatra.name,
      };
    }),
  });
});

async function ownChart(req: Request) {
  const auth = requireRole(req, "customer");
  const id = z.string().min(1).max(40).parse(req.params.id);
  const chart = await db.chart.findUnique({ where: { id } });
  // Someone else's chart reads as missing, so ids can't be probed.
  if (!chart || chart.userId !== auth.user.id || chart.kind !== "kundli") throw notFound("That chart wasn't found.");
  return chart;
}

astroRouter.get("/kundli/:id", async (req, res) => {
  res.json({ chart: chartView(await ownChart(req)) });
});

astroRouter.delete("/kundli/:id", async (req, res) => {
  const chart = await ownChart(req);
  await db.chart.delete({ where: { id: chart.id } });
  res.json({ ok: true });
});

/** Vimshottari dasha of a saved Kundli, with the periods running at `at` (default now). */
astroRouter.get("/kundli/:id/dasha", async (req, res) => {
  const chart = await ownChart(req);
  const at = z.coerce.date().optional().parse(req.query.at) ?? new Date();
  if (Number.isNaN(at.getTime())) throw badRequest("Invalid date.");
  const k = chart.result as unknown as Kundli;
  const mahadashas: DashaPeriod[] = k.dasha.mahadashas;
  res.json({ balance: k.dasha.balance, mahadashas, current: engine().currentDasha(mahadashas, at) });
});

// ── Matchmaking (public; saved for signed-in customers) ──

const personField = z
  .object({
    name: z.string().trim().min(1, "Enter both names.").max(80),
    date: dateField,
    time: timeField.optional(),
    place: placeField,
  })
  .strict();
const matchBody = z.object({ boy: personField, girl: personField }).strict();

astroRouter.post("/matchmaking", async (req, res) => {
  rateLimit(`match:${req.auth?.user.id ?? ip(req)}`, 30, 10 * 60_000, "Too many matches in a short time. Try again in a few minutes.");
  const body = matchBody.parse(req.body);
  const [boyPlace, girlPlace] = await Promise.all([resolvePlace(body.boy.place), resolvePlace(body.girl.place)]);
  const person = (p: typeof body.boy, place: ResolvedPlace) => ({
    name: p.name,
    date: p.date,
    time: p.time,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
  });
  const match = calculate("matchmaking", () => engine().matchmaking(person(body.boy, boyPlace), person(body.girl, girlPlace)));

  let id: string | null = null;
  if (req.auth?.role === "customer") {
    const chart = await db.chart.create({
      data: {
        userId: req.auth.user.id,
        kind: "matchmaking",
        label: `${body.boy.name} & ${body.girl.name}`,
        input: { boy: { ...body.boy, place: boyPlace }, girl: { ...body.girl, place: girlPlace } } as object,
        result: match as object,
        engine: engine().label,
      },
    });
    id = chart.id;
  }
  res.json({ id, match, engine: engine().label });
});

// ── Panchang (public) ──

/** Used when no place is given: New Delhi (as the website's Panchang has always shown). */
const DEFAULT_PLACE: ResolvedPlace = { placeId: null, name: "New Delhi, India", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" };

const panchangQuery = z.object({
  date: dateField.optional(),
  placeId: z.string().min(1).max(40).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  tz: tzField.optional(),
});

astroRouter.get("/panchang", async (req, res) => {
  rateLimit(`panchang:${ip(req)}`, 60, 60_000, "Too many requests. Wait a moment.");
  const q = panchangQuery.parse(req.query);
  let place = DEFAULT_PLACE;
  if (q.placeId) place = await resolvePlace({ placeId: q.placeId });
  else if (q.lat !== undefined || q.lon !== undefined) {
    if (q.lat === undefined || q.lon === undefined) throw badRequest("Give both lat and lon.");
    place = await resolvePlace({ latitude: q.lat, longitude: q.lon, timezone: q.tz });
  }
  const date = q.date ?? todayIn(place.timezone);
  const key = `p|${date}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}|${place.timezone}`;
  const panchang = memoised(key, () =>
    calculate("panchang", () => engine().panchang({ date, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone })),
  );
  res.json({ place, panchang });
});

// ── Horoscope (public) ──

/** Accepts 0–11, an English name ("Aries") or a Sanskrit name ("Mesha"). */
function parseSign(raw: unknown): number {
  const s = z.string().trim().min(1, "Choose a Moon sign.").max(20).parse(raw).toLowerCase();
  if (/^\d{1,2}$/.test(s) && Number(s) < 12) return Number(s);
  const i = RASHIS.findIndex((r) => r.en.toLowerCase() === s || r.sa.toLowerCase() === s);
  if (i < 0) throw badRequest("Unknown Moon sign.");
  return i;
}

astroRouter.get("/horoscope", async (req, res) => {
  rateLimit(`horoscope:${ip(req)}`, 120, 60_000, "Too many requests. Wait a moment.");
  const sign = parseSign(req.query.sign);
  const period = z.enum(["daily", "weekly"]).default("daily").parse(req.query.period);
  const tz = "Asia/Kolkata";
  const date = dateField.optional().parse(req.query.date) ?? todayIn(tz);
  const horoscope = memoised(`h|${sign}|${period}|${date}`, () =>
    calculate("horoscope", () => engine().horoscope({ sign, period, date, timezone: tz })),
  );
  res.json({ horoscope });
});

// ── Transits (public) ──

astroRouter.get("/transit", async (req, res) => {
  rateLimit(`transit:${ip(req)}`, 60, 60_000, "Too many requests. Wait a moment.");
  const q = z
    .object({ at: z.iso.datetime({ offset: true, error: "Give the time as an ISO date-time, e.g. 2026-10-16T06:00:00+05:30." }).optional(), node: z.enum(["mean", "true"]).optional() })
    .parse(req.query);
  const at = q.at ? new Date(q.at) : new Date();
  const year = at.getUTCFullYear();
  if (year < 1800 || year > 2200) throw badRequest("Dates from 1800 to 2200 are supported.");
  res.json({ transit: calculate("transit", () => engine().transit(at, q.node)) });
});
