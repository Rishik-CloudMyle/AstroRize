import type { Metadata } from "next";
import Link from "next/link";
import ChangePassword from "@/components/account/change-password";
import LogoutButton from "@/components/logout-button";
import { PageHeader, Panel } from "@/components/portal/ui";

export const metadata: Metadata = { title: "Settings" };

export default function PortalSettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your password, legal pages and signing out." />
      <Panel>
        <h2 className="m-0 text-[16px] font-bold">Password</h2>
        <ChangePassword className="mt-3" />
      </Panel>
      <Panel className="mt-4">
        <h2 className="m-0 mb-2 text-[16px] font-bold">Legal</h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[14px] font-semibold">
          <li><Link href="/terms">Terms &amp; Conditions</Link></li>
          <li><Link href="/privacy">Privacy Policy</Link></li>
          <li><Link href="/portal/profile">Profile &amp; photo</Link></li>
        </ul>
      </Panel>
      <LogoutButton className="mt-4 h-12 rounded-full border border-line bg-white px-6 text-[14.5px] font-bold text-ink">Log out</LogoutButton>
    </div>
  );
}
