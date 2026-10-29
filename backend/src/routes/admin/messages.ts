import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict } from "../../lib/errors.ts";
import {
  checkSendRate,
  closedReason,
  directText,
  directThreadFor,
  directUnreadTotal,
  kindOf,
  personInclude,
  postDirect,
  staffConversations,
  staffSees,
  staffThreadView,
  type Person,
} from "../../lib/messaging.ts";
import { byNameMatch } from "../../lib/format.ts";
import { rateLimit } from "../../lib/safety.ts";
import { pagesOf, requirePage, type AdminRoleKey } from "../../lib/rbac.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Messages: admins talk to other staff (one person or several), to an astrologer or to a
// customer. Only an admin can start a conversation; everyone in it can reply. Each person
// sees only the conversations they are in.
export const messagesRouter = Router();

/** Most astrologers one "New message" can go to (each in their own conversation). */
const MAX_ASTROLOGERS = 500;
/** Staff (besides you) in one conversation. */
const MAX_STAFF = 24;

/** Staff who are switched on and whose department can open Messages; anyone else who can sign in. */
function canReceive(u: Person): boolean {
  if (!u.active) return false;
  if (u.role === "ADMIN") return !!u.adminRole && pagesOf(u.adminRole.toLowerCase() as AdminRoleKey).includes("messages");
  if (u.role === "CUSTOMER") return !u.deletedAt;
  return !!u.astrologer;
}

messagesRouter.get("/messages", async (req, res) => {
  const admin = requirePage(req, "messages");
  const conversations = await staffConversations(admin.user.id);
  res.json({ conversations, unread: conversations.reduce((n, c) => n + c.unread, 0) });
});

/** For the nav badge, polled from every console page. */
messagesRouter.get("/messages/unread", async (req, res) => {
  const admin = requirePage(req, "messages");
  res.json({ unread: await directUnreadTotal(admin.user.id) });
});

/**
 * People to start a conversation with. With no search: the staff, by department, and the
 * astrologers. With any text: staff, astrologers and customers by name, email or phone, names
 * starting with it first. Customers show only their name and a masked phone number.
 */
