import { Router } from "express";
import { accountsOverview, createPayoutsForBatch, retryPayout, transfersView } from "../../lib/payouts.ts";
import { providerView } from "../../lib/payout-providers/index.ts";
import { dueDateOf, payoutSchedule } from "../../lib/payout-schedule.ts";
import { approveBatch, releaseBatch } from "../../lib/payout-actions.ts";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { closesOn, cycleOf, freeCallsCycleDays, prepareBatch, prepareCandidates, prepareDiff, splitThisMonth, tdsPct } from "../../lib/earnings.ts";
import { istDayMonth, istTime, rupee } from "../../lib/format.ts";
import type { TdsLine } from "../../lib/tds.ts";
import { isManualAdjustment } from "../../lib/payout-adjustments.ts";
import { requireCapability, requirePage } from "../../lib/rbac.ts";
import { duplicatePayments, grossVolume, walletTrialBalance } from "../../lib/ledger.ts";
import { campaignCostThisMonth } from "../../lib/campaigns.ts";
import { configNumber, getSetting, putSetting } from "../../lib/settings.ts";
import { customAmountPolicy } from "../../lib/payments.ts";
import { priceChangeView } from "../../lib/pricing.ts";
import { lakh } from "./overview.ts";
import { creditProposal, proposedMinutes, refundProposedAt, refundProposerId, splitForTicket } from "./support.ts";
import { CREDIT_PROPOSED } from "../../lib/tickets.ts";

export const financeRouter = Router();

