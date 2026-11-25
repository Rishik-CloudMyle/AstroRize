import { Router } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { audit } from "../lib/audit.ts";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { istDate, istTime } from "../lib/format.ts";
import { notifyMany } from "../lib/notifications.ts";
import { requirePage } from "../lib/rbac.ts";
import { rateLimit } from "../lib/safety.ts";
import type { AuthContext } from "../middleware/auth.ts";

// Help for astrologers (portal → Help): an astrologer raises an issue and follows the answer as a
// conversation. It lands with the team that usually handles that topic (HR for most, Finance for payouts,
// Compliance for safety); that team replies from the admin console ("Astrologer help"), may forward it,
// and marks it resolved. Super Admins see everything. (Customers' own Help & support is separate.)

export const TOPICS = {
  PAYOUT: { label: "Payout, earnings or TDS", team: "finance" },
  CONSULTATION: { label: "A customer or a consultation", team: "hr" },
  SAFETY: { label: "Abusive customer or safety", team: "compliance" },
  TECHNICAL: { label: "App, call or live problem", team: "hr" },
  PROFILE: { label: "Profile, application or training", team: "hr" },
  LIVE: { label: "Live session", team: "hr" },
  OTHER: { label: "Something else", team: "hr" },
} as const;
type Topic = keyof typeof TOPICS;
const TOPIC_KEYS = Object.keys(TOPICS) as [Topic, ...Topic[]];
const TEAMS = ["hr", "finance", "compliance", "super"] as const;
const TEAM_LABEL: Record<string, string> = { hr: "HR team", finance: "Finance team", compliance: "Compliance team", super: "Admin team" };

const refOf = (id: string) => `AIS-${id.slice(-6).toUpperCase()}`;
const stamp = (d: Date) => `${istDate(d)}, ${istTime(d)}`;

// ── The astrologer's side (mounted under /api/portal) ──

export const astroHelpPortalRouter = Router();

async function meId(req: { auth?: AuthContext }) {
  const a = await db.astrologer.findUnique({ where: { userId: (req.auth as AuthContext).user.id }, select: { id: true, name: true } });
  if (!a) throw forbidden("This account is not linked to an astrologer profile.");
  return a;
}

const view = (i: { id: string; topic: string; team: string; subject: string; state: string; createdAt: Date; lastActivityAt: Date; readAt: Date | null }, lastStaffAt: Date | null) => ({
  id: i.id,
  ref: refOf(i.id),
  topic: TOPICS[i.topic as Topic]?.label ?? i.topic,
  with: TEAM_LABEL[i.team] ?? "Team",
  subject: i.subject,
  state: i.state,
  raisedAt: stamp(i.createdAt),
  updatedAt: stamp(i.lastActivityAt),
  unread: !!lastStaffAt && (!i.readAt || lastStaffAt > i.readAt),
});

