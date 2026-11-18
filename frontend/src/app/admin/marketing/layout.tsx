import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Marketing" sub="Campaign offers customers claim, the gift catalogue and a copy check. Approval and activation are done by an Admin, not by Marketing." />
      <Suspense>
        <SubNav label="Marketing pages" items={[{"href":"/admin/marketing","label":"Campaigns"},{"href":"/admin/marketing/gifts","label":"Gift catalogue"},{"href":"/admin/marketing/copy-check","label":"Copy check"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
