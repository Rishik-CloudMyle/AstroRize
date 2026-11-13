import type { Astrologer } from "./types";

export const PKG_DURATIONS = [15, 30, 45, 60] as const;
export type PkgDuration = (typeof PKG_DURATIONS)[number];

export const PKG_DISC: Record<PkgDuration, number> = {
  15: 5,
  30: 10,
  45: 15,
  60: 20,
};

export const PKG_TIP: Record<PkgDuration, string> = {
  15: "One focused question.",
  30: "One decision, with a short follow-up.",
  45: "Two related questions in one sitting.",
  60: "A full sitting for a wider chart.",
};

export interface PkgQuote {
  mins: number;
  disc: number;
  original: number;
  after: number;
  floor: number;
  final: number;
  floorApplied: boolean;
  savings: number;
}

export function pkgQuote(pricePerMin: number, mins: number): PkgQuote {
  const disc = PKG_DISC[mins as PkgDuration] ?? 0;
  const original = pricePerMin * mins;
  const after = Math.trunc((original * (100 - disc)) / 100);
  const floor = Math.trunc((original * 80) / 100);
  const final = Math.max(after, floor);
  return {
    mins,
    disc,
    original,
    after,
    floor,
    final,
    floorApplied: after < floor,
    savings: original - final,
  };
}

export function pkgMinPrice(pricePerMin: number): number {
  return pkgQuote(pricePerMin, 15).final;
}

export function isPkgEnabled(a: Astrologer): boolean {
  // Astrologers support Fixed Sessions by default unless specifically disabled
  const explicit = (a as unknown as { fixedEnabled?: boolean }).fixedEnabled;
  if (explicit === false) return false;
  return true;
}

export const PKG_CONSENT_POINTS = [
  "The session ends automatically when your purchased time is over.",
  "If you end early, unused time is non-refundable.",
  "If the astrologer ends early without your consent, you can raise a service ticket for review or refund of the unused part.",
  "If the session drops due to a technical issue, you can raise a service ticket for review.",
] as const;

export const PKG_POLICY_POINTS = [
  "A Fixed Session is prepaid time with one astrologer, at a package price.",
  "We reserve the full package price in your wallet when you confirm.",
  "The amount is reserved when you confirm, and charged only when you connect.",
  "If you never connect, the reservation is released in full.",
  "The session is valid for the purchased duration and automatically ends when that time expires.",
  "Temporary disconnects do not automatically pause your package timer.",
  "After you connect, unused time is not refunded if you end the session early.",
  "If the astrologer is unable to complete the session, or a technical or platform interruption occurs, you may raise a billing issue through Help & Support. Refunds are not automatic.",
  "Other promotional offers do not stack on a Fixed Session.",
] as const;

export type FixSortKey =
  | "popularity"
  | "exp_desc"
  | "exp_asc"
  | "orders_desc"
  | "orders_asc"
  | "price_asc"
  | "price_desc"
  | "rating_desc"
  | "rating_asc";

export interface FixFiltersState {
  searchQuery: string;
  expertise: string[];
  languages: string[];
  availability: string[];
  mode: string[];
  sort: FixSortKey;
}

export const DEFAULT_FIX_FILTERS: FixFiltersState = {
  searchQuery: "",
  expertise: [],
  languages: [],
  availability: [],
  mode: [],
  sort: "popularity",
};

export function filterAndSortFixedAstrologers(
  list: Astrologer[],
  filters: FixFiltersState,
): Astrologer[] {
  const q = filters.searchQuery.trim().toLowerCase();

  const filtered = list.filter((a) => {
    if (!isPkgEnabled(a)) return false;

    // Search query
    if (q) {
      const haystack = [a.name, ...a.skills, ...a.languages, a.about].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Expertise filter
    if (filters.expertise.length > 0) {
      const matches = filters.expertise.some((e) => a.skills.some((s) => s.toLowerCase() === e.toLowerCase()));
      if (!matches) return false;
    }

    // Languages filter
    if (filters.languages.length > 0) {
      const matches = filters.languages.some((l) => a.languages.some((al) => al.toLowerCase() === l.toLowerCase()));
      if (!matches) return false;
    }

    // Availability filter
    if (filters.availability.length > 0) {
      const st = a.availability;
      const matches = filters.availability.some((av) => {
        if (av === "Available" && st === "on") return true;
        if (av === "In consultation" && st === "busy") return true;
        if (av === "Live" && st === "live") return true;
        if (av === "Offline" && st === "off") return true;
        return false;
      });
      if (!matches) return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "exp_desc":
        return b.years - a.years;
      case "exp_asc":
        return a.years - b.years;
      case "orders_desc":
        return b.consults - a.consults;
      case "orders_asc":
        return a.consults - b.consults;
      case "price_asc":
        return pkgMinPrice(a.price) - pkgMinPrice(b.price);
      case "price_desc":
        return pkgMinPrice(b.price) - pkgMinPrice(a.price);
      case "rating_desc":
        return (b.rating ?? 0) - (a.rating ?? 0);
      case "rating_asc":
        return (a.rating ?? 0) - (b.rating ?? 0);
      case "popularity":
      default:
        return b.consults - a.consults;
    }
  });

  return sorted;
}
