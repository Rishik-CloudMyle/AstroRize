import { db } from "../db.ts";
import type { SupportTicket } from "../generated/prisma/client.ts";
import { istDayMonth, istTime } from "./format.ts";
import { isOpen, isMoneyTicket, isTeam, MONEY_TEAMS, MOVES, RAISE_ACTION, teamLabel, type Team } from "./tickets.ts";

// The approval flow of a ticket, as staff see it on the Support case: three boxes, Support ↓ Finance ↓
// Admin, each with who acted, when and what; the box the ticket is in now is highlighted and the boxes
// it never needs are greyed. Built from the audit trail (every move records from → to, who, why), so it
// can never disagree with what happened. The conversation and internal notes are a separate list.

export type StepKey = "support" | "finance" | "admin";
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
  /** "Support", "Finance" (or Compliance / Marketing on a ticket of theirs), "Admin". */
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

const stepOfTeam = (team: string): StepKey => (team === "support" ? "support" : team === "super" ? "admin" : "finance");
const when = (d: Date) => `${istDayMonth(d)}, ${istTime(d)}`;
const TEAM_NAME: Record<string, string> = { super: "Admin" };
const name = (team: string) => TEAM_NAME[team] ?? teamLabel(team);

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
  const visited = new Set<StepKey>(["support"]);
  const events: Record<StepKey, FlowEvent[]> = { support: [], finance: [], admin: [] };
  let middle: Team = "finance";
  const push = (step: StepKey, e: { what: string; who: string; at: Date; self?: boolean }) => {
    visited.add(step);
    events[step].push({ what: e.what, who: e.who, at: e.at.toISOString(), when: when(e.at), self: !!e.self });
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
    const step = role ? stepOfTeam(role) : "support";
    if (role === "compliance" || role === "marketing") middle = role;
    if (MOVES.includes(e.action)) {
      const m = /^(\w+) → (\w+)/.exec(e.diff);
      const to = m?.[2] ?? "";
      if (isTeam(to) && !MONEY_TEAMS.includes(to)) middle = to;
      const verb =
        e.action === "support.ticket.escalate"
          ? "Escalated to"
          : e.action === "support.ticket.route"
            ? to === "support"
              ? "Returned to"
              : "Sent for approval to"
            : "Forwarded to";
      push(m && isTeam(m[1]!) ? stepOfTeam(m[1]!) : step, {
        what: `${verb} ${name(to)}${parts.slice(1).join(" · ") ? ` — ${parts.slice(1).join(" · ")}` : ""}`,
        who: e.actorName,
        at: e.at,
      });
      if (isTeam(to)) visited.add(stepOfTeam(to));
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
  const holderStep = stepOfTeam(holder);
  if (open) visited.add(holderStep);
  if (isTeam(holder) && !MONEY_TEAMS.includes(holder)) middle = holder;

  const needed = (k: StepKey) => (k === "support" ? true : k === "finance" ? money || middle !== "finance" : false);
  const status = (k: StepKey): StepStatus => {
    if (open && holderStep === k) return "current";
    if (visited.has(k)) return "done";
    if (!open) return "notneeded";
    return needed(k) ? "upcoming" : "notneeded";
  };
  const noteFor = (k: StepKey, s: StepStatus): string => {
    if (s === "current") return `With ${name(k === "support" ? "support" : k === "admin" ? "super" : middle)} now`;
    if (s === "notneeded") return k === "admin" ? "Not needed unless escalated" : "Not needed";
    if (s === "upcoming") return k === "finance" ? "Approves money" : "Next";
    return "Done";
  };
  const label: Record<StepKey, string> = { support: "Support", finance: name(middle), admin: "Admin" };
  const steps: FlowStep[] = (["support", "finance", "admin"] as const).map((k) => {
    const s = status(k);
    return { key: k, label: label[k], status: s, note: noteFor(k, s), events: events[k] };
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
