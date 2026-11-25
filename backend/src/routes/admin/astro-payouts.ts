import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, notFound } from "../../lib/errors.ts";
import { holdRules, isRange, prepareAstrologerBatch, statementPeriods, type RangeKey } from "../../lib/earnings.ts";
import { estimateTds, loadTdsContext } from "../../lib/tds.ts";
import { istDate, istTime, rupee } from "../../lib/format.ts";
import { approveBatch, releaseBatch } from "../../lib/payout-actions.ts";
import { adminOf, capabilitiesOf, requireCapability, requirePage } from "../../lib/rbac.ts";

// Astrologer payouts: for a day, a week, 15 days or a month, what each astrologer earned (what customers
// paid, the share they keep, TDS, what is payable), whether it has been paid yet, and a way to prepare,
// approve and release one astrologer's payout on its own. Open to Super Admin, Finance and HR (the matrix
// can change that). Preparing a payout makes a one-astrologer batch (id "PA-…") that goes through the same
// approve and release steps, with the same two-person rule, as any payout batch.
export const astroPayoutsRouter = Router();

const query = z.object({ range: z.string().optional(), period: z.coerce.number().int().min(0).max(40).catch(0), q: z.string().trim().max(60).catch("") });

function pick(req: Request) {
  const { range: r, period, q } = query.parse(req.query);
  const range: RangeKey = isRange(r) ? r : "fortnight";
  const periods = statementPeriods(range);
  const index = Math.min(period, periods.length - 1);
  return { range, periods, index, p: periods[index]!, q };
}

/** One line of the statement, as every screen and the Excel file show it. */
function lineView(l: { date: Date; sessionRef: string; kind: string; mode: string; minutes: number; gross: number | null; sharePct: number | null; amount: number | null; fundedBy: string; payoutBatchId: string | null }, batches: Map<string, string>) {
  return {
    date: istDate(l.date),
    time: istTime(l.date),
    session: l.sessionRef,
    kind: l.kind,
    mode: l.mode,
    minutes: l.minutes,
    gross: l.gross ?? l.amount ?? 0,
    sharePct: l.sharePct,
    amount: l.amount ?? 0,
    fundedBy: l.fundedBy === "PLATFORM" ? "PLATFORM" : "CUSTOMER",
    batchId: l.payoutBatchId,
    batchState: l.payoutBatchId ? (batches.get(l.payoutBatchId) ?? null) : null,
  };
}

astroPayoutsRouter.get("/astro-payouts", async (req, res) => {
  requirePage(req, "payouts");
  const admin = adminOf(req);
  const { range, periods, index, p, q } = pick(req);
  const now = new Date();
  const [lines, tds, paused, held] = await Promise.all([
    db.earningsLine.findMany({ where: { date: { gte: p.start, lte: p.end }, amount: { not: null } }, orderBy: { date: "asc" } }),
    loadTdsContext(),
    db.setting.findUnique({ where: { key: "payout.paused" } }),
    holdRules(now),
  ]);
  const ids = [...new Set(lines.map((l) => l.astrologerId))];
  const batchIds = [...new Set(lines.map((l) => l.payoutBatchId).filter((b): b is string => !!b))];
  const [astrologers, accounts, batchRows, payouts] = await Promise.all([
    db.astrologer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, activatedAt: true, createdAt: true } }),
    db.payoutAccount.findMany({ where: { astrologerId: { in: ids } }, select: { astrologerId: true, last4: true, kind: true, isTest: true } }),
    db.payoutBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, state: true, cycle: true } }),
    db.payout.findMany({ where: { batchId: { in: batchIds }, astrologerId: { in: ids } }, select: { batchId: true, astrologerId: true, state: true, amount: true, utr: true, attempts: true } }),
  ]);
  const pausedMap = (paused?.value ?? {}) as Record<string, unknown>;
  const batchState = new Map(batchRows.map((b) => [b.id, b.state]));
  const rows = ids
    .map((id) => {
      const a = astrologers.find((x) => x.id === id);
      if (!a) return null;
      const mine = lines.filter((l) => l.astrologerId === id);
      const paid = mine.filter((l) => l.fundedBy !== "PLATFORM");
      const free = mine.filter((l) => l.fundedBy === "PLATFORM");
      const gross = paid.reduce((s, l) => s + (l.gross ?? l.amount ?? 0), 0);
      const earned = paid.reduce((s, l) => s + (l.amount ?? 0), 0);
      const unbatched = paid.filter((l) => !l.payoutBatchId);
      const unbatchedEarned = unbatched.reduce((s, l) => s + (l.amount ?? 0), 0);
      const inBatches = [...new Set(paid.map((l) => l.payoutBatchId).filter((b): b is string => !!b))].map((bid) => {
        const sum = paid.filter((l) => l.payoutBatchId === bid).reduce((s, l) => s + (l.amount ?? 0), 0);
        const po = payouts.filter((x) => x.batchId === bid && x.astrologerId === id).sort((m, n) => n.attempts - m.attempts)[0];
        return { id: bid, state: batchState.get(bid) ?? "DRAFT", earned: sum, transfer: po?.state ?? null, utr: po?.utr ?? null, net: po?.amount ?? null };
      });
      const hold = held({ id: "", astrologerId: id, amount: null, date: p.end, astrologer: { activatedAt: a.activatedAt, createdAt: a.createdAt } } as never);
      const acct = accounts.find((x) => x.astrologerId === id);
      return {
        astrologerId: id,
        name: a.name,
        sessions: paid.filter((l) => l.kind !== "gift" && l.kind !== "adjustment").length,
        minutes: paid.reduce((s, l) => s + l.minutes, 0),
        gross,
        commission: gross - earned,
        earned,
        // This astrologer's own rate (PAN, residency, Finance override); thresholds are applied when the payout is prepared.
        tds: estimateTds(tds, id, earned).amount,
        net: earned - estimateTds(tds, id, earned).amount,
        tdsPct: estimateTds(tds, id, earned).pct,
        tdsNote: estimateTds(tds, id, earned).note,
        freeCompensation: free.reduce((s, l) => s + (l.amount ?? 0), 0),
        unbatchedEarned,
        batches: inBatches,
        hold: pausedMap[id] ? "paused" : hold,
        account: acct ? `${acct.kind === "UPI" ? "UPI" : "Bank"} ••••${acct.last4}${acct.isTest ? " (test)" : ""}` : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r && (!q || r.name.toLowerCase().includes(q.toLowerCase())))
    .sort((x, y) => y.earned - x.earned || x.name.localeCompare(y.name));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const caps = capabilitiesOf(admin.adminRole);
  res.json({
    payouts: {
      range,
      periods: periods.map((x) => x.label),
      periodIndex: index,
      periodLabel: p.label,
      running: index === 0,
      tdsPct: tds.global.defaultPct,
      totals: { astrologers: rows.length, gross: sum((r) => r.gross), commission: sum((r) => r.commission), earned: sum((r) => r.earned), tds: sum((r) => r.tds), net: sum((r) => r.net), freeCompensation: sum((r) => r.freeCompensation), unbatched: sum((r) => r.unbatchedEarned) },
      rows,
      can: { prepare: caps.includes("astro_payout.prepare"), approve: caps.includes("astro_payout.approve"), release: caps.includes("astro_payout.release") },
      me: admin.user.id,
    },
  });
});

