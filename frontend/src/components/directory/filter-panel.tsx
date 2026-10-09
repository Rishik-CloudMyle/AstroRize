"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Astrologer } from "@/lib/types";
import {
  CATEGORIES,
  categoryCount,
  emptyFilters,
  facetOptions,
  matchesFilters,
  sortOptionLabel,
  type FilterState,
} from "./filters";

/**
 * The customer app's Filters sheet: categories on the left, options on the right, Apply at the bottom.
 * Full screen on phones, a large centered panel from `sm` up. Edits are a draft until Apply;
 * closing (back button, Escape, backdrop) discards them.
 */
export default function FilterPanel({
  astrologers,
  initial,
  initialCategory,
  onApply,
  onClose,
}: {
  astrologers: Astrologer[];
  initial: FilterState;
  initialCategory: string;
  onApply: (state: FilterState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterState>(() => ({
    filters: structuredClone(initial.filters),
    sort: initial.sort,
  }));
  const [openId, setOpenId] = useState(initialCategory);
  const [optionQuery, setOptionQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();
  const titleId = `${uid}-title`;

  const open = CATEGORIES.find((c) => c.id === openId) ?? CATEGORIES[0];
  const matchCount = astrologers.filter((a) => matchesFilters(a, draft.filters)).length;

  // Lock page scroll, close on Escape, keep Tab inside the panel, and hand focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    tabRefs.current[CATEGORIES.findIndex((c) => c.id === initialCategory)]?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
    // Runs once per opening; onClose is stable for the panel's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCategory(id: string) {
    setOpenId(id);
    setOptionQuery("");
  }

  // Up/Down (and Home/End) move between categories, as in a vertical tab list.
  function onTabKey(e: React.KeyboardEvent, index: number) {
    const last = CATEGORIES.length - 1;
    const next =
      e.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    selectCategory(CATEGORIES[next].id);
    tabRefs.current[next]?.focus();
  }

  function toggleFacet(key: keyof FilterState["filters"], option: string) {
    setDraft((d) => {
      const current = d.filters[key];
      const nextValues = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...d, filters: { ...d.filters, [key]: nextValues } };
    });
  }

  const q = optionQuery.trim().toLowerCase();
  const panelId = `${uid}-panel`;

  return (
    <div
      className="fixed inset-0 z-[100] flex bg-[rgba(28,25,23,.45)] sm:items-center sm:justify-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-dvh w-full flex-col overflow-hidden bg-paper shadow-[0_16px_40px_rgba(11,31,51,.18)] sm:h-[min(640px,calc(100dvh-48px))] sm:max-w-[720px] sm:rounded-[20px]"
      >
        <div className="grid min-h-[56px] grid-cols-[40px_1fr_auto] items-center gap-2 border-b border-line px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="grid size-10 place-items-center rounded-[10px] text-ink hover:bg-cream"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-5" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
          </button>
          <h2 id={titleId} className="text-center text-[17px] font-bold text-ink">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => setDraft({ filters: emptyFilters(), sort: "popularity" })}
            className="px-1 py-1.5 text-[13px] font-bold text-amber-700 hover:text-amber-800"
          >
            Clear All
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="Filter categories"
            className="w-[36%] max-w-[168px] shrink-0 overflow-y-auto border-r border-line bg-cream"
          >
            {CATEGORIES.map((c, i) => {
              const on = c.id === open.id;
              const count = categoryCount(c, draft);
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${c.id}`}
                  aria-selected={on}
                  aria-controls={panelId}
                  tabIndex={on ? 0 : -1}
                  onClick={() => selectCategory(c.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`flex min-h-[48px] w-full items-center justify-between gap-2 border-l-[3px] py-2 pl-3 pr-2.5 text-left text-[12.5px] leading-tight sm:text-[13.5px] ${
                    on ? "border-amber-500 bg-paper font-bold text-ink" : "border-transparent font-semibold text-stone-600 hover:text-ink"
                  }`}
                >
                  <span>{c.label}</span>
                  {count > 0 && (
                    <span className="text-[10.5px] font-bold text-amber-700">
                      {count}
                      <span className="sr-only"> selected</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${open.id}`}
            className="min-w-0 flex-1 overflow-y-auto px-3.5 pb-4 pt-3 sm:px-5"
          >
            <h3 className="mb-2.5 text-sm font-bold text-ink">{open.label}</h3>
            {open.kind === "facet" ? (
              <>
                {open.searchable && (
                  <label className="mb-3 flex h-10 items-center gap-2 rounded-full border border-line bg-white px-3.5 focus-within:border-amber-500">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="size-4 shrink-0 text-muted" aria-hidden="true">
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="m16 16 4 4" />
                    </svg>
                    <span className="sr-only">Search {open.label.toLowerCase()}</span>
                    <input
                      type="search"
                      value={optionQuery}
                      onChange={(e) => setOptionQuery(e.target.value)}
                      placeholder={`Search ${open.label.toLowerCase()}`}
                      className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-ink outline-none"
                    />
                  </label>
                )}
                <fieldset>
                  <legend className="sr-only">{open.label}</legend>
                  {(() => {
                    const options = facetOptions(open.key, astrologers).filter((o) => !q || o.toLowerCase().includes(q));
                    if (options.length === 0) return <p className="py-3 text-[13px] text-stone-500">No matching options.</p>;
                    return options.map((o) => (
                      <OptionRow
                        key={o}
                        type="checkbox"
                        label={o}
                        checked={draft.filters[open.key].includes(o)}
                        onChange={() => toggleFacet(open.key, o)}
                      />
                    ));
                  })()}
                </fieldset>
              </>
            ) : (
              <fieldset>
                <legend className="sr-only">Sort by {open.label.toLowerCase()}</legend>
                {open.keys.map((k) => (
                  <OptionRow
                    key={k}
                    type="radio"
                    name={`${uid}-sort`}
                    label={sortOptionLabel(k)}
                    checked={draft.sort === k}
                    onChange={() => setDraft((d) => ({ ...d, sort: k }))}
                  />
                ))}
              </fieldset>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-paper px-3.5 pb-4 pt-2.5 sm:px-5">
          <button
            type="button"
            disabled={matchCount === 0}
            onClick={() => onApply(draft)}
            className="h-12 w-full rounded-[14px] bg-amber-500 text-[15px] font-bold text-ink transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
          >
            {matchCount === 0 ? "No matches" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One option: a real checkbox or radio input drawn as the app's square tick box. */
function OptionRow({
  type,
  name,
  label,
  checked,
  onChange,
}: {
  type: "checkbox" | "radio";
  name?: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-[46px] cursor-pointer items-center gap-3 border-b border-line-soft py-2 text-[13.5px] font-semibold text-ink last:border-b-0">
      <input type={type} name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`grid size-[18px] shrink-0 place-items-center rounded-[4px] border-[1.5px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-600 ${
          checked ? "border-amber-500 bg-amber-500" : "border-stone-300 bg-white"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" className="size-[11px]">
            <path d="m6 12 4 4 8-8" />
          </svg>
        )}
      </span>
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}
