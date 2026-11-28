"use client";

import { useState } from "react";
import type { Review } from "@/lib/types";

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest";
const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest", label: "Highest rating" },
  { value: "lowest", label: "Lowest rating" },
];

const time = (r: Review) => (r.at ? Date.parse(r.at) : Date.parse(r.when) || 0);

/** Reviews in the order chosen; equal ratings keep the newest first. */
export function sortReviews(reviews: Review[], sort: ReviewSort): Review[] {
  return [...reviews].sort((a, b) => {
    if (sort === "oldest") return time(a) - time(b);
    if (sort === "highest" && a.stars !== b.stars) return b.stars - a.stars;
    if (sort === "lowest" && a.stars !== b.stars) return a.stars - b.stars;
    return time(b) - time(a);
  });
}

export function ReviewSortSelect({ value, onChange, className = "" }: { value: ReviewSort; onChange: (v: ReviewSort) => void; className?: string }) {
  return (
    <label className={`flex items-center justify-end gap-2 text-[12.5px] font-semibold text-stone-500 ${className}`}>
      Sort by
      <select value={value} onChange={(e) => onChange(e.target.value as ReviewSort)} className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] font-bold text-ink">
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The profile page's written reviews, with the sort choice. */
export default function ReviewList({ reviews }: { reviews: Review[] }) {
  const [sort, setSort] = useState<ReviewSort>("newest");
  if (!reviews.length) return null;
  return (
    <>
      {reviews.length > 1 && <ReviewSortSelect value={sort} onChange={setSort} />}
      {sortReviews(reviews, sort).map((r, i) => (
        <div key={`${r.name}-${r.at ?? r.when}-${i}`} className="border-t border-line-soft pt-3.5">
          <div className="flex items-center gap-2">
            <b className="text-[13.5px] font-bold text-ink">{r.name}</b>
            <span className="text-xs tracking-[1px] text-[#f5b301]" aria-label={`${r.stars} stars`}>
              {"★".repeat(r.stars)}
            </span>
            <span className="ml-auto text-[11.5px] text-mauve">{r.when}</span>
          </div>
          <p className="mt-1.5 text-[13.5px] leading-[1.55] text-stone-600">{r.text}</p>
        </div>
      ))}
    </>
  );
}
