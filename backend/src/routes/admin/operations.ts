import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { RATE_MAX, RATE_MIN, STAGE_LIFECYCLE, answersFor, draftValues, requestedRate, setNote } from "../../lib/application.ts";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { instantRate, rateFor } from "../../lib/billing.ts";
import { ageLabel, istDate, istStamp, rupee } from "../../lib/format.ts";
import { requireCapability, requirePage } from "../../lib/rbac.ts";
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
    submittedAt: a.submittedAt.toISOString(),
    version: a.version,
    /** Sent from the astrologer portal (stages are mirrored onto the account; it can be activated). */
    fromPortal: a.astrologerId !== null,
  };
}

const staleApplicant = () => conflict("This application changed while you had it open. Reload to see the latest version.");

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
  if (a.version !== version) throw staleApplicant();
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

/** Every astrologer on the platform with where they are in the lifecycle (filtered in the console). */
operationsRouter.get("/lifecycle/astrologers", async (req, res) => {
  requirePage(req, "hr");
  const list = await db.astrologer.findMany({
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      initials: true,
      photo: true,
      skills: true,
      lifecycle: true,
      suspension: true,
      presence: true,
      consults: true,
      rating: true,
      createdAt: true,
    },
  });
  res.json({
    astrologers: list.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      initials: a.initials,
      photo: a.photo,
      skills: a.skills,
      lifecycle: a.lifecycle,
      suspension: a.suspension,
      online: a.presence !== "OFF",
      consults: a.consults,
      rating: a.rating,
      joined: istDate(a.createdAt),
      joinedAt: a.createdAt.toISOString(),
    })),
  });
});

/** One astrologer's full record for the lifecycle popup. */
operationsRouter.get("/lifecycle/astrologers/:id", async (req, res) => {
  requirePage(req, "hr");
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400000);
  const a = await db.astrologer.findUnique({
    where: { id: String(req.params.id) },
    include: {
      user: { select: { email: true, phone: true, lastLoginAt: true } },
      liveRoom: { select: { isLive: true, topic: true } },
      training: { select: { done: true } },
      application: { select: { savedAt: true, currentStep: true } },
    },
  });
  if (!a) throw notFound("Astrologer not found.");
  const [month, last, reviews, notices] = await Promise.all([
    db.consultation.aggregate({ where: { astrologerId: a.id, status: "ENDED", connectedAt: { gte: since } }, _count: { _all: true }, _sum: { total: true, billedMinutes: true } }),
    db.consultation.findFirst({ where: { astrologerId: a.id, status: "ENDED" }, orderBy: { endedAt: "desc" }, select: { endedAt: true } }),
    db.review.count({ where: { astrologerId: a.id, status: "VISIBLE" } }),
    db.complianceNotice.count({ where: { astrologerId: a.id, status: { not: "DECIDED" } } }),
  ]);
  res.json({
    astrologer: {
      id: a.id,
      slug: a.slug,
      name: a.name,
      photo: a.photo,
      gender: a.gender,
      greeting: a.greeting,
      about: a.about,
      recognition: a.recognition.toLowerCase(),
      lifecycle: a.lifecycle,
      suspension: a.suspension,
      presence: a.presence.toLowerCase(),
      skills: a.skills,
      languages: a.languages,
      years: a.years,
      joined: istDate(a.createdAt),
      consults: a.consults,
      rating: a.rating,
      ratings: a.ratingDistribution.reduce((s, n) => s + n, 0),
      reviews,
      price: {
        chat: rupee(a.price),
        voice: rupee(a.price),
        video: rupee(rateFor(a.price, "VIDEO")),
        instant: rupee(instantRate(a.price, a.instantMultiplier)),
        multiplier: a.instantMultiplier,
        was: a.was ? rupee(a.was) : null,
      },
      month: { consultations: month._count._all, minutes: month._sum.billedMinutes ?? 0, billed: rupee(month._sum.total ?? 0) },
      lastConsultation: last?.endedAt ? istDate(last.endedAt) : null,
      contact: a.user ? { email: a.user.email, phone: a.user.phone, lastSignIn: a.user.lastLoginAt ? istDate(a.user.lastLoginAt) : null } : null,
      live: a.liveRoom ? { isLive: a.liveRoom.isLive, topic: a.liveRoom.topic } : null,
      training: a.training.length ? { done: a.training.filter((t) => t.done).length, total: a.training.length } : null,
      application: a.application ? { step: a.application.currentStep + 1, savedAt: istDate(a.application.savedAt) } : null,
      openNotices: notices,
    },
  });
});