financeRouter.get("/finance", async (req, res) => {
  requirePage(req, "finance");
  const now = new Date();
  const [batches, denominations, customAmount, floorPct, floorMode, kpis, proposed, candidates, split, tds, freeDays] = await Promise.all([
    db.payoutBatch.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { lines: true } } } }),
    db.denomination.findMany({ orderBy: { amount: "asc" } }),
    customAmountPolicy(),
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
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5.5 * 3600_000);
  // GST collected: on recharges made before it moved into the per-minute rate, plus the GST inside what
  // customers paid for sessions since (18/118 of a session's total).
  const usageGst = (since: Date | null) =>
    db.$queryRaw<{ gst: number | null }[]>`SELECT COALESCE(SUM("total" - ROUND("total" * 100.0 / (100 + "gstPct"))), 0)::int AS gst FROM "Consultation" WHERE "gstPct" > 0 AND "status" = 'ENDED' AND (${since}::timestamp IS NULL OR "endedAt" >= ${since})`;
  const [gstAll, gstMonth, usageAll, usageMonth] = await Promise.all([
    db.payment.aggregate({ where: { status: "PAID" }, _sum: { gst: true } }),
    db.payment.aggregate({ where: { status: "PAID", createdAt: { gte: monthStart } }, _sum: { gst: true } }),
    usageGst(null),
    usageGst(monthStart),
  ]);
  const schedule = await payoutSchedule();
  // Batches whose money has not all reached the astrologers, for the "overdue" mark.
  const unpaidPayouts = await db.payout.findMany({ where: { state: { not: "PROCESSED" } }, select: { batchId: true, amount: true } });
  const unpaid = new Set(unpaidPayouts.map((p) => p.batchId));
  const toTransfer = unpaidPayouts.reduce((s, p) => s + p.amount, 0);
  // The cycles still running, for "nothing to prepare until …".
  const running = (["EARNINGS", "FREE_CALLS"] as const).map((kind) => {
    const c = cycleOf(kind, now, freeDays, schedule.cycleDays);
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
        gstTotal: rupee((gstAll._sum.gst ?? 0) + (usageAll[0]?.gst ?? 0)),
        gstMonth: rupee((gstMonth._sum.gst ?? 0) + (usageMonth[0]?.gst ?? 0)),
        grossDelta:
          grossDelta === null ? `nothing in ${gross.previousMonth} to compare` : `${grossDelta >= 0 ? "+" : "−"}${Math.abs(grossDelta)}% vs same days of ${gross.previousMonth}`,
        pendingPayouts: lakh(awaiting.reduce((s, b) => s + b.gross, 0) + toTransfer),
        toTransfer: rupee(toTransfer),
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
        // What claimed campaign offers cost AstroRize this month (promotional credit and discounts).
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
      schedule,
      provider: providerView(),
      batches: batches.map((b) => ({
        id: b.id,
        kind: b.kind === "FREE_CALLS" ? "FREE_CALLS" : "EARNINGS",
        /** "Earnings · 1–15 Oct 2026" (older batches: "Cycle 2026-10-A · 1–15 Oct"). */
        cycle: b.cycle,
        lines: b._count.lines,
        astrologers: b.astrologers,
        gross: rupee(b.gross),
        /** The payout day after the cycle ends, and whether it has passed with money still unpaid. */
        dueOn: b.periodEnd ? istDayMonth(dueDateOf(b.periodEnd, schedule.day)) : null,
        overdue: !!b.periodEnd && Date.now() > dueDateOf(b.periodEnd, schedule.day).getTime() + 86_400_000 && (b.state !== "RELEASED" || unpaid.has(b.id)),
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
          /** REFUND | MAKE_GOOD (a free replacement call instead of money back) | WALLET_CREDIT (a credit from support, any ticket) */
          kind: t.state === "MAKEGOOD_PROPOSED" ? "MAKE_GOOD" : t.state === CREDIT_PROPOSED ? "WALLET_CREDIT" : "REFUND",
          amount: t.state === "MAKEGOOD_PROPOSED" ? `${await proposedMinutes(t.id)} min free call` : rupee(t.refundAmount),
          /** For a wallet credit: the balance it goes to and the reason the customer will see. */
          credit:
            t.state === CREDIT_PROPOSED
              ? await creditProposal(t.id).then((p) => (p ? { bucket: p.bucket === "SERVICE" ? "Service balance" : "Promotional balance", reason: p.reason } : null))
              : null,
          proposedBy: t.proposedBy,
          proposedById: await refundProposerId(t.id),
          proposedAt: (await refundProposedAt(t.id))?.toISOString() ?? null,
          /** The team holding it now (Finance, or Admin once escalated) — only that team decides. */
          team: t.assignedTeam,
          /** Who bears it (staff only): customer paid, refund, astrologer share reversed, AstroRize share. */
          split: await splitForTicket(t),
        })),
      ),
      denominations: denominations.map((d) => d.amount),
      enabledDenominations: denominations.filter((d) => d.enabled).map((d) => d.amount),
      /** Custom recharge amounts on the wallet page: on/off and the allowed range. */
      customAmount,
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
  res.json(await approveBatch(admin, String(req.params.id)));
});

/** Every transfer to an astrologer (newest problems first), the payout details on file, and how payouts are being sent. */
financeRouter.get("/payouts/transfers", async (req, res) => {
  requirePage(req, "finance");
  const [transfers, accounts] = await Promise.all([transfersView(), accountsOverview()]);
  res.json({ provider: providerView(), transfers, accounts });
});

