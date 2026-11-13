import type { Metadata } from "next";
import { Suspense } from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import FixedSessionsView from "@/components/fixed-sessions/fixed-sessions-view";
import { getAstrologers } from "../data";

export const metadata: Metadata = {
  title: "Fixed Sessions",
  description:
    "Prepaid astrology sessions at package discounts. Choose 15, 30, 45, or 60 minutes with verified astrologers.",
};

export default async function FixedSessionsPage() {
  const { astrologers } = await getAstrologers();

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 lg:px-6 max-lg:px-0 max-lg:pt-0 max-lg:pb-12">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Fixed Sessions" }]}
        className="mb-2.5 max-lg:hidden"
      />
      <div className="mb-2 max-lg:hidden">
        <h1 className="font-display text-[36px] font-semibold text-ink sm:text-[42px]">
          Fixed Sessions
        </h1>
        <p className="mt-1.5 text-sm text-stone-600">
          Prepaid consultations with verified astrologers. Choose your sitting duration with guaranteed package pricing.
        </p>
      </div>

      {/* Mobile Top Title Bar */}
      <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 lg:hidden">
        <h1 className="font-display text-xl font-bold text-ink">Fixed Sessions</h1>
        <span className="text-xs font-semibold text-stone-500">
          {astrologers.length} astrologers
        </span>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 h-96 rounded-[20px] border border-line bg-paper max-lg:mx-4" />
        }
      >
        <FixedSessionsView initialAstrologers={astrologers} />
      </Suspense>
    </div>
  );
}
