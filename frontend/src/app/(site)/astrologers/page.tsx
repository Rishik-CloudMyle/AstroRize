import type { Metadata } from "next";
import { Suspense } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import DirectoryView from "@/components/directory/directory-view";
import { getAstrologers } from "../data";

export const metadata: Metadata = {
  title: "Astrologers",
  description: "Browse verified astrologers by skill, language, availability and price. Chat, voice or video.",
};

export default async function AstrologersPage() {
  const { astrologers, total } = await getAstrologers();

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 lg:px-6 max-lg:px-0 max-lg:pt-0 max-lg:pb-0">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Astrologers" }]} className="mb-2.5 max-lg:hidden" />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:hidden">Astrologers</h1>
      <p className="mt-1.5 text-sm text-stone-600 max-lg:hidden">
        {total} verified practitioners. Filter by skill, language, price and more to find the right one for you.
      </p>
      {/* The directory reads filters from the URL, so it renders in the browser. */}
      <Suspense fallback={<div className="mt-[26px] h-96 rounded-[20px] border border-line bg-paper max-lg:mx-4 max-lg:mt-3" />}>
        <DirectoryView astrologers={astrologers} />
      </Suspense>
    </div>
  );
}
