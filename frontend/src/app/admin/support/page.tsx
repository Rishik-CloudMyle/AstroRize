import AccessDenied from "@/components/admin/access-denied";
import SupportView from "@/components/admin/support/support-view";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getSession, getSupport, getSupportCase } from "@/lib/admin/api";
import { pickSort, sortRows, TICKET_SORTS } from "@/lib/admin/sort";

export const metadata = { title: "Support & disputes" };

export default async function SupportPage({ searchParams }: PageProps<"/admin/support">) {
  if (!(await allowed("support"))) return <AccessDenied />;
  const [data, sp, session] = await Promise.all([getSupport(), searchParams, getSession()]);
  // Support and the Super Admin work every ticket; another department sees the issues forwarded to it.
  const hub = session.role === "super" || session.role === "support";
  const teamName = { finance: "Finance", compliance: "Compliance", marketing: "Marketing" }[session.role as string] ?? "your team";
  const asked = typeof sp.ticket === "string" ? sp.ticket : undefined;
  const sort = pickSort(TICKET_SORTS, sp.sort);
  // With no ?ticket=, open the top ticket of the open queue in the chosen order (a resolved one when none is open).
  const sorted = sortRows(data.tickets, TICKET_SORTS, sort);
  const ticket = data.tickets.some((t) => t.id === asked) ? (asked as string) : (sorted.find((t) => t.open) ?? sorted[0])?.id;
  const file = ticket ? await getSupportCase(ticket) : null;
  // A link to a ticket this person can't see (any more): e.g. it was forwarded to another team since.
  const gone = asked && ticket !== asked ? asked : null;

  return (
    <div>
      <PageTitle
        title="Support & disputes"
        sub={
          hub
            ? "Every customer issue lands here first; forward it to the team that should handle it. Platform evidence ranks above customer uploads. Refunds are capped at the billed amount and need a second approver."
            : `Customer issues Support forwarded to ${teamName}. Reply to the customer, resolve it, or send it back to Support. Internal notes are never shown to the customer.`
        }
      />
      {gone && (
        <p role="status" className="mt-4 mb-0 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[12.5px] text-[#92400e]">
          {gone} isn&apos;t in your queue any more — it may have been passed to another team.
        </p>
      )}
      {ticket && file ? (
        <SupportView key={asked ?? "all"} data={data} initialTicket={ticket} initialCase={file} focus={ticket === asked} />
      ) : (
        <div className={`${PANEL} mt-5 p-6 text-center text-[13px] text-[#78716c]`}>
          {hub ? "No tickets yet. Disputes and reports appear here as soon as one is raised." : `No issues with ${teamName} right now. They appear here when Support forwards one.`}
        </div>
      )}
    </div>
  );
}
