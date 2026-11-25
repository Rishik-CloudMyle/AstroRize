import Link from "next/link";
import ChangePassword from "@/components/account/change-password";
import LogoutButton from "@/components/logout-button";
import { PANEL, PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Settings" };

// Every department's own settings: password and signing out. Department-wide settings live on the Config console.
export default function AdminSettingsPage() {
  return (
    <div>
      <PageTitle title="Settings" sub="Your password and signing out. Your details and verified mobile number are on My profile." />
      <div className={`${PANEL} p-5`}>
        <h2 className="m-0 text-[16px] font-bold">Password</h2>
        <ChangePassword className="mt-3" />
      </div>
      <div className={`${PANEL} mt-4 flex flex-wrap items-center gap-3 p-5`}>
        <Link href="/admin/profile" className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold text-ink hover:no-underline">
          Open My profile
        </Link>
        <LogoutButton className="h-11 rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold text-ink">Log out</LogoutButton>
      </div>
    </div>
  );
}
