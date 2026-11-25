import AccessDenied from "@/components/admin/access-denied";
import PayoutsView from "@/components/admin/payouts/payouts-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Astrologer payouts" };

export default async function AstrologerPayoutsPage() {
  if (!(await allowed("payouts"))) return <AccessDenied />;
  return (
    <div>
      <PageTitle
        title="Astrologer payouts"
        sub="Check what each astrologer earned for a day, week, 15 days or month, then prepare, approve and release their payout one astrologer at a time. The person who approves can't release."
      />
      <PayoutsView />
    </div>
  );
}
