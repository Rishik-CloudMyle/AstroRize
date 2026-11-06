import { db } from "../db.ts";
import type { Prisma, SupportTicket } from "../generated/prisma/client.ts";
import type { AuthContext } from "../middleware/auth.ts";
import { istDayMonth, istTime, rupee } from "./format.ts";
import { capabilitiesOf, loadMatrix, pagesOf, ROLE_LABELS, type AdminRoleKey } from "./rbac.ts";

// Customer issues (Help & support): who works a ticket, who may see and act on it, and how it reads
// to the customer.
//
// Routing (client request, Nov 2026): every new issue lands with Support. Support may forward it to
// another team (Finance for refunds and payments, Compliance for astrologer behaviour and safety,
// Marketing for offers, the Super Admin for anything else, including astrologer lifecycle matters —
// there is no separate HR department), with an internal note. The team it is with replies to the
// customer, resolves it or sends it back to Support. Support sees every ticket; another department
// sees only the tickets with it (plus remedies it may approve or has approved); a Super Admin sees all.
// Refunds and wallet credits keep the propose / second-person approve flow (routes/admin/support.ts).

export const TEAMS = ["support", "finance", "compliance", "marketing", "super"] as const;
export type Team = (typeof TEAMS)[number];
export const isTeam = (v: string): v is Team => (TEAMS as readonly string[]).includes(v);

/** The team as staff see it. */
export const teamLabel = (t: string) => (isTeam(t) ? ROLE_LABELS[t as AdminRoleKey] : t);

/** The team in the customer's words (never a person's name). */
export const CUSTOMER_TEAM: Record<Team, string> = {
  support: "Support team",
  finance: "Finance team",
  compliance: "Compliance team",
  marketing: "Marketing team",
  super: "Admin team",
};
const customerTeam = (t: string) => (isTeam(t) ? CUSTOMER_TEAM[t] : CUSTOMER_TEAM.support);

/** What a customer can say an issue is about, and the team it usually ends up with. */
export const CATEGORIES = {
  PAYMENT_REFUND: { label: "Payment / refund", team: "finance" },
  WALLET: { label: "Wallet / recharge", team: "finance" },
  CONSULTATION: { label: "Consultation problem", team: "support" },
  ASTROLOGER: { label: "Astrologer behaviour", team: "compliance" },
  ACCOUNT: { label: "Account / login", team: "support" },
  TECHNICAL: { label: "Technical problem", team: "support" },
  OTHER: { label: "Other", team: "support" },
} as const satisfies Record<string, { label: string; team: Team }>;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as [Category, ...Category[]];
export const categoryLabel = (c: string | null) => (c && c in CATEGORIES ? CATEGORIES[c as Category].label : null);
/** The team a category usually belongs with (Support suggests forwarding there). */
export const suggestedTeam = (c: string | null): Team => (c && c in CATEGORIES ? CATEGORIES[c as Category].team : "support");

// ── Open / closed ──

/**
 * A ticket is closed once it is resolved (rejected, closed, or a free replacement call given) or a
 * refund was approved. An approved remedy closes it whatever older rows say about `state`.
 */
export const CLOSED_STATES = ["RESOLVED", "REFUND_INITIATED"];
export const OPEN_TICKET = { state: { notIn: CLOSED_STATES }, refundState: { not: "INITIATED" } } satisfies Prisma.SupportTicketWhereInput;
export const isOpen = (t: { state: string; refundState: string }) => !CLOSED_STATES.includes(t.state) && t.refundState !== "INITIATED";

/** Reports raised without a session say "—": they share no session with anything. */
export const hasSession = (t: { sessionRef: string }) => t.sessionRef !== "—" && t.sessionRef.trim() !== "";

/**
 * A credit to the customer's wallet from support, on any ticket (with or without a session):
 * proposed by a team with a money capability, approved by a second person (routes/admin/support.ts).
 * The ticket's `state` is CREDIT_PROPOSED while it waits, and `resolution` WALLET_CREDIT once given.
 */
