import Link from "next/link";
import SiteChrome from "@/components/site-chrome";

export default function NotFound() {
  return (
    <SiteChrome>
      <div className="mx-auto max-w-[560px] px-4 py-20 text-center sm:px-6">
        <div className="font-display text-[72px] font-semibold leading-none text-amber-500">404</div>
        <h1 className="mt-3 font-display text-[32px] font-semibold text-ink">This page isn&apos;t in the stars</h1>
        <p className="mt-2 text-sm text-stone-600">The link may be old or mistyped. Try one of these instead.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Link href="/" className="az-cta inline-flex h-11 items-center rounded-full px-6 text-sm font-bold hover:text-cta-ink hover:no-underline">
            Go home
          </Link>
          <Link
            href="/astrologers"
            className="inline-flex h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-bold text-ink hover:text-ink hover:no-underline"
          >
            Browse astrologers
          </Link>
        </div>
      </div>
    </SiteChrome>
  );
}
