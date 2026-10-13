import AccessDenied from "@/components/admin/access-denied";
import DisputeRefundsPanel from "@/components/admin/finance/dispute-refunds";
import FinanceView from "@/components/admin/finance/finance-view";
import WalletRefundsPanel from "@/components/admin/finance/wallet-refunds";
import { KpiCard, PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getFinance } from "@/lib/admin/api";
import { getWalletRefunds } from "@/lib/admin/refunds";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  const [data, refunds] = await Promise.all([getFinance(), getWalletRefunds()]);

  return (
    <div>
      <PageTitle
        title="Finance"
        sub="Payouts, refunds, recharge denominations and the cashback floor. Every money decision needs a second person: approver and releaser, proposer and approver are never the same."
      />
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {data.kpis.map((k) => (
          <KpiCard key={k.label} {...k} valueSize="text-[24px]" />
        ))}
      </div>
      <FinanceView data={data} />
      <DisputeRefundsPanel refunds={data.disputeRefunds} />
      <WalletRefundsPanel data={refunds} />
    </div>
  );
}