export const CREDIT_PROPOSED = "CREDIT_PROPOSED";
export const WALLET_CREDIT = "WALLET_CREDIT";

// ── Staff access ──

type Admin = AuthContext & { adminRole: AdminRoleKey };

const seesAll = (role: AdminRoleKey) => role === "super" || role === "support";

/** The tickets a department may see (call after the matrix is loaded — the admin router does). */
export function ticketScope(admin: Admin): Prisma.SupportTicketWhereInput {
  if (seesAll(admin.adminRole)) return {};
  const or: Prisma.SupportTicketWhereInput[] = [{ assignedTeam: admin.adminRole }];
  // A proposed remedy waits on whoever may approve it, whichever team has the ticket; once decided they
  // keep seeing it (the approver checks the result, Finance answers for the money).
  if (capabilitiesOf(admin.adminRole).includes("dispute.refund.approve")) or.push({ refundState: { in: ["PROPOSED", "INITIATED"] } });
  return { OR: or };
}

/** The teams a ticket can be forwarded to: every team that can open the Support page, except the one it is with. */
export function forwardTargets(current: string): Team[] {
  return TEAMS.filter((t) => t !== current && (t === "super" || pagesOf(t).includes("support")));
}

/**
 * What this staff member may do on a ticket. The admin UI shows exactly these buttons; the API
 * refuses anything else.
 *  · view: see it at all (Support and Super Admin: every ticket; other departments: theirs).
 *  · act: reply to the customer, forward, resolve, and propose / reject a remedy (with the capability):
 *    only the team it is with, or a Super Admin, and only while it is open.
 *  · note: add a staff-only note, whenever they can see it.
 */
export function ticketAccess(admin: Admin, t: Pick<SupportTicket, "assignedTeam" | "refundState" | "state">) {
  const role = admin.adminRole;
  const pages = pagesOf(role);
  const view =
    pages.includes("support") &&
    (seesAll(role) || t.assignedTeam === role || ((t.refundState === "PROPOSED" || t.refundState === "INITIATED") && capabilitiesOf(role).includes("dispute.refund.approve")));
  const act = view && isOpen(t) && (role === "super" || t.assignedTeam === role);
  return { view, act, note: view };
}

/** The same check from a plain session (e.g. the media route, outside the admin router). */
export async function staffCanView(auth: AuthContext, t: Pick<SupportTicket, "assignedTeam" | "refundState" | "state">) {
  if (auth.role !== "admin" || !auth.adminRole) return false;
  await loadMatrix();
  return ticketAccess(auth as Admin, t).view;
}

// ── The customer's tickets ──

/** The audit action written when a customer raises an issue (older tickets are found by it). */
export const RAISE_ACTION = "support.ticket.raise";

/** Every ticket this customer raised: by customerId, or (before Nov 2026) by their raise audit entry. */
export async function customerTicketWhere(userId: string): Promise<Prisma.SupportTicketWhereInput> {
  const raised = await db.auditLog.findMany({ where: { action: RAISE_ACTION, actorId: userId }, select: { object: true } });
  return { OR: [{ customerId: userId }, ...(raised.length ? [{ id: { in: raised.map((r) => r.object) } }] : [])] };
}

/** The customer of a ticket (to notify them), or null for astrologer / staff reports. */
export async function customerOf(t: Pick<SupportTicket, "id" | "customerId">): Promise<string | null> {
  if (t.customerId) return t.customerId;
  const raised = await db.auditLog.findFirst({ where: { action: RAISE_ACTION, object: t.id }, select: { actorId: true } });
  return raised?.actorId ?? null;
}

export type StatusTone = "now" | "wait" | "done" | "fail";

