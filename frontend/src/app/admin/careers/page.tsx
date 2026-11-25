import AccessDenied from "@/components/admin/access-denied";
import CareersView, { type Application } from "@/components/admin/careers/careers-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { apiGet } from "@/lib/api/server";

export const metadata = { title: "Careers" };

export default async function CareersPage() {
  if (!(await allowed("hr"))) return <AccessDenied />;
  const { applications } = await apiGet<{ applications: Application[] }>("/admin/careers");
  return (
    <div>
      <PageTitle title="Careers" sub="Applications sent from the website's Careers form, for any role. Read the message, download the resume and mark where each application stands." />
      <CareersView initial={applications} />
    </div>
  );
}
