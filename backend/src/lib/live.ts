import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db.ts";
import { HttpError, badRequest, conflict, notFound } from "./errors.ts";
import { rupee } from "./format.ts";
import { CONTACT_BLOCKED_NOTICE, containsContactDetails } from "./safety.ts";
import { getSetting } from "./settings.ts";
import { sharePctFor, sharePolicy, writeEarnings } from "./earnings.ts";
import type { ChatMessage, GiftSend, LiveRoom, User } from "../generated/prisma/client.ts";

// Live room activity shared by the public room (routes/catalog.ts) and the astrologer's
// console (routes/portal.ts): the chat feed with join and gift lines, gifts, and the session
// details an astrologer sets when going live.

/** Chat lines a room answer carries (this session only). */
export const CHAT_SHOWN = 50;
/** Recent gifts a room answer carries; each viewer's page animates each one once. */
export const GIFTS_SHOWN = 20;

/** "Sneha R" → "SR". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "•";
}

/** One line of the room feed: a message, "<name> joined" or "<name> sent 🪷 Lotus". */
export function chatLineView(c: ChatMessage) {
  return {
    id: c.id,
    kind: c.kind === "join" || c.kind === "gift" ? c.kind : "message",
    who: c.author,
    text: c.text,
    photo: c.photo,
    initials: initialsOf(c.author),
  };
}

type GiftWithSender = GiftSend & { user: Pick<User, "name" | "photoUrl"> | null };

export function giftView(g: GiftWithSender) {
  const who = g.user?.name ?? "A viewer";
  return {
    id: g.id,
    who,
    photo: g.user?.photoUrl ?? null,
    initials: initialsOf(who),
    icon: g.icon,
    name: g.name,
    price: g.price,
    at: g.createdAt.toISOString(),
  };
}

/** This live session's chat (oldest first) and recent gifts (newest first). */
export async function sessionFeed(room: Pick<LiveRoom, "id" | "startedAt">) {
  const since = { gte: room.startedAt };
  const [chat, gifts] = await Promise.all([
    db.chatMessage.findMany({ where: { roomId: room.id, createdAt: since }, orderBy: { createdAt: "desc" }, take: CHAT_SHOWN }),
    db.giftSend.findMany({
      where: { roomId: room.id, createdAt: since },
      orderBy: { createdAt: "desc" },
      take: GIFTS_SHOWN,
      include: { user: { select: { name: true, photoUrl: true } } },
    }),
  ]);
  return { chat: chat.reverse().map(chatLineView), gifts: gifts.map(giftView) };
}

// ── Joining ──

/** Joins being written right now, so two quick requests can't both post "<name> joined". */
const joining = new Set<string>();

/**
 * Posts "<name> joined" to the room feed the first time a viewer joins this live session.
 * Joining again (another tab, a reload) posts nothing.
 */
export async function announceJoin(room: Pick<LiveRoom, "id" | "startedAt">, user: Pick<User, "id" | "name" | "photoUrl">) {
  const key = `${room.id}@${room.startedAt.getTime()}:${user.id}`;
  if (joining.has(key)) return;
  joining.add(key);
  try {
    const already = await db.chatMessage.findFirst({
      where: { roomId: room.id, userId: user.id, kind: "join", createdAt: { gte: room.startedAt } },
      select: { id: true },
    });
    if (!already) {
      await db.chatMessage.create({ data: { roomId: room.id, author: user.name, text: "joined", userId: user.id, kind: "join", photo: user.photoUrl } });
    }
  } finally {
    joining.delete(key);
  }
}

// ── Gifts ──

/**
 * What a customer can spend on gifts: gifts are paid from the service balance only, and an
 * ongoing consultation's hold is covered by promotional credit first (it is used first when
 * the session settles), so only the part of the hold above the promo balance is set aside.
 */
export function giftSpendable(w: { service: number; promo: number; held: number } | null): number {
  if (!w) return 0;
  return Math.max(0, w.service - Math.max(0, w.held - w.promo));
}

export async function giftBalance(userId: string): Promise<number> {
  return giftSpendable(await db.wallet.findUnique({ where: { userId }, select: { service: true, promo: true, held: true } }));
}

/**
 * The gift's wallet reference, derived from the customer and the request id their page sent,
 * so repeating a request (double click, a retry after a dropped connection) finds the gift
 * already sent instead of charging again. The unique index on the reference enforces it.
 */
export function giftRef(userId: string, requestId: string): string {
  return "GFT-" + createHash("sha256").update(`${userId}:${requestId}`).digest("hex").slice(0, 12).toUpperCase();
}

const withSender = { user: { select: { name: true, photoUrl: true } } } as const;

/**
 * A customer sends a gift from the catalogue to a live room. In one database transaction: the
 * service balance is debited (never below what an ongoing consultation needs), the wallet
 * ledger gets a "Gift sent" line, the gift is recorded, the room feed says so, and the
 * astrologer's earnings get a gift line. Returns the gift and whether it was a repeat.
 */
