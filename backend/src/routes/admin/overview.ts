import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { ageLabel, istDateKey, istTime, rupee } from "../../lib/format.ts";
import { adminOf, capabilitiesOf, pagesOf, requirePage } from "../../lib/rbac.ts";
import { hostedLiveRoom } from "../../lib/presence.ts";
import { configNumber, getSetting } from "../../lib/settings.ts";
import { monitoringCounts } from "./monitoring.ts";

export const overviewRouter = Router();

/** "₹18.4 L" / "₹2.14 Cr" */
export function lakh(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)} L`;
  return rupee(n);
}

overviewRouter.get("/session", async (req, res) => {
  const admin = adminOf(req);
  // From the access matrix in force (defaults + the Super Admin's changes), so the nav follows a change at once.
  const pages = pagesOf(admin.adminRole);
  // Open-work counts for the nav badges, only for pages this role can open.
  const [hr, finance, support, compliance, trust] = await Promise.all([
    pages.includes("hr") ? db.applicant.count() : 0,
    pages.includes("finance") ? db.payoutBatch.count({ where: { state: { not: "RELEASED" } } }) : 0,
    pages.includes("support") ? db.supportTicket.count({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] } } }) : 0,
    pages.includes("compliance") ? db.liveRoom.count({ where: hostedLiveRoom() }) : 0,
    pages.includes("trust") ? db.review.count({ where: { status: "FLAGGED" } }) : 0,
  ]);
  res.json({
    session: {
      id: admin.user.id,
      name: admin.user.name,
      initials: admin.user.initials,
      actor: admin.user.actorName ?? admin.user.name,
      role: admin.adminRole,
      pages,
      capabilities: capabilitiesOf(admin.adminRole),
      counts: { hr, finance, support, compliance, trust },
    },
  });
});

// ── Analytics, computed from the database on every request ──

const DAYS = 30;
const DAY_MS = 86400000;
/** A stored UTC timestamp column as its IST calendar date, e.g. 2026-10-08 (for GROUP BY). */
const istDay = (col: string) => Prisma.raw(`to_char((("${col}" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD')`);
/** An Instant Call counts as its own channel whatever its mode. */
const CHANNEL = Prisma.sql`CASE WHEN "kind" = 'INSTANT' THEN 'instant' ELSE lower("mode") END`;

/** Midnight IST at the start of the IST day `daysBack` days before `now`. */
function istMidnight(now: Date, daysBack: number): Date {
  return new Date(new Date(`${istDateKey(now)}T00:00:00+05:30`).getTime() - daysBack * DAY_MS);
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/**
 * The overview's charts and live numbers. A "consultation" is an ENDED one, dated by when it
 * connected; revenue is what customers were billed for them; a recharge is a PAID payment.
 * Trend windows are the last 30 IST days (today so far included); week-on-week figures compare
 * the last 7 × 24 hours with the 7 × 24 hours before, so a part-day never skews them.
 */
async function analytics(now: Date) {
  const start = istMidnight(now, DAYS - 1);
  const dayKeys = Array.from({ length: DAYS }, (_, i) => istDateKey(new Date(start.getTime() + (i + 0.5) * DAY_MS)));
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
  const thisWeek = { gte: weekAgo };
  const lastWeek = { gte: twoWeeksAgo, lt: weekAgo };

  const [byDay, activeByDay, recharges, signups, top, liveConsults, waiting, oldestWaiting, liveRooms, liveQueue, presence, c7, cPrev, p7, pPrev, s7, sPrev] =
    await Promise.all([
      db.$queryRaw<{ day: string; channel: string; n: bigint; revenue: bigint }[]>`
        SELECT ${istDay("connectedAt")} AS day, ${CHANNEL} AS channel, count(*) AS n, coalesce(sum("total"), 0) AS revenue
        FROM "Consultation" WHERE "status" = 'ENDED' AND "connectedAt" >= ${start} GROUP BY 1, 2`,
      // A customer who consulted twice in a day counts once.
      db.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT ${istDay("connectedAt")} AS day, count(DISTINCT "customerId") AS n
        FROM "Consultation" WHERE "status" = 'ENDED' AND "connectedAt" >= ${start} GROUP BY 1`,
      db.$queryRaw<{ day: string; n: bigint; amount: bigint }[]>`
        SELECT ${istDay("paidAt")} AS day, count(*) AS n, coalesce(sum("amount"), 0) AS amount
        FROM "Payment" WHERE "status" = 'PAID' AND "paidAt" >= ${start} GROUP BY 1`,
      db.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT ${istDay("createdAt")} AS day, count(*) AS n
        FROM "User" WHERE "role" = 'CUSTOMER' AND "createdAt" >= ${start} GROUP BY 1`,
      db.$queryRaw<{ id: string; name: string; n: bigint; revenue: bigint }[]>`
        SELECT a."id", a."name", count(*) AS n, coalesce(sum(c."total"), 0) AS revenue
        FROM "Consultation" c JOIN "Astrologer" a ON a."id" = c."astrologerId"
        WHERE c."status" = 'ENDED' AND c."connectedAt" >= ${start}
        GROUP BY a."id", a."name" ORDER BY revenue DESC, n DESC LIMIT 5`,
      db.$queryRaw<{ channel: string; n: bigint }[]>`
        SELECT ${CHANNEL} AS channel, count(*) AS n FROM "Consultation" WHERE "status" = 'ACTIVE' GROUP BY 1`,
      db.consultation.count({ where: { status: "REQUESTED" } }),
      db.consultation.findFirst({ where: { status: "REQUESTED" }, orderBy: { requestedAt: "asc" }, select: { requestedAt: true } }),
      db.liveRoom.count({ where: { isLive: true } }),
      db.liveQueueEntry.count({ where: { status: "WAITING", room: { isLive: true } } }),
      // The public roster: the astrologers the directory lists.
      db.astrologer.groupBy({ by: ["presence"], where: { lifecycle: "active", suspension: { not: "full" } }, _count: { _all: true } }),
      db.consultation.aggregate({ where: { status: "ENDED", connectedAt: thisWeek }, _count: { _all: true }, _sum: { total: true } }),
      db.consultation.aggregate({ where: { status: "ENDED", connectedAt: lastWeek }, _count: { _all: true }, _sum: { total: true } }),
      db.payment.aggregate({ where: { status: "PAID", paidAt: thisWeek }, _count: { _all: true }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { status: "PAID", paidAt: lastWeek }, _count: { _all: true }, _sum: { amount: true } }),
      db.user.count({ where: { role: "CUSTOMER", createdAt: thisWeek } }),
      db.user.count({ where: { role: "CUSTOMER", createdAt: lastWeek } }),
    ]);

  const perDay = <T extends { day: string }>(rows: T[], pick: (r: T) => number) =>
    dayKeys.map((d) => rows.filter((r) => r.day === d).reduce((sum, r) => sum + pick(r), 0));
  const channelOf = (d: string, ch: string) => num(byDay.find((r) => r.day === d && r.channel === ch)?.n);
  const live = Object.fromEntries(liveConsults.map((r) => [r.channel, num(r.n)]));
  const pres = Object.fromEntries(presence.map((p) => [p.presence, p._count._all]));

  return {
    days: dayKeys,
    series: {
      consultations: perDay(byDay, (r) => num(r.n)),
      revenue: perDay(byDay, (r) => num(r.revenue)),
      activeCustomers: perDay(activeByDay, (r) => num(r.n)),
      signups: perDay(signups, (r) => num(r.n)),
      recharges: perDay(recharges, (r) => num(r.n)),
      rechargeAmount: perDay(recharges, (r) => num(r.amount)),
    },
    channels: dayKeys.slice(-14).map((d) => ({
      day: d,
      chat: channelOf(d, "chat"),
      voice: channelOf(d, "voice"),
      video: channelOf(d, "video"),
      instant: channelOf(d, "instant"),
    })),
    top: top.map((t) => ({ id: t.id, name: t.name, consultations: num(t.n), revenue: num(t.revenue) })),
    /** [last 7 × 24 h, the 7 × 24 h before]. */
    week: {
      consultations: [c7._count._all, cPrev._count._all],
      revenue: [num(c7._sum.total), num(cPrev._sum.total)],
      rechargeAmount: [num(p7._sum.amount), num(pPrev._sum.amount)],
      recharges: [p7._count._all, pPrev._count._all],
      signups: [s7, sPrev],
    },
    now: {
      consultations: { chat: live.chat ?? 0, voice: live.voice ?? 0, video: live.video ?? 0, instant: live.instant ?? 0 },
      waiting,
      longestWaitSeconds: oldestWaiting ? Math.max(0, Math.round((now.getTime() - oldestWaiting.requestedAt.getTime()) / 1000)) : 0,
      liveRooms,
      liveQueue,
      roster: presence.reduce((sum, p) => sum + p._count._all, 0),
      presence: { on: pres.ON ?? 0, busy: pres.BUSY ?? 0, live: pres.LIVE ?? 0, off: pres.OFF ?? 0 },
    },
  };
}

overviewRouter.get("/overview", async (req, res) => {
  requirePage(req, "overview");
  const now = new Date();
  const slaDays = await configNumber("hr.application.review_sla_days", 5);
  const slaCutoff = new Date(now.getTime() - slaDays * 86400000);

  const [activeSessions, emergency, lives, openTickets, breached, applicants, overSla, awaiting, submittedChanges, flaggedReviews, audits, analyticsData, trial] =
    await Promise.all([
      db.consultation.count({ where: { status: "ACTIVE" } }),
      db.consultation.count({ where: { status: "ACTIVE", kind: "INSTANT" } }),
      monitoringCounts(),
      db.supportTicket.count({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] } } }),
      db.supportTicket.findMany({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, slaDueAt: { lt: now } } }),
      db.applicant.count(),
      db.applicant.findMany({ where: { submittedAt: { lt: slaCutoff } }, orderBy: { submittedAt: "asc" } }),
      db.payoutBatch.findMany({ where: { state: "APPROVED" } }),
      db.configChange.findMany({ where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } }),
      db.review.count({ where: { status: "FLAGGED" } }),
      db.auditLog.findMany({ orderBy: { at: "desc" }, take: 4 }),
      analytics(now),
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
        publicLives: lives.lives,
        flaggedLives: lives.review,
        openTickets,
        breachedTickets: breached.length,
        applications: applicants,
        applicationsOverSla: overSla.length,
        payoutAwaiting: lakh(pendingGross),
        payoutBatchesAwaiting: awaiting.length,
      },
      generatedAt: now.toISOString(),
      analytics: analyticsData,
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
  const pages = pagesOf(admin.adminRole);
  const contains = { contains: q, mode: "insensitive" as const };
  const [tickets, applicants, keys, batches, campaigns, targets] = await Promise.all([
    pages.includes("support") ? db.supportTicket.findMany({ where: { OR: [{ id: contains }, { subject: contains }, { sessionRef: contains }] }, take: 5 }) : [],
    pages.includes("hr") ? db.applicant.findMany({ where: { OR: [{ id: contains }, { name: contains }] }, take: 5 }) : [],
    pages.includes("config") ? db.configKey.findMany({ where: { OR: [{ key: contains }, { description: contains }] }, take: 5 }) : [],
    pages.includes("finance") ? db.payoutBatch.findMany({ where: { id: contains }, take: 5 }) : [],
    pages.includes("marketing") ? db.campaign.findMany({ where: { OR: [{ id: contains }, { name: contains }] }, take: 5 }) : [],
    pages.includes("compliance")
      ? db.liveRoom.findMany({ where: { ...hostedLiveRoom(), OR: [{ topic: contains }, { astrologer: { name: contains } }] }, include: { astrologer: { select: { name: true } } }, take: 5 })
      : [],
  ]);
  res.json({
    hits: [
      ...targets.map((t) => ({ kind: "Live", label: `${t.astrologer.name} · live now`, sub: t.topic, page: "compliance", param: null })),
      ...tickets.map((t) => ({ kind: "Ticket", label: t.id, sub: t.subject, page: "support", param: `ticket=${t.id}` })),
      ...applicants.map((a) => ({ kind: "Application", label: `${a.id} · ${a.name}`, sub: a.state, page: "hr", param: `app=${a.id}` })),
      ...keys.map((k) => ({ kind: "Config", label: k.key, sub: `current ${k.value}`, page: "config", param: `key=${encodeURIComponent(k.key)}` })),
      ...batches.map((b) => ({ kind: "Payout", label: b.id, sub: `${b.state} · ${lakh(b.gross)}`, page: "finance", param: null })),
      ...campaigns.map((c) => ({ kind: "Campaign", label: `${c.id} · ${c.name}`, sub: c.state, page: "marketing", param: null })),
    ],
  });
});
