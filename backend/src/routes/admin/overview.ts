import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { ageLabel, byNameMatch, istDateKey, istDayMonth, istTime, rupee } from "../../lib/format.ts";
import { walletTrialBalance } from "../../lib/ledger.ts";
import { adminOf, capabilitiesOf, pagesOf, requirePage, type PageKey } from "../../lib/rbac.ts";
import { refundProposerId } from "./support.ts";
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
    // The same rows as the Finance part of "Work waiting on you", so badge and list agree.
    pages.includes("finance") ? workFor(admin, new Date()).then((w) => w.filter((i) => i.page === "finance").length) : 0,
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

type Admin = ReturnType<typeof adminOf>;
type WorkItem = { ico: string; title: string; sub: string; age: string; tone: string; page: PageKey; param: string | null };

/**
 * What is waiting on this person: only work their department can do, and never a second-person
 * step on something they did themselves (approve ≠ release, draft ≠ approve, propose ≠ approve).
 * The Finance nav badge counts the Finance rows, so the two always agree.
 */
async function workFor(admin: Admin, now: Date): Promise<WorkItem[]> {
  const pages = pagesOf(admin.adminRole);
  const caps = capabilitiesOf(admin.adminRole);
  const can = (page: PageKey, cap?: string) => pages.includes(page) && (!cap || caps.includes(cap));
  const me = admin.user.id;
  const slaDays = await configNumber("hr.application.review_sla_days", 5);
  const slaCutoff = new Date(now.getTime() - slaDays * 86400000);

  const [drafts, approved, configs, proposed, walletRefunds, breached, overSla, flagged, campaignsToApprove, campaignDrafts] = await Promise.all([
    can("finance", "payout.approve") ? db.payoutBatch.findMany({ where: { state: "DRAFT" }, orderBy: { createdAt: "asc" } }) : [],
    can("finance", "payout.release")
      ? db.payoutBatch.findMany({ where: { state: "APPROVED", OR: [{ approvedById: null }, { approvedById: { not: me } }] }, orderBy: { approvedAt: "asc" } })
      : [],
    can("config", "config.write")
      ? db.configChange.findMany({ where: { status: "SUBMITTED", OR: [{ draftedById: null }, { draftedById: { not: me } }] }, orderBy: { createdAt: "asc" } })
      : [],
    caps.includes("dispute.refund.approve") && (pages.includes("finance") || pages.includes("support"))
      ? db.supportTicket.findMany({ where: { refundState: "PROPOSED" }, orderBy: { createdAt: "asc" } })
      : [],
    can("finance", "wallet.refund.process") ? db.walletRefund.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }) : [],
    can("support")
      ? db.supportTicket.findMany({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, slaDueAt: { lt: now } }, orderBy: { slaDueAt: "asc" } })
      : [],
    can("hr") ? db.applicant.findMany({ where: { submittedAt: { lt: slaCutoff } }, orderBy: { submittedAt: "asc" } }) : [],
    can("trust") ? db.review.findMany({ where: { status: "FLAGGED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : [],
    can("marketing", "campaign.approve") ? db.campaign.findMany({ where: { state: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, orderBy: { rank: "asc" } }) : [],
    can("marketing", "campaign.submit") && !caps.includes("campaign.approve")
      ? db.campaign.findMany({ where: { state: "DRAFT" }, orderBy: { rank: "asc" } })
      : [],
  ]);
  // A refund this person proposed needs someone else (compared by person, as the approve route does).
  const mine = await Promise.all(proposed.map((t) => refundProposerId(t.id)));
  const toApprove = proposed.filter((t, i) => (mine[i] ? mine[i] !== me : t.proposedBy !== (admin.user.actorName ?? admin.user.name)));
  const refundsDue = walletRefunds.reduce((s, r) => s + r.amount, 0);

  return [
    ...drafts.map((b) => ({
      ico: "₹",
      title: `Payout batch ${b.id} awaiting approval`,
      sub: `${b.astrologers} astrologers · ${lakh(b.gross)} · step-up MFA`,
      age: ageLabel(b.createdAt, now),
      tone: "amber",
      page: "finance" as const,
      param: null,
    })),
    ...approved.map((b) => ({
      ico: "₹",
      title: `Payout batch ${b.id} awaiting release`,
      sub: b.approvedByName ? `Approved by ${b.approvedByName} · ${lakh(b.gross)}` : lakh(b.gross),
      age: b.approvedAt ? ageLabel(b.approvedAt, now) : "—",
      tone: "amber",
      page: "finance" as const,
      param: null,
    })),
    ...toApprove.map((t) => ({
      ico: "↺",
      title: `Refund on ${t.id} awaiting your approval`,
      sub: `${rupee(t.refundAmount)} · proposed by ${t.proposedBy ?? "Support"} · ${t.subject}`,
      age: ageLabel(t.createdAt, now),
      tone: "amber",
      page: pages.includes("finance") ? ("finance" as const) : ("support" as const),
      param: pages.includes("finance") ? null : `ticket=${t.id}`,
    })),
    ...(walletRefunds.length
      ? [
          {
            ico: "₹",
            title: `${walletRefunds.length} wallet refund${walletRefunds.length === 1 ? "" : "s"} to pay`,
            sub: `${rupee(refundsDue)} to original payment methods · deleted accounts`,
            age: ageLabel(walletRefunds[0]!.createdAt, now),
            tone: "amber",
            page: "finance" as const,
            param: null,
          },
        ]
      : []),
    ...breached.map((t) => ({ ico: "!", title: `${t.id} has breached its SLA`, sub: t.subject, age: ageLabel(t.slaDueAt, now), tone: "rose", page: "support" as const, param: `ticket=${t.id}` })),
    ...configs.map((c) => ({
      ico: "⚙",
      title: "Config draft awaiting a second approver",
      sub: `${c.key} ${c.fromValue} → ${c.toValue} · drafted by ${c.draftedByName}`,
      age: ageLabel(c.createdAt, now),
      tone: "plain",
      page: "config" as const,
      param: `key=${encodeURIComponent(c.key)}`,
    })),
    ...(overSla.length
      ? [
          {
            ico: "◍",
            title: `${overSla.length} applications past the ${slaDays}-day review SLA`,
            sub: overSla.map((a) => a.id).join(", "),
            age: ageLabel(overSla[0]!.submittedAt, now),
            tone: "rose-age",
            page: "hr" as const,
            param: null,
          },
        ]
      : []),
    ...(flagged.length
      ? [
          {
            ico: "★",
            title: `${flagged.length} review${flagged.length === 1 ? "" : "s"} flagged for moderation`,
            sub: "Policy violation · reasoned removal required",
            age: ageLabel(flagged[0]!.createdAt, now),
            tone: "plain",
            page: "trust" as const,
            param: null,
          },
        ]
      : []),
    ...campaignsToApprove.map((c) => ({ ico: "◈", title: `Campaign ${c.id} awaiting approval`, sub: `${c.name} · ${c.cashback} cashback`, age: "—", tone: "plain", page: "marketing" as const, param: null })),
    ...campaignDrafts.map((c) => ({ ico: "◈", title: `Campaign ${c.id} is still a draft`, sub: `${c.name} · submit it for Admin approval`, age: "—", tone: "plain", page: "marketing" as const, param: null })),
  ];
}

overviewRouter.get("/overview", async (req, res) => {
  const admin = requirePage(req, "overview");
  const pages = pagesOf(admin.adminRole);
  const has = (p: PageKey) => pages.includes(p);
  const now = new Date();
  const slaDays = await configNumber("hr.application.review_sla_days", 5);
  const slaCutoff = new Date(now.getTime() - slaDays * 86400000);

  const [activeSessions, emergency, lives, openTickets, breached, applicants, overSla, awaiting, audits, analyticsData, trial, worklist] =
    await Promise.all([
      db.consultation.count({ where: { status: "ACTIVE" } }),
      db.consultation.count({ where: { status: "ACTIVE", kind: "INSTANT" } }),
      monitoringCounts(),
      has("support") ? db.supportTicket.count({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] } } }) : 0,
      has("support") ? db.supportTicket.count({ where: { state: { notIn: ["RESOLVED", "REFUND_INITIATED"] }, slaDueAt: { lt: now } } }) : 0,
      has("hr") ? db.applicant.count() : 0,
      has("hr") ? db.applicant.count({ where: { submittedAt: { lt: slaCutoff } } }) : 0,
      has("finance") ? db.payoutBatch.findMany({ where: { state: "APPROVED" } }) : [],
      db.auditLog.findMany({ orderBy: { at: "desc" }, take: 4 }),
      analytics(now),
      has("finance") ? walletTrialBalance() : null,
      workFor(admin, now),
    ]);
  const pendingGross = awaiting.reduce((s, b) => s + b.gross, 0);

  res.json({
    overview: {
      dateLine: `${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })} · ${istTime(now)} IST · your department's work and figures`,
      kpis: {
        liveSessions: activeSessions,
        emergency,
        publicLives: lives.lives,
        flaggedLives: lives.review,
        // Department tiles are null when this department can't open the page behind them.
        openTickets: has("support") ? openTickets : null,
        breachedTickets: breached,
        applications: has("hr") ? applicants : null,
        applicationsOverSla: overSla,
        payoutAwaiting: has("finance") ? lakh(pendingGross) : null,
        payoutBatchesAwaiting: awaiting.length,
      },
      generatedAt: now.toISOString(),
      analytics: analyticsData,
      // Shown only when customer wallets really disagree with their ledger lines.
      trialBalance:
        trial && trial.walletsOut
          ? {
              title: `Wallet trial balance is out by ${rupee(trial.off)}`,
              body: `${trial.walletsOut} of ${trial.checked} customer wallets don't match their ledger lines. Reconcile them before the next payout batch is released.`,
            }
          : null,
      worklist,
      // Today's entries by time, older ones by date, so nothing old reads as today.
      recentAudit: audits.map((a) => ({ time: istDateKey(a.at) === istDateKey(now) ? istTime(a.at) : istDayMonth(a.at), action: a.action, who: a.actorName, object: a.object, breakGlass: a.breakGlass })),
    },
  });
});