export async function sendGift(roomId: string, user: Pick<User, "id" | "name" | "photoUrl">, giftId: string, requestId: string) {
  const ref = giftRef(user.id, requestId);
  const prior = await db.giftSend.findUnique({ where: { ref }, include: withSender });
  if (prior) {
    if (prior.userId !== user.id) throw conflict("Something went wrong sending this gift. Please try again.");
    return { gift: giftView(prior), replayed: true };
  }

  const gift = await db.gift.findUnique({ where: { id: giftId } });
  if (!gift || gift.state !== "ACTIVE" || gift.price <= 0) throw badRequest("This gift isn't available right now. Choose another one.");
  const shares = await sharePolicy();

  try {
    const sent = await db.$transaction(async (tx) => {
      const room = await tx.liveRoom.findFirst({
        where: { id: roomId, isLive: true },
        select: { id: true, astrologerId: true, astrologer: { select: { activatedAt: true, createdAt: true } } },
      });
      if (!room) throw notFound("This live room has ended.");
      // One statement: concurrent gifts (or a consultation settling) can never overspend.
      const debited = await tx.$executeRaw`
        UPDATE "Wallet" SET "service" = "service" - ${gift.price}
        WHERE "userId" = ${user.id} AND "service" - GREATEST(0, "held" - "promo") >= ${gift.price}`;
      if (!debited) return null;
      await tx.transaction.create({ data: { userId: user.id, type: "Gift sent", ref, bucket: "Service", amount: -gift.price } });
      const send = await tx.giftSend.create({
        data: { roomId: room.id, astrologerId: room.astrologerId, userId: user.id, giftId: gift.id, name: gift.name, icon: gift.icon, price: gift.price, ref },
        include: withSender,
      });
      await tx.chatMessage.create({
        data: { roomId: room.id, author: user.name, text: `sent ${gift.icon} ${gift.name}`, userId: user.id, kind: "gift", photo: user.photoUrl },
      });
      // Gifts follow the same split as consultations (client, Oct 2026): the astrologer keeps their share.
      await writeEarnings(tx, {
        astrologerId: room.astrologerId,
        date: send.createdAt,
        sessionRef: ref,
        kind: "gift",
        mode: `Live gift · ${gift.name}`,
        minutes: 0,
        gifts: gift.price,
        gross: gift.price,
        sharePct: sharePctFor(room.astrologer, send.createdAt, shares),
      });
      return send;
    });
    if (!sent) {
      const short = gift.price - (await giftBalance(user.id));
      throw new HttpError(409, `Needs ${rupee(Math.max(1, short))} more in service balance.`, "insufficient_balance");
    }
    return { gift: giftView(sent), replayed: false };
  } catch (e) {
    // The same request ran twice at once: the other one sent it (and charged once).
    if ((e as { code?: string }).code === "P2002") {
      const again = await db.giftSend.findUnique({ where: { ref }, include: withSender });
      if (again && again.userId === user.id) return { gift: giftView(again), replayed: true };
      throw conflict("Something went wrong sending this gift. Please try again.");
    }
    throw e;
  }
}

// ── Session details (spec AR-LIVE §4) ──

export const MIN_DURATION = 5;
export const MAX_DURATION = 480;

export async function liveCategories(): Promise<string[]> {
  const list = await getSetting<unknown>("live.categories", []);
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string" && c.trim().length > 0) : [];
}

const titleField = z
  .string({ error: "Give your live a title." })
  .trim()
  .min(3, "Give your live a title of at least 3 characters.")
  .max(80, "Keep the title under 80 characters.");
export const topicField = z
  .string({ error: "Give your live a topic." })
  .trim()
  .min(3, "Give your live a topic, e.g. “Saturn transit Q&A”.")
  .max(80, "Keep the topic under 80 characters.");

/** Title, topic, category, language and expected duration, checked against what this astrologer may choose. */
export function detailsSchema(categories: string[], languages: string[]) {
  return z.object({
    title: titleField,
    topic: topicField,
    category: z.string({ error: "Choose a category." }).refine((c) => categories.includes(c), "Choose a category from the list."),
    language: z.string({ error: "Choose a language." }).refine((l) => languages.includes(l), "Choose one of the languages on your profile."),
    durationMins: z
      .number({ error: "Say roughly how long you'll be live." })
      .int("Enter the duration in whole minutes.")
      .min(MIN_DURATION, `Plan at least ${MIN_DURATION} minutes.`)
      .max(MAX_DURATION, `A live can be planned for up to ${MAX_DURATION} minutes (8 hours).`),
  });
}

export type LiveDetails = z.infer<ReturnType<typeof detailsSchema>>;

/** Contact details are not allowed in what viewers read. */
export function checkDetailsText(d: Partial<Pick<LiveDetails, "title" | "topic">>) {
  if ((d.title && containsContactDetails(d.title)) || (d.topic && containsContactDetails(d.topic))) throw badRequest(CONTACT_BLOCKED_NOTICE);
}

/** "title: A → B · duration: 30 → 45 min" for the audit log. */
export function detailsDiff(before: Partial<LiveDetails>, after: Partial<LiveDetails>): string {
  const fmt = (k: keyof LiveDetails, v: unknown) => (v === null || v === undefined || v === "" ? "—" : k === "durationMins" ? `${v} min` : String(v));
  const labels: Record<keyof LiveDetails, string> = { title: "title", topic: "topic", category: "category", language: "language", durationMins: "duration" };
  return (Object.keys(labels) as (keyof LiveDetails)[])
    .filter((k) => k in after && after[k] !== before[k])
    .map((k) => `${labels[k]}: ${fmt(k, before[k])} → ${fmt(k, after[k])}`)
    .join(" · ");
}
