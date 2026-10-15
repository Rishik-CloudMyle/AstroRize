import AccessDenied from "@/components/admin/access-denied";
import RbacMatrix from "@/components/admin/rbac/rbac-matrix";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getRbac } from "@/lib/admin/api";

export const metadata = { title: "RBAC" };

export default async function RbacPage() {
  if (!(await allowed("rbac"))) return <AccessDenied />;
  const data = await getRbac();

  return (
    <div>
      <PageTitle
        title="RBAC administration"
        sub="Which department can open which page and do which task. Locked rules keep the platform safe, and every change is audited."
      />

      {/* A new saved version (someone saved or reset) starts the grid afresh. */}
      <RbacMatrix key={data.version} data={data} />
    </div>
  );
}
