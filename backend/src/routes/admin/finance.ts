import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { rupee } from "../../lib/format.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";
import { configNumber, getSetting, putSetting } from "../../lib/settings.ts";
import { lakh } from "./overview.ts";

export const financeRouter = Router();

financeRouter.get("/finance", async (req, res) => {
  requirePage(req, "finance");
  const [batches, denominations, floorPct, floorMode, kpis] = await Promise.all([
    db.payoutBatch.findMany({ orderBy: { createdAt: "desc" } }),
    db.denomination.findMany({ orderBy: { amount: "asc" } }),
    configNumber("wallet.cashback.floor_pct", 80),
    getSetting<"reject" | "adjust">("finance.floorMode", "reject"),
    getSetting<{ grossVolume: number; grossDelta: string; duplicates: number; trialBalance: number; trialDate: string }>("finance.kpis", {
      grossVolume: 0,
      grossDelta: "",
      duplicates: 0,
      trialBalance: 0,
      trialDate: "",
    }),
  ]);
  const awaiting = batches.filter((b) => b.state === "APPROVED");
  res.json({
    finance: {
      kpis: {
        grossVolume: lakh(kpis.grossVolume),
        grossDelta: kpis.grossDelta,
        pendingPayouts: lakh(awaiting.reduce((s, b) => s + b.gross, 0)),
        batchesAwaiting: awaiting.length,
        duplicates: kpis.duplicates,
        trialBalance: rupee(kpis.trialBalance),
        trialDate: kpis.trialDate,
      },
      cycle: batches[0]?.cycle ?? "",
      batches: batches.map((b) => ({
        id: b.id,
        astrologers: b.astrologers,
        gross: rupee(b.gross),
        grossValue: b.gross,
        createdAt: b.createdAt.toISOString(),
        tds: "−" + rupee(b.tds),
        state: b.state,
        approvedBy: b.approvedRole?.toLowerCase(),
        approvedById: b.approvedById,
        approvedByName: b.approvedByName,
      })),
      denominations: denominations.map((d) => d.amount),
      enabledDenominations: denominations.filter((d) => d.enabled).map((d) => d.amount),
      floorPct,
      floorMode,
    },
  });
});

financeRouter.post("/payouts/:id/approve", async (req, res) => {
  requirePage(req, "finance");
  const admin = requireCapability(req, "payout.approve");
  const b = await db.payoutBatch.findUnique({ where: { id: String(req.params.id) } });
  if (!b) throw notFound("Payout batch not found.");
  if (b.state !== "DRAFT") throw conflict(`${b.id} is already ${b.state.toLowerCase()}.`);
  await db.payoutBatch.update({
    where: { id: b.id },
    data: {
      state: "APPROVED",
      approvedById: admin.user.id,
      approvedByName: actorName(admin),
      approvedRole: admin.adminRole.toUpperCase() as "SUPER" | "FINANCE" | "SUPPORT" | "COMPLIANCE",
      approvedAt: new Date(),
    },
  });
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
  await db.payoutBatch.update({
    where: { id: b.id },
    data: { state: "RELEASED", releasedById: admin.user.id, releasedByName: actorName(admin), releasedAt: new Date() },
  });
  await audit(admin, "payout.batch.release", b.id, "APPROVED → RELEASED");
  // ⚠ RazorpayX is not connected yet; the reference below is a placeholder.
  res.json({ ok: true, actor: actorName(admin), reference: `RZP${b.id.slice(-4)}8821` });
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