/** Where an issue stands, in the customer's words. */
export function customerStatus(
  t: Pick<SupportTicket, "state" | "refundState" | "refundAmount" | "resolution" | "assignedTeam" | "awaitingCustomer" | "closedAs" | "sessionRef">,
): { label: string; tone: StatusTone; body: string } {
  if (t.resolution === "MAKE_GOOD") return { label: "Free replacement call given", tone: "done", body: "Book it from the astrologer's profile — see your notifications for how long it is valid." };
  if (t.resolution === WALLET_CREDIT) {
    return { label: `${rupee(t.refundAmount)} credited to your wallet`, tone: "done", body: "It's in your AstroRize wallet — you'll see it under Wallet → Transactions." };
  }
  if (t.resolution === "REFUND" || t.refundState === "INITIATED") {
    return { label: t.refundAmount > 0 ? `${rupee(t.refundAmount)} refunded` : "Refunded", tone: "done", body: "The refund is back in your AstroRize wallet." };
  }
  if (!isOpen(t)) {
    if (t.closedAs === "RESOLVED") return { label: "Resolved", tone: "done", body: "We've marked this issue as resolved. If something is still wrong, raise a new issue." };
    return {
      label: "Closed",
      tone: "fail",
      body: hasSession(t)
        ? "This issue was reviewed and closed. A new request can't be raised for this session."
        : "This issue was reviewed and closed. If you need more help, raise a new issue.",
    };
  }
  if (t.awaitingCustomer) return { label: "Waiting for you", tone: "wait", body: "We've asked you something — reply below so we can carry on." };
  const team = customerTeam(t.assignedTeam);
  return { label: `With our ${team}`, tone: "now", body: `Our ${team} is looking into it. We'll reply here.` };
}

// ── Timeline ──

/** Audit actions on a ticket, as staff read them. */
const STAFF_ACTION: Record<string, string> = {
  "support.ticket.raise": "Raised by the customer",
  "support.ticket.reply": "Replied to the customer",
  "support.ticket.forward": "Forwarded",
  "support.ticket.resolve": "Resolved",
  "support.ticket.close": "Closed",
  "dispute.refund.propose": "Refund proposed",
  "dispute.refund.approve": "Refund approved",
  "dispute.refund.decline": "Refund declined",
  "dispute.makegood.propose": "Free replacement call proposed",
  "dispute.makegood.approve": "Free replacement call approved",
  "dispute.makegood.decline": "Free replacement call declined",
  "dispute.credit.propose": "Wallet credit proposed",
  "dispute.credit.approve": "Wallet credit approved",
  "dispute.credit.decline": "Wallet credit declined",
  "dispute.reject": "Dispute rejected",
  "dispute.close.covered": "Closed as already remedied",
};

/** "support → finance · note" (the forward audit entry). */
const FORWARD = /^(\w+) → (\w+)/;

/** Audit actions the customer sees as a status line (no names, no internal reasons). */
function customerEvent(action: string, diff: string, t: Pick<SupportTicket, "refundAmount">): string | null {
  switch (action) {
    case "support.ticket.forward": {
      const to = FORWARD.exec(diff)?.[2];
      return to ? `Passed to our ${customerTeam(to)}` : null;
    }
    case "dispute.refund.approve":
      return t.refundAmount > 0 ? `${rupee(t.refundAmount)} refunded to your wallet` : "Refunded to your wallet";
    case "dispute.makegood.approve":
      return "Free replacement call given";
    case "dispute.credit.approve":
      return `${rupee(t.refundAmount)} credited to your wallet`;
    case "dispute.reject":
      return "Reviewed and closed";
    case "dispute.close.covered":
      return "Closed — already settled on another request";
    case "support.ticket.resolve":
      return "Marked as resolved";
    case "support.ticket.close":
      return "Closed";
    default:
      return null;
  }
}

const when = (d: Date) => `${istDayMonth(d)}, ${istTime(d)}`;

/** The URL of a screenshot on a ticket message (served only to the customer and staff who can see the ticket). */
export const attachmentUrl = (messageId: string, file: string) => `/api/media/tickets/${encodeURIComponent(messageId)}/${encodeURIComponent(file)}`;

