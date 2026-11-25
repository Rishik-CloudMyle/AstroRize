import AccessDenied from "@/components/admin/access-denied";
import HandoverView from "@/components/admin/handover/handover-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";

export const metadata = { title: "Super Admin handover" };

export default async function HandoverPage() {
  if (!(await allowed("team"))) return <AccessDenied />;
  return (
    <div>
      <PageTitle title="Super Admin handover" sub="Give the Super Admin role to someone else for a time, or permanently as a second handler. Confirmed by a code sent to your mobile number." />
      <HandoverView />
    </div>
  );
}
