import { Router } from "express";
import { db } from "../../db.ts";
import { forbidden, notFound } from "../../lib/errors.ts";
import { istDate, rupee } from "../../lib/format.ts";
import { requirePage } from "../../lib/rbac.ts";
import { sessionKindLabel } from "../../lib/session-label.ts";
import { customerOf, ticketAccess } from "../../lib/tickets.ts";

// The customer's session history, for the staff handling one of their tickets. Customers never see
// a session reference ("SES-…"): it is the staff-side key that ties a ticket, a refund or a payout
// line back to the consultation in that customer's history. Read-only.
export const customerSessionsRouter = Router();

/** How many recent consultations the panel lists. */
const LIMIT = 25;

const STATUS: Record<string, string> = {
  REQUESTED: "Requested",
  CONNECTING: "Connecting",
  ACTIVE: "In session",
  ENDED: "Ended",
  REJECTED: "Declined",
  TIMED_OUT: "Not answered",
  CANCELLED: "Cancelled",
};

/** Same page and per-ticket access as the case itself (Support, Finance, Super Admin — whoever may open the ticket). */
customerSessionsRouter.get("/support/:id/customer-sessions", async (req, res) => {
  const admin = requirePage(req, "support");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (!ticketAccess(admin, t).view) throw forbidden("You don't have access to this ticket.");
  const customerId = await customerOf(t);
  if (!customerId) return res.json({ alias: t.customerAlias, sessions: [], note: "This report wasn't raised by a customer, so there is no session history." });
  const select = {
    id: true,
    ref: true,
    mode: true,
    kind: true,
    status: true,
    rate: true,
    total: true,
    billedMinutes: true,
    billedSeconds: true,
    requestedAt: true,
    connectedAt: true,
    endedAt: true,
    astrologer: { select: { name: true } },
  } as const;
  const [recent, own] = await Promise.all([
    db.consultation.findMany({ where: { customerId }, orderBy: { requestedAt: "desc" }, take: LIMIT, select }),
    // The ticket's own session is always listed, however old.
    t.sessionRef && t.sessionRef !== "—" ? db.consultation.findFirst({ where: { ref: t.sessionRef, customerId }, select }) : null,
  ]);
  const rows = own && !recent.some((c) => c.id === own.id) ? [...recent, own] : recent;
  res.json({
    alias: t.customerAlias,
    sessions: rows.map((c) => ({
      id: c.id,
      ref: c.ref,
      astrologer: c.astrologer.name,
      mode: sessionKindLabel(c),
      date: istDate(c.connectedAt ?? c.requestedAt),
      minutes: c.billedSeconds > 0 ? Math.max(1, Math.round(c.billedSeconds / 60)) : c.billedMinutes,
      amount: c.total,
      amountLabel: c.total > 0 ? rupee(c.total) : "Free",
      status: STATUS[c.status] ?? c.status,
      /** The session this ticket is about. */
      current: c.ref === t.sessionRef,
    })),
  });
});
