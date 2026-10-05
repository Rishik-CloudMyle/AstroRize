import AccessDenied from "@/components/admin/access-denied";
import MonitoringView from "@/components/admin/monitoring/monitoring-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getMonitoring } from "@/lib/admin/api";

export const metadata = { title: "Live monitoring" };

export default async function MonitoringPage() {
  if (!(await allowed("compliance"))) return <AccessDenied />;
  const data = await getMonitoring();

  return (
    <div>
      <PageTitle
        title="Live monitoring"
        sub="Public lives only. Observers can never publish. Private lives are always denied."
      />
      <MonitoringView data={data} />
    </div>
  );
}
