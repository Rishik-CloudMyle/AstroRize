import AccessDenied from "@/components/admin/access-denied";
import DisputeRefundsPanel from "@/components/admin/finance/dispute-refunds";
import WalletRefundsPanel from "@/components/admin/finance/wallet-refunds";
import { allowed } from "@/lib/admin/guard";
import { getFinance } from "@/lib/admin/api";
import { getWalletRefunds } from "@/lib/admin/refunds";

export const metadata = { title: "Finance · Refunds" };

export default async function FinanceRefundsPage() {
  if (!(await allowed("finance"))) return <AccessDenied />;
  const [data, refunds] = await Promise.all([getFinance(), getWalletRefunds()]);
  return (
    <>
      <DisputeRefundsPanel refunds={data.disputeRefunds} />
      <WalletRefundsPanel data={refunds} />
    </>
  );
}
