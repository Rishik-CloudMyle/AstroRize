import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { rupee, istDate } from "../../lib/format.ts";
import { addAdjustment, recentAdjustments } from "../../lib/payout-adjustments.ts";
import { bankFile, payoutSheet, recordManualPayout } from "../../lib/payout-manual.ts";
import { payoutSchedule, savePayoutSchedule } from "../../lib/payout-schedule.ts";
import { batchStatement } from "../../lib/payout-statement.ts";
import { actorName, requireCapability, requirePage } from "../../lib/rbac.ts";
import { loadTdsContext, type TdsLine } from "../../lib/tds.ts";

// Finance's payout operations: the schedule, incentives and deductions, the bank file and payout
// sheet, recording what the bank did, monthly statements and reconciliation.
export const payoutOpsRouter = Router();

const finance = (req: Parameters<typeof requirePage>[0]) => {
  requirePage(req, "finance");
  return requireCapability(req, "payout.approve", "Only Finance can do this.");
};

payoutOpsRouter.put("/payouts/schedule", async (req, res) => {
  const admin = finance(req);
  const next = z
    .object({
      day: z.number().int().min(1, "Choose a payout day from the 1st to the 10th.").max(10, "Choose a payout day from the 1st to the 10th."),
      cycleDays: z.union([z.literal(15), z.literal(30)]),
    })
    .parse(req.body);
  const before = await payoutSchedule();
  await savePayoutSchedule(next);
  const show = (s: typeof next) => `day ${s.day} · ${s.cycleDays === 30 ? "monthly" : "half-monthly"}`;
  await audit(admin, "payout.schedule", "payout.schedule", `${show(before)} → ${show(next)}`);
  res.json({ ok: true, schedule: next });
});

payoutOpsRouter.get("/payouts/adjustments", async (req, res) => {
  requirePage(req, "finance");
  const [adjustments, astrologers] = await Promise.all([recentAdjustments(), db.astrologer.findMany({ where: { lifecycle: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  res.json({ adjustments, astrologers });
});

payoutOpsRouter.post("/payouts/adjustments", async (req, res) => {
  const admin = finance(req);
  const body = z
    .object({
      astrologerId: z.string().min(1, "Choose the astrologer.").max(40),
      amount: z.number().int("Enter whole rupees.").min(-100_000, "At most ₹1,00,000.").max(100_000, "At most ₹1,00,000.").refine((n) => n !== 0, "Enter an amount."),
      reason: z.string().trim().min(5, "Say what it is for (at least 5 characters).").max(120),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .parse(req.body);
  const { line, astrologer } = await addAdjustment(body);
  await audit(admin, "payout.adjustment.add", line.sessionRef, `${astrologer} · ${body.amount > 0 ? "+" : "−"}${rupee(Math.abs(body.amount))} · ${body.reason}`);
  res.status(201).json({ ok: true, ref: line.sessionRef });
});

/** The HDFC upload file. POST: making a new one takes those payouts out of the queue. */
payoutOpsRouter.post("/payouts/bank-file", async (req, res) => {
  const admin = finance(req);
  const { ref } = z.object({ ref: z.string().max(60).optional() }).parse(req.body ?? {});
  const file = await bankFile(ref);
  await audit(admin, ref ? "payout.bankfile.redownload" : "payout.bankfile.create", file.ref, `${file.count} transfers · ${rupee(file.total)}`);
  res.json(file);
});

/** Every finalised payout with beneficiary bank details (full account numbers: audited). */
payoutOpsRouter.post("/payouts/sheet", async (req, res) => {
  const admin = finance(req);
  const rows = await payoutSheet();
  await audit(admin, "payout.sheet.export", "payouts", `${rows.length} payouts with bank details`);
  res.json({ rows });
});

payoutOpsRouter.post("/payouts/transfers/:id/record", async (req, res) => {
  const admin = finance(req);
  const reason = z.string().trim().min(3, "Say what happened.").max(200);
  const body = z
    .discriminatedUnion("status", [
      z.object({ status: z.literal("PAID"), utr: z.string().trim().max(60), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date.") }),
      z.object({ status: z.literal("FAILED"), reason }),
      z.object({ status: z.literal("RETURNED"), reason }),
    ])
    .parse(req.body);
  const id = String(req.params.id);
  const out = await recordManualPayout(id, body, actorName(admin));
  await audit(admin, `payout.transfer.record.${body.status.toLowerCase()}`, id, out.diff);
  res.json({ ok: true, state: out.state });
});

payoutOpsRouter.get("/payouts/:batchId/statements/:astrologerId", async (req, res) => {
  requirePage(req, "finance");
  res.json({ statement: await batchStatement(String(req.params.batchId), String(req.params.astrologerId)) });
});

/** For the cycles ending in a month: what was owed, what has been paid, what is still open. */
payoutOpsRouter.get("/payouts/reconciliation", async (req, res) => {
  requirePage(req, "finance");
  const now = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month)) ? String(req.query.month) : now;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1) - 5.5 * 3_600_000);
  const end = new Date(Date.UTC(y, m, 1) - 5.5 * 3_600_000 - 1);
  const [batches, open, tdsContext] = await Promise.all([
    db.payoutBatch.findMany({
      where: { periodEnd: { gte: start, lte: end } },
      orderBy: { id: "asc" },
      include: { payouts: true, lines: { include: { astrologer: { select: { name: true } } } } },
    }),
    db.earningsLine.aggregate({ where: { payoutBatchId: null, amount: { not: null }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: true }),
    loadTdsContext(),
  ]);
  const rows = batches.flatMap((b) => {
    const per = new Map<string, { name: string; earned: number }>();
    for (const l of b.lines) {
      const r = per.get(l.astrologerId) ?? { name: l.astrologer.name, earned: 0 };
      r.earned += l.amount ?? 0;
      per.set(l.astrologerId, r);
    }
    return [...per].map(([id, r]) => {
      const p = b.payouts.find((x) => x.astrologerId === id);
      const kept = (b.tdsDetail as Record<string, TdsLine> | null)?.[id];
      const tds = p ? p.tds : (kept?.amount ?? tdsContext.compute(id, r.earned).amount);
      const net = p ? p.amount : r.earned - tds;
      const state = p ? p.state : b.state === "RELEASED" ? "NOTHING" : b.state;
      return { batch: b.id, astrologerId: id, astrologer: r.name, earned: r.earned, tds, net, state, utr: p?.utr ?? "", paidOn: p?.paidAt ? istDate(p.paidAt) : "" };
    });
  });
  const net = (states: string[]) => rows.filter((r) => states.includes(r.state)).reduce((s, r) => s + r.net, 0);
  res.json({
    month,
    rows,
    totals: {
      earned: rows.reduce((s, r) => s + r.earned, 0),
      tds: rows.reduce((s, r) => s + r.tds, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
      paid: net(["PROCESSED"]),
      atBank: net(["PROCESSING"]),
      awaiting: net(["QUEUED"]),
      problems: net(["FAILED", "REVERSED"]),
      notFinalised: net(["DRAFT", "APPROVED"]),
      notPrepared: open._sum.amount ?? 0,
      notPreparedLines: open._count,
    },
  });
});
