import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { closesOn, cycleOf, freeCallsCycleDays, prepareBatch, prepareCandidates, prepareDiff, splitThisMonth, tdsPct } from "../../lib/earnings.ts";
import { istDayMonth, istTime, rupee } from "../../lib/format.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";
import { duplicatePayments, grossVolume, walletTrialBalance } from "../../lib/ledger.ts";
import { campaignCostThisMonth } from "../../lib/campaigns.ts";
import { configNumber, getSetting, putSetting } from "../../lib/settings.ts";
import { priceChangeView } from "../../lib/pricing.ts";
import { lakh } from "./overview.ts";
import { proposedMinutes, refundProposerId } from "./support.ts";

export const financeRouter = Router();

financeRouter.get("/finance", async (req, res) => {
  requirePage(req, "finance");
  const now = new Date();
  const [batches, denominations, floorPct, floorMode, kpis, proposed, candidates, split, tds, freeDays] = await Promise.all([
    db.payoutBatch.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { lines: true } } } }),
    db.denomination.findMany({ orderBy: { amount: "asc" } }),
    configNumber("wallet.cashback.floor_pct", 80),
    getSetting<"reject" | "adjust">("finance.floorMode", "reject"),
    Promise.all([grossVolume(), duplicatePayments(), walletTrialBalance()]),
    // Dispute refunds Support has proposed: Finance is the second approver (dispute.refund.approve).
    db.supportTicket.findMany({ where: { refundState: "PROPOSED" }, orderBy: { createdAt: "asc" } }),
    prepareCandidates(),
    splitThisMonth(),
    tdsPct(),
    freeCallsCycleDays(),
  ]);
  const campaigns = await campaignCostThisMonth(now);
  // The cycles still running, for "nothing to prepare until …".
  const running = (["EARNINGS", "FREE_CALLS"] as const).map((kind) => {
    const c = cycleOf(kind, now, freeDays);
    return { kind, id: c.id, label: c.label, closes: closesOn(c) };
  });
  const [gross, duplicates, trial] = kpis;
  const awaiting = batches.filter((b) => b.state === "APPROVED");
  const grossDelta = gross.previous ? Math.round(((gross.amount - gross.previous) / gross.previous) * 100) : null;
  res.json({
    finance: {
      kpis: {
        grossVolume: lakh(gross.amount),
        grossMonth: gross.month,
        grossDelta:
          grossDelta === null ? `nothing in ${gross.previousMonth} to compare` : `${grossDelta >= 0 ? "+" : "−"}${Math.abs(grossDelta)}% vs same days of ${gross.previousMonth}`,
        pendingPayouts: lakh(awaiting.reduce((s, b) => s + b.gross, 0)),
        batchesAwaiting: awaiting.length,
        duplicates,
        trialBalance: rupee(trial.off),
        walletsOut: trial.walletsOut,
        walletsChecked: trial.checked,
        // The revenue split this month (lines written since shares existed).
        splitMonth: split.month,
        platformRevenue: lakh(split.platformRevenue),
        customerGross: lakh(split.customerGross),
        astrologerShare: lakh(split.astrologerShare),
        freeCallCost: lakh(split.freeCallCost),
        freeCallMinutes: split.freeCallMinutes,
        // What claimed campaign offers cost Astrorize this month (promotional credit and discounts).
        campaignMonth: campaigns.month,
        campaignCost: lakh(campaigns.total),
        campaignCashback: rupee(campaigns.cashback),
        campaignBonus: rupee(campaigns.bonus),
        campaignDiscount: rupee(campaigns.discount),
      },
      tdsPct: tds,
      /** Closed cycles with something to pay and no batch yet. */
      toPrepare: candidates.map((c) => ({ ...c, grossLabel: rupee(c.gross), tdsLabel: "−" + rupee(c.tds) })),
      running,
      cycle: batches[0]?.cycle ?? "",
      batches: batches.map((b) => ({
        id: b.id,
        kind: b.kind === "FREE_CALLS" ? "FREE_CALLS" : "EARNINGS",
        /** "Earnings · 1–15 Oct 2026" (older batches: "Cycle 2026-10-A · 1–15 Oct"). */
        cycle: b.cycle,
        lines: b._count.lines,
        astrologers: b.astrologers,
        gross: rupee(b.gross),
        grossValue: b.gross,
        createdAt: b.createdAt.toISOString(),
        tds: "−" + rupee(b.tds),
        state: b.state,
        approvedBy: b.approvedRole?.toLowerCase(),
        approvedById: b.approvedById,
        approvedByName: b.approvedByName,
        releasedByName: b.releasedByName,
        releasedAt: b.releasedAt ? `${istDayMonth(b.releasedAt)}, ${istTime(b.releasedAt)} IST` : null,
      })),
      disputeRefunds: await Promise.all(
        proposed.map(async (t) => ({
          id: t.id,
          subject: t.subject,
          customer: t.customerAlias,
          session: t.sessionRef,
          /** REFUND | MAKE_GOOD (a free replacement call instead of money back) */
          kind: t.state === "MAKEGOOD_PROPOSED" ? "MAKE_GOOD" : "REFUND",
          amount: t.state === "MAKEGOOD_PROPOSED" ? `${await proposedMinutes(t.id)} min free call` : rupee(t.refundAmount),
          proposedBy: t.proposedBy,
          proposedById: await refundProposerId(t.id),
        })),
      ),
      denominations: denominations.map((d) => d.amount),
      enabledDenominations: denominations.filter((d) => d.enabled).map((d) => d.amount),
      floorPct,
      floorMode,
    },
  });
});

