import AccessDenied from "@/components/admin/access-denied";
import AstroHelpView from "@/components/admin/astro-help/astro-help-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { apiGet } from "@/lib/api/server";

export const metadata = { title: "Astrologer help" };

export default async function AstroHelpPage() {
  if (!(await allowed("astrohelp"))) return <AccessDenied />;
  const { issues } = await apiGet<{ issues: React.ComponentProps<typeof AstroHelpView>["initial"] }>("/admin/astro-help");
  return (
    <div>
      <PageTitle title="Astrologer help" sub="Issues astrologers raised from their portal. HR, Finance or Compliance answer the ones with them; oldest first, red means waiting longest." />
      <AstroHelpView initial={issues} />
    </div>
  );
}
