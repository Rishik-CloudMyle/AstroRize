import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import { AppTopbar } from "@/components/mobile/page-title";
import { RaiseIssueForm } from "@/components/support/support-views";

export const metadata: Metadata = {
  title: "Raise an issue",
  robots: { index: false },
};

export default function RaiseIssuePage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6 max-lg:p-0! max-lg:pb-8!">
      <div className="lg:hidden">
        <AppTopbar title="Raise an issue" backHref="/support" />
      </div>
      <div className="max-lg:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Help & support", href: "/support" }, { label: "Raise an issue" }]} />
        <h1 className="mb-1 font-display text-[36px] font-semibold text-ink sm:text-[42px]">Raise an issue</h1>
        <p className="mb-6 text-sm text-stone-600">Tell us what went wrong. Our Support team reads every issue and replies on it.</p>
      </div>
      <div className="max-lg:px-4 max-lg:pt-3">
        <RaiseIssueForm />
      </div>
    </div>
  );
}
