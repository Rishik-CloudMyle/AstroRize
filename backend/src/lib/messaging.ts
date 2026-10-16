import { z } from "zod";
import { db } from "../db.ts";
import type { Astrologer, Message, User } from "../generated/prisma/client.ts";
import { conflict, notFound } from "./errors.ts";
import { istDate } from "./format.ts";
import { ROLE_LABELS, type AdminRoleKey } from "./rbac.ts";
import { CONTACT_BLOCKED_NOTICE, containsContactDetails, rateLimit } from "./safety.ts";

// Astrologer Messenger: free, text-only direct messages between a customer and an astrologer.
// One conversation per astrologer–customer pair; contact details are never delivered.

export type Side = "CUSTOMER" | "ASTROLOGER";

export const messageText = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(1000, "Messages can be up to 1,000 characters.");

/**
 * A message as one side of the conversation sees it. A blocked message is shown only to the
 * person who tried to send it (older notices, saved before the sender was recorded, to both).
 */
export function messageView(m: Message, viewer: Side) {
  const from = m.blocked ? "blocked" : m.sender === viewer ? "me" : viewer === "ASTROLOGER" ? "customer" : "astrologer";
  return { id: m.id, from, text: m.text, at: m.createdAt.toISOString() };
}

export function visibleTo(viewer: Side) {
  return (m: Message) => !m.blocked || m.sender === viewer || m.sender === "SYSTEM";
}

/** The last delivered message, for list previews. */
export function lastDelivered(messages: Message[]): Message | undefined {
  return messages.findLast((m) => !m.blocked);
}

/**
 * Messages from the other side that arrived after this side last opened the conversation
 * (MessageThread.astrologerReadAt / customerReadAt). Blocked messages never reach the other side.
 */
export function unreadFrom(messages: Pick<Message, "sender" | "blocked" | "createdAt">[], from: "CUSTOMER" | "ASTROLOGER", readAt: Date | null): number {
  return messages.filter((m) => m.sender === from && !m.blocked && (!readAt || m.createdAt > readAt)).length;
}

/** Same pace limit on both sides. Checked before anything is written. */
export function checkSendRate(userId: string) {
  rateLimit(`dm:${userId}`, 5, 10_000, "You're sending messages too quickly. Wait a few seconds.");
}

/**
 * Saves a message from one side. Contact details are never delivered: the sender gets the
 * notice instead (stored as blocked, without the original text).
 */
export async function postMessage(threadId: string, sender: Side, text: string) {
  const blocked = containsContactDetails(text);
  const message = await db.message.create({
    data: blocked ? { threadId, sender, text: CONTACT_BLOCKED_NOTICE, blocked: true } : { threadId, sender, text },
  });
  await db.messageThread.update({ where: { id: threadId }, data: { updatedAt: message.createdAt } });
  return { blocked, message: messageView(message, sender) };
}

/** Consultations that actually connected and finished between the two. */
const completedWith = (customerId: string, astrologerId: string) => ({
  customerId,
  astrologerId,
  status: "ENDED",
  connectedAt: { not: null },
});

/** A customer may start a conversation with any listed astrologer (active, not fully suspended). */
export function isMessageable(a: Pick<Astrologer, "lifecycle" | "suspension">): boolean {
  return a.lifecycle === "active" && a.suspension !== "full";
}

/** The customer's history with this astrologer, for the astrologer's profile popup. */
export async function historyWith(customerId: string, astrologerId: string) {
  const where = completedWith(customerId, astrologerId);
  const [consultations, last] = await Promise.all([
    db.consultation.count({ where }),
    db.consultation.findFirst({ where, orderBy: { endedAt: "desc" }, select: { endedAt: true, connectedAt: true } }),
  ]);
  const lastAt = last?.endedAt ?? last?.connectedAt ?? null;
  return { consultations, lastConsultation: lastAt ? istDate(lastAt) : null };
}

// ── Astrorize team conversations ──
// Started only by an admin, with other staff (one or several), or with one astrologer or one
// customer (plus any staff). Every member can reply. Unread counts come from each member's
// lastReadAt. These are with Astrorize staff, so contact details are not held back here.

export const directText = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(2000, "Messages can be up to 2,000 characters.");