/** One batch, astrologer by astrologer: what customers paid, AstroRize's commission, earnings, TDS, what is sent. */
financeRouter.get("/payouts/:id/details", async (req, res) => {
  requirePage(req, "finance");
  const batch = await db.payoutBatch.findUnique({ where: { id: String(req.params.id) }, include: { lines: { include: { astrologer: { select: { id: true, name: true } } } }, payouts: true } });
  if (!batch) throw notFound("That payout batch does not exist.");
  const pct = await tdsPct();
  // The GST inside what the customer paid: the session's total less the ex-GST gross its line was booked on.
  const sessions = await db.consultation.findMany({ where: { ref: { in: batch.lines.map((l) => l.sessionRef) }, gstPct: { gt: 0 } }, select: { ref: true, total: true } });
  const paid = new Map(sessions.map((c) => [c.ref, c.total]));
  const by = new Map<string, { name: string; gross: number; earned: number; gst: number; adjustments: number }>();
  for (const l of batch.lines) {
    const earned = l.amount ?? 0;
    const gross = l.gross ?? earned;
    const row = by.get(l.astrologerId) ?? { name: l.astrologer.name, gross: 0, earned: 0, gst: 0, adjustments: 0 };
    if (isManualAdjustment(l.kind)) row.adjustments += earned;
    const total = paid.get(l.sessionRef);
    if (total !== undefined) row.gst += Math.max(0, total - gross);
    row.gross += isManualAdjustment(l.kind) ? 0 : gross;
    row.earned += earned;
    by.set(l.astrologerId, row);
  }
  const rows = [...by.entries()].map(([id, r]) => {
    const p = batch.payouts.filter((x) => x.astrologerId === id).sort((a, b) => b.attempts - a.attempts)[0];
    const kept = (batch.tdsDetail as Record<string, TdsLine> | null)?.[id];
    const tds = p ? p.tds : kept ? kept.amount : Math.round((r.earned * pct) / 100);
    return {
      astrologerId: id,
      astrologer: r.name,
      adjustments: rupee(r.adjustments),
      customerPaid: rupee(r.gross + r.gst),
      gst: rupee(r.gst),
      commission: rupee(r.gross - (r.earned - r.adjustments)),
      earnings: rupee(r.earned),
      tds: rupee(tds),
      tdsPct: p?.tdsPct ?? kept?.pct ?? pct,
      tdsNote: p?.tdsNote ?? kept?.note ?? "",
      payable: rupee(p ? p.amount : r.earned - tds),
      transfer: p ? p.state : "Not sent yet",
      utr: p?.utr ?? "",
    };
  });
  res.json({ id: batch.id, kind: batch.kind, state: batch.state, rows });
});

/** Retry a failed or returned transfer (a new attempt; Finance decides, never automatic). */
financeRouter.post("/payouts/transfers/:id/retry", async (req, res) => {
  const admin = requireCapability(req, "payout.release", "Your role can approve payouts but not release them.");
  requirePage(req, "finance");
  const p = await retryPayout(String(req.params.id), admin);
  res.json({ ok: true, state: p?.state ?? null });
});

/** Make (or finish) the transfers of a released batch — if releasing it couldn't reach RazorpayX. */
financeRouter.post("/payouts/:id/transfers", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.release", "Your role can approve payouts but not release them.");
  const out = await createPayoutsForBatch(String(req.params.id));
  await audit(admin, "payout.batch.transfers", String(req.params.id), `${out.transfers} transfers · ${out.paid} paid · ${out.failed} failed`);
  res.json({ ok: true, ...out });
});

/** Approver and releaser must be different people — except a Super Admin, who may release what they approved (audited). */
financeRouter.post("/payouts/:id/release", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.release", "Your role can approve payouts but not release them.");
  res.json(await releaseBatch(admin, String(req.params.id)));
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

/** Custom recharge amounts on the wallet page: switch them on or off and set the range. Audited. */
financeRouter.put("/settings/custom-amount", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "config.write");
  const next = z
    .object({
      enabled: z.boolean(),
      min: z.number().int("Enter the smallest amount in whole rupees.").min(1, "The smallest amount must be at least ₹1."),
      max: z.number().int("Enter the largest amount in whole rupees.").max(100000, "The largest amount can be at most ₹1,00,000."),
    })
    .refine((v) => v.max >= v.min, { message: "The largest amount must be at least the smallest.", path: ["max"] })
    .parse(req.body);
  const before = await customAmountPolicy();
  await putSetting("wallet.customAmount", next);
  const show = (c: typeof next) => `${c.enabled ? "ON" : "OFF"} ${rupee(c.min)}–${rupee(c.max)}`;
  await audit(admin, "wallet.custom_amount", "wallet.customAmount", `${show(before)} → ${show(next)}`);
  res.json({ ok: true, customAmount: next });
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
