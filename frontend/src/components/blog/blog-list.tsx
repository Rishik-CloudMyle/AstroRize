"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BLOG_CATEGORIES, type Article } from "@/lib/mock/blog";

/** The stories as cards, with a search box and category chips (the prototype's Insights screen). */
export default function BlogList({ articles }: { articles: Article[] }) {
  const [cat, setCat] = useState<(typeof BLOG_CATEGORIES)[number]>("All");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return articles.filter((a) => (cat === "All" || a.category === cat) && (!needle || `${a.title} ${a.blurb} ${a.category}`.toLowerCase().includes(needle)));
  }, [articles, cat, q]);

  return (
    <div>
      <label htmlFor="blog-search" className="sr-only">
        Search stories
      </label>
      <input
        id="blog-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stories"
        className="h-11 w-full max-w-[420px] rounded-xl border border-line bg-white px-3.5 text-[14px] text-ink"
      />
      <div role="group" aria-label="Category" className="mt-3.5 flex flex-wrap gap-2">
        {BLOG_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={`h-9 rounded-full border px-4 text-[13px] font-bold ${cat === c ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="mt-8 text-center text-[14px] text-stone-500">No stories match. Try another word or category.</p>
      ) : (
        <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <li key={a.slug}>
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white">
                <Link href={`/blog/${a.slug}`} className="relative block aspect-[16/9] bg-stone-900" aria-label={`Read: ${a.title}`}>
                  <Image src={a.image} alt="" fill sizes="(min-width:1024px) 400px, (min-width:640px) 50vw, 100vw" className="object-cover" />
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[10.5px] font-bold tracking-[.08em] text-amber-800 uppercase">{a.category}</span>
                  <h2 className="m-0 mt-1 text-[17px] leading-snug font-bold text-ink">
                    <Link href={`/blog/${a.slug}`} className="text-ink hover:text-amber-800 hover:no-underline">
                      {a.title}
                    </Link>
                  </h2>
                  <p className="mt-1.5 mb-0 text-[13.5px] leading-normal text-stone-600">{a.blurb}</p>
                  <div className="mt-auto flex items-center justify-between pt-3.5">
                    <span className="text-[12px] text-stone-500">{a.date}</span>
                    <Link href={`/blog/${a.slug}`} className="text-[13px] font-bold text-amber-800">
                      Read story ›
                    </Link>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
