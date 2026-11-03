import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { RATE_MAX, RATE_MIN, STAGE_LIFECYCLE, answersFor, draftValues, requestedRate, setNote } from "../../lib/application.ts";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { chatRate, instantRate, rateFor } from "../../lib/billing.ts";
import { ageLabel, istDate, istDateKey, istStamp, rupee } from "../../lib/format.ts";
import { AUDIENCES, CAMPAIGN_KINDS, announceCampaign, appliedPct, floorCap, isLegacy, isOpen, offerLimits, offerProblem, offerSummary } from "../../lib/campaigns.ts";
import { actorName, capabilitiesOf, requireCapability, requirePage } from "../../lib/rbac.ts";
import { lockKey } from "../../lib/consultations.ts";
import { type PriceChannel, approvalProblem, channelName, channelPrice, priceChangeView, priceUpdate, pricingPolicy } from "../../lib/pricing.ts";
import { removeGalleryPhoto } from "../../lib/gallery.ts";
import { deleteMedia } from "../../lib/media.ts";
import { configNumber } from "../../lib/settings.ts";
import { capacityProblem, capacityView, periodName, welcomePolicy } from "../../lib/welcome.ts";
import type { Applicant, Campaign, Prisma } from "../../generated/prisma/client.ts";

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
  const negotiating = list.find((a) => a.negotiation && a.state === "Negotiation");
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
  const [month, last, reviews, notices, freeCalls, priceChanges] = await Promise.all([
    db.consultation.aggregate({ where: { astrologerId: a.id, status: "ENDED", connectedAt: { gte: since } }, _count: { _all: true }, _sum: { total: true, billedMinutes: true } }),
    db.consultation.findFirst({ where: { astrologerId: a.id, status: "ENDED" }, orderBy: { endedAt: "desc" }, select: { endedAt: true } }),
    db.review.count({ where: { astrologerId: a.id, status: "VISIBLE" } }),
    db.complianceNotice.count({ where: { astrologerId: a.id, status: { not: "DECIDED" } } }),
    welcomePolicy().then((policy) => capacityView(a, policy, now)),
    db.priceChange.findMany({ where: { astrologerId: a.id }, orderBy: { requestedAt: "desc" }, take: 8 }),
  ]);
  const pendingChange = priceChanges.find((c) => c.status === "PENDING");
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
        /** Chat & voice ₹/min as a number. */
        value: a.price,
        chat: rupee(chatRate(a)),
        voice: rupee(a.price),
        video: rupee(rateFor(a.price, "VIDEO")),
        instant: rupee(instantRate(a.price, a.instantMultiplier)),
        multiplier: a.instantMultiplier,
        was: a.was ? rupee(a.was) : null,
        /** When the astrologer last changed their own price in the portal (null = never). */
        changedAt: a.priceChangedAt ? istDate(a.priceChangedAt) : null,
        /** An increase waiting for approval (decided on the Price requests tab), or null. */
        pending: pendingChange ? priceChangeView(pendingChange) : null,
        /** Recent changes and requests, newest first (none for changes made before approvals existed). */
        history: priceChanges.filter((c) => c.status !== "PENDING").slice(0, 6).map(priceChangeView),
      },
      month: { consultations: month._count._all, minutes: month._sum.billedMinutes ?? 0, billed: rupee(month._sum.total ?? 0) },
      lastConsultation: last?.endedAt ? istDate(last.endedAt) : null,
      contact: a.user ? { email: a.user.email, phone: a.user.phone, lastSignIn: a.user.lastLoginAt ? istDate(a.user.lastLoginAt) : null } : null,
      live: a.liveRoom ? { isLive: a.liveRoom.isLive, topic: a.liveRoom.topic } : null,
      training: a.training.length ? { done: a.training.filter((t) => t.done).length, total: a.training.length } : null,
      application: a.application ? { step: a.application.currentStep + 1, savedAt: istDate(a.application.savedAt) } : null,
      openNotices: notices,
      // Published straight from the portal (no review); staff can take an item down below.
      introVideoUrl: a.introVideoUrl,
      gallery: a.gallery,
      // Welcome campaign: whether customers can use their free call with this astrologer.
      // (The astrologer sets their own capacity in the portal; HR can change it here too.)
      freeCalls,
    },
  });
});

