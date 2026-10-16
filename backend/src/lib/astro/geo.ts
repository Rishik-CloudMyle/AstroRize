// Birthplace search: OpenStreetMap Nominatim, used within its usage policy
// (https://operations.osmfoundation.org/policies/nominatim/):
//  • identified with a User-Agent naming Astrorize plus a contact (GEOCODER_CONTACT);
//  • at most one request per second from this server (requests queue up);
//  • every answer is cached in the Place table under the normalised search text, so the same
//    search never goes to Nominatim twice; searches with no result are remembered for a day;
//  • no per-keystroke autocomplete against Nominatim (the policy forbids it): suggestions while
//    typing come only from our own cache (suggestPlaces); Nominatim is asked when the person
//    submits the search (searchPlaces).
// Time zones come from the coordinates, offline (timezoneAt in time.ts).
// Results are © OpenStreetMap contributors (ODbL): the website should show that credit.

import { config } from "../../config.ts";
import { db } from "../../db.ts";
import { HttpError } from "../errors.ts";
import { timezoneAt } from "./time.ts";
import type { Place } from "../../generated/prisma/client.ts";

export interface PlaceResult {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

const MAX_RESULTS = 5;
const MIN_GAP_MS = 1100;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE = 20;

/** "  Kothrud ,PUNE " → "kothrud, pune". */
export function normaliseQuery(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;]+|[\s,.;]+$/g, "")
    .slice(0, 120);
}

const view = (p: Place): PlaceResult => ({ id: p.id, name: p.name, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone });

/** Astrorize's customers are in India: among equally good matches, Indian places come first. */
const inIndia = (p: Pick<Place, "name">) => (/,\s*India$/i.test(p.name) ? 0 : 1);

/**
 * Drops near-duplicates: OpenStreetMap often returns the same town twice (the city and its
 * administrative area) a few hundred metres apart. Same first name part within ~5 km = one place.
 */
function distinct(places: Place[]): Place[] {
  const kept: Place[] = [];
  for (const p of places) {
    const head = p.name.split(",")[0]!.trim().toLowerCase();
    const dup = kept.some(
      (k) =>
        k.name.split(",")[0]!.trim().toLowerCase() === head &&
        Math.abs(k.latitude - p.latitude) < 0.05 &&
        Math.abs(k.longitude - p.longitude) < 0.05,
    );
    if (!dup) kept.push(p);
  }
  return kept;
}

