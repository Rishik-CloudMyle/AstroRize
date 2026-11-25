import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { istStamp } from "../../lib/format.ts";
import { actorName, adminOf, capabilitiesOf, requireCapability, requirePage, secondPerson } from "../../lib/rbac.ts";
import { putSetting } from "../../lib/settings.ts";
import { staffTdsDecided, staffTdsProposed } from "../../lib/staff-notifications.ts";
import { DEFAULT_OVERRIDE, TDS_SETTING, loadTdsContext, type TdsGlobal, type TdsOverride } from "../../lib/tds.ts";

// The TDS page (Finance, with a Super Admin to acknowledge): the global default rates and thresholds, and
// each astrologer's own settings (residential status, billing address, PAN status, a custom rate, an
// exemption or their own threshold). Finance proposes a change; it takes effect when a Super Admin
// acknowledges it. A change never touches a batch already prepared: each batch keeps its own TDS.
export const tdsRouter = Router();

const pct = z.number({ error: "Enter a whole-number percentage." }).int("Use a whole-number percentage.").min(0, "A rate can't be below 0%.").max(100, "A rate can't be above 100%.");
const rupees = z.number({ error: "Enter an amount in rupees." }).int("Use whole rupees.").min(0, "An amount can't be below ₹0.").max(100_000_000, "That amount is too large.");

const globalValues = z.object({ defaultPct: pct, noPanPct: pct, nonResidentPct: pct, thresholdPerPayout: rupees, thresholdPerYear: rupees });
const astrologerValues = z.object({
  residentialStatus: z.enum(["RESIDENT", "NON_RESIDENT"], { error: "Choose resident or non-resident." }),
  billingAddress: z.string().trim().max(300, "Keep the address under 300 characters.").nullable().transform((v) => v || null),
  ratePct: pct.nullable(),
  exempt: z.boolean(),
  thresholdPerPayout: rupees.nullable(),
  note: z.string().trim().max(300, "Keep the note under 300 characters.").nullable().transform((v) => v || null),
});
const proposeBody = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("GLOBAL"), values: globalValues, reason: z.string().trim().max(300).optional(), applyNow: z.boolean().optional() }),
  z.object({ scope: z.literal("ASTROLOGER"), astrologerId: z.string().max(40), values: astrologerValues, reason: z.string().trim().max(300).optional(), applyNow: z.boolean().optional() }),
]);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

tdsRouter.get("/tds", async (req, res) => {
  requirePage(req, "tds");
  const admin = adminOf(req);
  const [ctx, astrologers, pending, history] = await Promise.all([
    loadTdsContext(),
    db.astrologer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, lifecycle: true } }),
    db.tdsChange.findMany({ where: { state: "PENDING" }, orderBy: { createdAt: "asc" } }),
    db.tdsChange.findMany({ where: { state: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 15 }),
  ]);
  const caps = capabilitiesOf(admin.adminRole);
  const view = (c: (typeof pending)[number]) => ({
    id: c.id,
    scope: c.scope,
    scopeLabel: c.scope === "GLOBAL" ? "the global TDS rules" : `${c.astrologerName ?? "an astrologer"}'s TDS settings`,
    astrologerId: c.astrologerId,
    proposed: c.proposed,
    previous: c.previous,
    reason: c.reason,
    state: c.state,
    by: c.proposedByName,
    byId: c.proposedById,
    at: istStamp(c.createdAt),
    decidedBy: c.decidedByName,
    decidedAt: c.decidedAt ? istStamp(c.decidedAt) : null,
    decisionNote: c.decisionNote,
  });
  res.json({
    tds: {
      global: ctx.global,
      astrologers: astrologers.map((a) => {
        const r = ctx.rateOf(a.id);
        return {
          id: a.id,
          name: a.name,
          lifecycle: a.lifecycle,
          hasPan: r.hasPan,
          profile: r.profile,
          effectivePct: r.pct,
          effectiveNote: r.note,
          thresholdPerPayout: r.thresholdPerPayout,
          paidThisYear: ctx.yearToDate(a.id),
          pending: pending.some((p) => p.astrologerId === a.id),
        };
      }),
      pending: pending.map(view),
      history: history.map(view),
      can: { propose: caps.includes("tds.propose"), acknowledge: caps.includes("tds.acknowledge") },
      me: admin.user.id,
    },
  });
});

/** Writes an acknowledged change into the live rules. */
async function applyChange(c: { scope: string; astrologerId: string | null; proposed: unknown }, by: string) {
  if (c.scope === "GLOBAL") {
    await putSetting(TDS_SETTING, globalValues.parse(c.proposed));
    return;
  }
  const v = astrologerValues.parse(c.proposed);
  await db.tdsProfile.upsert({
    where: { astrologerId: c.astrologerId! },
    create: { astrologerId: c.astrologerId!, ...v, updatedByName: by },
    update: { ...v, updatedByName: by },
  });
}

