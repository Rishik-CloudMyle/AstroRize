import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";

export default function LivemonitoringLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Live monitoring" sub="Who is live right now, and account suspensions. Public lives can be observed watch-only; private consultations are listed for awareness and can never be joined." />
      <Suspense>
        <SubNav label="Live monitoring pages" items={[{"href":"/admin/monitoring","label":"Live now"},{"href":"/admin/monitoring/suspensions","label":"Suspensions"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