export interface TimelineItem {
  id: string;
  /** customer | reply (staff → customer) | note (staff only) | event (a status change) */
  kind: "customer" | "reply" | "note" | "event";
  /** Who: "You" / the team (customer view); a person's short name and team (staff view). */
  who: string;
  text: string;
  attachmentUrl: string | null;
  at: string;
  when: string;
}

async function ticketHistory(t: SupportTicket) {
  const [messages, entries] = await Promise.all([
    db.supportTicketMessage.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { object: t.id }, orderBy: { at: "asc" } }),
  ]);
  return { messages, entries };
}

const byTime = (a: TimelineItem, b: TimelineItem) => a.at.localeCompare(b.at);

/** The customer's view: their words, the teams' replies and status lines. Internal notes never appear. */
export async function customerTimeline(t: SupportTicket): Promise<TimelineItem[]> {
  const { messages, entries } = await ticketHistory(t);
  const items: TimelineItem[] = [
    { id: `${t.id}-raised`, kind: "customer", who: "You", text: t.description ?? t.subject, attachmentUrl: null, at: t.createdAt.toISOString(), when: when(t.createdAt) },
  ];
  for (const m of messages) {
    if (m.internal) continue;
    items.push({
      id: m.id,
      kind: m.author === "CUSTOMER" ? "customer" : "reply",
      who: m.author === "CUSTOMER" ? "You" : `AstroRize ${customerTeam(m.team ?? "support")}`,
      text: m.text,
      attachmentUrl: m.attachment ? attachmentUrl(m.id, m.attachment) : null,
      at: m.createdAt.toISOString(),
      when: when(m.createdAt),
    });
  }
  for (const e of entries) {
    const text = customerEvent(e.action, e.diff, t);
    if (text) items.push({ id: e.id, kind: "event", who: "AstroRize", text, attachmentUrl: null, at: e.at.toISOString(), when: when(e.at) });
  }
  return items.sort(byTime);
}

/** The staff view: everything, with names, internal notes and every audited step. */
export async function staffTimeline(t: SupportTicket): Promise<TimelineItem[]> {
  const { messages, entries } = await ticketHistory(t);
  const items: TimelineItem[] = [];
  if (t.description) {
    items.push({ id: `${t.id}-raised`, kind: "customer", who: `Customer · ${t.customerAlias}`, text: t.description, attachmentUrl: null, at: t.createdAt.toISOString(), when: when(t.createdAt) });
  }
  for (const m of messages) {
    items.push({
      id: m.id,
      kind: m.author === "CUSTOMER" ? "customer" : m.internal ? "note" : "reply",
      who: m.author === "CUSTOMER" ? `Customer · ${t.customerAlias}` : `${m.authorName}${m.team ? ` · ${teamLabel(m.team)}` : ""}`,
      text: m.text,
      attachmentUrl: m.attachment ? attachmentUrl(m.id, m.attachment) : null,
      at: m.createdAt.toISOString(),
      when: when(m.createdAt),
    });
  }
  for (const e of entries) {
    // Replies and notes already show as messages; the raise shows as the customer's first message.
    if (e.action === "support.ticket.reply" || e.action === "support.ticket.note" || (e.action === RAISE_ACTION && t.description)) continue;
    const label = STAFF_ACTION[e.action] ?? e.action;
    const fwd = e.action === "support.ticket.forward" ? FORWARD.exec(e.diff) : null;
    const text = fwd ? `${label} ${teamLabel(fwd[1]!)} → ${teamLabel(fwd[2]!)}${e.diff.includes(" · ") ? ` · ${e.diff.split(" · ").slice(1).join(" · ")}` : ""}` : `${label} · ${e.diff}`;
    items.push({ id: e.id, kind: "event", who: e.actorName, text, attachmentUrl: null, at: e.at.toISOString(), when: when(e.at) });
  }
  return items.sort(byTime);
}
