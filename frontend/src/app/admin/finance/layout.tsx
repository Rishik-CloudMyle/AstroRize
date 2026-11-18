import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Finance" sub="Payouts, refunds, recharge options and price changes. Every money decision needs a second person: approver and releaser, proposer and approver are never the same." />
      <Suspense>
        <SubNav label="Finance pages" items={[{"href":"/admin/finance","label":"Payouts"},{"href":"/admin/finance/refunds","label":"Refunds"},{"href":"/admin/finance/recharges","label":"Recharges"},{"href":"/admin/finance/price-changes","label":"Price changes"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
