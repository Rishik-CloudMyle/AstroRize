import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";
import { getRefundsBadge } from "@/lib/admin/api";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const refunds = await getRefundsBadge();
  return (
    <div>
      <PageTitle title="Finance" sub="Payouts, refunds, recharge options and price changes. Every money decision needs a second person: approver and releaser, proposer and approver are never the same." />
      <Suspense>
        <SubNav label="Finance pages" items={[{"href":"/admin/finance","label":"Payouts"},{"href":"/admin/finance/transfers","label":"Transfers"},{"href":"/admin/finance/reconciliation","label":"Reconciliation"},{"href":"/admin/finance/refunds","label":"Refunds","badge":refunds},{"href":"/admin/finance/recharges","label":"Recharges"},{"href":"/admin/finance/price-changes","label":"Price changes"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
