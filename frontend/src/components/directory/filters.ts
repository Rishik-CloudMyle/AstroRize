// Directory filters and sorts, laid out like the customer app's Filters sheet.
// Everything here is plain data + pure functions so the URL, the chip row and
// the panel all agree on one model.

import type { Astrologer } from "@/lib/types";
import { AVAILABILITY, RECOGNITION } from "@/lib/format";

export type FacetKey = "expertise" | "language" | "mode" | "availability" | "recognition" | "gender";

/** Option lists in the app's order. Skills and languages also pick up anything extra found in the data. */
const FACET_OPTIONS: Record<FacetKey, readonly string[]> = {
  expertise: [
    "Vedic", "Numerology", "Tarot", "Palmistry", "Face Reading", "KP", "Nadi",
    "Prashna", "Psychic", "Signature Reading", "Vastu", "Life Coaching", "Healing", "Counseling",
  ],
  language: [
    "English", "Hindi", "Bengali", "Gujarati", "Kannada", "Malayalam",
    "Marathi", "Odia", "Punjabi", "Tamil", "Telugu", "Urdu",
  ],
  mode: ["Chat", "Voice", "Video", "Instant Call"],
  availability: ["Available", "In consultation", "Live", "Instant Call"],
  recognition: ["Premium", "Trusted", "Proven Expert", "Rising", "New"],
  gender: ["Male", "Female"],
};

export const FACET_KEYS = Object.keys(FACET_OPTIONS) as FacetKey[];

export const SORTS = [
  { key: "popularity", label: "Popularity" },
  { key: "exp_desc", label: "Experience — High to Low" },
  { key: "exp_asc", label: "Experience — Low to High" },
  { key: "orders_desc", label: "Orders — High to Low" },
  { key: "orders_asc", label: "Orders — Low to High" },
  { key: "rating_desc", label: "Rating — High to Low" },
  { key: "rating_asc", label: "Rating — Low to High" },
  { key: "price_desc", label: "Price — High to Low" },
  { key: "price_asc", label: "Price — Low to High" },
] as const;

export type SortKey = (typeof SORTS)[number]["key"];

/** Sort keys used by older shared links, before the app's nine sorts. */
const LEGACY_SORTS: Record<string, SortKey> = {
  rating: "rating_desc",
  price: "price_asc",
  experience: "exp_desc",
};

export type Category =
  | { id: string; label: string; kind: "facet"; key: FacetKey; searchable?: boolean }
  | { id: string; label: string; kind: "sort"; keys: [SortKey, SortKey] };

/** The panel's left rail, in the app's order. */
export const CATEGORIES: Category[] = [
  { id: "expertise", label: "Skills", kind: "facet", key: "expertise", searchable: true },
  { id: "rating", label: "Rating", kind: "sort", keys: ["rating_desc", "rating_asc"] },
  { id: "price", label: "Price", kind: "sort", keys: ["price_desc", "price_asc"] },
  { id: "experience", label: "Experience", kind: "sort", keys: ["exp_desc", "exp_asc"] },
  { id: "language", label: "Languages", kind: "facet", key: "language", searchable: true },
  { id: "availability", label: "Availability", kind: "facet", key: "availability" },
  { id: "mode", label: "Consultation", kind: "facet", key: "mode" },
  { id: "recognition", label: "Recognition", kind: "facet", key: "recognition" },
  { id: "gender", label: "Gender", kind: "facet", key: "gender" },
  { id: "orders", label: "Orders", kind: "sort", keys: ["orders_desc", "orders_asc"] },
];

export type Filters = Record<FacetKey, string[]>;

export interface FilterState {
  filters: Filters;
  sort: SortKey;
}

export function emptyFilters(): Filters {
  return { expertise: [], language: [], mode: [], availability: [], recognition: [], gender: [] };
}

/** Options for a facet: the app's list, then any extra values present in the data (so nothing is unfilterable). */
export function facetOptions(key: FacetKey, astrologers: Astrologer[]): string[] {
  const base = [...FACET_OPTIONS[key]];
  const fromData = key === "expertise" ? astrologers.flatMap((a) => a.skills) : key === "language" ? astrologers.flatMap((a) => a.languages) : [];
  for (const value of fromData) if (!base.includes(value)) base.push(value);
  return base;
}

