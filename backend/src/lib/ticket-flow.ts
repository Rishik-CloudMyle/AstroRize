import { db } from "../db.ts";
import type { SupportTicket } from "../generated/prisma/client.ts";
import { istDayMonth, istTime } from "./format.ts";
import { isOpen, isMoneyTicket, isTeam, MOVES, RAISE_ACTION, suggestedTeam, teamLabel, type Team } from "./tickets.ts";

// The flow of a ticket, as staff see it on the Support case: one box per team it really goes through
// (Support first, then the department its issue belongs with, then any team it is forwarded to; Admin only
// if it is escalated there), each with who acted, when and what; the box the ticket is in now is highlighted. Built from the audit trail (every move records from → to, who, why), so it
// can never disagree with what happened. The conversation and internal notes are a separate list.

export type StepKey = Team;
export type StepStatus = "done" | "current" | "upcoming" | "notneeded";

export interface FlowEvent {
  /** "Proposed refund ₹1", "Escalated to Admin — needs a second look" … */
  what: string;
  who: string;
  at: string;
  when: string;
  /** A Super Admin approved their own proposal. */
  self: boolean;
}
export interface FlowStep {
  key: StepKey;
  /** The team: "Support", "Finance", "Compliance", "Marketing" or "Admin". */
  label: string;
  status: StepStatus;
  /** A short line under the label ("With Finance now", "Not needed"). */
  note: string;
  events: FlowEvent[];
}
export interface TicketFlow {
  money: boolean;
  /** The one team holding the ticket (support | finance | compliance | marketing | super). */
  holder: string;
  holderLabel: string;
  /** "Waiting for Finance to approve ₹1" — who has it and what happens next. */
  next: string;
  steps: FlowStep[];
}

const when = (d: Date) => `${istDayMonth(d)}, ${istTime(d)}`;
const name = (team: string) => (team === "super" ? "Admin" : teamLabel(team));

/** The department an issue of this kind belongs with (Support triages first, then this team). */
export const plannedTeam = (t: Pick<SupportTicket, "category" | "refundState" | "sessionRef">): Team =>
  isMoneyTicket(t) ? "finance" : suggestedTeam(t.category);