/**
 * Welcome campaign settings for one astrologer (HR): take part in free calls or not, and their
 * own capacity per day or per week (null = the campaign's daily default) within the admin
 * maximum (Config welcome.astrologer_max_per_day / _per_week) — the same rules as the portal,
 * where the astrologer sets it themselves. Each change is audited.
 */
operationsRouter.patch("/lifecycle/astrologers/:id/free-calls", async (req, res) => {
  const admin = requirePage(req, "hr");
  const input = z
    .object({
      enabled: z.boolean().optional(),
      dailyLimit: z.number("Enter the limit as a whole number.").nullable().optional(),
      period: z.enum(["DAY", "WEEK"]).optional(),
    })
    .parse(req.body);
  const a = await db.astrologer.findUnique({ where: { id: String(req.params.id) } });
  if (!a) throw notFound("Astrologer not found.");
  const policy = await welcomePolicy();
  const period = input.period ?? (a.freeCallsLimitPeriod === "WEEK" ? "WEEK" : "DAY");
  const limit = input.dailyLimit === undefined ? a.freeCallsDailyLimit : input.dailyLimit;
  if (limit !== null && (input.dailyLimit !== undefined || input.period !== undefined)) {
    const problem = capacityProblem(limit, period, policy);
    if (problem) throw badRequest(problem);
  }
  const data: Prisma.AstrologerUpdateInput = {};
  if (input.enabled !== undefined && input.enabled !== a.freeCallsEnabled) data.freeCallsEnabled = input.enabled;
  if (limit !== a.freeCallsDailyLimit) data.freeCallsDailyLimit = limit;
  // The campaign default is per day.
  const newPeriod = limit === null ? "DAY" : period;
  if (newPeriod !== a.freeCallsLimitPeriod) data.freeCallsLimitPeriod = newPeriod;
  if (Object.keys(data).length) {
    await db.astrologer.update({ where: { id: a.id }, data });
    const limitLabel = (n: number | null, p: string) => (n === null ? "campaign default" : `${n} per ${periodName(p === "WEEK" ? "WEEK" : "DAY")}`);
    if (data.freeCallsEnabled !== undefined) {
      await audit(admin, "astrologer.free_calls.update", a.id, `${a.freeCallsEnabled ? "on" : "off"} → ${input.enabled ? "on" : "off"}`);
    }
    if (data.freeCallsDailyLimit !== undefined || data.freeCallsLimitPeriod !== undefined) {
      await audit(admin, "astrologer.free_calls.limit", a.id, `${limitLabel(a.freeCallsDailyLimit, a.freeCallsLimitPeriod)} → ${limitLabel(limit, newPeriod)}`);
    }
  }
  const fresh = await db.astrologer.findUniqueOrThrow({ where: { id: a.id } });
  res.json({ freeCalls: { ...(await capacityView(fresh, policy)), dailyLimit: fresh.freeCallsDailyLimit } });
});

/**
 * Takes down an inappropriate intro video or gallery photo (HR). The file is deleted and the
 * action audited; the astrologer can upload a replacement from their portal.
 */
operationsRouter.post("/lifecycle/astrologers/:id/media/remove", async (req, res) => {
  const admin = requirePage(req, "hr");
  const { url, reason } = z
    .object({ url: z.string().max(200), reason: z.string().trim().max(300).optional() })
    .parse(req.body);
  const a = await db.astrologer.findUnique({ where: { id: String(req.params.id) }, select: { id: true, introVideoUrl: true, gallery: true } });
  if (!a) throw notFound("Astrologer not found.");
  const why = reason ? ` · ${reason}` : "";
  if (a.introVideoUrl && a.introVideoUrl === url) {
    // Only clears it if it's still the same video (the astrologer may have replaced it meanwhile).
    const { count } = await db.astrologer.updateMany({ where: { id: a.id, introVideoUrl: url }, data: { introVideoUrl: null } });
    if (count) {
      await deleteMedia(url);
      await audit(admin, "astrologer.intro_video.takedown", a.id, `intro video removed by staff${why}`);
    }
  } else {
    const { removed, position } = await removeGalleryPhoto(a.id, url);
    if (!removed) throw notFound("That photo or video is no longer on this profile.");
    await audit(admin, "astrologer.gallery.takedown", a.id, `gallery photo ${position} removed by staff${why}`);
  }
  const fresh = await db.astrologer.findUniqueOrThrow({ where: { id: a.id }, select: { introVideoUrl: true, gallery: true } });
  res.json(fresh);
});

