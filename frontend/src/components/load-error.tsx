"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page can't load its data (for example the API is restarting). */
export default function LoadError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[560px] px-4 py-20 text-center sm:px-6">
      <div className="font-display text-[56px] font-semibold leading-none text-amber-500">✦</div>
      <h1 className="mt-3 font-display text-[32px] font-semibold text-ink">We couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-stone-600">Something interrupted the connection. Please try again in a moment.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <button type="button" onClick={retry} className="az-cta inline-flex h-11 items-center rounded-full px-6 text-sm font-bold">
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-bold text-ink hover:text-ink hover:no-underline"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
