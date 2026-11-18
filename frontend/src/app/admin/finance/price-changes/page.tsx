import AccessDenied from "@/components/admin/access-denied";
import PriceChangesPanel from "@/components/admin/finance/price-changes";
import { allowed } from "@/lib/admin/guard";
import { getPriceChanges } from "@/lib/admin/price-changes";

export const metadata = { title: "Finance · Price changes" };

export default async function FinancePriceChangesPage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  return <PriceChangesPanel changes={await getPriceChanges()} />;
}
