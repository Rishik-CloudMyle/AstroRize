import AccessDenied from "@/components/admin/access-denied";
import FinanceView from "@/components/admin/finance/finance-view";
import { KpiCard, PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getFinance } from "@/lib/admin/api";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  const data = await getFinance();

  return (
    <div>
      <PageTitle
        title="Finance"
        sub="Denominations, tax profiles, cashback floors and the payout pipeline. Approver and releaser are never the same actor."
      />
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {data.kpis.map((k) => (
          <KpiCard key={k.label} {...k} valueSize="text-[24px]" />
        ))}
      </div>
      <FinanceView data={data} />
    </div>
  );
}
