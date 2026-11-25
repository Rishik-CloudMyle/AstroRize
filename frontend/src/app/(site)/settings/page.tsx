import type { Metadata } from "next";
import Breadcrumbs from "@/components/breadcrumbs";
import CustomerSettings from "@/components/account/customer-settings";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your AstroRize password, data rights and account.",
  robots: { index: false },
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-[860px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Settings" }]} className="mb-2.5 max-lg:hidden" />
      <h1 className="mb-1 font-display text-[36px] font-semibold text-ink sm:text-[42px] max-lg:text-[30px]">Settings</h1>
      <p className="mb-6 text-sm text-stone-600">Change your password, use your data rights, or pause or delete your account.</p>
      <CustomerSettings />
    </div>
  );
}
