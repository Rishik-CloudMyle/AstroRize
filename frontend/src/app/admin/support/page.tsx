import AccessDenied from "@/components/admin/access-denied";
import SupportView from "@/components/admin/support/support-view";
import { PageTitle } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getSupport, getSupportCase } from "@/lib/admin/api";

export const metadata = { title: "Support & disputes" };

export default async function SupportPage({ searchParams }: PageProps<"/admin/support">) {
  if (!(await allowed("support"))) return <AccessDenied />;
  const [data, sp] = await Promise.all([getSupport(), searchParams]);
  const asked = typeof sp.ticket === "string" ? sp.ticket : undefined;
  const ticket = data.tickets.some((t) => t.id === asked) ? (asked as string) : data.tickets[0]?.id;
  const file = ticket ? await getSupportCase(ticket) : null;

  return (
    <div>
      <PageTitle
        title="Support & disputes"
        sub="Platform evidence ranks above customer uploads. Refunds are capped at the billed amount and need a second approver."
      />
      {ticket && file && <SupportView key={asked ?? "all"} data={data} initialTicket={ticket} initialCase={file} />}
    </div>
  );
}
