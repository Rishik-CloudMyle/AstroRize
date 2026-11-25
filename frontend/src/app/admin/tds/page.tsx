import AccessDenied from "@/components/admin/access-denied";
import TdsView from "@/components/admin/tds/tds-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "TDS" };

export default async function TdsPage() {
  if (!(await allowed("tds"))) return <AccessDenied />;
  return (
    <div>
      <PageTitle
        title="TDS"
        sub="The global TDS rates and thresholds, and each astrologer's own settings: residential status, billing address, PAN and any custom rate. Finance proposes; a Super Admin acknowledges."
      />
      <TdsView />
    </div>
  );
}
