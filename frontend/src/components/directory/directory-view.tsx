"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Astrologer } from "@/lib/types";
import { AVAILABILITY, RECOGNITION, languageLine, ratingLabel, rupee, skillLine } from "@/lib/format";
import { AvailabilityBadge, DiscountBadge, Portrait, RecognitionBadge, VerifiedTick, WasPrice } from "../astrologer/parts";

const FACETS = [
  { key: "expertise", label: "Expertise", options: ["Vedic", "Numerology", "Tarot", "KP", "Nadi", "Vastu", "Palmistry"] },
  { key: "language", label: "Language", options: ["Hindi", "English", "Tamil", "Marathi", "Bengali", "Punjabi"] },
  { key: "mode", label: "Mode", options: ["Chat", "Voice", "Video", "Instant Call"] },
  { key: "availability", label: "Availability", options: ["Available", "In consultation", "Live", "Instant Call"] },
  { key: "recognition", label: "Recognition", options: ["Premium", "Trusted", "Proven Expert", "Rising", "New"] },
] as const;

type FacetKey = (typeof FACETS)[number]["key"];

const SORTS = [
  { key: "popularity", label: "Popularity" },
  { key: "rating", label: "Rating — High to Low" },
  { key: "price", label: "Price — Low to High" },
  { key: "experience", label: "Experience — High to Low" },
] as const;

/** Does an astrologer match one option of a facet? */
function matches(a: Astrologer, facet: FacetKey, option: string): boolean {
  switch (facet) {
    case "expertise":
      return a.skills.includes(option);
    case "language":
      return a.languages.includes(option);
    case "mode":
      // Every astrologer offers chat, voice and video; Instant Call needs them online.
      return option === "Instant Call" ? a.availability !== "off" : true;
    case "availability":
      return option === "Instant Call" ? a.availability !== "off" : AVAILABILITY[a.availability].label.startsWith(option);
    case "recognition":
      return RECOGNITION[a.recognition].label === option;
  }
}

