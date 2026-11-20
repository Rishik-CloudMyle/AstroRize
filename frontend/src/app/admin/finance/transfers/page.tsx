import AccessDenied from "@/components/admin/access-denied";
import PayoutTransfers from "@/components/admin/finance/payout-transfers";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Finance · Payout transfers" };

export default async function PayoutTransfersPage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  return <PayoutTransfers />;
}