// ── Price requests: astrologers' increases waiting for approval (decreases apply at once) ──

/** The queue (oldest first) with each astrologer's recent changes, and the last 30 days' decisions. */
operationsRouter.get("/lifecycle/price-requests", async (req, res) => {
  const admin = requirePage(req, "hr");
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400000);
  const [policy, pending, recent] = await Promise.all([
    pricingPolicy(),
    db.priceChange.findMany({
      where: { status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      include: {
        astrologer: {
          select: { id: true, name: true, photo: true, slug: true, price: true, chatPrice: true, chatPriceChangedAt: true, lifecycle: true, priceChangedAt: true },
        },
      },
    }),
    db.priceChange.findMany({
      where: { status: { not: "PENDING" }, OR: [{ decidedAt: { gte: since } }, { requestedAt: { gte: since } }] },
      orderBy: { requestedAt: "desc" },
      take: 50,
      include: { astrologer: { select: { id: true, name: true, photo: true } } },
    }),
  ]);
  const ids = [...new Set(pending.map((p) => p.astrologerId))];
  const history = ids.length
    ? await db.priceChange.findMany({ where: { astrologerId: { in: ids }, status: { not: "PENDING" } }, orderBy: { requestedAt: "desc" }, take: 200 })
    : [];
  res.json({
    canDecide: capabilitiesOf(admin.adminRole).includes("price.approve"),
    maxIncrease: policy.maxIncrease,
    pending: pending.map((p) => {
      // The price this request is for: the call price or the separate chat price.
      const current = channelPrice(p.astrologer, p.channel === "CHAT" ? "CHAT" : "CALL");
      return {
      ...priceChangeView(p),
      astrologer: { id: p.astrologer.id, name: p.astrologer.name, photo: p.astrologer.photo, slug: p.astrologer.slug, price: current.price },
      /** How long it has waited: "4 min", "6h", "2d". */
      waiting: ageLabel(p.requestedAt, now, "long"),
      /** Last changed (decrease applied or increase approved), or null. */
      lastChangedOn: current.priceChangedAt ? istDate(current.priceChangedAt) : null,
      /** Why it can't be approved as things stand (e.g. the price moved), or null. */
      problem: approvalProblem(current, p.toPrice, policy),
      history: history.filter((h) => h.astrologerId === p.astrologerId && h.channel === p.channel).slice(0, 5).map(priceChangeView),
      };
    }),
    recent: recent.map((c) => ({ ...priceChangeView(c), astrologer: { id: c.astrologer.id, name: c.astrologer.name, photo: c.astrologer.photo } })),
  });
});

/**
 * Approve or reject an increase (price.approve on the lifecycle page). Approving re-checks it
 * against the price in force now and applies it to new consultations (running ones keep their
 * rate); the cooldown starts from here. Rejecting needs a reason, which the astrologer sees.
 * Serialised per astrologer, so a double click or two staff can't both decide it. Audited.
 */
