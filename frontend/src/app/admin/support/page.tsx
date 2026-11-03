import AccessDenied from "@/components/admin/access-denied";
import SupportView from "@/components/admin/support/support-view";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getSupport, getSupportCase } from "@/lib/admin/api";
import { pickSort, sortRows, TICKET_SORTS } from "@/lib/admin/sort";

export const metadata = { title: "Support & disputes" };

export default async function SupportPage({ searchParams }: PageProps<"/admin/support">) {
  if (!(await allowed("support"))) return <AccessDenied />;
  const [data, sp] = await Promise.all([getSupport(), searchParams]);
  const asked = typeof sp.ticket === "string" ? sp.ticket : undefined;
  const sort = pickSort(TICKET_SORTS, sp.sort);
  // With no ?ticket=, open the top ticket of the open queue in the chosen order (a resolved one when none is open).
  const sorted = sortRows(data.tickets, TICKET_SORTS, sort);
  const ticket = data.tickets.some((t) => t.id === asked) ? (asked as string) : (sorted.find((t) => t.open) ?? sorted[0])?.id;
  const file = ticket ? await getSupportCase(ticket) : null;

  return (
    <div>
      <PageTitle
        title="Support & disputes"
        sub="Platform evidence ranks above customer uploads. Refunds are capped at the billed amount and need a second approver."
      />
      {ticket && file ? (
        <SupportView key={asked ?? "all"} data={data} initialTicket={ticket} initialCase={file} />
      ) : (
        <div className={`${PANEL} mt-5 p-6 text-center text-[13px] text-[#78716c]`}>
          No tickets yet. Disputes and reports appear here as soon as one is raised.
        </div>
      )}
    </div>
  );
}