/** Short label for a sort option inside a category ("High to Low"). */
export function sortOptionLabel(key: SortKey): string {
  const label = SORTS.find((s) => s.key === key)?.label ?? key;
  return label.replace(/^[^—]+—\s*/, "");
}

export function readState(params: URLSearchParams, astrologers: Astrologer[]): FilterState {
  const filters = emptyFilters();
  for (const key of FACET_KEYS) {
    // Unknown values (old or hand-edited links) are dropped, so every active filter can be seen and removed in the panel.
    const allowed = facetOptions(key, astrologers);
    const values = params.get(key)?.split(",").filter(Boolean) ?? [];
    filters[key] = allowed.filter((o) => values.includes(o));
  }
  const raw = params.get("sort") ?? "popularity";
  const sort = SORTS.some((s) => s.key === raw) ? (raw as SortKey) : (LEGACY_SORTS[raw] ?? "popularity");
  return { filters, sort };
}

/** URL changes for a state: empty facets and the default sort are removed. */
export function stateToParams(state: FilterState): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const key of FACET_KEYS) changes[key] = state.filters[key].join(",") || null;
  changes.sort = state.sort === "popularity" ? null : state.sort;
  return changes;
}

export function activeFilterCount(filters: Filters): number {
  return FACET_KEYS.reduce((n, k) => n + filters[k].length, 0);
}

/** Selections in one category: chosen options, or 1 when the category's sort is on. */
export function categoryCount(cat: Category, state: FilterState): number {
  return cat.kind === "facet" ? state.filters[cat.key].length : cat.keys.includes(state.sort) ? 1 : 0;
}

/** Does an astrologer match one option of a facet? */
function matches(a: Astrologer, facet: FacetKey, option: string): boolean {
  switch (facet) {
    case "expertise":
      return a.skills.includes(option);
    case "language":
      return a.languages.includes(option);
    case "mode":
      // Every astrologer offers chat, voice and video; Instant Call needs them available.
      return option === "Instant Call" ? a.availability === "on" : true;
    case "availability":
      return option === "Instant Call" ? a.availability === "on" : AVAILABILITY[a.availability].label.startsWith(option);
    case "recognition":
      return RECOGNITION[a.recognition].label === option;
    case "gender":
      return a.gender === option;
  }
}

/** Any option within a facet, all facets together. */
export function matchesFilters(a: Astrologer, filters: Filters): boolean {
  return FACET_KEYS.every((k) => filters[k].length === 0 || filters[k].some((o) => matches(a, k, o)));
}

export function matchesQuery(a: Astrologer, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    a.name.toLowerCase().includes(q) ||
    a.skills.some((s) => s.toLowerCase().includes(q)) ||
    a.languages.some((l) => l.toLowerCase().includes(q))
  );
}

/** Sorted copy. Ties keep the popularity order the API returns; unrated astrologers go last for both rating sorts. */
export function sortAstrologers(list: Astrologer[], sort: SortKey): Astrologer[] {
  const by = (pick: (a: Astrologer) => number, dir: 1 | -1) => (x: Astrologer, y: Astrologer) => (pick(x) - pick(y)) * dir;
  const rating = (dir: 1 | -1) => (x: Astrologer, y: Astrologer) => {
    if (x.rating === null || y.rating === null) return (x.rating === null ? 1 : 0) - (y.rating === null ? 1 : 0);
    return (x.rating - y.rating) * dir;
  };
  const compare: Record<SortKey, ((x: Astrologer, y: Astrologer) => number) | null> = {
    popularity: null,
    exp_desc: by((a) => a.years, -1),
    exp_asc: by((a) => a.years, 1),
    orders_desc: by((a) => a.consults, -1),
    orders_asc: by((a) => a.consults, 1),
    rating_desc: rating(-1),
    rating_asc: rating(1),
    price_desc: by((a) => a.price, -1),
    price_asc: by((a) => a.price, 1),
  };
  const fn = compare[sort];
  return fn ? [...list].sort(fn) : [...list];
}
