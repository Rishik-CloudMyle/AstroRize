import type { Metadata } from "next";
import EarningsView from "@/components/portal/views/earnings-view";
import { getEarnings } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsPage({ searchParams }: PageProps<"/portal/earnings">) {
  const { period, range } = await searchParams;
  const index = Math.min(40, Math.max(0, Number(Array.isArray(period) ? period[0] : period) || 0));
  const picked = Array.isArray(range) ? range[0] : range;
  const data = await getEarnings(index, picked === "daily" || picked === "weekly" || picked === "monthly" ? picked : "fortnight");
  return <EarningsView data={data} />;
}
