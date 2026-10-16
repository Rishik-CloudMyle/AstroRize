"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { searchPlaces, suggestPlaces, type Place } from "@/lib/astro";
import { inputClass } from "./tool-ui";

// Birthplace picker. While typing it suggests places Astrorize has found before (our own cache);
// a new place is looked up on OpenStreetMap only when the person presses Search or Enter — the
// OpenStreetMap (Nominatim) usage policy forbids per-keystroke lookups. Recently chosen places
// are remembered in this browser for convenience.

const RECENT_KEY = "astrorize.recentPlaces";
const MAX_RECENT = 5;

function readRecent(): Place[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (p): p is Place =>
          !!p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.latitude === "number" &&
          typeof p.longitude === "number" &&
          typeof p.timezone === "string",
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function rememberPlace(place: Place) {
  try {
    const list = [place, ...readRecent().filter((p) => p.id !== place.id)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked (private window): nothing to remember.
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "Pune, Maharashtra, India" → ["Pune", "Maharashtra, India"]. */
function splitName(name: string): [string, string] {
  const i = name.indexOf(",");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 1).trim()];
}

/** "UTC+05:30" for a time zone today (the chart itself uses the offset on the birth date). */
function offsetNow(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part === "GMT" ? "UTC+00:00" : (part ?? "").replace("GMT", "UTC");
  } catch {
    return "";
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; source: "suggest" | "search" | "recent" }
  | { kind: "empty"; query: string }
  | { kind: "error"; message: string };

export default function BirthPlaceInput({
  label,
  value,
  onChange,
  prefill,
  invalid = false,
  hint,
}: {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Text to start from (e.g. the birthplace saved on the profile); matched against known places. */
  prefill?: string;
  /** Show the field in its error state (the form was submitted without a place). */
  invalid?: boolean;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefilled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // Start from the profile's birthplace: pick it straight away when it's a place we know.
  useEffect(() => {
    if (!prefill || prefilled.current || value) return;
    prefilled.current = true;
    const n = seq.current;
    const wanted = norm(prefill);
    suggestPlaces(prefill)
      .then(({ places }) => {
        if (seq.current !== n) return;
        const match = places.find((p) => norm(p.name) === wanted || norm(p.name).startsWith(`${wanted},`) || norm(splitName(p.name)[0]) === wanted);
        setText(match ? match.name : prefill);
        if (match) onChange(match);
      })
      .catch(() => {
        if (seq.current === n) setText(prefill);
      });
  }, [prefill, value, onChange]);

  function choose(place: Place) {
    seq.current++;
    setText(place.name);
    setOpen(false);
    setActive(-1);
    setStatus({ kind: "idle" });
    rememberPlace(place);
    onChange(place);
  }

  function typed(next: string) {
    setText(next);
    if (value) onChange(null);
    setActive(-1);
    if (debounce.current) clearTimeout(debounce.current);
    const n = ++seq.current;
    if (next.trim().length < 2) {
      const recent = next.trim() ? [] : readRecent();
      setOptions(recent);
      setStatus(recent.length ? { kind: "results", source: "recent" } : { kind: "idle" });
      setOpen(recent.length > 0);
      return;
    }
    debounce.current = setTimeout(() => {
      suggestPlaces(next.trim())
        .then(({ places }) => {
          if (seq.current !== n) return;
          const recent = readRecent().filter((p) => norm(p.name).includes(norm(next)) && !places.some((q) => q.id === p.id));
          const all = [...places, ...recent].slice(0, 8);
          setOptions(all);
          // Enter picks the best known match; Search (or the last row) looks further.
          setActive(all.length ? 0 : -1);
          setStatus({ kind: "results", source: "suggest" });
          setOpen(true);
        })
        .catch(() => {
          // Suggestions are a convenience; Search still works.
          if (seq.current !== n) return;
          setOptions([]);
          setStatus({ kind: "results", source: "suggest" });
          setOpen(true);
        });
    }, 220);
  }

  async function search() {
    const q = text.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) {
      setStatus({ kind: "error", message: "Type at least 2 letters of the town or city, then press Search." });
      setOpen(false);
      return;
    }
    const n = ++seq.current;
    setStatus({ kind: "searching" });
    setOpen(false);
    try {
      const { places } = await searchPlaces(q);
      if (seq.current !== n) return;
      setOptions(places);
      setActive(places.length ? 0 : -1);
      setStatus(places.length ? { kind: "results", source: "search" } : { kind: "empty", query: q });
      setOpen(places.length > 0);
    } catch (err) {
      if (seq.current !== n) return;
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setStatus({
        kind: "error",
        message: offline
          ? "You seem to be offline. Connect to the internet and press Search again."
          : err instanceof ApiError
            ? err.message
            : "Place search isn't available right now. Please try again shortly.",
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Enter never submits the whole form from here: it picks the highlighted place or searches.
      e.preventDefault();
      if (open && active >= 0 && options[active]) choose(options[active]);
      else void search();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  function onFocus() {
    if (value || text.trim()) return;
    const recent = readRecent();
    if (recent.length) {
      setOptions(recent);
      setStatus({ kind: "results", source: "recent" });
      setOpen(true);
    }
  }

  const searching = status.kind === "searching";
  const showList = open && status.kind === "results";

  return (
    <div className="min-w-0">
      <label htmlFor={`${id}-input`} className="text-xs font-semibold text-stone-600">
        {label}
      </label>
      <div className="relative mt-1.5 flex gap-2">
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid && !value}
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder="Town or city, e.g. Pune"
          onChange={(e) => typed(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => setOpen(false)}
          className={`${inputClass} mt-0 flex-1 ${invalid && !value ? "border-rose-400" : ""}`}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching}
          className="h-11 shrink-0 rounded-xl border border-line bg-white px-3.5 text-[13px] font-bold text-ink hover:border-amber-400 disabled:cursor-wait disabled:opacity-70"
        >
          {searching ? "Searching…" : "Search"}
        </button>

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} matches`}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_14px_30px_rgba(62,38,18,.14)]"
          >
            {status.source === "recent" && (
              <li className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-stone-500" role="presentation">
                Recent places
              </li>
            )}
            {options.map((p, i) => {
              const [town, region] = splitName(p.name);
              return (
                <li
                  key={p.id}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer rounded-xl px-3 py-2 ${i === active ? "bg-amber-50" : ""}`}
                >
                  <b className="block truncate text-[13.5px] text-ink">{town}</b>
                  {region && <span className="block truncate text-xs text-stone-500">{region}</span>}
                </li>
              );
            })}
            {status.source !== "search" && (
              <li
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void search()}
                className="cursor-pointer rounded-xl px-3 py-2 text-[13px] text-stone-600 hover:bg-amber-50"
              >
                {options.length === 0 && status.source === "suggest" ? "No saved matches. " : ""}
                {text.trim().length >= 2 ? (
                  <>
                    Search all places for <b className="text-ink">“{text.trim()}”</b> →
                  </>
                ) : (
                  "Type a town or city, then press Search"
                )}
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-1 min-h-[18px] text-[11.5px] leading-snug" aria-live="polite">
        {value ? (
          <span className="text-emerald-800">
            ✓ {value.name} · {value.timezone}
            {offsetNow(value.timezone) ? ` (${offsetNow(value.timezone)})` : ""}
          </span>
        ) : status.kind === "error" ? (
          <span className="text-rose-700">{status.message}</span>
        ) : status.kind === "empty" ? (
          <span className="text-rose-700">
            No places found for “{status.query}”. Check the spelling or add the state or country.
          </span>
        ) : searching ? (
          <span className="text-stone-500">Looking up places…</span>
        ) : invalid ? (
          <span className="text-rose-700">Choose the birthplace from the list — press Search to find it.</span>
        ) : hint ? (
          <span className="text-stone-500">{hint}</span>
        ) : (
          <span className="text-stone-500">Type the town, then press Search and pick it from the list.</span>
        )}
      </div>
      <div className="text-[10.5px] text-stone-400">
        Place data ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-stone-500 underline">
          OpenStreetMap contributors
        </a>
      </div>
    </div>
  );
}