astroHelpPortalRouter.get("/help", async (req, res) => {
  const a = await meId(req);
  const rows = await db.astrologerIssue.findMany({
    where: { astrologerId: a.id },
    orderBy: { lastActivityAt: "desc" },
    take: 100,
    include: { messages: { where: { author: "STAFF" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  res.json({
    topics: TOPIC_KEYS.map((k) => ({ key: k, label: TOPICS[k].label })),
    issues: rows.map((r) => view(r, r.messages[0]?.createdAt ?? null)),
  });
});

const raise = z.object({
  topic: z.enum(TOPIC_KEYS, { error: "Choose what it is about." }),
  subject: z.string({ error: "Write a short subject." }).trim().min(3, "Write a short subject.").max(120, "Keep the subject under 120 characters."),
  details: z.string({ error: "Tell us what happened." }).trim().min(10, "Tell us a little more (at least 10 characters).").max(3000, "Keep it under 3000 characters."),
});

astroHelpPortalRouter.post("/help", async (req, res) => {
  const a = await meId(req);
  rateLimit(`astrohelp:${a.id}`, 8, 60 * 60 * 1000, "You have raised several issues in a short time. Please wait a little, or reply on one you already raised.");
  const input = raise.parse(req.body);
  const team = TOPICS[input.topic].team;
  const issue = await db.astrologerIssue.create({
    data: { astrologerId: a.id, topic: input.topic, team, subject: input.subject, messages: { create: { author: "ASTROLOGER", authorName: a.name, text: input.details } } },
    select: { id: true },
  });
  try {
    const roles = [...new Set([team.toUpperCase(), "SUPER"])] as ("HR" | "FINANCE" | "COMPLIANCE" | "SUPER")[];
    const staff = await db.user.findMany({ where: { role: "ADMIN", active: true, adminRole: { in: roles } }, select: { id: true } });
    await notifyMany(
      staff.map((s) => s.id),
      { kind: "staff.astrohelp.new", title: `Astrologer issue · ${TOPICS[input.topic].label}`, body: `${a.name}: ${input.subject}`, href: `/admin/astro-help?issue=${issue.id}` },
    );
  } catch (e) {
    console.error("Couldn't notify staff of an astrologer issue:", e instanceof Error ? e.message : e);
  }
  res.status(201).json({ id: issue.id, ref: refOf(issue.id) });
});

astroHelpPortalRouter.get("/help/:id", async (req, res) => {
  const a = await meId(req);
  const issue = await db.astrologerIssue.findFirst({ where: { id: String(req.params.id), astrologerId: a.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!issue) throw notFound("That issue doesn't exist.");
  const lastStaff = [...issue.messages].reverse().find((m) => m.author === "STAFF")?.createdAt ?? null;
  const shown = view(issue, lastStaff);
  await db.astrologerIssue.update({ where: { id: issue.id }, data: { readAt: new Date() } });
  res.json({
    issue: { ...shown, unread: false },
    messages: issue.messages.map((m) => ({ id: m.id, mine: m.author === "ASTROLOGER", who: m.author === "ASTROLOGER" ? "You" : TEAM_LABEL[issue.team] ?? "Team", text: m.text, at: stamp(m.createdAt) })),
  });
});

astroHelpPortalRouter.post("/help/:id/reply", async (req, res) => {
  const a = await meId(req);
  const { text } = z.object({ text: z.string({ error: "Write your reply." }).trim().min(1, "Write your reply.").max(3000) }).parse(req.body);
  const issue = await db.astrologerIssue.findFirst({ where: { id: String(req.params.id), astrologerId: a.id }, select: { id: true, state: true, team: true } });
  if (!issue) throw notFound("That issue doesn't exist.");
  if (issue.state === "RESOLVED") throw conflict("This issue is resolved. Please raise a new one if you still need help.");
  await db.$transaction([
    db.astrologerIssueMessage.create({ data: { issueId: issue.id, author: "ASTROLOGER", authorName: a.name, text } }),
    db.astrologerIssue.update({ where: { id: issue.id }, data: { state: "OPEN", lastActivityAt: new Date(), readAt: new Date() } }),
  ]);
  res.status(201).json({ ok: true });
});

// ── The staff side (mounted under /api/admin) ──

export const astroHelpAdminRouter = Router();

/** Teams an admin sees: their own department's, or all for a Super Admin. */
const scope = (role: string) => (role === "super" ? {} : { team: role });

astroHelpAdminRouter.get("/astro-help", async (req, res) => {
  const admin = requirePage(req, "astrohelp");
  const rows = await db.astrologerIssue.findMany({
    where: scope(admin.adminRole),
    orderBy: [{ lastActivityAt: "desc" }],
    take: 200,
    include: { astrologer: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { author: true } } },
  });
  res.json({
    issues: rows.map((r) => ({
      id: r.id,
      ref: refOf(r.id),
      astrologer: r.astrologer.name,
      topic: TOPICS[r.topic as Topic]?.label ?? r.topic,
      team: r.team,
      teamLabel: TEAM_LABEL[r.team] ?? r.team,
      subject: r.subject,
      state: r.state,
      raisedAt: stamp(r.createdAt),
      raisedIso: r.createdAt.toISOString(),
      updatedAt: stamp(r.lastActivityAt),
      /** The astrologer wrote last: it needs an answer. */
      needsReply: r.state !== "RESOLVED" && r.messages[0]?.author === "ASTROLOGER",
    })),
  });
});

async function load(req: Parameters<typeof requirePage>[0], id: string) {
  const admin = requirePage(req, "astrohelp");
  const issue = await db.astrologerIssue.findFirst({
    where: { id, ...scope(admin.adminRole) },
    include: { astrologer: { select: { name: true, userId: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!issue) throw notFound("That issue doesn't exist, or it is with another team.");
  return { admin, issue };
}

astroHelpAdminRouter.get("/astro-help/:id", async (req, res) => {
  const { issue } = await load(req, String(req.params.id));
  res.json({
    issue: { id: issue.id, ref: refOf(issue.id), astrologer: issue.astrologer.name, topic: TOPICS[issue.topic as Topic]?.label ?? issue.topic, team: issue.team, subject: issue.subject, state: issue.state },
    messages: issue.messages.map((m) => ({ id: m.id, mine: m.author === "STAFF", who: m.author === "STAFF" ? m.authorName : issue.astrologer.name, text: m.text, at: stamp(m.createdAt) })),
  });
});

astroHelpAdminRouter.post("/astro-help/:id/reply", async (req, res) => {
  const { admin, issue } = await load(req, String(req.params.id));
  const body = z.object({ text: z.string({ error: "Write your reply." }).trim().min(1, "Write your reply.").max(3000), resolve: z.boolean().optional() }).parse(req.body);
  if (issue.state === "RESOLVED" && !body.resolve) throw conflict("This issue is resolved.");
  const state = body.resolve ? "RESOLVED" : "WAITING";
  await db.$transaction([
    db.astrologerIssueMessage.create({ data: { issueId: issue.id, author: "STAFF", authorName: admin.user.actorName ?? admin.user.name, text: body.text } }),
    db.astrologerIssue.update({ where: { id: issue.id }, data: { state, lastActivityAt: new Date() } }),
  ]);
  await audit(admin, body.resolve ? "astrohelp.resolve" : "astrohelp.reply", issue.id, `${refOf(issue.id)} → ${state}`);
  await notifyMany(issue.astrologer.userId ? [issue.astrologer.userId] : [], {
    kind: "astrohelp.reply",
    title: body.resolve ? "Your issue was resolved" : "A reply to your issue",
    body: `${refOf(issue.id)} · ${issue.subject}`,
    href: `/portal/help?issue=${issue.id}`,
  }).catch(() => {});
  res.json({ ok: true });
});

astroHelpAdminRouter.post("/astro-help/:id/forward", async (req, res) => {
  const { admin, issue } = await load(req, String(req.params.id));
  const { team } = z.object({ team: z.enum(TEAMS, { error: "Choose a team." }) }).parse(req.body);
  if (team === issue.team) throw badRequest("It is already with that team.");
  await db.astrologerIssue.update({ where: { id: issue.id }, data: { team, lastActivityAt: new Date() } });
  await audit(admin, "astrohelp.forward", issue.id, `${refOf(issue.id)}: ${issue.team} → ${team}`);
  try {
    const roles = [...new Set([team.toUpperCase(), "SUPER"])] as ("HR" | "FINANCE" | "COMPLIANCE" | "SUPER")[];
    const staff = await db.user.findMany({ where: { role: "ADMIN", active: true, adminRole: { in: roles } }, select: { id: true } });
    await notifyMany(
      staff.map((s) => s.id),
      { kind: "staff.astrohelp.forward", title: "Astrologer issue forwarded", body: `${issue.astrologer.name}: ${issue.subject}`, href: `/admin/astro-help?issue=${issue.id}` },
    );
  } catch {
    // The forward is saved; the bell just misses this one.
  }
  res.json({ ok: true });
});