/** One application with its negotiation and the audit trail of every action taken on it. */
operationsRouter.get("/applicants/:id", async (req, res) => {
  requirePage(req, "hr");
  const now = new Date();
  const a = await db.applicant.findUnique({ where: { id: String(req.params.id) } });
  if (!a) throw notFound("This application is no longer open — it may have been rejected or approved.");
  const [slaDays, history, astro] = await Promise.all([
    configNumber("hr.application.review_sla_days", 5),
    db.auditLog.findMany({ where: { object: a.id }, orderBy: { at: "desc" }, take: 20 }),
    a.astrologerId
      ? db.astrologer.findUnique({
          where: { id: a.astrologerId },
          include: { user: { select: { email: true, phone: true } }, application: { select: { values: true } } },
        })
      : null,
  ]);
  const neg = a.negotiation as Negotiation | null;
  res.json({
    application: {
      ...applicantView(a, slaDays, now),
      submitted: istDate(a.submittedAt),
      slaDays,
      negotiation: neg
        ? {
            round: neg.round,
            maxRounds: neg.maxRounds,
            rows: neg.rows.map((r) => ({ mode: r.mode, requested: `${rupee(r.requested)}/min`, proposed: `${rupee(r.proposed)}/min` })),
          }
        : null,
      history: history.map((h) => ({ when: istStamp(h.at), action: h.action, who: h.actorName, diff: h.diff })),
      // What the astrologer filled in on the portal (null for applications entered by HR).
      portal: astro
        ? {
            astrologerId: astro.id,
            answers: answersFor(draftValues(astro.application?.values), astro, { email: astro.user?.email ?? null, phone: astro.user?.phone ?? null }),
            requestedRate: requestedRate(draftValues(astro.application?.values)),
            rateLimits: { min: RATE_MIN, max: RATE_MAX },
          }
        : null,
    },
  });
});

