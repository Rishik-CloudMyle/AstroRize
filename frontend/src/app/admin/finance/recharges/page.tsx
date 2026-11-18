import AccessDenied from "@/components/admin/access-denied";
import FinanceView from "@/components/admin/finance/finance-view";
import RechargePaymentsPanel from "@/components/admin/finance/recharge-payments";
import { allowed } from "@/lib/admin/guard";
import { getFinance } from "@/lib/admin/api";
import { getPayments } from "@/lib/admin/payments";

export const metadata = { title: "Finance · Recharges" };

export default async function FinanceRechargesPage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  const [data, payments] = await Promise.all([getFinance(), getPayments()]);
  return (
    <>
      <FinanceView data={data} part="recharge" />
      <RechargePaymentsPanel data={payments} />
    </>
  );
}
