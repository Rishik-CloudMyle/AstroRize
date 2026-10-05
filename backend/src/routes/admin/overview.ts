import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { ageLabel, istTime, rupee } from "../../lib/format.ts";
import { PAGES, adminOf, requirePage } from "../../lib/rbac.ts";
import { configNumber, getSetting } from "../../lib/settings.ts";

export const overviewRouter = Router();

/** "₹18.4 L" / "₹2.14 Cr" */
export function lakh(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)} L`;
  return rupee(n);
}

overviewRouter.get("/session", async (req, res) => {
  const admin = adminOf(req);
  const pages = PAGES[admin.adminRole];
  // Open-work counts for the nav badges, only for pages this role can open.
  const [hr, finance, support, compliance, trust] = await Promise.all([
    pages.includes("hr") ? db.applicant.count() : 0,
    pages.includes("finance") ? db.payoutBatch.count({ where: { state: { not: "RELEASED" } } }) : 0,
    pages.includes("support") ? db.supportTicket.count({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] } } }) : 0,
    pages.includes("compliance") ? db.monitorTarget.count() : 0,
    pages.includes("trust") ? db.review.count({ where: { status: "FLAGGED" } }) : 0,
  ]);
  res.json({
    session: {
      name: admin.user.name,
      initials: admin.user.initials,
      actor: admin.user.actorName ?? admin.user.name,
      role: admin.adminRole,
      pages,
      counts: { hr, finance, support, compliance, trust },
    },
  });
});

overviewRouter.get("/overview", async (req, res) => {
  requirePage(req, "overview");
  const now = new Date();
  const slaDays = await configNumber("hr.application.review_sla_days", 5);
  const slaCutoff = new Date(now.getTime() - slaDays * 86400000);

  const [activeSessions, emergency, liveRooms, flaggedRooms, openTickets, breached, applicants, overSla, awaiting, submittedChanges, flaggedReviews, audits, metrics, trial] =
    await Promise.all([
      db.consultation.count({ where: { status: "ACTIVE" } }),
      db.consultation.count({ where: { status: "ACTIVE", kind: "INSTANT" } }),
      db.liveRoom.count({ where: { isLive: true } }),
      db.monitorTarget.count({ where: { band: { in: ["CRITICAL", "HIGH"] } } }),
      db.supportTicket.count({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] } } }),
      db.supportTicket.findMany({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, slaDueAt: { lt: now } } }),
      db.applicant.count(),
      db.applicant.findMany({ where: { submittedAt: { lt: slaCutoff } }, orderBy: { submittedAt: "asc" } }),
      db.payoutBatch.findMany({ where: { state: "APPROVED" } }),
      db.configChange.findMany({ where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } }),
      db.review.count({ where: { status: "FLAGGED" } }),
      db.auditLog.findMany({ orderBy: { at: "desc" }, take: 4 }),
      getSetting<{ dau: number[]; stickiness: number[]; channels: [string, number, number, number][]; live: { label: string; value: number; sub: string; color: string }[]; availability: { label: string; count: number; color: string }[]; registered: number }>("metrics.overview", {
        dau: [],
        stickiness: [],
        channels: [],
        live: [],
        availability: [],
        registered: 0,
      }),
      getSetting<{ title: string; body: string } | null>("finance.trialBalance", null),
    ]);
  const pendingGross = awaiting.reduce((s, b) => s + b.gross, 0);

  const worklist = [
    ...awaiting.map((b) => ({
      ico: "₹",
      title: `Payout batch ${b.id} awaiting release`,
      sub: b.approvedByName ? `Approved by ${b.approvedByName} — a different actor must release` : "Awaiting release",
      age: b.approvedAt ? ageLabel(b.approvedAt, now) : "—",
      tone: "amber",
      page: "finance",
      param: null as string | null,
    })),
    ...breached.map((t) => ({ ico: "!", title: `${t.id} has breached its SLA`, sub: t.subject, age: ageLabel(t.slaDueAt, now), tone: "rose", page: "support", param: `ticket=${t.id}` })),
    ...submittedChanges.map((c) => ({
      ico: "⚙",
      title: "Config draft awaiting a second approver",
      sub: `${c.key} ${c.fromValue} → ${c.toValue}`,
      age: ageLabel(c.createdAt, now),
      tone: "plain",
      page: "config",
      param: `key=${encodeURIComponent(c.key)}`,
    })),
    ...(overSla.length
      ? [{ ico: "◍", title: `${overSla.length} applications past the ${slaDays}-day review SLA`, sub: overSla.map((a) => a.id).join(", "), age: ageLabel(overSla[0]!.submittedAt, now), tone: "rose-age", page: "hr", param: null }]
      : []),
    ...(flaggedReviews
      ? [{ ico: "★", title: `${flaggedReviews} reviews flagged for moderation`, sub: "Policy violation · reasoned removal required", age: "1d", tone: "plain", page: "trust", param: null }]
      : []),
  ];

  res.json({
    overview: {
      dateLine: `${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} · ${istTime(now)} IST · everything below is scoped to your capabilities`,
      kpis: {
        liveSessions: activeSessions,
        emergency,
        publicLives: liveRooms,
        flaggedLives: flaggedRooms,
        openTickets,
        breachedTickets: breached.length,
        applications: applicants,
        applicationsOverSla: overSla.length,
        payoutAwaiting: lakh(pendingGross),
        payoutBatchesAwaiting: awaiting.length,
      },
      metrics,
      trialBalance: trial,
      worklist,
      recentAudit: audits.map((a) => ({ time: istTime(a.at), action: a.action, who: a.actorName, object: a.object, breakGlass: a.breakGlass })),
    },
  });
});

overviewRouter.get("/search", async (req, res) => {
  const admin = adminOf(req);
  const q = z.string().trim().max(80).parse(req.query.q ?? "");
  if (q.length < 2) return res.json({ hits: [] });
  const pages = PAGES[admin.adminRole];
  const contains = { contains: q, mode: "insensitive" as const };
  const [tickets, applicants, keys, batches, campaigns, targets] = await Promise.all([
    pages.includes("support") ? db.supportTicket.findMany({ where: { OR: [{ id: contains }, { subject: contains }, { sessionRef: contains }] }, take: 5 }) : [],
    pages.includes("hr") ? db.applicant.findMany({ where: { OR: [{ id: contains }, { name: contains }] }, take: 5 }) : [],
    pages.includes("config") ? db.configKey.findMany({ where: { OR: [{ key: contains }, { description: contains }] }, take: 5 }) : [],
    pages.includes("finance") ? db.payoutBatch.findMany({ where: { id: contains }, take: 5 }) : [],
    pages.includes("marketing") ? db.campaign.findMany({ where: { OR: [{ id: contains }, { name: contains }] }, take: 5 }) : [],
    pages.includes("compliance") ? db.monitorTarget.findMany({ where: { OR: [{ id: contains }, { astroLabel: contains }] }, take: 5 }) : [],
  ]);
  res.json({
    hits: [
      ...targets.map((t) => ({ kind: "Live", label: t.astroLabel, sub: t.reason, page: "compliance", param: null })),
      ...tickets.map((t) => ({ kind: "Ticket", label: t.id, sub: t.subject, page: "support", param: `ticket=${t.id}` })),
      ...applicants.map((a) => ({ kind: "Application", label: `${a.id} · ${a.name}`, sub: a.state, page: "hr", param: `app=${a.id}` })),
      ...keys.map((k) => ({ kind: "Config", label: k.key, sub: `current ${k.value}`, page: "config", param: `key=${encodeURIComponent(k.key)}` })),
      ...batches.map((b) => ({ kind: "Payout", label: b.id, sub: `${b.state} · ${lakh(b.gross)}`, page: "finance", param: null })),
      ...campaigns.map((c) => ({ kind: "Campaign", label: `${c.id} · ${c.name}`, sub: c.state, page: "marketing", param: null })),
    ],
  });
});
