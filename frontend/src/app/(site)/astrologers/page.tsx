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
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Astrologers" }]} />
      <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px]">Astrologers</h1>
      <p className="mt-1.5 text-sm text-stone-600">
        {total} verified practitioners. Filters change the URL, so you can share or bookmark any view.
      </p>
      {/* The directory reads filters from the URL, so it renders in the browser. */}
      <Suspense fallback={<div className="mt-[26px] h-96 rounded-[20px] border border-line bg-paper" />}>
        <DirectoryView astrologers={astrologers} />
      </Suspense>
    </div>
  );
}
