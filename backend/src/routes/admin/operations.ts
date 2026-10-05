import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { conflict, forbidden, notFound } from "../../lib/errors.ts";
import { ageLabel, istDate, rupee } from "../../lib/format.ts";
import { adminOf, requirePage } from "../../lib/rbac.ts";
import { configNumber } from "../../lib/settings.ts";
import type { Applicant, Prisma } from "../../generated/prisma/client.ts";

export const operationsRouter = Router();

// ── Astrologer lifecycle (HR) ──

const STAGES = ["Under review", "Docs pending", "Interview", "Negotiation", "Pricing", "Training"];

interface Negotiation {
  round: number;
  maxRounds: number;
  rows: { mode: string; requested: number; proposed: number }[];
}

function applicantView(a: Applicant, slaDays: number, now: Date) {
  return {
    id: a.id,
    name: a.name,
    skill: a.skill,
    state: a.state,
    age: ageLabel(a.submittedAt, now),
    breach: now.getTime() - a.submittedAt.getTime() > slaDays * 86400000,
    version: a.version,
  };
}

/** The next Price Version id: one after the latest created (PV-00417 → PV-00418). */
async function nextPriceVersion(): Promise<string> {
  const last = await db.auditLog.findFirst({ where: { action: "price.version.create" }, orderBy: { at: "desc" } });
  const n = last ? Number(last.object.replace(/\D/g, "")) : 0;
  return `PV-${String((Number.isFinite(n) ? n : 0) + 1).padStart(5, "0")}`;
}

/** Optimistic locking: the action must quote the version the admin was looking at. */
async function lockedApplicant(id: string, version: number) {
  const a = await db.applicant.findUnique({ where: { id } });
  if (!a) throw notFound("Application not found.");
  if (a.version !== version) throw conflict("This application changed while you had it open. Reload to see the latest version.");
  return a;
}

operationsRouter.get("/lifecycle", async (req, res) => {
  requirePage(req, "hr");
  const now = new Date();
  const slaDays = await configNumber("hr.application.review_sla_days", 5);
  const [list, nextVersion] = await Promise.all([db.applicant.findMany({ orderBy: { submittedAt: "asc" } }), nextPriceVersion()]);
  const negotiating = list.find((a) => a.negotiation);
  const neg = negotiating?.negotiation as Negotiation | undefined;
  const count = (state: string) => list.filter((a) => a.state === state).length;
  res.json({
    lifecycle: {
      filters: [
        { label: "All", count: list.length },
        { label: "Under review", count: count("Under review") },
        { label: "Interview", count: count("Interview") },
        { label: "Negotiation", count: count("Negotiation") },
        { label: "Pricing", count: count("Pricing") },
      ],
      applications: list.map((a) => applicantView(a, slaDays, now)),
      negotiation:
        negotiating && neg
          ? {
              appId: negotiating.id,
              applicant: negotiating.name,
              version: negotiating.version,
              round: neg.round,
              maxRounds: neg.maxRounds,
              rows: neg.rows.map((r) => ({ mode: r.mode, requested: `${rupee(r.requested)}/min`, proposed: `${rupee(r.proposed)}/min` })),
            }
          : null,
      pricing: { effective: istDate(new Date(now.getTime() + 3 * 86400000)), mode: "Dual — HR + Finance", version: nextVersion },
    },
  });
});

