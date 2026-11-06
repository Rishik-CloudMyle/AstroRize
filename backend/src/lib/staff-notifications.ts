import { db } from "../db.ts";
import type { AdminRole } from "../generated/prisma/client.ts";
import { rupee } from "./format.ts";
import { notifyMany } from "./notifications.ts";
import { capabilitiesOf, loadMatrix, pagesOf, ROLE_LABELS, ROLE_ORDER, type AdminRoleKey } from "./rbac.ts";

// In-app notifications for staff (the admin console's bell) about customer issues: a new issue, a
// customer's reply, a forward, a refund or free call waiting for its second approver, and its
// decision. Recipients are active staff found by department (RBAC matrix in force); deactivated
// accounts never get one, and nobody is told about something they did themselves.
//
// A notification never fails the action that caused it: the action is already saved when these
// run, so a failure is logged and the bell simply misses that one.

/** Opens the ticket on the Support page (the page opens the ?ticket= one). */
export const ticketHref = (id: string) => `/admin/support?ticket=${encodeURIComponent(id)}`;

/** "Finance team", "Support team"; the Super Admins are not a "team" to staff. */
const teamName = (role: string) => (role === "super" ? "Super Admins" : `${ROLE_LABELS[role as AdminRoleKey] ?? role} team`);

const snippet = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

interface Person {
  id: string;
  role: AdminRoleKey;
}

/** Active staff of these departments, without the people in `except`. */
async function staffOf(roles: AdminRoleKey[], except: (string | null | undefined)[] = []): Promise<Person[]> {
  const known = [...new Set(roles)].filter((r) => ROLE_ORDER.includes(r));
  if (!known.length) return [];
  const rows = await db.user.findMany({
    where: { role: "ADMIN", active: true, adminRole: { in: known.map((r) => r.toUpperCase() as AdminRole) } },
    select: { id: true, adminRole: true },
  });
  return rows.filter((r) => r.adminRole && !except.includes(r.id)).map((r) => ({ id: r.id, role: r.adminRole!.toLowerCase() as AdminRoleKey }));
}

/**
 * One notification for each person, linking to the ticket on Support — or to `elsewhere` for a
 * department whose matrix doesn't open Support (e.g. Finance deciding refunds on its own page).
 */
async function send(people: Person[], ticketId: string, n: { kind: string; title: string; body: string }, elsewhere = "/admin") {
  const byHref = new Map<string, string[]>();
  for (const p of people) {
    const href = p.role === "super" || pagesOf(p.role).includes("support") ? ticketHref(ticketId) : elsewhere;
    byHref.set(href, [...(byHref.get(href) ?? []), p.id]);
  }
  for (const [href, ids] of byHref) await notifyMany([...new Set(ids)], { ...n, href });
}

async function safely(what: string, fn: () => Promise<void>) {
  try {
    await loadMatrix();
    await fn();
  } catch (e) {
    console.error(`Couldn't notify staff (${what}):`, e instanceof Error ? e.message : e);
  }
}

/** A customer raised an issue: everyone in Support, and the Super Admins. */
export function staffNewIssue(t: { id: string; subject: string; customerAlias: string }, category: string | null) {
  return safely("new issue", async () => {
    const people = await staffOf(["support", "super"]);
    await send(people, t.id, {
      kind: "staff.ticket.new",
      title: `New issue ${t.id}${category ? ` · ${category}` : ""}`,
      body: `${t.customerAlias}: ${snippet(t.subject)}`,
    });
  });
}

/**
 * The customer replied: the team the ticket is with, plus the staff member who last replied to the
 * customer or forwarded it (when they are in another team now), if still active.
 */
