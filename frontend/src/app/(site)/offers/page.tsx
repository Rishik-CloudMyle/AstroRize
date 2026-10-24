import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import OffersView from "@/components/offers/offers-view";

export const metadata: Metadata = {
  title: "Offers",
  description: "Astrorize offers: recharge cashback, consultation discounts and bonus credit. Claim an offer and it applies automatically.",
};

export default function OffersPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      {/* Phones and tablets: the app's title bar. */}
      <div className="lg:hidden">
        <AppTopbar title="Offers" />
        <p className="mx-4 mt-3 mb-3 text-[12px] leading-[1.45] text-app-ink-2">
          Claim an offer first — it then applies automatically: cashback at your next recharge, a discount on your next
          consultation, or bonus credit straight to your wallet.
        </p>
      </div>
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Offers" }]} />
        <h1 className="font-display text-[36px] font-semibold leading-tight text-ink sm:text-[42px]">Offers</h1>
        <p className="mb-6 mt-1.5 max-w-[62ch] text-[14.5px] leading-normal text-stone-600">
          Claim an offer first — it then applies automatically: cashback at your next recharge, a discount on your next
          consultation, or bonus credit straight to your wallet.
        </p>
      </div>
      <div className="max-lg:px-4">
        <OffersView />
      </div>
    </div>
  );
}