messagesRouter.get("/messages/people", async (req, res) => {
  const admin = requirePage(req, "messages");
  const q = z.string().trim().max(80).catch("").parse(req.query.q);
  const text = { contains: q, mode: "insensitive" as const };
  // A phone search: digits only (spaces, dashes and a leading +91 allowed), at least four.
  const digits = q.replace(/^\+91/, "").replace(/[\s()-]/g, "");
  const byPhone: Prisma.UserWhereInput[] = /^\d{4,10}$/.test(digits) ? [{ phone: { contains: digits } }] : [];
  const searching = q.length > 0;
  const [staff, astrologers, customers] = await Promise.all([
    db.user.findMany({
      where: { role: "ADMIN", active: true, id: { not: admin.user.id }, ...(q ? { OR: [{ name: text }, { email: text }] } : {}) },
      orderBy: [{ adminRole: "asc" }, { name: "asc" }],
      take: 100,
      include: personInclude,
    }),
    db.user.findMany({
      where: {
        role: "ASTROLOGER",
        active: true,
        astrologer: { isNot: null },
        ...(searching ? { OR: [{ name: text }, { email: text }, { astrologer: { name: text } }, ...byPhone] } : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
      include: personInclude,
    }),
    searching
      ? db.user.findMany({
          where: { role: "CUSTOMER", active: true, deletedAt: null, OR: [{ name: text }, { email: text }, ...byPhone] },
          orderBy: { name: "asc" },
          take: 100,
          include: personInclude,
        })
      : [],
  ]);
  const ranked = <T extends { name: string | null }>(rows: T[], max: number) =>
    (searching ? byNameMatch(rows, q, (p) => p.name ?? "") : rows).slice(0, max);
  res.json({ people: [...ranked(staff.filter(canReceive), 100), ...ranked(astrologers, 30), ...ranked(customers, 20)].map(staffSees) });
});

/**
 * The "Astrologers" department: every active astrologer (live on the platform, account switched on),
 * with their skills, to pick one or several from. Search is done on the page.
 */
messagesRouter.get("/messages/astrologers", async (req, res) => {
  requirePage(req, "messages");
  const rows = await db.user.findMany({
    where: { role: "ASTROLOGER", active: true, astrologer: { is: { lifecycle: "active" } } },
    include: { astrologer: { select: { name: true, photo: true, slug: true, skills: true } } },
    take: MAX_ASTROLOGERS,
  });
  const astrologers = rows
    .map((u) => ({ ...staffSees(u), skills: u.astrologer?.skills ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-IN"));
  res.json({ astrologers });
});

messagesRouter.get("/messages/:id", async (req, res) => {
  const admin = requirePage(req, "messages");
  const thread = await directThreadFor(String(req.params.id), admin.user.id, true);
  res.json({ conversation: staffThreadView(thread, admin.user.id) });
});

const startBody = z.object({
  memberIds: z
    .array(z.string().min(1).max(64))
    .min(1, "Choose who to message.")
    .max(MAX_ASTROLOGERS + MAX_STAFF, "That's too many people for one message."),
  subject: z
    .string()
    .trim()
    .max(120, "Keep the subject to 120 characters.")
    .nullish()
    .transform((s) => s || null),
  text: directText,
});

/**
 * The conversation with exactly these members (you included) — without a subject, the one already
 * with the same people is continued — then the message in it.
 */
async function deliver(me: string, memberIds: string[], subject: string | null, text: string) {
  let threadId: string | null = null;
  if (!subject) {
    const same = await db.directThread.findMany({
      where: { subject: null, AND: [me, ...memberIds].map((userId) => ({ members: { some: { userId } } })) },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
    });
    threadId = same.find((t) => t._count.members === memberIds.length + 1)?.id ?? null;
  }
  const created = !threadId;
  if (!threadId) {
    const thread = await db.directThread.create({
      data: {
        subject,
        createdById: me,
        members: { create: [{ userId: me, lastReadAt: new Date() }, ...memberIds.map((userId) => ({ userId }))] },
      },
    });
    threadId = thread.id;
  }
  const message = await postDirect(threadId, me, text);
  return { id: threadId, created, message };
}

/**
 * Start a conversation (or, without a subject, continue the one already with exactly these people).
 * Several astrologers: the same message goes to each in their own private conversation (with the
 * staff chosen), so astrologers never see each other or each other's replies.
 */
messagesRouter.post("/messages", async (req, res) => {
  const admin = requirePage(req, "messages");
  const me = admin.user.id;
  const body = startBody.parse(req.body);
  const ids = [...new Set(body.memberIds)].filter((id) => id !== me);
  if (!ids.length) throw badRequest("Choose who to message.");
  const people = await db.user.findMany({ where: { id: { in: ids } }, include: personInclude });
  if (people.length !== ids.length || !people.every(canReceive)) {
    throw badRequest("Someone you chose can't receive messages any more. Search for them again.");
  }
  const staff = people.filter((p) => p.role === "ADMIN");
  const outside = people.filter((p) => p.role !== "ADMIN");
  if (staff.length > MAX_STAFF) throw badRequest(`A conversation can include up to ${MAX_STAFF} colleagues besides you.`);
  // Keeps customers and astrologers from reaching each other through a group conversation.
  const broadcast = outside.length > 1;
  if (broadcast && !outside.every((p) => p.role === "ASTROLOGER")) {
    throw badRequest("A conversation can include one customer, plus any staff. Several astrologers each get their own conversation.");
  }
  if (outside.length > MAX_ASTROLOGERS) throw badRequest(`You can message up to ${MAX_ASTROLOGERS} astrologers at once.`);

  checkSendRate(me);
  if (!broadcast) {
    const sent = await deliver(me, ids, body.subject, body.text);
    const other = outside[0];
    if (sent.created && other) {
      await audit(admin, "messages.start", `${kindOf(other)}:${staffSees(other).name}`, body.subject ?? "Conversation started");
    }
    return res.status(201).json({ id: sent.id, created: sent.created, message: sent.message });
  }

  // One message to many astrologers: a few a minute at most.
  rateLimit(`dm-bulk:${me}`, 3, 60_000, "You've sent several messages to many astrologers just now. Wait a minute before the next.");
  const staffIds = staff.map((p) => p.id);
  const sent: { id: string; created: boolean; person: ReturnType<typeof staffSees> }[] = [];
  try {
    // One at a time: each is its own conversation, and the database stays free for everyone else.
    for (const astrologer of outside) {
      const r = await deliver(me, [...staffIds, astrologer.id], body.subject, body.text);
      sent.push({ id: r.id, created: r.created, person: staffSees(astrologer) });
    }
  } finally {
    if (sent.length) {
      const fresh = sent.filter((s) => s.created).length;
      const names = sent.map((s) => s.person.name);
      await audit(
        admin,
        "messages.broadcast",
        `astrologers:${sent.length}`,
        [
          body.subject ?? "No subject",
          `sent to ${sent.length} of ${outside.length} astrologers (${fresh} new, ${sent.length - fresh} continued)`,
          names.length > 12 ? `${names.slice(0, 12).join(", ")} and ${names.length - 12} more` : names.join(", "),
          staff.length ? `with ${staff.length} staff` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }
  }
  res.status(201).json({
    id: sent[0]!.id,
    created: sent.some((s) => s.created),
    conversations: sent.map((s) => ({ id: s.id, created: s.created, person: s.person })),
  });
});

messagesRouter.post("/messages/:id", async (req, res) => {
  const admin = requirePage(req, "messages");
  const { text } = z.object({ text: directText }).parse(req.body);
  const thread = await directThreadFor(String(req.params.id), admin.user.id, false);
  const closed = closedReason(thread);
  if (closed) throw conflict(closed);
  checkSendRate(admin.user.id);
  res.status(201).json({ message: await postDirect(thread.id, admin.user.id, text) });
});
