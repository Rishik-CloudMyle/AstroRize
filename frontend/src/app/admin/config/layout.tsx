import { Suspense } from "react";
import SubNav from "@/components/admin/sub-nav";
import { PageTitle } from "@/components/admin/ui";

export default function ConfigconsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageTitle title="Config console" sub="Every operational setting lives here. Changes are drafted, approved by a second person and versioned. Each setting has one platform-wide value." />
      <Suspense>
        <SubNav label="Config console pages" items={[{"href":"/admin/config","label":"All settings"},{"href":"/admin/config/fixed-sessions","label":"Fixed Sessions"}]} />
      </Suspense>
      <div className="mt-1">{children}</div>
    </div>
  );
}
