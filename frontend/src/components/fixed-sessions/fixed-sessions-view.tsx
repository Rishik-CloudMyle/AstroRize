"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Astrologer } from "@/lib/types";
import { rupee, RECOGNITION, AVAILABILITY } from "@/lib/format";
import {
  pkgDurations,
  DEFAULT_FIX_FILTERS,
  filterAndSortFixedAstrologers,
  pkgQuote,
  type FixFiltersState,
  type FixSortKey,
} from "@/lib/fixed-sessions";
import FixedSessionSheet from "@/components/consult/fixed-session-sheet";
import { AppVerifiedTick } from "@/components/astrologer/app-astro-card";

export interface FixedSessionsViewProps {
  initialAstrologers: Astrologer[];
  initialDiscounts?: Record<number, number>;
}

const EXPERTISE_OPTIONS = [
  "Vedic",
  "Tarot",
  "Numerology",
  "KP",
  "Vastu",
  "Palmistry",
  "Prashna",
  "Nadi",
  "Face Reading",
];

const LANGUAGE_OPTIONS = [
  "Hindi",
  "English",
  "Bengali",
  "Gujarati",
  "Kannada",
  "Marathi",
  "Tamil",
  "Telugu",
  "Punjabi",
];

const AVAILABILITY_OPTIONS = [
  "Available",
  "In consultation",
  "Live",
  "Offline",
];

const SORT_OPTIONS: { key: FixSortKey; label: string }[] = [
  { key: "popularity", label: "Most Popular" },
  { key: "exp_desc", label: "Experience: High to Low" },
  { key: "exp_asc", label: "Experience: Low to High" },
  { key: "rating_desc", label: "Rating: High to Low" },
  { key: "price_asc", label: "Package Price: Low to High" },
  { key: "price_desc", label: "Package Price: High to Low" },
];

