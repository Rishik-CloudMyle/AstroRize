import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";

export default function TrustreviewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Trust & reviews" sub="Flagged reviews to keep or remove with a reason, off-platform contact attempts, and the rating sample floor." />
      <Suspense>
        <SubNav label="Trust & reviews pages" items={[{"href":"/admin/trust","label":"Reviews"},{"href":"/admin/trust/contact-attempts","label":"Contact attempts"},{"href":"/admin/trust/ranking","label":"Ranking rules"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