export type PersonKind = "staff" | "astrologer" | "customer";

export const personInclude = { astrologer: { select: { name: true, photo: true, slug: true } } } as const;
export type Person = User & { astrologer: Pick<Astrologer, "name" | "photo" | "slug"> | null };

export function kindOf(u: Pick<User, "role">): PersonKind {
  return u.role === "ADMIN" ? "staff" : u.role === "ASTROLOGER" ? "astrologer" : "customer";
}

/** "Finance", "Super Admin"… for a staff member. */
export function departmentOf(u: Pick<User, "adminRole">): string {
  return u.adminRole ? ROLE_LABELS[u.adminRole.toLowerCase() as AdminRoleKey] : "Staff";
}

/** "+91 98••• ••210": enough to tell two customers apart, never the full number. */
export function maskedPhone(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, "").slice(-10);
  return digits && digits.length >= 6 ? `+91 ${digits.slice(0, 2)}••• ••${digits.slice(-3)}` : null;
}

function maskedEmail(email: string | null): string | null {
  const [local, domain] = email?.split("@") ?? [];
  return local && domain ? `${local[0]}•••@${domain}` : null;
}

/** How a person appears to staff: their name and one short line (department, role or masked contact). */
export function staffSees(u: Person) {
  const kind = kindOf(u);
  const name = kind === "astrologer" ? (u.astrologer?.name ?? u.name) : u.name;
  const line =
    kind === "staff"
      ? departmentOf(u)
      : kind === "astrologer"
        ? "Astrologer"
        : ["Customer", maskedPhone(u.phone) ?? maskedEmail(u.email)].filter(Boolean).join(" · ");
  const photo = kind === "astrologer" ? (u.astrologer?.photo ?? null) : kind === "customer" ? u.photoUrl : null;
  return { id: u.id, kind, name, initials: u.initials, photo, line };
}

/** Customer → "Astrorize support"; astrologer → "Astrorize team · Neha Gupta (Finance)". */
function teamLabel(viewer: PersonKind, staff: Person | undefined): string {
  if (viewer === "customer") return "Astrorize support";
  return staff ? `Astrorize team · ${staff.name} (${departmentOf(staff)})` : "Astrorize team";
}

/** The author of a staff message as an astrologer ("Neha Gupta · Finance") or a customer ("Neha · Astrorize support") sees it. */
function staffAuthor(viewer: PersonKind, u: Person): string {
  return viewer === "customer" ? `${u.name.split(" ")[0]} · Astrorize support` : `${u.name} · ${departmentOf(u)}`;
}

/** Unread messages per conversation for this person (messages from others after they last read). */
export async function directUnread(userId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ threadId: string; n: bigint }[]>`
    SELECT m."threadId", count(*) AS n
    FROM "DirectMessage" m JOIN "DirectMember" dm ON dm."threadId" = m."threadId" AND dm."userId" = ${userId}
    WHERE m."senderId" <> ${userId} AND (dm."lastReadAt" IS NULL OR m."createdAt" > dm."lastReadAt")
    GROUP BY m."threadId"`;
  return new Map(rows.map((r) => [r.threadId, Number(r.n)]));
}

/** Total unread across this person's team conversations (for the nav badges). */
export async function directUnreadTotal(userId: string): Promise<number> {
  let total = 0;
  for (const n of (await directUnread(userId)).values()) total += n;
  return total;
}