operationsRouter.post("/lifecycle/price-requests/:id/:action", async (req, res) => {
  requirePage(req, "hr");
  const admin = requireCapability(req, "price.approve", "Your role can see price requests but not decide them.");
  const action = z.enum(["approve", "reject"]).parse(req.params.action);
  const { reason } = z
    .object({ reason: z.string().trim().max(300, "Keep the reason under 300 characters.").optional() })
    .parse(req.body ?? {});
  if (action === "reject" && (!reason || reason.length < 3)) throw badRequest("Give the astrologer a short reason for rejecting it.");
  const found = await db.priceChange.findUnique({ where: { id: String(req.params.id) }, select: { astrologerId: true } });
  if (!found) throw notFound("Price request not found.");
  const policy = await pricingPolicy();
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    await lockKey(tx, `price:${found.astrologerId}`);
    const change = await tx.priceChange.findUniqueOrThrow({ where: { id: String(req.params.id) } });
    if (change.status !== "PENDING") {
      const by = change.decidedByName ? ` by ${change.decidedByName}` : "";
      return { ok: false as const, message: `This request was already ${change.status.toLowerCase()}${by}. Reload to see the latest.` };
    }
    const a = await tx.astrologer.findUniqueOrThrow({ where: { id: change.astrologerId } });
    const decided = { decidedAt: now, decidedById: admin.user.id, decidedByName: actorName(admin) };
    const channel: PriceChannel = change.channel === "CHAT" ? "CHAT" : "CALL";
    const current = channelPrice(a, channel);
    if (action === "reject") {
      await tx.priceChange.update({ where: { id: change.id }, data: { ...decided, status: "REJECTED", reason } });
      return { ok: true as const, change, a, current: current.price };
    }
    const problem = approvalProblem(current, change.toPrice, policy);
    if (problem) return { ok: false as const, message: problem };
    await tx.astrologer.update({ where: { id: a.id }, data: priceUpdate(channel, change.toPrice, now) });
    await tx.priceChange.update({ where: { id: change.id }, data: { ...decided, status: "APPROVED" } });
    return { ok: true as const, change, a, current: current.price };
  });
  if (!result.ok) throw conflict(result.message);
  const { change, a, current } = result;
  if (action === "approve") {
    await audit(admin, "price.change.approve", a.id, `${rupee(current)} → ${rupee(change.toPrice)}/min (${channelName(change.channel)}) · ${a.name}'s request of ${istDate(change.requestedAt)}`);
  } else {
    await audit(admin, "price.change.reject", a.id, `${rupee(change.fromPrice)} → ${rupee(change.toPrice)}/min refused · ${a.name} · ${reason}`);
  }
  res.json({ ok: true, status: action === "approve" ? "APPROVED" : "REJECTED", name: a.name, from: current, to: change.toPrice });
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
      if (!neg || a.state !== "Negotiation") throw conflict(neg ? `Rates can only be accepted at the Negotiation stage. This application is at ${a.state}.` : "There is no rate proposal on this application.");
      data = { state: "Pricing" };
      diff = `Negotiation → Pricing · ${neg.rows.map((r) => `${r.mode} ${rupee(r.proposed)}`).join(", ")}`;
      break;
    case "counter":
      if (!neg || a.state !== "Negotiation") throw conflict(neg ? `Counter-offers can only be made at the Negotiation stage. This application is at ${a.state}.` : "There is no rate proposal on this application.");
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
        // Listed publicly from now on; offline until the astrologer goes online themselves. The first
        // activation starts the new-astrologer earnings share period (lib/earnings.ts).
        const before = await tx.astrologer.findUniqueOrThrow({ where: { id: astrologerId }, select: { activatedAt: true } });
        return tx.astrologer.update({
          where: { id: astrologerId },
          data: { lifecycle: "active", price: rate, was: null, presence: "OFF", activatedAt: before.activatedAt ?? new Date() },
        });
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

/** The states a campaign really moves through (Marketing drafts and submits; an Admin approves, which activates it). */
const CAMPAIGN_FLOW = ["DRAFT", "SUBMITTED", "ACTIVE", "EXPIRED"] as const;
const flowState = (state: string) => (state === "UNDER_REVIEW" ? "SUBMITTED" : state);

/** A calendar day in IST, as the console's date inputs send it: "2026-10-22". */
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-22.");
const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

