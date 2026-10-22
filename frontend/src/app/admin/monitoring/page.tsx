import AccessDenied from "@/components/admin/access-denied";
import MonitoringView from "@/components/admin/monitoring/monitoring-view";
import Suspensions from "@/components/admin/monitoring/suspensions";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getMonitoring, getSuspensions } from "@/lib/admin/api";

export const metadata = { title: "Live monitoring" };

export default async function MonitoringPage() {
  if (!(await allowed("compliance"))) return <AccessDenied />;
  const [data, suspensions] = await Promise.all([getMonitoring(), getSuspensions()]);

  return (
    <div>
      <PageTitle
        title="Live monitoring"
        sub="Who is live right now, and account suspensions. Public lives can be observed watch-only; private consultations are listed for awareness and can never be joined."
      />
      <MonitoringView data={data} />
      <Suspensions data={suspensions} />
    </div>
  );
}
