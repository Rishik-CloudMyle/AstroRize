import AccessDenied from "@/components/admin/access-denied";
import Reconciliation from "@/components/admin/finance/reconciliation";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Finance · Reconciliation" };

export default async function ReconciliationPage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  return <Reconciliation />;
}