/** One astrologer's statement for the period: every line, with the batch it is in. */
astroPayoutsRouter.get("/astro-payouts/:astrologerId", async (req, res) => {
  requirePage(req, "payouts");
  const { range, p } = pick(req);
  const id = String(req.params.astrologerId);
  const [a, lines, tds] = await Promise.all([
    db.astrologer.findUnique({ where: { id }, select: { name: true } }),
    db.earningsLine.findMany({ where: { astrologerId: id, date: { gte: p.start, lte: p.end }, amount: { not: null } }, orderBy: { date: "asc" } }),
    loadTdsContext(),
  ]);
  if (!a) throw notFound("That astrologer doesn't exist.");
  const batchIds = [...new Set(lines.map((l) => l.payoutBatchId).filter((b): b is string => !!b))];
  const batchRows = await db.payoutBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, state: true } });
  const states = new Map(batchRows.map((b) => [b.id, b.state]));
  const rows = lines.map((l) => lineView(l, states));
  const paid = rows.filter((r) => r.fundedBy === "CUSTOMER");
  const gross = paid.reduce((s, r) => s + r.gross, 0);
  const earned = paid.reduce((s, r) => s + r.amount, 0);
  const est = estimateTds(tds, id, earned);
  const t = est.amount;
  res.json({
    statement: {
      astrologer: a.name,
      range,
      periodLabel: p.label,
      tdsPct: est.pct,
      tdsNote: est.note,
      rows,
      totals: { gross, commission: gross - earned, earned, tds: t, net: earned - t, freeCompensation: rows.filter((r) => r.fundedBy === "PLATFORM").reduce((s, r) => s + r.amount, 0) },
    },
  });
});

const prepareBody = z.object({ astrologerId: z.string().max(40), range: z.string().optional(), period: z.number().int().min(0).max(40).default(0) });

/** Prepares one astrologer's payout for the period (a DRAFT batch that then needs approving and releasing). */
astroPayoutsRouter.post("/astro-payouts/prepare", async (req, res) => {
  requirePage(req, "payouts");
  const admin = requireCapability(req, "astro_payout.prepare", "Your role can't prepare astrologer payouts.");
  const body = prepareBody.parse(req.body ?? {});
  const range: RangeKey = isRange(body.range) ? body.range : "fortnight";
  const periods = statementPeriods(range);
  const p = periods[Math.min(body.period, periods.length - 1)]!;
  const r = await prepareAstrologerBatch(body.astrologerId, p);
  if (!r.already) {
    await audit(admin, "payout.astro.prepare", r.batch.id, `— → DRAFT · ${r.lines} lines · owed ${rupee(r.batch.gross)} · TDS ${rupee(r.batch.tds)} · ${p.label}`);
  }
  res.status(r.already ? 200 : 201).json({ ok: true, already: r.already, batchId: r.batch.id, state: r.batch.state, lines: r.lines, owed: r.batch.gross, tds: r.batch.tds });
});

/** Only one-astrologer batches ("PA-…") are decided here; whole-cycle batches stay on the Finance page. */
function astroBatchId(req: Request) {
  const id = String(req.params.id);
  if (!id.startsWith("PA-")) throw badRequest("This page handles one-astrologer payouts. Whole-cycle batches are decided on the Finance page.");
  return id;
}

astroPayoutsRouter.post("/astro-payouts/batches/:id/approve", async (req, res) => {
  requirePage(req, "payouts");
  const admin = requireCapability(req, "astro_payout.approve", "Your role can't approve astrologer payouts.");
  res.json(await approveBatch(admin, astroBatchId(req)));
});

astroPayoutsRouter.post("/astro-payouts/batches/:id/release", async (req, res) => {
  requirePage(req, "payouts");
  const admin = requireCapability(req, "astro_payout.release", "Your role can approve payouts but not release them.");
  res.json(await releaseBatch(admin, astroBatchId(req)));
});
