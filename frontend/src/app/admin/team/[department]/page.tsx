import { notFound } from "next/navigation";
import Link from "next/link";
import AccessDenied from "@/components/admin/access-denied";
import TeamView from "@/components/admin/team/team-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getStaff } from "@/lib/admin/api";

export const metadata = { title: "Department" };

/** One department's own page: its people, and the form to add someone to it. */
export default async function DepartmentPage({ params }: { params: Promise<{ department: string }> }) {
  if (!(await allowed("team"))) return <AccessDenied />;
  const { department } = await params;
  const all = await getStaff();
  const dept = all.find((d) => d.role === department);
  if (!dept) notFound();
  return (
    <div>
      <p className="m-0 mb-2 text-[12.5px]">
        <Link href="/admin/team">← All departments</Link>
      </p>
      <PageTitle title={`${dept.label} team`} sub={`The people in ${dept.label}, with their own logins. Every change is recorded in the audit log.`} />
      <TeamView departments={[dept]} />
    </div>
  );
}
