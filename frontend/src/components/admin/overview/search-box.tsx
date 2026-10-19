"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api/client";
import type { SearchHit } from "@/lib/admin/types";
import { toSearchHit, type RawSearchHit } from "@/lib/admin/view";

const MAX_HITS = 8;
const DEBOUNCE_MS = 200;

/**
 * Overview search: the API matches sessions, tickets, astrologers, config keys, batches and
 * campaigns, limited to the pages this role can open.
 */
export default function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  // Hits are stored with the query they answer, so a stale answer is never shown.
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });

  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ hits: RawSearchHit[] }>(`/admin/search?q=${encodeURIComponent(q)}`);
        setResult({ q, hits: res.hits.map(toSearchHit).slice(0, MAX_HITS) });
      } catch {
        setResult({ q, hits: [] });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const hits = result.q === q ? result.hits : [];
  const pending = q.length > 0 && result.q !== q;
  const showList = open && q.length > 0 && !pending;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && hits[cursor]) {
      router.push(hits[cursor].href);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex h-[42px] min-w-[280px] items-center gap-2 rounded-full border border-line bg-white px-4">
        <span className="text-muted" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-label="Search the console"
          placeholder="Search sessions, tickets, astrologers, config keys"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-[48px] right-0 z-50 w-[420px] overflow-hidden rounded-[14px] border border-line bg-paper p-1.5 shadow-[0_20px_44px_rgba(90,62,40,.18)]"
        >
          {hits.length === 0 ? (
            <p className="m-0 px-3 py-2.5 text-[12.5px] text-[#78716c]">Nothing matches “{query.trim()}”.</p>
          ) : (
            hits.map((h, i) => (
              <Link
                key={h.kind + h.label + h.href}
                href={h.href}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-ink hover:text-ink hover:no-underline ${
                  i === cursor ? "bg-amber-100" : ""
                }`}
              >
                <span className="w-[86px] flex-none text-[9.5px] font-extrabold tracking-[.08em] text-[#78716c] uppercase">
                  {h.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12.5px]">{h.label}</b>
                  <span className="block truncate text-[11px] text-[#78716c]">{h.sub}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
