import type { Metadata } from "next";
import EarningsView from "@/components/portal/views/earnings-view";
import { getEarnings } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsPage({ searchParams }: PageProps<"/portal/earnings">) {
  const { period } = await searchParams;
  const index = Math.min(2, Math.max(0, Number(Array.isArray(period) ? period[0] : period) || 0));
  const data = await getEarnings(index);
  return <EarningsView data={data} />;
}
