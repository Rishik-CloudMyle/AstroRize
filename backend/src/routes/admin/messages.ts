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
import { pagesOf, requirePage, type AdminRoleKey } from "../../lib/rbac.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Messages: admins talk to other staff (one person or several), to an astrologer or to a
// customer. Only an admin can start a conversation; everyone in it can reply. Each person
// sees only the conversations they are in.
export const messagesRouter = Router();

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
 * People to start a conversation with. With no search: the staff, by department. With two or
 * more characters: staff, astrologers and customers by name, email or phone. Customers show only
 * their name and a masked phone number.
 */
messagesRouter.get("/messages/people", async (req, res) => {
  const admin = requirePage(req, "messages");
  const q = z.string().trim().max(80).catch("").parse(req.query.q);
  const text = { contains: q, mode: "insensitive" as const };
  // A phone search: digits only (spaces, dashes and a leading +91 allowed), at least four.
  const digits = q.replace(/^\+91/, "").replace(/[\s()-]/g, "");
  const byPhone: Prisma.UserWhereInput[] = /^\d{4,10}$/.test(digits) ? [{ phone: { contains: digits } }] : [];
  const searching = q.length >= 2;
  const [staff, astrologers, customers] = await Promise.all([
    db.user.findMany({
      where: { role: "ADMIN", active: true, id: { not: admin.user.id }, ...(q ? { OR: [{ name: text }, { email: text }] } : {}) },
      orderBy: [{ adminRole: "asc" }, { name: "asc" }],
      take: 100,
      include: personInclude,
    }),
    searching
      ? db.user.findMany({
          where: {
            role: "ASTROLOGER",
            active: true,
            astrologer: { isNot: null },
            OR: [{ name: text }, { email: text }, { astrologer: { name: text } }, ...byPhone],
          },
          orderBy: { name: "asc" },
          take: 8,
          include: personInclude,
        })
      : [],
    searching
      ? db.user.findMany({
          where: { role: "CUSTOMER", active: true, deletedAt: null, OR: [{ name: text }, { email: text }, ...byPhone] },
          orderBy: { name: "asc" },
          take: 8,
          include: personInclude,
        })
      : [],
  ]);
  res.json({ people: [...staff.filter(canReceive), ...astrologers, ...customers].map(staffSees) });
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
    .max(25, "A conversation can include up to 25 people."),
  subject: z
    .string()
    .trim()
    .max(120, "Keep the subject to 120 characters.")
    .nullish()
    .transform((s) => s || null),
  text: directText,
});

/** Start a conversation (or, without a subject, continue the one already with exactly these people). */
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
  const outside = people.filter((p) => p.role !== "ADMIN");
  // Keeps customers and astrologers from reaching each other through a group conversation.
  if (outside.length > 1) throw badRequest("A conversation can include one astrologer or customer, plus any staff.");

  checkSendRate(me);
  let threadId: string | null = null;
  if (!body.subject) {
    const same = await db.directThread.findMany({
      where: { subject: null, AND: [me, ...ids].map((userId) => ({ members: { some: { userId } } })) },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
    });
    threadId = same.find((t) => t._count.members === ids.length + 1)?.id ?? null;
  }
  const created = !threadId;
  if (!threadId) {
    const thread = await db.directThread.create({
      data: {
        subject: body.subject,
        createdById: me,
        members: { create: [{ userId: me, lastReadAt: new Date() }, ...ids.map((userId) => ({ userId }))] },
      },
    });
    threadId = thread.id;
    const other = outside[0];
    if (other) {
      await audit(admin, "messages.start", `${kindOf(other)}:${staffSees(other).name}`, body.subject ?? "Conversation started");
    }
  }
  const message = await postDirect(threadId, me, body.text);
  res.status(201).json({ id: threadId, created, message });
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