/** Conversations this person is in, newest first, with the last message for the preview. */
async function threadsOf(userId: string) {
  return db.directThread.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      members: { include: { user: { include: personInclude } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

/** Who speaks for Astrorize in a conversation: the admin who started it. */
const creatorOf = (t: { createdById: string; members: { userId: string; user: Person }[] }) =>
  t.members.find((m) => m.userId === t.createdById)?.user ?? t.members.find((m) => m.user.role === "ADMIN")?.user;

/** The list for a staff member: who else is in each conversation. */
export async function staffConversations(userId: string) {
  const [threads, unread] = await Promise.all([threadsOf(userId), directUnread(userId)]);
  return threads.map((t) => {
    const last = t.messages[0];
    return {
      id: t.id,
      subject: t.subject,
      people: t.members.filter((m) => m.userId !== userId).map((m) => staffSees(m.user)),
      preview: last?.text.slice(0, 100) ?? "",
      lastAt: (last?.createdAt ?? t.createdAt).toISOString(),
      lastFromMe: last?.senderId === userId,
      unread: unread.get(t.id) ?? 0,
    };
  });
}

/** The list for an astrologer or a customer: each conversation is with "the Astrorize team". */
export async function teamConversations(userId: string, viewer: Exclude<PersonKind, "staff">) {
  const [threads, unread] = await Promise.all([threadsOf(userId), directUnread(userId)]);
  return threads.map((t) => {
    const last = t.messages[0];
    return {
      id: t.id,
      title: teamLabel(viewer, creatorOf(t)),
      subject: t.subject,
      preview: last?.text.slice(0, 100) ?? "",
      lastAt: (last?.createdAt ?? t.createdAt).toISOString(),
      lastFromMe: last?.senderId === userId,
      unread: unread.get(t.id) ?? 0,
    };
  });
}

/** One conversation for a member (404 for anyone else), optionally marking it read. */
export async function directThreadFor(threadId: string, userId: string, markRead: boolean) {
  const thread = await db.directThread.findUnique({
    where: { id: threadId },
    include: {
      members: { include: { user: { include: personInclude } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { include: personInclude } } },
    },
  });
  if (!thread || !thread.members.some((m) => m.userId === userId)) throw notFound("Conversation not found.");
  if (markRead) {
    await db.directMember.update({ where: { threadId_userId: { threadId, userId } }, data: { lastReadAt: new Date() } });
  }
  return thread;
}
type FullThread = Awaited<ReturnType<typeof directThreadFor>>;

/** Why nobody can write in this conversation any more (a customer deleted their account), or null. */
export function closedReason(t: Pick<FullThread, "members">): string | null {
  const gone = t.members.some((m) => m.user.role === "CUSTOMER" && m.user.deletedAt);
  return gone ? "This customer has deleted their account, so the conversation is closed." : null;
}

export function staffThreadView(t: FullThread, userId: string) {
  const closed = closedReason(t);
  return {
    id: t.id,
    subject: t.subject,
    startedBy: t.members.find((m) => m.userId === t.createdById)?.user.name ?? null,
    startedAt: t.createdAt.toISOString(),
    people: t.members.filter((m) => m.userId !== userId).map((m) => staffSees(m.user)),
    messages: t.messages.map((m) => ({
      id: m.id,
      mine: m.senderId === userId,
      author: staffSees(m.sender),
      text: m.text,
      at: m.createdAt.toISOString(),
    })),
    canSend: !closed,
    notice: closed,
  };
}

export function teamThreadView(t: FullThread, userId: string, viewer: Exclude<PersonKind, "staff">) {
  return {
    id: t.id,
    title: teamLabel(viewer, creatorOf(t)),
    subject: t.subject,
    messages: t.messages.map((m) => ({
      id: m.id,
      from: m.senderId === userId ? ("me" as const) : ("team" as const),
      author: m.senderId === userId ? null : m.sender.role === "ADMIN" ? staffAuthor(viewer, m.sender) : staffSees(m.sender).name,
      text: m.text,
      at: m.createdAt.toISOString(),
    })),
  };
}

/** Saves a message from a member and marks the conversation read up to it for the sender. */
export async function postDirect(threadId: string, senderId: string, text: string) {
  const message = await db.$transaction(async (tx) => {
    const m = await tx.directMessage.create({ data: { threadId, senderId, text } });
    await tx.directThread.update({ where: { id: threadId }, data: { updatedAt: m.createdAt } });
    await tx.directMember.update({ where: { threadId_userId: { threadId, userId: senderId } }, data: { lastReadAt: m.createdAt } });
    return m;
  });
  return { id: message.id, text: message.text, at: message.createdAt.toISOString() };
}

/** A member replies (astrologer or customer side): checks membership, a closed conversation and the pace limit. */
export async function replyDirect(threadId: string, userId: string, text: string) {
  const thread = await directThreadFor(threadId, userId, false);
  const closed = closedReason(thread);
  if (closed) throw conflict(closed);
  checkSendRate(userId);
  return postDirect(threadId, userId, text);
}
