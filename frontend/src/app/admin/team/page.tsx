import AccessDenied from "@/components/admin/access-denied";
import TeamView from "@/components/admin/team/team-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getStaff } from "@/lib/admin/api";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  if (!(await allowed("team"))) return <AccessDenied />;
  const departments = await getStaff();

  return (
    <div>
      <PageTitle
        title="Team"
        sub="The people in each department. Everyone has their own login, so one person can cover when another is away. Every change is recorded in the audit log."
      />
      <TeamView departments={departments} />
    </div>
  );
}