operationsRouter.post("/applicants/:id/:action", async (req, res) => {
  const admin = requirePage(req, "hr");
  const action = z.enum(["advance", "request-info", "reject", "interview", "accept-rates", "counter", "activate"]).parse(req.params.action);
  const { version, reason, rate } = z
    .object({
      version: z.number().int(),
      reason: z.string().trim().max(500).optional(),
      rate: z
        .number("Enter the per-minute rate.")
        .int("Use whole rupees for the rate.")
        .min(RATE_MIN, `The rate must be at least ${rupee(RATE_MIN)}/min.`)
        .max(RATE_MAX, `The rate can be at most ${rupee(RATE_MAX)}/min.`)
        .optional(),
    })
    .parse(req.body);
  const a = await lockedApplicant(String(req.params.id), version);
  const neg = a.negotiation as Negotiation | null;
  let data: Prisma.ApplicantUpdateInput = {};
  let diff = "";

  switch (action) {
    case "advance": {
      const next = STAGES[STAGES.indexOf(a.state) + 1];
      if (!next) {
        throw conflict(
          a.astrologerId
            ? "This application is at the last stage — use Approve & activate."
            : "This application is already at the last stage.",
        );
      }
      data = { state: next };
      diff = `${a.state} → ${next}`;
      break;
    }
    case "request-info":
      if (!reason || reason.length < 10) throw forbidden("Write a reason of at least 10 characters so the applicant knows what's needed.");
      data = { state: "Docs pending" };
      diff = `${a.state} → Docs pending · ${reason}`;
      break;
    case "reject": {
      if (!reason) throw forbidden("A rejection needs a reason.");
      // The application leaves the open queue. A portal applicant's account is marked rejected
      // (and taken offline) and keeps the reason, which their portal shows.
      await db.$transaction(async (tx) => {
        const { count } = await tx.applicant.deleteMany({ where: { id: a.id, version } });
        if (!count) throw staleApplicant();
        if (a.astrologerId) {
          await tx.astrologer.update({ where: { id: a.astrologerId }, data: { lifecycle: "rejected", presence: "OFF" } });
          await setNote(tx, a.astrologerId, reason);
        }
      });
      await audit(admin, "application.reject", a.id, `${a.state} → REJECTED · ${reason}`);
      return res.json({ ok: true, removed: true });
    }
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
    case "activate": {
      // Approve & activate: only a portal applicant, only once training (the last stage) is reached.
      if (!a.astrologerId) throw conflict("This application has no portal account to activate.");
      if (a.state !== STAGES[STAGES.length - 1]) throw conflict(`Approve & activate is available at the ${STAGES[STAGES.length - 1]} stage. This application is at ${a.state}.`);
      if (rate === undefined) throw badRequest("Enter the per-minute rate.");
      const astrologerId = a.astrologerId;
      const astro = await db.$transaction(async (tx) => {
        const { count } = await tx.applicant.deleteMany({ where: { id: a.id, version } });
        if (!count) throw staleApplicant();
        // Listed publicly from now on; offline until the astrologer goes online themselves.
        return tx.astrologer.update({ where: { id: astrologerId }, data: { lifecycle: "active", price: rate, was: null, presence: "OFF" } });
      });
      await audit(admin, "application.activate", a.id, `${a.state} → ACTIVE · ${astro.id} · ${rupee(rate)}/min`);
      return res.json({ ok: true, removed: true, astrologer: { id: astro.id, slug: astro.slug, price: astro.price } });
    }
  }
  const updated = await db.$transaction(async (tx) => {
    // The version is checked again here, so two admins acting at once can't both succeed.
    const { count } = await tx.applicant.updateMany({ where: { id: a.id, version }, data: { ...(data as Prisma.ApplicantUpdateManyMutationInput), version: { increment: 1 } } });
    if (!count) throw staleApplicant();
    const next = await tx.applicant.findUniqueOrThrow({ where: { id: a.id } });
    // A portal applicant sees HR's stage on their own account (and HR's note when info is requested).
    if (next.astrologerId && next.state !== a.state) {
      const lifecycle = STAGE_LIFECYCLE[next.state];
      if (lifecycle) await tx.astrologer.update({ where: { id: next.astrologerId }, data: { lifecycle } });
    }
    if (next.astrologerId && action === "request-info" && reason) await setNote(tx, next.astrologerId, reason);
    return next;
  });
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
  requirePage(req, "marketing");
  const action = z.enum(["submit", "duplicate", "approve"]).parse(req.params.action);
  // Marketing builds and submits; only an Admin approves and activates.
  const admin =
    action === "approve"
      ? requireCapability(req, "campaign.approve", "Only an Admin can approve and activate campaigns.")
      : requireCapability(req, "campaign.submit");
  const c = await db.campaign.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("Campaign not found.");
  if (action === "submit") {
    if (c.state !== "DRAFT") throw conflict(`${c.id} is ${c.state.toLowerCase()} — only drafts can be submitted.`);
    await db.campaign.update({ where: { id: c.id }, data: { state: "SUBMITTED" } });
    await audit(admin, "campaign.submit", c.id, "DRAFT → SUBMITTED");
  } else if (action === "approve") {
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