/** Typing suggestions from places already found before. Never calls Nominatim. */
export async function suggestPlaces(q: string, limit = 8): Promise<PlaceResult[]> {
  const nq = normaliseQuery(q);
  if (nq.length < 2) return [];
  const rows = await db.place.findMany({
    where: { OR: [{ query: { startsWith: nq } }, { name: { contains: nq, mode: "insensitive" } }] },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  // Only places whose name holds the typed text (a cached search also stores OpenStreetMap's loose
  // matches). Names starting with it first, India first within that, then OpenStreetMap's order.
  const order = (p: Place) => Number(p.query.split("#")[1] ?? 0) || 0;
  const rank = (p: Place) => (p.name.toLowerCase().startsWith(nq) ? 0 : 2) + inIndia(p);
  return distinct(
    rows.filter((p) => p.name.toLowerCase().includes(nq)).sort((a, b) => rank(a) - rank(b) || order(a) - order(b)),
  )
    .slice(0, limit)
    .map(view);
}

export async function getPlace(id: string): Promise<PlaceResult | null> {
  const p = await db.place.findUnique({ where: { id } });
  return p ? view(p) : null;
}

// ── Nominatim ──

const misses = new Map<string, number>();
const inFlight = new Map<string, Promise<PlaceResult[]>>();
let lastRequestAt = 0;
let queueTail: Promise<unknown> = Promise.resolve();
let queued = 0;
let warnedNoContact = false;

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

/** "Kothrud, Pune, Maharashtra, India" rather than the full postal display name. */
function shortName(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const parts = [
    hit.name,
    a.suburb ?? a.neighbourhood,
    a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality,
    a.county && !(a.city || a.town || a.village) ? a.county : undefined,
    a.state ?? a.region,
    a.country,
  ].filter((x): x is string => Boolean(x && x.trim()));
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.length >= 2 ? unique.join(", ") : hit.display_name;
}

/** Runs `task` no sooner than MIN_GAP_MS after the previous Nominatim request. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  if (queued >= MAX_QUEUE) throw new HttpError(503, "Place search is busy. Please try again in a few seconds.", "unavailable");
  queued++;
  const run = queueTail.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    try {
      return await task();
    } finally {
      queued--;
    }
  });
  queueTail = run.catch(() => undefined);
  return run;
}

async function fetchNominatim(q: string): Promise<NominatimHit[]> {
  if (!config.geocoderContact && !warnedNoContact) {
    warnedNoContact = true;
    console.warn("[geo] GEOCODER_CONTACT is not set; Nominatim's usage policy asks for a contact in the User-Agent.");
  }
  const url = new URL(`${config.nominatimUrl}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("accept-language", "en");
  if (config.geocoderContact) url.searchParams.set("email", config.geocoderContact);
  const res = await fetch(url, {
    headers: {
      "User-Agent": `Astrorize/1.0 (birthplace search${config.geocoderContact ? `; ${config.geocoderContact}` : ""})`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as NominatimHit[]) : [];
}

async function lookupAndCache(nq: string): Promise<PlaceResult[]> {
  let hits: NominatimHit[];
  try {
    hits = await throttled(() => fetchNominatim(nq));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error(`[geo] place search failed for "${nq}":`, err instanceof Error ? err.message : err);
    throw new HttpError(503, "Place search isn't available right now. Please try again shortly.", "unavailable");
  }

  const rows = hits
    .map((h) => ({ lat: Number(h.lat), lon: Number(h.lon), name: shortName(h) }))
    .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon) && Math.abs(h.lat) <= 90 && Math.abs(h.lon) <= 180)
    .slice(0, MAX_RESULTS)
    .map((h, i) => ({
      // The first result is stored under the search itself; the others under "search#n".
      query: i === 0 ? nq : `${nq}#${i}`,
      name: h.name.slice(0, 200),
      latitude: h.lat,
      longitude: h.lon,
      timezone: timezoneAt(h.lat, h.lon),
    }));
  if (rows.length === 0) {
    if (misses.size > 5000) misses.clear();
    misses.set(nq, Date.now());
    return [];
  }
  // Another request may have stored the same search meanwhile; the unique query keeps one copy.
  await db.place.createMany({ data: rows, skipDuplicates: true });
  return cachedSearch(nq);
}

async function cachedSearch(nq: string): Promise<PlaceResult[]> {
  const rows = await db.place.findMany({ where: { OR: [{ query: nq }, { query: { startsWith: `${nq}#` } }] } });
  // OpenStreetMap's own order (its best match first), India first, near-duplicates dropped.
  const order = (p: Place) => (p.query === nq ? 0 : Number(p.query.slice(nq.length + 1)) || 99);
  return distinct(rows.sort((a, b) => inIndia(a) - inIndia(b) || order(a) - order(b))).map(view);
}

/**
 * Full search for a submitted place name: the cache first, Nominatim only for a search never
 * made before. Throws 503 (HttpError) when Nominatim can't be reached.
 */
export async function searchPlaces(q: string): Promise<PlaceResult[]> {
  const nq = normaliseQuery(q);
  if (nq.length < 2) return [];
  const cached = await cachedSearch(nq);
  if (cached.length) return cached;
  const missAt = misses.get(nq);
  if (missAt && Date.now() - missAt < MISS_TTL_MS) return [];

  let pending = inFlight.get(nq);
  if (!pending) {
    pending = lookupAndCache(nq).finally(() => inFlight.delete(nq));
    inFlight.set(nq, pending);
  }
  return pending;
}