export default function DirectoryView({ astrologers }: { astrologers: Astrologer[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selected = (key: FacetKey) => params.get(key)?.split(",").filter(Boolean) ?? [];
  const query = params.get("q") ?? "";
  const sort = params.get("sort") ?? "popularity";
  const activeCount = FACETS.reduce((n, f) => n + selected(f.key).length, 0);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggle(key: FacetKey, option: string) {
    const current = selected(key);
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    update({ [key]: next.join(",") || null });
  }

  function clearFilters() {
    update(Object.fromEntries(FACETS.map((f) => [f.key, null])));
  }

  // Filter: any option within a facet, all facets together.
  const q = query.trim().toLowerCase();
  const results = astrologers
    .filter((a) => FACETS.every((f) => selected(f.key).length === 0 || selected(f.key).some((o) => matches(a, f.key, o))))
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.skills.some((s) => s.toLowerCase().includes(q)) ||
        a.languages.some((l) => l.toLowerCase().includes(q)),
    )
    .sort((x, y) => {
      switch (sort) {
        case "rating":
          return (y.rating ?? -1) - (x.rating ?? -1);
        case "price":
          return x.price - y.price;
        case "experience":
          return y.years - x.years;
        default:
          // Popularity: keep the ranking order the data comes in.
          return 0;
      }
    });

  const sortLabel = SORTS.find((s) => s.key === sort)?.label.split(" — ")[0].toLowerCase() ?? "popularity";
  const countLabel =
    results.length === astrologers.length
      ? `${astrologers.length} astrologers · sorted by ${sortLabel}`
      : `${results.length} of ${astrologers.length} astrologers · sorted by ${sortLabel}`;

  return (
    <div className="mt-[26px] grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-7">
      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        aria-expanded={filtersOpen}
        aria-controls="directory-filters"
        className="flex h-11 items-center justify-between rounded-xl border border-line bg-paper px-4 text-sm font-bold text-ink lg:hidden"
      >
        <span>Filters{activeCount > 0 ? ` (${activeCount})` : ""}</span>
        <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span>
      </button>

      <aside
        id="directory-filters"
        className={`${filtersOpen ? "block" : "hidden"} rounded-[20px] border border-line bg-paper p-[18px] lg:sticky lg:top-24 lg:block`}
      >
        <div className="flex items-center justify-between">
          <b className="text-[13px] font-bold">Filters</b>
          <button type="button" onClick={clearFilters} className="p-0 text-xs font-semibold text-amber-700">
            Clear
          </button>
        </div>
        {FACETS.map((f) => (
          <fieldset key={f.key} className="mt-[18px]">
            <legend className="mb-2 text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">{f.label}</legend>
            <div className="flex flex-wrap gap-1.5">
              {f.options.map((o) => {
                const on = selected(f.key).includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(f.key, o)}
                    className={`h-[30px] rounded-full border px-[11px] text-xs font-semibold ${
                      on ? "border-amber-500 bg-amber-500 text-ink" : "border-line bg-white text-stone-600"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </aside>

      <div className="min-w-0">
        <div className="mb-3.5 flex flex-wrap items-center gap-3">
          <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-full border border-line bg-white px-4">
            <span className="text-muted" aria-hidden="true">
              ⌕
            </span>
            <span className="sr-only">Search astrologers</span>
            <input
              type="search"
              defaultValue={query}
              onChange={(e) => update({ q: e.target.value || null })}
              placeholder="Search by name, skill or language"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[12.5px] text-stone-500">Sort</span>
            <select
              value={sort}
              onChange={(e) => update({ sort: e.target.value === "popularity" ? null : e.target.value })}
              className="h-11 rounded-xl border border-line bg-white px-3 text-[13.5px] font-semibold text-ink"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mb-3 text-[12.5px] text-stone-500" aria-live="polite">
          {countLabel}
        </div>

        {results.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#e0d4bd] bg-paper px-6 py-9 text-center">
            <div className="text-[15px] font-bold text-ink">No astrologers match these filters</div>
            <p className="mb-3.5 mt-1.5 text-[13px] text-stone-500">Try removing a filter or searching for something else.</p>
            <button type="button" onClick={clearFilters} className="az-cta h-10 rounded-full px-[18px] text-sm font-bold">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((a) => (
              <DirectoryCard key={a.id} astrologer={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DirectoryCard({ astrologer: a }: { astrologer: Astrologer }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-[20px] border border-line-warm bg-card px-4 py-4 shadow-[0_8px_20px_rgba(90,62,40,.06)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-[18px]">
      <Portrait astrologer={a} size={76} rays statusDot />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/astrologer/${a.slug}`}
            className="font-name text-lg font-bold tracking-[-.02em] text-plum hover:text-plum"
          >
            {a.name}
          </Link>
          <VerifiedTick size={15} />
          <RecognitionBadge astrologer={a} />
        </div>
        <div className="mt-[3px] text-[13px] text-mauve">{skillLine(a)}</div>
        <div className="mt-[3px] text-xs text-mauve">{languageLine(a)}</div>
        <div className="mt-[9px] flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f2ea] px-[9px] py-[3px] text-[11.5px] font-bold text-plum">
            ★ {ratingLabel(a)}
            <span className="h-3 w-px bg-[#e4d9c8]" />
            <span className="font-semibold text-mauve">{a.consults.toLocaleString("en-IN")} consults</span>
          </span>
          <AvailabilityBadge astrologer={a} />
          {a.eta && (
            <span className="inline-flex h-[22px] items-center gap-[5px] rounded-full bg-blue-50 px-[9px] text-[11px] font-bold text-blue-700">
              ⏱ waits {a.eta}
            </span>
          )}
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-[#f3e9d8] pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
        <div>
          <div className="flex items-baseline gap-1.5 sm:justify-end">
            <WasPrice astrologer={a} className="text-xs" />
            <span className="text-xl font-bold tabular-nums text-plum">{rupee(a.price)}</span>
            <span className="text-[11px] font-semibold text-mauve">/min</span>
          </div>
          <div className="mt-1">
            <DiscountBadge astrologer={a} className="h-[19px] px-[7px] text-[9.5px]" />
          </div>
        </div>
        <Link
          href={`/astrologer/${a.slug}`}
          className="az-cta inline-flex h-[38px] shrink-0 items-center rounded-full px-[18px] text-[13.5px] font-bold hover:text-cta-ink hover:no-underline sm:mt-2.5"
        >
          View profile
        </Link>
      </div>
    </div>
  );
}
