import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istDayMonth, istTime, makeRef, rupee } from "../../lib/format.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";
import { getSetting } from "../../lib/settings.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Support & disputes: tickets, the metering evidence, and maker-checker refunds.
export const supportRouter = Router();

function slaLabel(due: Date, now: Date) {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return { label: "Breached", tone: "breached" };
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return { label: `${Math.max(1, hours)}h left`, tone: "urgent" };
  const days = Math.floor(hours / 24);
  return { label: `${days}d left`, tone: days <= 1 ? "soon" : "ok" };
}

/** Billing facts for a ticket: from the real consultation when there is one, else the case file. */
async function caseFile(ticket: { id: string; sessionRef: string }) {
  const c = await db.consultation.findUnique({ where: { ref: ticket.sessionRef } });
  if (c && c.status === "ENDED") {
    return {
      metering: [
        { label: "Billed seconds", value: String(c.billedSeconds) },
        { label: "Billed minutes", value: String(c.billedMinutes) },
        { label: "Rate at connect", value: `${rupee(c.rate)}/min` },
        { label: "Amount billed", value: rupee(c.total) },
      ],
      evidence: [
        {
          rank: "PLATFORM",
          label: `Server metering log · connect ${c.connectedAt ? istTime(c.connectedAt) : "—"}, end ${c.endedAt ? istTime(c.endedAt) : "—"}`,
          when: "auto",
        },
        { rank: "PLATFORM", label: `Wallet ledger entry · hold ${rupee(c.heldAmount)}, debit ${rupee(c.total)}`, when: "auto" },
      ],
      billed: c.total,
      buckets: { service: c.serviceUsed, promo: c.promoUsed },
    };
  }
  const stored = await getSetting<{
    metering: { label: string; value: string }[];
    evidence: { rank: string; label: string; when: string }[];
    billed: number;
    buckets: { service: number; promo: number };
  } | null>(`support.case.${ticket.sessionRef}`, null);
  return stored ?? { metering: [], evidence: [], billed: 0, buckets: { service: 0, promo: 0 } };
}

supportRouter.get("/support", async (req, res) => {
  requirePage(req, "support");
  const now = new Date();
  const tickets = await db.supportTicket.findMany({ orderBy: { createdAt: "desc" } });
  res.json({
    tickets: tickets.map((t) => {
      const sla = slaLabel(t.slaDueAt, now);
      return {
        id: t.id,
        subject: t.subject,
        state: t.state,
        sla: sla.label,
        slaTone: sla.tone,
        alias: t.customerAlias,
        session: t.sessionRef,
        refundState: t.refundState,
        proposedBy: t.proposedBy,
      };
    }),
  });
});

supportRouter.get("/support/:id", async (req, res) => {
  requirePage(req, "support");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  const file = await caseFile(t);
  res.json({
    case: {
      id: t.id,
      state: t.state,
      refundState: t.refundState,
      proposedBy: t.proposedBy,
      approvedBy: t.approvedBy,
      metering: file.metering,
      evidence: file.evidence,
      refund: {
        billed: rupee(file.billed),
        buckets: [
          { label: "Service balance portion", value: rupee(file.buckets.service) },
          { label: "Promotional balance portion", value: rupee(file.buckets.promo) },
          { label: `Total refund — capped at billed ${rupee(file.billed)}`, value: rupee(file.billed), total: true },
        ],
      },
    },
  });
});

supportRouter.post("/support/:id/refund/propose", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (t.refundState !== "NONE") throw conflict("A refund has already been proposed for this ticket.");
  const file = await caseFile(t);
  await db.supportTicket.update({
    where: { id: t.id },
    data: { refundState: "PROPOSED", state: "REFUND_PROPOSED", refundAmount: file.billed, proposedBy: actorName(admin) },
  });
  await audit(admin, "dispute.refund.propose", t.id, `${rupee(file.billed)} proposed`);
  res.json({ ok: true, billed: rupee(file.billed) });
});

/**
 * A second person approves; the refund goes back to the customer's wallet in the
 * same buckets it was paid from, never more than was billed.
 */
supportRouter.post("/support/:id/refund/approve", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.approve", "Blocked — Support may propose but not approve a refund.");
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  if (t.refundState !== "PROPOSED") throw conflict("There is no proposed refund to approve.");
  if (t.proposedBy === actorName(admin)) throw forbidden("Blocked — you proposed this refund. A second approver is required.");

  const c = await db.consultation.findUnique({ where: { ref: t.sessionRef } });
  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.supportTicket.update({ where: { id: t.id }, data: { refundState: "INITIATED", state: "REFUND_INITIATED", approvedBy: actorName(admin) } }),
  ];
  if (c?.customerId && c.total > 0) {
    let ref = makeRef("RFD");
    while (await db.transaction.findUnique({ where: { ref } })) ref = makeRef("RFD");
    ops.push(
      db.wallet.update({ where: { userId: c.customerId }, data: { service: { increment: c.serviceUsed }, promo: { increment: c.promoUsed } } }),
      db.transaction.create({ data: { userId: c.customerId, type: "Refund", ref, bucket: `${t.id} · ${istDayMonth(new Date())}`, amount: c.total } }),
    );
  }
  await db.$transaction(ops);
  await audit(admin, "dispute.refund.approve", t.id, `REFUND_PROPOSED → REFUND_INITIATED (${rupee(t.refundAmount)})`);
  res.json({ ok: true, actor: actorName(admin), billed: rupee(t.refundAmount) });
});

supportRouter.post("/support/:id/reject", async (req, res) => {
  requirePage(req, "support");
  const admin = requireCapability(req, "dispute.refund.propose");
  const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body);
  const t = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!t) throw notFound("Ticket not found.");
  await db.supportTicket.update({ where: { id: t.id }, data: { state: "RESOLVED" } });
  await audit(admin, "dispute.reject", t.id, `${t.state} → RESOLVED · ${reason}`);
  res.json({ ok: true });
});
