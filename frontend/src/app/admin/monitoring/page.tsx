import AccessDenied from "@/components/admin/access-denied";
import MonitoringView from "@/components/admin/monitoring/monitoring-view";
import { allowed } from "@/lib/admin/guard";
import { getMonitoring } from "@/lib/admin/api";

export const metadata = { title: "Live monitoring" };

export default async function MonitoringPage() {
  if (!(await allowed("compliance"))) return <AccessDenied />;
  return <MonitoringView data={await getMonitoring()} />;
}