export default function FixedSessionsView({
  initialAstrologers,
  initialDiscounts,
}: FixedSessionsViewProps) {
  const [filters, setFilters] = useState<FixFiltersState>(DEFAULT_FIX_FILTERS);
  const [activeSheetAstrologer, setActiveSheetAstrologer] = useState<Astrologer | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [discounts, setDiscounts] = useState<Record<number, number> | undefined>(initialDiscounts);

  // Filtered astrologers list
  const astrologers = useMemo(() => {
    return filterAndSortFixedAstrologers(initialAstrologers, filters, discounts);
  }, [initialAstrologers, filters, discounts]);

  const activeFilterCount =
    (filters.expertise.length > 0 ? 1 : 0) +
    (filters.languages.length > 0 ? 1 : 0) +
    (filters.availability.length > 0 ? 1 : 0) +
    (filters.sort !== "popularity" ? 1 : 0);

  const clearFilters = () => {
    setFilters(DEFAULT_FIX_FILTERS);
  };

  const toggleExpertise = (skill: string) => {
    setFilters((prev) => {
      const exists = prev.expertise.includes(skill);
      return {
        ...prev,
        expertise: exists
          ? prev.expertise.filter((s) => s !== skill)
          : [...prev.expertise, skill],
      };
    });
  };

  const toggleLanguage = (lang: string) => {
    setFilters((prev) => {
      const exists = prev.languages.includes(lang);
      return {
        ...prev,
        languages: exists
          ? prev.languages.filter((l) => l !== lang)
          : [...prev.languages, lang],
      };
    });
  };

  const toggleAvailability = (av: string) => {
    setFilters((prev) => {
      const exists = prev.availability.includes(av);
      return {
        ...prev,
        availability: exists
          ? prev.availability.filter((a) => a !== av)
          : [...prev.availability, av],
      };
    });
  };

  return (
    <div className="w-full">
      {/* ── Fixed Session Explanatory Banner (Desktop & Mobile) ── */}
      <div className="mb-6 rounded-[20px] border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-100/50 p-4 sm:p-5 shadow-xs max-lg:mx-4 max-lg:mt-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-900 mb-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5 text-amber-700">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
              </svg>
              Fixed Session, not pay per minute
            </div>
            <h2 className="text-base sm:text-lg font-bold text-ink">
              Prepaid packages with customizable savings
            </h2>
            <p className="mt-1 text-xs sm:text-sm leading-relaxed text-stone-600 max-w-3xl">
              Pay per minute can end when your wallet runs low. A Fixed Session gives you dedicated 5, 10, 15, 30, 45, or 60 minutes for a single package price. The session automatically ends when your purchased time is complete.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex rounded-xl bg-white/80 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-2xs">
              5m · 10m · 15m · 30m · 45m · 60m
            </span>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="mb-6 flex flex-col gap-3 max-lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400"
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
              placeholder="Search by name, expertise, or language"
              className="h-11 w-full rounded-full border border-line bg-paper pl-10 pr-4 text-sm text-ink placeholder:text-stone-400 focus:border-amber-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
            />
            {filters.searchQuery && (
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, searchQuery: "" }))}
                aria-label="Clear search"
                className="absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Desktop Filter Pills & Sort Selector */}
          <div className="flex items-center gap-2">
            {/* Mobile Filter Button (< 1024px) */}
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-bold text-stone-700 shadow-2xs hover:bg-stone-50 lg:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-amber-500 text-[11px] font-extrabold text-ink">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort Selector */}
            <div className="relative max-sm:min-w-0 max-sm:flex-1">
              <select
                value={filters.sort}
                onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value as FixSortKey }))}
                className="h-11 appearance-none rounded-full border border-line bg-paper pl-4 pr-9 max-sm:w-full max-sm:min-w-0 text-xs sm:text-sm font-semibold text-stone-700 focus:border-amber-500 focus:outline-hidden"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        {/* Desktop Quick Category Filter Row (Hidden on mobile) */}
        <div className="hidden lg:flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-500 mr-1.5">Skills:</span>
          {EXPERTISE_OPTIONS.map((exp) => {
            const active = filters.expertise.includes(exp);
            return (
              <button
                key={exp}
                type="button"
                onClick={() => toggleExpertise(exp)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "border border-line bg-paper text-stone-600 hover:border-amber-400 hover:text-amber-900"
                }`}
              >
                {exp}
              </button>
            );
          })}

          <div className="mx-2 h-4 w-px bg-stone-300" />

          <span className="text-xs font-bold uppercase tracking-wider text-stone-500 mr-1.5">Languages:</span>
          {LANGUAGE_OPTIONS.slice(0, 5).map((lang) => {
            const active = filters.languages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "border border-line bg-paper text-stone-600 hover:border-amber-400 hover:text-amber-900"
                }`}
              >
                {lang}
              </button>
            );
          })}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-bold text-amber-800 underline hover:text-amber-900"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Astrologers Grid / List ── */}
      {astrologers.length === 0 ? (
        <div className="rounded-[20px] border border-line bg-paper p-12 text-center max-lg:mx-4">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-amber-100 text-amber-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-ink">No Fixed Sessions match</h3>
          <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
            Only astrologers who match your search and filter criteria appear here. Try clearing or relaxing your filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-line bg-white px-5 text-sm font-bold text-ink hover:bg-stone-50 transition"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 max-lg:px-4">
          {astrologers.map((a) => {
            const st = a.availability;
            const rec = RECOGNITION[a.recognition];
            const rateLabel = a.rating === null ? "Trust Profile Building" : `★ ${a.rating.toFixed(1)}`;

            return (
              <article
                key={a.id}
                className="flex flex-col justify-between rounded-[20px] border border-line bg-paper p-4 sm:p-5 shadow-xs transition hover:border-amber-400/80 hover:shadow-md"
              >
                <div>
                  {/* Astrologer Header row */}
                  <div className="flex items-start gap-3.5">
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-full border border-line bg-stone-100">
                      <Image
                        src={a.photo}
                        alt={a.name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/astrologer/${a.slug}`}
                          className="truncate text-base font-bold text-ink hover:text-amber-800 hover:underline"
                        >
                          {a.name}
                        </Link>
                        <AppVerifiedTick />
                      </div>

                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                        <span className="font-semibold text-amber-900">{rec.label}</span>
                        <span>•</span>
                        <span>{a.years} yrs exp</span>
                      </div>

                      <p className="mt-1 truncate text-xs text-stone-600">
                        {a.skills.join(" · ")}
                      </p>

                      <p className="mt-0.5 truncate text-[11px] text-stone-500">
                        {a.languages.join(", ")}
                      </p>

                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="font-bold text-ink">{rateLabel}</span>
                        {a.consults > 0 && (
                          <span className="text-stone-400">
                            ({a.consults.toLocaleString("en-IN")} consults)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Availability chip */}
                  <div className="mt-3 flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        st === "on"
                          ? "bg-emerald-100 text-emerald-800"
                          : st === "busy"
                          ? "bg-amber-100 text-amber-900"
                          : st === "live"
                          ? "bg-purple-100 text-purple-900"
                          : "bg-stone-200 text-stone-700"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          st === "on"
                            ? "bg-emerald-600"
                            : st === "busy"
                            ? "bg-amber-600"
                            : st === "live"
                            ? "bg-purple-600 animate-pulse"
                            : "bg-stone-500"
                        }`}
                      />
                      {AVAILABILITY[st]?.label ?? st}
                    </span>
                  </div>

                  {/* Fixed Session Pricing Pills (5, 10, 15, 30, 45, 60 min) */}
                  <div className="mt-3.5 grid grid-cols-3 sm:grid-cols-6 gap-1">
                    {pkgDurations(discounts).map((mins) => {
                      const q = pkgQuote(a.price, mins, discounts);
                      return (
                        <div
                          key={mins}
                          className="flex flex-col rounded-lg border border-line bg-stone-50/70 px-1.5 py-1 text-center text-xs"
                        >
                          <span className="font-bold text-[11px] text-stone-500">{mins}m</span>
                          <span className="text-[12px] font-extrabold text-ink">{rupee(q.final)}</span>
                          <s className="text-[9px] text-stone-400">{rupee(q.original)}</s>
                        </div>
                      );
                    })}
                  </div>

                  {/* Availability Notice under cards */}
                  {st === "live" && (
                    <p className="mt-2.5 text-[11px] leading-snug text-purple-800">
                      Live now. Private Fixed Session starts when they are free.
                    </p>
                  )}
                  {st === "busy" && (
                    <p className="mt-2.5 text-[11px] leading-snug text-amber-800">
                      In consultation. Packages stay listed; connect when they are free.
                    </p>
                  )}
                  {st === "off" && (
                    <p className="mt-2.5 text-[11px] leading-snug text-stone-500">
                      Packages are configured. They are not free to connect right now.
                    </p>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 flex items-center gap-2 border-t border-line/60 pt-3">
                  <Link
                    href={`/astrologer/${a.slug}`}
                    className="flex h-10 flex-1 items-center justify-center rounded-full border border-line bg-white text-xs font-bold text-stone-700 hover:bg-stone-50 transition"
                  >
                    View Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => setActiveSheetAstrologer(a)}
                    className="flex h-10 flex-1 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-ink shadow-xs hover:bg-amber-400 transition"
                  >
                    Choose Session
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Mobile Filter Bottom Sheet (APP-FIX-002) ── */}
      {mobileFilterOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs lg:hidden"
        >
          <div className="flex max-h-[85vh] w-full flex-col rounded-t-[24px] border border-line bg-paper shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold text-ink">Fixed Session Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 text-xs text-stone-700 flex flex-col gap-5">
              {/* Skills / Expertise */}
              <div>
                <b className="block text-sm font-bold text-ink mb-2">Skills & Expertise</b>
                <div className="flex flex-wrap gap-1.5">
                  {EXPERTISE_OPTIONS.map((exp) => {
                    const active = filters.expertise.includes(exp);
                    return (
                      <button
                        key={exp}
                        type="button"
                        onClick={() => toggleExpertise(exp)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-amber-600 text-white"
                            : "border border-line bg-white text-stone-600"
                        }`}
                      >
                        {exp}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Languages */}
              <div>
                <b className="block text-sm font-bold text-ink mb-2">Languages</b>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const active = filters.languages.includes(lang);
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-amber-600 text-white"
                            : "border border-line bg-white text-stone-600"
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Availability */}
              <div>
                <b className="block text-sm font-bold text-ink mb-2">Availability</b>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABILITY_OPTIONS.map((av) => {
                    const active = filters.availability.includes(av);
                    return (
                      <button
                        key={av}
                        type="button"
                        onClick={() => toggleAvailability(av)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-amber-600 text-white"
                            : "border border-line bg-white text-stone-600"
                        }`}
                      >
                        {av}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 border-t border-line px-5 py-3.5 bg-paper">
              <button
                type="button"
                onClick={clearFilters}
                className="flex-1 h-11 rounded-full border border-line bg-white text-sm font-bold text-stone-700 hover:bg-stone-50"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 h-11 rounded-full bg-amber-500 text-sm font-bold text-ink shadow-xs hover:bg-amber-400"
              >
                Apply ({astrologers.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interactive Fixed Session Booking Sheet / Modal ── */}
      {activeSheetAstrologer && (
        <FixedSessionSheet
          astrologer={activeSheetAstrologer}
          customDiscounts={discounts}
          onClose={() => setActiveSheetAstrologer(null)}
        />
      )}
    </div>
  );
}
