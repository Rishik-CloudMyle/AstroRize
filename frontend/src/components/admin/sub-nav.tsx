"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type SubNavItem = { href: string; label: string; badge?: number };

/** The pages inside one area of the console (Finance → Payouts, Refunds…), each its own page. */
export default function SubNav({ items, label }: { items: SubNavItem[]; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = items.reduce<string | null>((best, it) => {
    const [path, q] = it.href.split("?");
    if (path !== pathname) return best;
    if (q) {
      const want = new URLSearchParams(q);
      for (const [k, v] of want) if (search.get(k) !== v) return best;
      return it.href;
    }
    return best ?? it.href;
  }, null);
  return (
    <nav aria-label={label} className="mt-[18px] flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3.5 pt-1 pb-2.5 text-[13.5px] font-bold whitespace-nowrap hover:no-underline max-[420px]:px-2.5 ${
              on ? "border-amber-500 text-ink hover:text-ink" : "border-transparent text-[#78716c] hover:text-ink"
            }`}
          >
            {t.label}
            {!!t.badge && (
              <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10.5px] font-extrabold text-ink tabular-nums">
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
