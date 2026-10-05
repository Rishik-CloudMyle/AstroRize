import AccessDenied from "@/components/admin/access-denied";
import AuditView from "@/components/admin/audit/audit-view";
import { allowed } from "@/lib/admin/guard";
import { getAuditLog } from "@/lib/admin/api";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  if (!(await allowed("audit"))) return <AccessDenied />;
  const entries = await getAuditLog();
  return <AuditView entries={entries} />;
}