operationsRouter.post("/applicants/:id/:action", async (req, res) => {
  const admin = requirePage(req, "hr");
  const action = z.enum(["advance", "request-info", "reject", "interview", "accept-rates", "counter"]).parse(req.params.action);
  const { version, reason } = z.object({ version: z.number().int(), reason: z.string().trim().max(500).optional() }).parse(req.body);
  const a = await lockedApplicant(String(req.params.id), version);
  const neg = a.negotiation as Negotiation | null;
  let data: Prisma.ApplicantUpdateInput = {};
  let diff = "";

  switch (action) {
    case "advance": {
      const next = STAGES[STAGES.indexOf(a.state) + 1];
      if (!next) throw conflict("This application is already at the last stage.");
      data = { state: next };
      diff = `${a.state} → ${next}`;
      break;
    }
    case "request-info":
      if (!reason || reason.length < 10) throw forbidden("Write a reason of at least 10 characters so the applicant knows what's needed.");
      data = { state: "Docs pending" };
      diff = `${a.state} → Docs pending · ${reason}`;
      break;
    case "reject":
      if (!reason) throw forbidden("A rejection needs a reason.");
      await db.applicant.delete({ where: { id: a.id } });
      await audit(admin, "application.reject", a.id, `${a.state} → REJECTED · ${reason}`);
      return res.json({ ok: true, removed: true });
    case "interview":
      data = { state: "Interview" };
      diff = `${a.state} → Interview`;
      break;
    case "accept-rates":
      if (!neg) throw conflict("There is no rate proposal on this application.");
      data = { state: "Pricing" };
      diff = `Negotiation → Pricing · ${neg.rows.map((r) => `${r.mode} ${rupee(r.proposed)}`).join(", ")}`;
      break;
    case "counter":
      if (!neg) throw conflict("There is no rate proposal on this application.");
      if (neg.round >= neg.maxRounds) throw conflict("Round cap reached — no further counter-offers are permitted.");
      data = { negotiation: { ...neg, round: neg.round + 1 } };
      diff = `round ${neg.round} → ${neg.round + 1}`;
      break;
  }
  const updated = await db.applicant.update({ where: { id: a.id }, data: { ...data, version: { increment: 1 } } });
  await audit(admin, `application.${action}`, a.id, diff);
  const slaDays = await configNumber("hr.application.review_sla_days", 5);
  res.json({ application: applicantView(updated, slaDays, new Date()) });
});

operationsRouter.post("/pricing/versions", async (req, res) => {
  const admin = requirePage(req, "hr");
  const id = await nextPriceVersion();
  await audit(admin, "price.version.create", id, "— → created (immutable)");
  res.status(201).json({ version: id });
});

// ── Marketing ──

const RIBBON = ["DRAFT", "SUBMITTED", "REVIEW", "APPROVED", "SCHEDULED", "ACTIVE", "EXPIRED"];

operationsRouter.get("/marketing", async (req, res) => {
  requirePage(req, "marketing");
  const [campaigns, gifts, cap] = await Promise.all([
    db.campaign.findMany({ orderBy: { rank: "asc" } }),
    db.gift.findMany({ orderBy: { rank: "asc" } }),
    configNumber("marketing.gift.max_value", 5100),
  ]);
  const active = campaigns.find((c) => c.state === "ACTIVE");
  res.json({
    marketing: {
      ribbon: RIBBON,
      activeIndex: 5,
      ribbonCampaign: active ? `${active.id} · ${active.name}` : "",
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, denoms: c.denoms, cashback: c.cashback, state: c.state })),
      gifts: gifts.map((g) => ({ id: g.id, icon: g.icon, name: g.name, price: rupee(g.price), state: g.price >= cap && g.state === "ACTIVE" ? "AT CAP" : g.state })),
      giftCap: rupee(cap),
    },
  });
});

operationsRouter.post("/campaigns/:id/:action", async (req, res) => {
  const admin = requirePage(req, "marketing");
  const action = z.enum(["submit", "duplicate", "approve"]).parse(req.params.action);
  const c = await db.campaign.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("Campaign not found.");
  if (action === "submit") {
    if (c.state !== "DRAFT") throw conflict(`${c.id} is ${c.state.toLowerCase()} — only drafts can be submitted.`);
    await db.campaign.update({ where: { id: c.id }, data: { state: "SUBMITTED" } });
    await audit(admin, "campaign.submit", c.id, "DRAFT → SUBMITTED");
  } else if (action === "approve") {
    if (adminOf(req).adminRole !== "super") throw forbidden("Only an Admin can approve and activate campaigns.");
    if (c.state !== "SUBMITTED" && c.state !== "UNDER_REVIEW") throw conflict(`${c.id} isn't waiting for approval.`);
    await db.campaign.update({ where: { id: c.id }, data: { state: "ACTIVE" } });
    await audit(admin, "campaign.approve", c.id, `${c.state} → ACTIVE`);
  } else {
    const count = await db.campaign.count();
    const id = `CMP-${12 + count + 1}`;
    await db.campaign.create({ data: { id, name: `${c.name} (copy)`, denoms: c.denoms, cashback: c.cashback, state: "DRAFT", rank: count } });
    await audit(admin, "campaign.duplicate", c.id, `→ ${id} DRAFT`);
    return res.status(201).json({ id });
  }
  res.json({ ok: true });
});
