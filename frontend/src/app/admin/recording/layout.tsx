import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";

export default function RecordingretentionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Recording & retention" sub="What AstroRize keeps from consultations and lives, and for how long. Changes and every listen are recorded in the audit log." />
      <Suspense>
        <SubNav label="Recording & retention pages" items={[{"href":"/admin/recording","label":"What is recorded"},{"href":"/admin/recording/calls","label":"Call recordings"},{"href":"/admin/recording/retention","label":"Retention"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