export async function ticketFlow(
  t: SupportTicket,
  remedy: { word: string; amount: string } | null,
  closedLabel: { label: string; by: string | null; on: string | null } | null,
): Promise<TicketFlow> {
  const entries = await db.auditLog.findMany({ where: { object: t.id }, orderBy: { at: "asc" } });
  const people = await db.user.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.actorId).filter((x): x is string => !!x))] } },
    select: { id: true, adminRole: true },
  });
  const roleOf = new Map(people.map((p) => [p.id, p.adminRole?.toLowerCase() ?? null]));

  const money = isMoneyTicket(t);
  const open = isOpen(t);
  // The teams in the order the ticket reached them; `visited` are the ones it has really been to.
  const order: Team[] = ["support"];
  const visited = new Set<Team>(["support"]);
  const events: Partial<Record<Team, FlowEvent[]>> = {};
  const visit = (team: string) => {
    if (!isTeam(team)) return;
    visited.add(team);
    if (!order.includes(team)) order.push(team);
  };
  const push = (team: Team, e: { what: string; who: string; at: Date; self?: boolean }) => {
    visit(team);
    (events[team] ??= []).push({ what: e.what, who: e.who, at: e.at.toISOString(), when: when(e.at), self: !!e.self });
  };

  for (const e of entries) {
    if (e.action === "support.ticket.reply" || e.action === "support.ticket.note") continue;
    const parts = e.diff.split(" · ");
    const reason = parts.slice(1).join(" · ");
    const role = e.actorId ? roleOf.get(e.actorId) : null;
    const self = e.diff.includes("self-approved");
    if (e.action === RAISE_ACTION) {
      push("support", { what: "Raised by the customer", who: `Customer · ${t.customerAlias}`, at: e.at });
      continue;
    }
    // The step is the acting person's department (a Super Admin acts as Admin).
    const step: Team = role && isTeam(role) ? role : "support";
    if (MOVES.includes(e.action)) {
      const m = /^(\w+) → (\w+)/.exec(e.diff);
      const from = m?.[1] ?? "";
      const to = m?.[2] ?? "";
      const verb =
        e.action === "support.ticket.escalate"
          ? "Escalated to"
          : e.action === "support.ticket.route"
            ? to === "support"
              ? "Returned to"
              : "Sent for approval to"
            : "Forwarded to";
      push(isTeam(from) ? from : step, {
        what: `${verb} ${name(to)}${reason ? ` — ${reason}` : ""}`,
        who: e.actorName,
        at: e.at,
      });
      visit(to);
      continue;
    }
    const amount = /₹[\d,]+/.exec(e.diff)?.[0] ?? "";
    const label: Record<string, string> = {
      "dispute.refund.propose": `Proposed a refund of ${amount}`,
      "dispute.credit.propose": `Proposed a wallet credit of ${amount}`,
      "dispute.makegood.propose": "Proposed a free replacement call",
      "dispute.refund.approve": `Approved the refund of ${amount}`,
      "dispute.credit.approve": `Approved the wallet credit of ${amount}`,
      "dispute.makegood.approve": "Approved the free replacement call",
      "dispute.refund.decline": `Declined the refund${reason ? ` — ${parts[parts.length - 1]}` : ""}`,
      "dispute.credit.decline": `Declined the wallet credit${reason ? ` — ${parts[parts.length - 1]}` : ""}`,
      "dispute.makegood.decline": `Declined the free replacement call${reason ? ` — ${parts[parts.length - 1]}` : ""}`,
      "dispute.reject": `Rejected the dispute${reason ? ` — ${parts[parts.length - 1]}` : ""}`,
      "dispute.close.covered": "Closed — already remedied on another ticket",
      "support.ticket.resolve": "Resolved",
      "support.ticket.close": "Closed",
    };
    const what = label[e.action];
    if (what) push(step, { what, who: e.actorName, at: e.at, self });
  }

  const holder = t.assignedTeam;
  if (open) visit(holder);
  // Still ahead: the department this kind of issue belongs with. Admin only ever appears once the
  // ticket is really escalated or forwarded there.
  const planned = plannedTeam(t);
  if (open && !order.includes(planned)) order.push(planned);

  const status = (k: Team): StepStatus => (open && holder === k ? "current" : visited.has(k) ? "done" : "upcoming");
  const noteFor = (k: Team, s: StepStatus): string =>
    s === "current" ? `With ${name(k)} now` : s === "done" ? "Done" : k === "finance" && money ? "Approves money" : "Next";
  const steps: FlowStep[] = order.map((k) => {
    const s = status(k);
    return { key: k, label: name(k), status: s, note: noteFor(k, s), events: events[k] ?? [] };
  });

  // Who has it and what happens next.
  const holderName = name(holder);
  let next: string;
  if (!open) {
    next = closedLabel ? `${closedLabel.label}${closedLabel.by ? ` by ${closedLabel.by}` : ""}${closedLabel.on ? ` on ${closedLabel.on}` : ""}` : "Closed";
  } else if (t.refundState === "PROPOSED" && remedy) {
    const who = t.proposedBy ? ` (proposed by ${t.proposedBy})` : "";
    next =
      holder === "super"
        ? `Waiting for Admin to approve the ${remedy.word} of ${remedy.amount}${who}`
        : holder === "finance"
          ? `Waiting for Finance to approve the ${remedy.word} of ${remedy.amount}${who}`
          : `Waiting for an approver to decide the ${remedy.word} of ${remedy.amount}${who}`;
  } else if (money) {
    next =
      holder === "support"
        ? "With Support: verify, then propose a refund or credit, or send it to Finance to approve"
        : holder === "finance"
          ? "With Finance: decide, propose a refund or credit, or escalate to Admin"
          : holder === "super"
            ? "With Admin: the final decision"
            : `With ${holderName}`;
  } else {
    next = `With ${holderName}`;
  }
  if (open && t.awaitingCustomer) next += ". Waiting on the customer's reply";
  return { money, holder, holderLabel: holderName, next, steps };
}

/** The teams a ticket goes through and where it is now — for the customer's view (no names, no notes). */
export async function ticketPath(t: SupportTicket): Promise<{ key: Team; status: StepStatus }[]> {
  const flow = await ticketFlow(t, null, null);
  return flow.steps.map((st) => ({ key: st.key, status: st.status }));
}
