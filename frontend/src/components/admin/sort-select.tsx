"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useId } from "react";
import { EYEBROW } from "@/components/admin/ui";
import { pickSort, type SortOption } from "@/lib/admin/sort";

/**
 * The chosen sort, kept in the URL as ?sort=… so a reload, a shared link or Back keeps it.
 * The URL is the only source of truth (an unknown value falls back to the default). The
 * default order leaves the URL clean. Other params (?key=, ?ticket=, ?view= …) are kept.
 */
export function useUrlSort<T>(options: readonly SortOption<T>[], fallback: string = options[0].key) {
  const sort = pickSort(options, useSearchParams().get("sort"), fallback);
  const setSort = useCallback(
    (next: string) => {
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete("sort");
      else url.searchParams.set("sort", next);
      // Native history updates are picked up by the Next.js router without a server round trip.
      window.history.replaceState(null, "", url);
    },
    [fallback],
  );
  return [sort, setSort] as const;
}

/** "Sort by" dropdown used across the console, styled like the config console's Setting dropdown. */
export default function SortSelect<T>({
  options,
  value,
  onChange,
  className = "w-[230px]",
}: {
  options: readonly SortOption<T>[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={`${EYEBROW} mb-1.5 block`}>
        Sort by
      </label>
      <span className="relative block">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] font-bold text-amber-700"
        >
          ⇅
        </span>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white pr-3 pl-8 text-[13px] font-semibold text-ink"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

/**
 * A filter kept in the URL as ?<param>=… (e.g. ?dept=finance), like useUrlSort: the URL is
 * the only source of truth, an unknown value falls back to `fallback`, and the default
 * leaves the URL clean. Other params are kept.
 */
export function useUrlParam(param: string, allowed: readonly string[], fallback: string) {
  const asked = useSearchParams().get(param);
  const value = asked !== null && allowed.includes(asked) ? asked : fallback;
  const setValue = useCallback(
    (next: string) => {
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete(param);
      else url.searchParams.set(param, next);
      window.history.replaceState(null, "", url);
    },
    [param, fallback],
  );
  return [value, setValue] as const;
}

/** A labelled filter dropdown in the same style as the "Sort by" dropdown. */
export function FilterSelect({
  label,
  icon = "⏷",
  options,
  value,
  onChange,
  className = "w-[230px]",
}: {
  label: string;
  icon?: string;
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={`${EYEBROW} mb-1.5 block`}>
        {label}
      </label>
      <span className="relative block">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] font-bold text-amber-700"
        >
          {icon}
        </span>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white pr-3 pl-8 text-[13px] font-semibold text-ink"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