overviewRouter.get("/search", async (req, res) => {
  const admin = adminOf(req);
  const q = z.string().trim().max(80).parse(req.query.q ?? "");
  if (!q) return res.json({ hits: [] });
  const pages = pagesOf(admin.adminRole);
  const contains = { contains: q, mode: "insensitive" as const };
  const [astrologers, tickets, applicants, keys, batches, campaigns, targets] = await Promise.all([
    pages.includes("hr")
      ? db.astrologer.findMany({ where: { OR: [{ name: contains }, { slug: contains }] }, orderBy: { name: "asc" }, take: 100 })
      : [],
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
      ...byNameMatch(astrologers, q, (a) => a.name)
        .slice(0, 6)
        .map((a) => ({
          kind: "Astrologer",
          label: a.name,
          sub: [a.skills.slice(0, 2).join(", "), a.suspension !== "none" ? "suspended" : a.lifecycle].filter(Boolean).join(" · "),
          page: "hr",
          param: `view=astrologers&astrologer=${a.id}`,
        })),
      ...targets.map((t) => ({ kind: "Live", label: `${t.astrologer.name} · live now`, sub: t.topic, page: "compliance", param: null })),
      ...tickets.map((t) => ({ kind: "Ticket", label: t.id, sub: t.subject, page: "support", param: `ticket=${t.id}` })),
      ...applicants.map((a) => ({ kind: "Application", label: `${a.id} · ${a.name}`, sub: a.state, page: "hr", param: `app=${a.id}` })),
      ...keys.map((k) => ({ kind: "Config", label: k.key, sub: `current ${k.value}`, page: "config", param: `key=${encodeURIComponent(k.key)}` })),
      ...batches.map((b) => ({ kind: "Payout", label: b.id, sub: `${b.state} · ${lakh(b.gross)}`, page: "finance", param: null })),
      ...campaigns.map((c) => ({ kind: "Campaign", label: `${c.id} · ${c.name}`, sub: c.state, page: "marketing", param: null })),
    ],
  });
});
