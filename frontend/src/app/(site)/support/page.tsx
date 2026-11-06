import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import { MyIssues } from "@/components/support/support-views";

export const metadata: Metadata = {
  title: "Help & support",
  description: "Raise an issue with the AstroRize team and follow the ones you raised.",
  robots: { index: false },
};

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <div className="lg:hidden">
        <AppTopbar title="Help & support" backHref="/me" />
      </div>
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wallet & account", href: "/wallet" }, { label: "Help & support" }]} />
        <h1 className="mb-1 font-display text-[36px] font-semibold text-ink sm:text-[42px]">Help &amp; support</h1>
        <p className="mb-6 text-sm text-stone-600">Raise an issue with our team and follow every reply here.</p>
      </div>
      <div className="max-lg:px-4 max-lg:pt-3">
        <MyIssues />
      </div>
    </div>
  );
}