const campaignInput = z.object({
  kind: z.enum(CAMPAIGN_KINDS),
  name: z.string().trim().min(3, "Give the campaign a name of at least 3 characters.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  percent: optionalInt(1, 100),
  flatAmount: optionalInt(1, 100000),
  minRecharge: optionalInt(0, 1000000),
  maxBenefit: optionalInt(1, 1000000),
  startsOn: dayKey.nullable().optional(),
  endsOn: dayKey.nullable().optional(),
  claimValidDays: z.number().int().min(1).max(90).optional().default(7),
  usesPerCustomer: z.number().int().min(1).max(10).optional().default(1),
  audience: z.enum(AUDIENCES).optional().default("ALL"),
});

/** Outcome promises astrology can't make (as in the copy check and the portal bio check). */
const CLAIM_WORDS = /\bguarantee(?:d|s)?\b|\bdefinitely\b|\bcures?\b|\bmiracles?\b|\bassured\b|\bnever fails?\b/i;

/** The fields a campaign stores, checked for its kind. */
async function campaignFields(body: unknown) {
  const v = campaignInput.parse(body);
  const limits = await offerLimits();
  if (CLAIM_WORDS.test(`${v.name} ${v.description}`)) {
    throw badRequest("The name or description promises an outcome (e.g. “guaranteed”). Rewrite it — check it with the Trust content check.");
  }
  const startsAt = v.startsOn ? new Date(`${v.startsOn}T00:00:00+05:30`) : null;
  // The end date is included: the offer runs until midnight IST at the end of that day.
  const endsAt = v.endsOn ? new Date(`${v.endsOn}T23:59:59.999+05:30`) : null;
  if (startsAt && endsAt && startsAt > endsAt) throw badRequest("The end date is before the start date.");
  if (endsAt && endsAt <= new Date()) throw badRequest("The end date has already passed.");
  const common = { kind: v.kind, name: v.name, description: v.description, startsAt, endsAt, audience: v.audience, claimValidDays: v.claimValidDays };
  if (v.kind === "BONUS_CREDIT") {
    if (!v.flatAmount) throw badRequest("Set the bonus credit amount (₹).");
    if (v.flatAmount > limits.bonusMax) throw badRequest(`A bonus credit can be at most ${rupee(limits.bonusMax)} (marketing.bonus_credit.max).`);
    // Credited once, when claimed.
    return { ...common, percent: null, flatAmount: v.flatAmount, minRecharge: null, maxBenefit: null, usesPerCustomer: 1 };
  }
  if (!v.percent) throw badRequest(v.kind === "CONSULT_DISCOUNT" ? "Set the discount percent." : "Set the cashback percent.");
  if (v.percent > limits.maxPct) throw badRequest(`The percent can be at most ${limits.maxPct}% (marketing.campaign.max_discount_pct).`);
  if (limits.floorMode === "reject" && v.percent > floorCap(limits)) {
    throw badRequest(`The ${limits.floorPct}% cashback floor allows at most ${floorCap(limits)}% (wallet.cashback.floor_pct; Finance's floor mode is "reject").`);
  }
  if (v.kind === "CONSULT_DISCOUNT") {
    return { ...common, percent: v.percent, flatAmount: null, minRecharge: null, maxBenefit: null, usesPerCustomer: v.usesPerCustomer };
  }
  return { ...common, percent: v.percent, flatAmount: null, minRecharge: v.minRecharge || null, maxBenefit: v.maxBenefit ?? null, usesPerCustomer: v.usesPerCustomer };
}

/** "Cashback 10% · min ₹500 · max ₹100 · 22 Oct–31 Oct · claim valid 7 days × 1 · all customers" (audit diff). */
function campaignDiff(c: Campaign) {
  return [
    c.kind,
    c.percent != null ? `${c.percent}%` : null,
    c.flatAmount != null ? rupee(c.flatAmount) : null,
    c.minRecharge ? `min ${rupee(c.minRecharge)}` : null,
    c.maxBenefit ? `max ${rupee(c.maxBenefit)}` : null,
    `${c.startsAt ? istDate(c.startsAt) : "on approval"}–${c.endsAt ? istDate(c.endsAt) : "until ended"}`,
    c.kind === "BONUS_CREDIT" ? null : `claim valid ${c.claimValidDays}d × ${c.usesPerCustomer}`,
    c.audience === "NEW" ? "new customers" : "all customers",
  ]
    .filter(Boolean)
    .join(" · ");
}

const istDay = (d: Date | null) => (d ? istDateKey(d) : null);

/** The next free number after the highest campaign id (CMP-16 → CMP-17), so ids never collide. */
async function nextCampaign() {
  const all = await db.campaign.findMany({ select: { id: true, rank: true } });
  const next = Math.max(0, ...all.map((x) => Number(/^CMP-(\d+)$/.exec(x.id)?.[1] ?? 0))) + 1;
  return { id: `CMP-${next}`, rank: Math.max(0, ...all.map((x) => x.rank)) + 1 };
}

operationsRouter.get("/marketing", async (req, res) => {
  requirePage(req, "marketing");
  const now = new Date();
  const [campaigns, gifts, cap, limits, claimCounts] = await Promise.all([
    db.campaign.findMany({ orderBy: { rank: "asc" } }),
    db.gift.findMany({ orderBy: { rank: "asc" } }),
    configNumber("marketing.gift.max_value", 5100),
    offerLimits(),
    db.campaignClaim.groupBy({ by: ["campaignId", "status"], _count: { _all: true } }),
  ]);
  const claimsOf = (id: string, status?: string) =>
    claimCounts.filter((g) => g.campaignId === id && (!status || g.status === status)).reduce((s, g) => s + g._count._all, 0);
  const active = campaigns.filter((c) => c.state === "ACTIVE");
  res.json({
    marketing: {
      // How many campaigns are at each step of the flow.
      flow: CAMPAIGN_FLOW.map((state) => ({ state, count: campaigns.filter((c) => flowState(c.state) === state).length })),
      activeCampaigns: active.map((c) => `${c.id} · ${c.name}`),
      campaigns: campaigns.map((c) => {
        const legacy = isLegacy(c);
        return {
          id: c.id,
          name: c.name,
          denoms: c.denoms,
          cashback: c.cashback,
          state: c.state,
          kind: c.kind,
          /** Made before offers existed: listed only, never claimable. */
          legacy,
          summary: offerSummary(c),
          description: c.description,
          percent: c.percent,
          /** The percent that applies after the cashback floor (lower than `percent` when clamped). */
          appliedPct: c.percent == null ? null : appliedPct(c.percent, limits),
          flatAmount: c.flatAmount,
          minRecharge: c.minRecharge,
          maxBenefit: c.maxBenefit,
          startsOn: istDay(c.startsAt),
          endsOn: istDay(c.endsAt),
          dates: legacy ? "" : `${c.startsAt ? istDate(c.startsAt) : "From approval"} – ${c.endsAt ? istDate(c.endsAt) : "until ended"}`,
          claimValidDays: c.claimValidDays,
          usesPerCustomer: c.usesPerCustomer,
          audience: c.audience,
          /** Live and claimable now (ACTIVE, inside its dates). */
          open: isOpen(c, now),
          claims: claimsOf(c.id),
          used: claimsOf(c.id, "USED"),
        };
      }),
      gifts: gifts.map((g) => ({ id: g.id, icon: g.icon, name: g.name, price: rupee(g.price), state: g.price >= cap && g.state === "ACTIVE" ? "AT CAP" : g.state })),
      giftCap: rupee(cap),
      maxDiscountPct: limits.maxPct,
      floorPct: limits.floorPct,
      floorMode: limits.floorMode,
      floorCapPct: floorCap(limits),
      bonusMax: limits.bonusMax,
    },
  });
});

/** Marketing drafts a campaign (an Admin approves it later). */
operationsRouter.post("/campaigns", async (req, res) => {
  requirePage(req, "marketing");
  const admin = requireCapability(req, "campaign.submit");
  const data = await campaignFields(req.body);
  const { id, rank } = await nextCampaign();
  const c = await db.campaign.create({ data: { id, rank, state: "DRAFT", ...data } });
  await audit(admin, "campaign.create", c.id, `→ DRAFT · ${c.name} · ${campaignDiff(c)}`);
  res.status(201).json({ id: c.id });
});

/** Edits a draft (once submitted, it is read-only). */
operationsRouter.patch("/campaigns/:id", async (req, res) => {
  requirePage(req, "marketing");
  const admin = requireCapability(req, "campaign.submit");
  const c = await db.campaign.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("Campaign not found.");
  if (c.state !== "DRAFT") throw conflict(`${c.id} is ${c.state.toLowerCase()} — only drafts can be edited.`);
  const data = await campaignFields(req.body);
  const { count } = await db.campaign.updateMany({ where: { id: c.id, state: "DRAFT" }, data });
  if (!count) throw conflict(`${c.id} was just submitted by someone else.`);
  const after = await db.campaign.findUniqueOrThrow({ where: { id: c.id } });
  await audit(admin, "campaign.edit", c.id, `${campaignDiff(c)} → ${campaignDiff(after)}`);
  res.json({ ok: true });
});

operationsRouter.post("/campaigns/:id/:action", async (req, res) => {
  requirePage(req, "marketing");
  const action = z.enum(["submit", "duplicate", "approve", "expire"]).parse(req.params.action);
  // Marketing builds, submits and can end a campaign; only an Admin approves and activates.
  const admin =
    action === "approve"
      ? requireCapability(req, "campaign.approve", "Only an Admin can approve and activate campaigns.")
      : requireCapability(req, "campaign.submit");
  const c = await db.campaign.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound("Campaign not found.");
  if (action === "submit") {
    if (c.state !== "DRAFT") throw conflict(`${c.id} is ${c.state.toLowerCase()} — only drafts can be submitted.`);
    const problem = offerProblem(c, await offerLimits());
    if (problem) throw badRequest(problem);
    const { count } = await db.campaign.updateMany({ where: { id: c.id, state: "DRAFT" }, data: { state: "SUBMITTED" } });
    if (!count) throw conflict(`${c.id} was just submitted by someone else.`);
    await audit(admin, "campaign.submit", c.id, `DRAFT → SUBMITTED · ${campaignDiff(c)}`);
  } else if (action === "approve") {
    if (c.state !== "SUBMITTED" && c.state !== "UNDER_REVIEW") throw conflict(`${c.id} isn't waiting for approval.`);
    // The limits may have been lowered since it was submitted.
    const problem = offerProblem(c, await offerLimits());
    if (problem) throw badRequest(problem);
    const { count } = await db.campaign.updateMany({ where: { id: c.id, state: c.state }, data: { state: "ACTIVE" } });
    if (!count) throw conflict(`${c.id} was just approved by someone else.`);
    await audit(admin, "campaign.approve", c.id, `${c.state} → ACTIVE · ${campaignDiff(c)}`);
    // Customers it is for are told now (or when its start date comes — the minute sweep).
    const told = await announceCampaign({ ...c, state: "ACTIVE" }).catch((e: unknown) => {
      console.error("Campaign announcement failed (the sweep retries):", e);
      return 0;
    });
    return res.json({ ok: true, notified: told });
  } else if (action === "expire") {
    if (c.state === "EXPIRED") throw conflict(`${c.id} has already ended.`);
    // Ending it by hand stops it at once: claims not yet used stop applying too.
    const claims = await db.$transaction(async (tx) => {
      const { count } = await tx.campaign.updateMany({ where: { id: c.id, state: c.state }, data: { state: "EXPIRED" } });
      if (!count) throw conflict(`${c.id} was just changed by someone else.`);
      return (await tx.campaignClaim.updateMany({ where: { campaignId: c.id, status: "ACTIVE" }, data: { status: "EXPIRED" } })).count;
    });
    await audit(admin, "campaign.expire", c.id, `${c.state} → EXPIRED${claims ? ` · ${claims} unused ${claims === 1 ? "claim" : "claims"} ended` : ""}`);
    return res.json({ ok: true, claimsEnded: claims });
  } else {
    const { id, rank } = await nextCampaign();
    // Everything but the dates (and any approval) is copied.
    await db.campaign.create({
      data: {
        id,
        rank,
        state: "DRAFT",
        name: `${c.name} (copy)`.slice(0, 80),
        denoms: c.denoms,
        cashback: c.cashback,
        kind: c.kind,
        description: c.description,
        percent: c.percent,
        flatAmount: c.flatAmount,
        minRecharge: c.minRecharge,
        maxBenefit: c.maxBenefit,
        claimValidDays: c.claimValidDays,
        usesPerCustomer: c.usesPerCustomer,
        audience: c.audience,
      },
    });
    await audit(admin, "campaign.duplicate", c.id, `→ ${id} DRAFT`);
    return res.status(201).json({ id });
  }
  res.json({ ok: true });
});
