import AccessDenied from "@/components/admin/access-denied";
import AuditView from "@/components/admin/audit/audit-view";
import { allowed } from "@/lib/admin/guard";
import { getAuditLog } from "@/lib/admin/api";
import { AUDIT_SORTS, pickSort } from "@/lib/admin/sort";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  if (!(await allowed("audit"))) return <AccessDenied />;
  const sort = pickSort(AUDIT_SORTS, (await searchParams).sort);
  const entries = await getAuditLog(sort);
  return <AuditView entries={entries} initialSort={sort} />;
}
