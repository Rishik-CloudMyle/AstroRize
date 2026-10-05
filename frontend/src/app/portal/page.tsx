import type { Metadata } from "next";
import DashboardView from "@/components/portal/views/dashboard-view";
import { getDashboard } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const data = await getDashboard();
  return <DashboardView data={data} />;
}