/**
 * Prepares the DRAFT payout batch for a closed cycle (earnings: a half-month; free-call compensation:
 * a month or week). Idempotent per cycle. Whoever may approve batches may prepare them.
 */
financeRouter.post("/payouts/prepare", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.approve");
  const { kind, cycleId } = z.object({ kind: z.enum(["EARNINGS", "FREE_CALLS"]), cycleId: z.string().min(1).max(40) }).parse(req.body);
  const result = await prepareBatch(kind, cycleId);
  if (!result.already) await audit(admin, "payout.batch.prepare", result.batch.id, prepareDiff(result));
  res.json({
    ok: true,
    already: result.already,
    batch: { id: result.batch.id, astrologers: result.batch.astrologers, gross: rupee(result.batch.gross), tds: rupee(result.batch.tds), lines: result.lines },
  });
});

financeRouter.post("/payouts/:id/approve", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.approve");
  const b = await db.payoutBatch.findUnique({ where: { id: String(req.params.id) } });
  if (!b) throw notFound("Payout batch not found.");
  if (b.state !== "DRAFT") throw conflict(`${b.id} is already ${b.state.toLowerCase()}.`);
  const { count } = await db.payoutBatch.updateMany({
    where: { id: b.id, state: "DRAFT" },
    data: {
      state: "APPROVED",
      approvedById: admin.user.id,
      approvedByName: actorName(admin),
      approvedRole: admin.adminRole.toUpperCase() as "SUPER" | "FINANCE" | "SUPPORT" | "COMPLIANCE",
      approvedAt: new Date(),
    },
  });
  if (!count) throw conflict(`${b.id} was just approved by someone else.`);
  await audit(admin, "payout.batch.approve", b.id, "DRAFT → APPROVED");
  res.json({ ok: true, actor: actorName(admin) });
});

/** Approver and releaser must be different people. */
financeRouter.post("/payouts/:id/release", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.release", "Your role can approve payouts but not release them.");
  const b = await db.payoutBatch.findUnique({ where: { id: String(req.params.id) } });
  if (!b) throw notFound("Payout batch not found.");
  if (b.state !== "APPROVED") throw conflict(`${b.id} must be approved before it can be released.`);
  if (b.approvedById === admin.user.id) throw forbidden(`Blocked — you approved ${b.id}. Release requires a different actor.`);
  const { count } = await db.payoutBatch.updateMany({
    where: { id: b.id, state: "APPROVED", approvedById: b.approvedById },
    data: { state: "RELEASED", releasedById: admin.user.id, releasedByName: actorName(admin), releasedAt: new Date() },
  });
  if (!count) throw conflict(`${b.id} was just released by someone else.`);
  await audit(admin, "payout.batch.release", b.id, "APPROVED → RELEASED");
  // RazorpayX isn't connected yet, so no transfer reference exists; the client says so.
  res.json({ ok: true, actor: actorName(admin) });
});

financeRouter.patch("/denominations/:amount", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "config.write");
  const amount = Number(req.params.amount);
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const d = await db.denomination.findUnique({ where: { amount } });
  if (!d) throw notFound("Unknown denomination.");
  await db.denomination.update({ where: { amount }, data: { enabled } });
  await audit(admin, "wallet.denomination.toggle", rupee(amount), enabled ? "OFF → ON" : "ON → OFF");
  res.json({ ok: true });
});

financeRouter.put("/settings/floor-mode", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "config.write");
  const { mode } = z.object({ mode: z.enum(["reject", "adjust"]) }).parse(req.body);
  const before = await getSetting("finance.floorMode", "reject");
  await putSetting("finance.floorMode", mode);
  await audit(admin, "wallet.cashback.floor_mode", "wallet.cashback.floor_mode", `${before} → ${mode}`);
  res.json({ ok: true });
});

/**
 * Astrologers' price changes in the last 30 days, newest first (read-only for Finance):
 * decreases (live at once), increases and what happened to them (approved / rejected /
 * withdrawn / still waiting). Decided on the Astrologer lifecycle page.
 */
financeRouter.get("/finance/price-changes", async (req, res) => {
  requirePage(req, "finance");
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await db.priceChange.findMany({
    where: { OR: [{ requestedAt: { gte: since } }, { decidedAt: { gte: since } }, { status: "PENDING" }] },
    orderBy: { requestedAt: "desc" },
    take: 300,
    include: { astrologer: { select: { id: true, name: true, photo: true } } },
  });
  res.json({ changes: rows.map((c) => ({ ...priceChangeView(c), astrologer: c.astrologer })) });
});