export function staffCustomerReplied(t: { id: string; assignedTeam: string; customerAlias: string }, text: string) {
  return safely("customer reply", async () => {
    const [lastMessage, lastForward] = await Promise.all([
      db.supportTicketMessage.findFirst({ where: { ticketId: t.id, author: "STAFF", internal: false, authorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { authorId: true, createdAt: true } }),
      db.auditLog.findFirst({ where: { object: t.id, action: "support.ticket.forward", actorId: { not: null } }, orderBy: { at: "desc" }, select: { actorId: true, at: true } }),
    ]);
    const last = lastForward && (!lastMessage || lastForward.at > lastMessage.createdAt) ? lastForward.actorId : lastMessage?.authorId;
    const team = await staffOf([t.assignedTeam as AdminRoleKey]);
    const extra = last && !team.some((p) => p.id === last) ? await db.user.findFirst({ where: { id: last, role: "ADMIN", active: true }, select: { id: true, adminRole: true } }) : null;
    const people = extra?.adminRole ? [...team, { id: extra.id, role: extra.adminRole.toLowerCase() as AdminRoleKey }] : team;
    await send(people, t.id, {
      kind: "staff.ticket.customer_reply",
      title: `Customer replied on ${t.id}`,
      body: `${t.customerAlias}: ${snippet(text)}`,
    });
  });
}

/**
 * Forwarded to another team: everyone in that team (and the Super Admins), never the forwarder.
 * Sent back to Support: the Support team.
 */
export function staffForwarded(t: { id: string }, to: string, note: string, actor: { id: string; name: string }) {
  return safely("forward", async () => {
    const back = to === "support";
    const people = await staffOf(back ? ["support"] : [to as AdminRoleKey, "super"], [actor.id]);
    await send(people, t.id, {
      kind: back ? "staff.ticket.returned" : "staff.ticket.forwarded",
      title: back ? `${t.id} sent back to Support by ${actor.name}` : `${t.id} forwarded to ${teamName(to)} by ${actor.name}`,
      body: snippet(note),
    });
  });
}

/** A refund or free replacement call was proposed: whoever may approve it (not the proposer), and the Super Admins. */
export function staffRemedyProposed(
  t: { id: string },
  what: { refund: number } | { minutes: number } | { credit: number; bucket: string },
  actor: { id: string; name: string },
) {
  return safely("remedy proposed", async () => {
    const approvers = ROLE_ORDER.filter((r) => r === "super" || capabilitiesOf(r).includes("dispute.refund.approve"));
    const people = await staffOf(approvers, [actor.id]);
    const label =
      "refund" in what
        ? `Refund of ${rupee(what.refund)}`
        : "credit" in what
          ? `Wallet credit of ${rupee(what.credit)} (${what.bucket} balance)`
          : `Free ${what.minutes}-minute replacement call`;
    await send(
      people,
      t.id,
      { kind: "staff.remedy.proposed", title: `${label} proposed on ${t.id}`, body: `Proposed by ${actor.name}. It needs a second person to approve or decline it.` },
      "/admin/finance",
    );
  });
}

/** The second approver decided: the person who proposed it (unless they decided it themselves). */
export function staffRemedyDecided(
  t: { id: string },
  proposerId: string | null,
  outcome: { approved: boolean; makeGood: boolean; credit?: boolean; reason?: string },
  actor: { id: string; name: string },
) {
  return safely("remedy decided", async () => {
    if (!proposerId || proposerId === actor.id) return;
    const proposer = await db.user.findFirst({ where: { id: proposerId, role: "ADMIN", active: true }, select: { id: true, adminRole: true } });
    if (!proposer?.adminRole) return;
    const people = [{ id: proposer.id, role: proposer.adminRole.toLowerCase() as AdminRoleKey }];
    const what = outcome.credit ? "Wallet credit" : outcome.makeGood ? "Free replacement call" : "Refund";
    await send(
      people,
      t.id,
      {
        kind: outcome.approved ? "staff.remedy.approved" : "staff.remedy.declined",
        title: `${what} on ${t.id} ${outcome.approved ? "approved" : "declined"} by ${actor.name}`,
        body: outcome.approved ? "The customer has been told." : `Reason: ${snippet(outcome.reason ?? "—")}`,
      },
      "/admin/finance",
    );
  });
}
