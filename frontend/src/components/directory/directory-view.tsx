"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Astrologer } from "@/lib/types";
import { languageLine, ratingLabel, rupee, skillLine } from "@/lib/format";
import { AvailabilityBadge, DiscountBadge, Portrait, RecognitionBadge, VerifiedTick, WasPrice } from "../astrologer/parts";
import FilterPanel from "./filter-panel";
import {
  CATEGORIES,
  SORTS,
  activeFilterCount,
  categoryCount,
  emptyFilters,
  matchesFilters,
  matchesQuery,
  readState,
  sortAstrologers,
  stateToParams,
  type FilterState,
  type SortKey,
} from "./filters";

/** How often the list re-reads who is available while the page is open. */
const REFRESH_MS = 30_000;

export default function DirectoryView({ astrologers: initial }: { astrologers: Astrologer[] }) {
  const astrologers = useCurrentAstrologers(initial);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Category the Filters panel is open on, or null when closed.
  const [panelCategory, setPanelCategory] = useState<string | null>(null);

  const state = readState(new URLSearchParams(params.toString()), astrologers);
  const query = params.get("q") ?? "";
  const activeCount = activeFilterCount(state.filters);
  const anyActive = activeCount > 0 || state.sort !== "popularity";

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function apply(nextState: FilterState) {
    update(stateToParams(nextState));
    setPanelCategory(null);
  }

  function clearAll() {
    update(stateToParams({ filters: emptyFilters(), sort: "popularity" }));
  }

  const results = sortAstrologers(
    astrologers.filter((a) => matchesFilters(a, state.filters) && matchesQuery(a, query)),
    state.sort,
  );

  const countLabel =
    results.length === astrologers.length
      ? `${astrologers.length} astrologers`
      : `${results.length} of ${astrologers.length} astrologers`;

  const chipBase =
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600";
  const chipOn = "border-amber-600 bg-amber-50 text-amber-800";
  const chipOff = "border-[#ecd9b6] bg-paper text-ink hover:border-amber-500";

  return (
    <div className="mt-[26px] min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-full border border-line bg-white px-4 focus-within:border-amber-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-4 shrink-0 text-muted" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <span className="sr-only">Search astrologers</span>
          <input
            type="search"
            defaultValue={query}
            onChange={(e) => update({ q: e.target.value || null })}
            placeholder="Search by name, skill or language"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        <label className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-[12.5px] text-stone-500">Sort by</span>
          <select
            value={state.sort}
            onChange={(e) => update({ sort: e.target.value === "popularity" ? null : e.target.value })}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[13.5px] font-semibold text-ink sm:flex-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Chip row like the app: Filter, then a shortcut into each category of the panel. */}
      <div
        role="group"
        aria-label="Filters"
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setPanelCategory(CATEGORIES[0].id)}
          className={`${chipBase} font-bold ${anyActive ? chipOn : chipOff}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-3.5" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filter
          {activeCount > 0 && <ChipCount n={activeCount} label="filters on" />}
        </button>
        {CATEGORIES.filter((c) => c.id !== "orders").map((c) => {
          const n = categoryCount(c, state);
          return (
            <button
              key={c.id}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setPanelCategory(c.id)}
              className={`${chipBase} font-semibold ${n ? chipOn : chipOff}`}
            >
              {c.label}
              {n > 0 && <ChipCount n={n} label={c.kind === "sort" ? "sort on" : "selected"} />}
            </button>
          );
        })}
      </div>

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-stone-500">
        <span aria-live="polite">
          {countLabel} · sorted by {sortName(state.sort)}
        </span>
        {anyActive && (
          <button type="button" onClick={clearAll} className="p-0 text-xs font-semibold text-amber-700 hover:text-amber-800">
            Clear
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[#e0d4bd] bg-paper px-6 py-9 text-center">
          <div className="text-[15px] font-bold text-ink">No astrologers match these filters</div>
          <p className="mb-3.5 mt-1.5 text-[13px] text-stone-500">Try removing a filter or searching for something else.</p>
          <button type="button" onClick={clearAll} className="az-cta h-10 rounded-full px-[18px] text-sm font-bold">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2 lg:gap-4">
          {results.map((a) => (
            <DirectoryCard key={a.id} astrologer={a} />
          ))}
        </div>
      )}

      {panelCategory && (
        <FilterPanel
          astrologers={astrologers}
          initial={state}
          initialCategory={panelCategory}
          onApply={apply}
          onClose={() => setPanelCategory(null)}
        />
      )}
    </div>
  );
}

/** The list, with availability kept current (every 30 s while visible, and on focus). */
function useCurrentAstrologers(initial: Astrologer[]): Astrologer[] {
  const [state, setState] = useState({ from: initial, list: initial });
  if (state.from !== initial) setState({ from: initial, list: initial });
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { astrologers } = await api.get<{ astrologers: Astrologer[] }>("/astrologers");
        if (!cancelled) setState((s) => ({ ...s, list: astrologers }));
      } catch {
        // Keep what we have; the next tick retries.
      }
    };
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const id = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return state.list;
}

/** "rating, high to low" for the count line. */
function sortName(key: SortKey): string {
  return (SORTS.find((s) => s.key === key)?.label ?? "Popularity").replace(" — ", ", ").toLowerCase();
}

function ChipCount({ n, label }: { n: number; label: string }) {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-100 px-[5px] text-[10px] font-bold text-amber-800">
      {n}
      <span className="sr-only"> {label}</span>
    </span>
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
