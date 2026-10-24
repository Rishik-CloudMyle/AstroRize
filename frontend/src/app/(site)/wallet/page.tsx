import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import WalletView from "@/components/wallet/wallet-view";

export const metadata: Metadata = {
  title: "Wallet & account",
  description: "Your Astrorize wallet balance, recharges, transactions and data rights.",
  robots: { index: false },
};

export default function WalletPage() {
  return (
    // Phones and tablets: the wallet draws its own app-look screens (title bar included), edge to edge.
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0!">
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wallet & account" }]} />
        <h1 className="mb-1 font-display text-[36px] font-semibold text-ink sm:text-[42px]">Wallet &amp; account</h1>
        <p className="mb-6 text-sm text-stone-600">
          Recharge, see every transaction and manage your data. GST is added on top and never reduces your credit.
        </p>
      </div>
      <WalletView />
    </div>
  );
}