tdsRouter.post("/tds/propose", async (req, res) => {
  requirePage(req, "tds");
  const admin = requireCapability(req, "tds.propose", "Your role can't change TDS settings.");
  const body = proposeBody.parse(req.body ?? {});
  const ctx = await loadTdsContext();

  let previous: unknown;
  let astrologerName: string | null = null;
  if (body.scope === "GLOBAL") {
    previous = ctx.global;
  } else {
    const a = await db.astrologer.findUnique({ where: { id: body.astrologerId }, select: { name: true } });
    if (!a) throw notFound("That astrologer doesn't exist.");
    astrologerName = a.name;
    const p: TdsOverride = ctx.rateOf(body.astrologerId).profile ?? DEFAULT_OVERRIDE;
    previous = { residentialStatus: p.residentialStatus, billingAddress: p.billingAddress, ratePct: p.ratePct, exempt: p.exempt, thresholdPerPayout: p.thresholdPerPayout, note: p.note };
  }
  if (same(previous, body.values)) throw badRequest("Nothing is different from what is in force now.");
  const open = await db.tdsChange.findFirst({ where: { state: "PENDING", scope: body.scope, astrologerId: body.scope === "ASTROLOGER" ? body.astrologerId : null } });
  if (open) throw conflict("There is already a change waiting to be acknowledged for this. A Super Admin has to acknowledge or reject it first.");

  const change = await db.tdsChange.create({
    data: {
      scope: body.scope,
      astrologerId: body.scope === "ASTROLOGER" ? body.astrologerId : null,
      astrologerName,
      proposed: body.values,
      previous: previous as object,
      reason: body.reason || null,
      proposedById: admin.user.id,
      proposedByName: actorName(admin),
    },
  });
  const label = body.scope === "GLOBAL" ? "the global TDS rules" : `${astrologerName}'s TDS settings`;
  await audit(admin, "tds.propose", change.id, `${label} · PENDING${body.reason ? ` · ${body.reason}` : ""}`);

  // A Super Admin may put their own proposal straight into force (recorded as self-approved).
  if (body.applyNow && admin.adminRole === "super") {
    await applyChange(change, actorName(admin));
    await db.tdsChange.update({ where: { id: change.id }, data: { state: "ACKNOWLEDGED", decidedById: admin.user.id, decidedByName: actorName(admin), decidedAt: new Date(), decisionNote: "Applied by the proposing Super Admin" } });
    await audit(admin, "tds.acknowledge", change.id, `${label} · PENDING → ACKNOWLEDGED · self-approved by Super Admin`);
    return res.status(201).json({ ok: true, id: change.id, applied: true });
  }
  await staffTdsProposed({ scopeLabel: label, byName: actorName(admin), proposerId: admin.user.id });
  res.status(201).json({ ok: true, id: change.id, applied: false });
});

tdsRouter.post("/tds/changes/:id/acknowledge", async (req, res) => {
  requirePage(req, "tds");
  const admin = requireCapability(req, "tds.acknowledge", "Only a Super Admin can acknowledge a TDS change.");
  const c = await db.tdsChange.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("That change doesn't exist.");
  if (c.state !== "PENDING") throw conflict(`That change was already ${c.state.toLowerCase()}.`);
  const self = secondPerson(admin, c.proposedById === admin.user.id, "Blocked — you proposed this change. A different person acknowledges it.");
  // Take it first (so two people can't both apply it), then write it into force.
  const { count } = await db.tdsChange.updateMany({ where: { id: c.id, state: "PENDING" }, data: { state: "ACKNOWLEDGED", decidedById: admin.user.id, decidedByName: actorName(admin), decidedAt: new Date() } });
  if (!count) throw conflict("Someone else just decided this change.");
  try {
    await applyChange(c, actorName(admin));
  } catch (e) {
    await db.tdsChange.update({ where: { id: c.id }, data: { state: "PENDING", decidedById: null, decidedByName: null, decidedAt: null } });
    throw e;
  }
  const label = c.scope === "GLOBAL" ? "the global TDS rules" : `${c.astrologerName}'s TDS settings`;
  await audit(admin, "tds.acknowledge", c.id, `${label} · PENDING → ACKNOWLEDGED${self}`);
  await staffTdsDecided({ proposerId: c.proposedById, scopeLabel: label, acknowledged: true, byName: actorName(admin) });
  res.json({ ok: true });
});

tdsRouter.post("/tds/changes/:id/reject", async (req, res) => {
  requirePage(req, "tds");
  const admin = requireCapability(req, "tds.acknowledge", "Only a Super Admin can reject a TDS change.");
  const { note } = z.object({ note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  const c = await db.tdsChange.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("That change doesn't exist.");
  const { count } = await db.tdsChange.updateMany({ where: { id: c.id, state: "PENDING" }, data: { state: "REJECTED", decidedById: admin.user.id, decidedByName: actorName(admin), decidedAt: new Date(), decisionNote: note || null } });
  if (!count) throw conflict(`That change was already ${c.state.toLowerCase()}.`);
  const label = c.scope === "GLOBAL" ? "the global TDS rules" : `${c.astrologerName}'s TDS settings`;
  await audit(admin, "tds.reject", c.id, `${label} · PENDING → REJECTED${note ? ` · ${note}` : ""}`);
  await staffTdsDecided({ proposerId: c.proposedById, scopeLabel: label, acknowledged: false, byName: actorName(admin), note });
  res.json({ ok: true });
});

export type { TdsGlobal };
