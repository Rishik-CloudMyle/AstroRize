import AccessDenied from "@/components/admin/access-denied";
import FinanceView from "@/components/admin/finance/finance-view";
import PayoutHoldsPanel from "@/components/admin/finance/payout-holds";
import { KpiCard } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getFinance } from "@/lib/admin/api";
import { getPayoutHolds } from "@/lib/admin/payout-holds";

export const metadata = { title: "Finance · Payouts" };

export default async function FinancePayoutsPage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  const [data, holds] = await Promise.all([getFinance(), getPayoutHolds()]);
  return (
    <>
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {data.kpis.map((k) => (
          <KpiCard key={k.label} {...k} valueSize="text-[24px]" />
        ))}
      </div>
      <FinanceView data={data} part="payouts" />
      <PayoutHoldsPanel data={holds} />
    </>
  );
}
