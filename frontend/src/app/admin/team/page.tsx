import AccessDenied from "@/components/admin/access-denied";
import Link from "next/link";
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
      <p className="mt-3 mb-0">
        <Link href="/admin/handover" className="inline-flex h-10 items-center rounded-xl bg-amber-500 px-4 text-[13px] font-bold text-ink hover:no-underline">
          Hand over the Super Admin role ›
        </Link>
      </p>
      <TeamView departments={departments} />
    </div>
  );
}
