import { config } from "../config.ts";
import { db } from "../db.ts";
import { ELIGIBILITY_MINUTES, rateFor, type Mode } from "./billing.ts";
import {
  OPEN_STATUSES,
  billedElapsed,
  endConsultation,
  endIfNeverJoined,
  freeWindow,
  joinTimeoutSeconds,
  joinView,
  lockKey,
  openConsultationOf,
  sessionCapSeconds,
} from "./consultations.ts";
import { makeRef } from "./format.ts";
import { syncPresence } from "./presence.ts";
import { windowOf } from "./consult-room.ts";
import { consultSummary } from "./profile.ts";
import { configNumber } from "./settings.ts";
import { zegoConfigured, zegoRoom, zegoServerUrl, zegoToken, zegoUserId } from "./zego.ts";
import type { Consultation, LiveRoom, Prisma, User } from "../generated/prisma/client.ts";

// Private consultations taken from a live room (spec AR-LIVE): the live's video keeps going to
// everyone, while the astrologer talks privately with the one customer being consulted — by chat,
// voice or video, as the customer chose when joining the queue. While one is in session the live's
// sound is off for everyone else.
//
//   Join the queue  → a LiveQueueEntry (WAITING) and its Consultation (origin LIVE, status QUEUED)
//                     in the chosen mode, with the rate the customer was shown for that mode, so
//                     the price is locked from then on.
//   Accept          → the consultation is CONNECTING and the customer's balance is held; the
//                     customer has a short window to join the call. One per room at a time; the
//                     others keep waiting in order.
//   Join the call   → ACTIVE (connected); metered once both sides have really joined the private
//                     room (billingStartedAt — same rule and join timeout as any consultation).
//   End (either)    → settled by endConsultation, exactly like a direct consultation.
//   Not answered / declined / left / live ended before connecting → released, ₹0 charged.

export const LIVE_ORIGIN = "LIVE";
/** A request waiting in a live room's queue (not yet a consultation anyone is in). */
export const QUEUED = "QUEUED";
/** A private consultation is happening in the room (accepted and connecting, or in session). */
const PRIVATE_STATUSES = ["CONNECTING", "ACTIVE"];

type Tx = Prisma.TransactionClient;

/** Seconds the customer has to join the call once the astrologer accepts (Config, default 60). */
export async function answerSeconds(): Promise<number> {
  return Math.min(300, Math.max(20, await configNumber("live.private.answer_seconds", 60)));
}

/** The rate of a private consultation from this astrologer's live: the same as a direct one in that mode. */
export const liveRate = (price: number, mode: Mode = "VOICE") => rateFor(price, mode);

/** What each mode costs from this astrologer's live (₹/min). Instant Call isn't offered from a live. */
export const liveRates = (price: number) => ({ chat: liveRate(price, "CHAT"), voice: liveRate(price, "VOICE"), video: liveRate(price, "VIDEO") });

/** The private consultation happening in the room right now, if any. */
export function privateInRoom(roomId: string) {
  return db.consultation.findFirst({
    where: { origin: LIVE_ORIGIN, liveRoomId: roomId, status: { in: PRIVATE_STATUSES } },
    orderBy: { requestedAt: "desc" },
    include: { customer: true },
  });
}

async function newSessionRef(tx: Tx): Promise<string> {
  for (;;) {
    const ref = makeRef("SES");
    if (!(await tx.consultation.findUnique({ where: { ref }, select: { id: true } }))) return ref;
  }
}

const newAlias = (n: number) => `${String.fromCharCode(65 + (n % 26))}-${Math.floor(1000 + Math.random() * 8999)}`;

// ── The queue ──

export type JoinResult =
  | { kind: "ok" }
  | { kind: "rate_changed"; rate: number }
  | { kind: "short"; spendable: number; needed: number; rate: number }
  | { kind: "full" }
  | { kind: "open"; open: Consultation };

/**
 * A customer joins the room's consult queue for a private chat, voice or video consultation. They
 * must have five minutes' balance at the rate they were shown for that mode (`quotedRate`, checked
 * against the current one); that rate is stored and is what they pay if accepted. Joining twice
 * changes nothing (the first request, and its mode, stand).
 */
export async function joinQueue(room: LiveRoom, userId: string, mode: Mode, quotedRate: number | undefined): Promise<JoinResult> {
  const astrologer = await db.astrologer.findUniqueOrThrow({ where: { id: room.astrologerId }, select: { price: true } });
  const rate = liveRate(astrologer.price, mode);
  if (quotedRate !== undefined && quotedRate !== rate) return { kind: "rate_changed", rate };
  const needed = rate * ELIGIBILITY_MINUTES;
  await db.wallet.upsert({ where: { userId }, create: { userId }, update: {} });

  return db.$transaction(async (tx) => {
    await lockKey(tx, `liveq:${room.id}`);
    await lockKey(tx, `consult:${userId}`);
    const existing = await tx.liveQueueEntry.findFirst({ where: { roomId: room.id, userId, status: "WAITING" }, select: { id: true } });
    if (existing) return { kind: "ok" as const };
    const open = await openConsultationOf(tx, userId);
    if (open) return { kind: "open" as const, open };
    const waiting = await tx.liveQueueEntry.count({ where: { roomId: room.id, status: "WAITING" } });
    if (waiting >= room.queueCapacity) return { kind: "full" as const };
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const spendable = Math.max(0, wallet.service + wallet.promo - wallet.held);
    if (spendable < needed) return { kind: "short" as const, spendable, needed, rate };

    const alias = newAlias(waiting);
    const consultation = await tx.consultation.create({
      data: {
        ref: await newSessionRef(tx),
        origin: LIVE_ORIGIN,
        liveRoomId: room.id,
        source: "LIVE",
        customerId: userId,
        customerAlias: alias,
        astrologerId: room.astrologerId,
        // Chat, voice or video with the astrologer, in a room of its own (never the live's).
        mode,
        rate,
        status: QUEUED,
      },
    });
    await tx.liveQueueEntry.create({ data: { roomId: room.id, userId, alias, mode: "PRIVATE", consent: false, consultationId: consultation.id } });
    return { kind: "ok" as const };
  });
}

/** The customer leaves the queue before being accepted. Nothing was held or charged. */
export async function leaveQueue(roomId: string, userId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockKey(tx, `liveq:${roomId}`);
    const entries = await tx.liveQueueEntry.findMany({ where: { roomId, userId, status: "WAITING" } });
    if (!entries.length) return false;
    await tx.liveQueueEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { status: "LEFT" } });
    await closeQueued(tx, entries.map((e) => e.consultationId), "CANCELLED", "user");
    return true;
  });
}

/** Closes the not-yet-accepted consultations behind queue entries (nothing was ever held for them). */
async function closeQueued(tx: Tx | typeof db, ids: (string | null)[], status: "CANCELLED" | "REJECTED", reason: string) {
  const list = ids.filter((id): id is string => !!id);
  if (!list.length) return;
  await tx.consultation.updateMany({ where: { id: { in: list }, status: QUEUED }, data: { status, endedAt: new Date(), endReason: reason } });
}

/** The astrologer declines a waiting request. The customer is told; ₹0 charged. */
export async function declineRequest(entryId: string, astrologerId: string) {
  return db.$transaction(async (tx) => {
    const entry = await tx.liveQueueEntry.findUnique({ where: { id: entryId }, include: { room: { select: { astrologerId: true, id: true } } } });
    if (!entry || entry.room.astrologerId !== astrologerId) return "notfound" as const;
    await lockKey(tx, `liveq:${entry.room.id}`);
    const { count } = await tx.liveQueueEntry.updateMany({ where: { id: entry.id, status: "WAITING" }, data: { status: "DECLINED" } });
    if (!count) return "gone" as const;
    await closeQueued(tx, [entry.consultationId], "REJECTED", "astrologer");
    return "ok" as const;
  });
}

export type AcceptResult =
  | { kind: "ok"; consultation: Consultation }
  | { kind: "notfound" | "gone" | "not_first" | "busy" | "customer_busy" | "short" };

/**
 * The astrologer accepts a waiting request: the private consultation is offered to the customer
 * (CONNECTING) and their available balance is held for it, as for any consultation. Only one
 * private consultation per room at a time; the rest of the queue keeps its order.
 */
export async function acceptRequest(entryId: string, astrologerId: string): Promise<AcceptResult> {
  const result = await db.$transaction(async (tx): Promise<AcceptResult> => {
    await lockKey(tx, `astro:${astrologerId}`);
    const entry = await tx.liveQueueEntry.findUnique({ where: { id: entryId }, include: { room: true } });
    if (!entry || entry.room.astrologerId !== astrologerId) return { kind: "notfound" };
    await lockKey(tx, `liveq:${entry.room.id}`);
    const fresh = await tx.liveQueueEntry.findUniqueOrThrow({ where: { id: entry.id } });
    if (fresh.status !== "WAITING" || !entry.room.isLive || !fresh.userId) return { kind: "gone" };
    // First come, first served.
    const front = await tx.liveQueueEntry.findFirst({ where: { roomId: entry.room.id, status: "WAITING" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (front?.id !== fresh.id) return { kind: "not_first" };
    const busy = await tx.consultation.findFirst({ where: { astrologerId, status: { in: PRIVATE_STATUSES } }, select: { id: true } });
    if (busy) return { kind: "busy" };
    await lockKey(tx, `consult:${fresh.userId}`);
    // Another consultation of the customer's (e.g. started elsewhere meanwhile): they stay in the queue.
    if (await openConsultationOf(tx, fresh.userId)) return { kind: "customer_busy" };

    let c = fresh.consultationId ? await tx.consultation.findUnique({ where: { id: fresh.consultationId } }) : null;
    if (!c || c.status !== QUEUED) {
      // A request from before private consultations were billed: priced at today's rate.
      const a = await tx.astrologer.findUniqueOrThrow({ where: { id: astrologerId }, select: { price: true } });
      c = await tx.consultation.create({
        data: {
          ref: await newSessionRef(tx),
          origin: LIVE_ORIGIN,
          liveRoomId: entry.room.id,
          source: "LIVE",
          customerId: fresh.userId,
          customerAlias: fresh.alias,
          astrologerId,
          mode: "VOICE",
          rate: liveRate(a.price),
          status: QUEUED,
        },
      });
    }

    // Same eligibility as any consultation: five minutes at the locked rate.
    const wallet = await tx.wallet.findUnique({ where: { userId: fresh.userId } });
    const spendable = wallet ? Math.max(0, wallet.service + wallet.promo - wallet.held) : 0;
    if (spendable < c.rate * ELIGIBILITY_MINUTES) {
      await tx.liveQueueEntry.update({ where: { id: fresh.id }, data: { status: "LEFT", consultationId: c.id } });
      await closeQueued(tx, [c.id], "CANCELLED", "balance");
      return { kind: "short" };
    }

    const now = new Date();
    await tx.wallet.update({ where: { userId: fresh.userId }, data: { held: { increment: spendable } } });
    // requestedAt: when the call was offered (the queue entry keeps when they joined the queue).
    const consultation = await tx.consultation.update({
      where: { id: c.id },
      data: { status: "CONNECTING", heldAmount: spendable, requestedAt: now, offeredAt: now },
    });
    await tx.liveQueueEntry.update({ where: { id: fresh.id }, data: { status: "ACCEPTED", consultationId: c.id } });
    return { kind: "ok", consultation };
  });
  return result;
}

/** When the customer's window to join the call closes. */
export function answerBy(c: Pick<Consultation, "status" | "offeredAt">, secs: number): Date | null {
  return c.status === "CONNECTING" && c.offeredAt ? new Date(c.offeredAt.getTime() + secs * 1000) : null;
}

/**
 * The customer joins the private call: it is connected (ACTIVE); metering starts once both sides have
 * really joined its room (markJoined). Refused once the window to join has closed (the offer is then
 * withdrawn and the hold released).
 */
export async function connectPrivate(consultationId: string, customerId: string) {
  const secs = await answerSeconds();
  const now = new Date();
  const { count } = await db.consultation.updateMany({
    where: {
      id: consultationId,
      customerId,
      origin: LIVE_ORIGIN,
      status: "CONNECTING",
      offeredAt: { gte: new Date(now.getTime() - secs * 1000) },
    },
    data: { status: "ACTIVE", connectedAt: now },
  });
  if (count) await syncPresence((await db.consultation.findUniqueOrThrow({ where: { id: consultationId } })).astrologerId);
  return count > 0;
}

/** Offers nobody picked up in time are withdrawn: the hold is released and ₹0 charged. */
export async function expireUnanswered(roomId?: string) {
  const secs = await answerSeconds();
  const stale = await db.consultation.findMany({
    where: {
      origin: LIVE_ORIGIN,
      status: "CONNECTING",
      offeredAt: { lt: new Date(Date.now() - secs * 1000) },
      ...(roomId ? { liveRoomId: roomId } : {}),
    },
  });
  for (const c of stale) {
    const ended = await endConsultation(c, "user");
    if (ended.status === "CANCELLED") await db.consultation.updateMany({ where: { id: c.id, status: "CANCELLED" }, data: { endReason: "unanswered" } });
  }
}

/**
 * The live is ending: requests still waiting are closed (₹0), and a private consultation in
 * progress ends with it — settled for the time connected, like any consultation the astrologer ends.
 */
export async function closeRoomConsultations(roomId: string) {
  const waiting = await db.liveQueueEntry.findMany({ where: { roomId, consultationId: { not: null } }, select: { consultationId: true } });
  await closeQueued(db, waiting.map((w) => w.consultationId), "CANCELLED", "live_ended");
  const open = await db.consultation.findMany({ where: { origin: LIVE_ORIGIN, liveRoomId: roomId, status: { in: OPEN_STATUSES } } });
  for (const c of open) await endConsultation(c, "astrologer");
}

// ── What each side sees ──

/** Time and money of a private consultation as it runs (server clock). */
async function meter(c: Consultation) {
  const [standardFree, secs, joinTimeout] = await Promise.all([configNumber("consult.free_seconds", 60), answerSeconds(), joinTimeoutSeconds()]);
  const now = Date.now();
  const by = answerBy(c, secs);
  return {
    id: c.id,
    ref: c.ref,
    status: c.status === "ACTIVE" ? ("active" as const) : ("connecting" as const),
    /** chat · voice · video, as chosen when joining the queue */
    mode: c.mode.toLowerCase() as "chat" | "voice" | "video",
    /** The window each side opens for it (same as a direct consultation in that mode). */
    window: windowOf(c),
    rate: c.rate,
    held: c.heldAmount,
    connectedAt: c.connectedAt?.toISOString() ?? null,
    /** Billed seconds so far: from billingStartedAt (0 while waiting for a side to join). */
    elapsedSeconds: billedElapsed(c, now),
    ...joinView(c, joinTimeout),
    freeSeconds: freeWindow(c, standardFree),
    maxSeconds: sessionCapSeconds(c, standardFree),
    /** Seconds left to join the call (connecting only). */
    secondsToAnswer: by ? Math.max(0, Math.ceil((by.getTime() - now) / 1000)) : null,
    answerWindow: secs,
  };
}

/** The customer's own private consultation in this room, or null (nobody else ever gets it). */
export async function customerPrivateView(roomId: string, customerId: string) {
  let c = await db.consultation.findFirst({
    where: { origin: LIVE_ORIGIN, liveRoomId: roomId, customerId, status: { in: PRIVATE_STATUSES } },
    orderBy: { requestedAt: "desc" },
  });
  // Connected but a side never joined in time: ended (₹0) on schedule.
  if (c?.status === "ACTIVE") c = await endIfNeverJoined(c);
  return c && PRIVATE_STATUSES.includes(c.status) ? meter(c) : null;
}

/** The astrologer's view of the private consultation in their room: who, how long, and its state. */
export async function hostPrivateView(roomId: string) {
  let c = await privateInRoom(roomId);
  if (c?.status === "ACTIVE" && (await endIfNeverJoined(c)).status !== "ACTIVE") c = await privateInRoom(roomId);
  if (!c) return null;
  return { ...(await meter(c)), alias: c.customerAlias, profile: c.customer ? consultSummary(c.customer) : null };
}

/**
 * How this customer's latest request in this live session ended up, so their page can say so:
 * waiting, accepted, declined, or left (by them, unanswered, balance, or the live ending).
 */
export async function myRequest(room: Pick<LiveRoom, "id" | "startedAt">, userId: string) {
  const entry = await db.liveQueueEntry.findFirst({
    where: { roomId: room.id, userId, createdAt: { gte: room.startedAt } },
    orderBy: { createdAt: "desc" },
  });
  if (!entry) return null;
  const c = entry.consultationId
    ? await db.consultation.findUnique({ where: { id: entry.consultationId }, select: { status: true, endReason: true, total: true, mode: true } })
    : null;
  return {
    id: entry.id,
    status: entry.status.toLowerCase() as "waiting" | "accepted" | "declined" | "left",
    consultationId: entry.consultationId,
    /** The consultation's state: queued, connecting, active, ended, cancelled, rejected. */
    consultation: c?.status.toLowerCase() ?? null,
    reason: c?.endReason ?? null,
    charged: c?.total ?? 0,
    /** chat · voice · video, as chosen when joining */
    mode: (c?.mode.toLowerCase() ?? null) as "chat" | "voice" | "video" | null,
  };
}

// ── Live video (ZEGO) ──

/** The one stream of a live: the host's camera and microphone. */
export const liveStreamId = (roomId: string) => `live_${roomId}_main`.replace(/[^A-Za-z0-9_-]/g, "_");

/**
 * Credentials for the live's public ZEGO room. The host may publish only the live stream; viewers
 * only play it. Private consultations use a different room (see consult-room.ts: mediaFor).
 */
export function liveMedia(room: Pick<LiveRoom, "id">, user: Pick<User, "id">, role: "host" | "viewer", userName: string) {
  if (!zegoConfigured()) return { available: false as const, reason: "not_configured" };
  const roomId = zegoRoom.live(room.id);
  const userId = zegoUserId(user.id, "live");
  const streamId = liveStreamId(room.id);
  return {
    available: true as const,
    appId: config.zegoAppId,
    server: zegoServerUrl(),
    roomId,
    userId,
    userName,
    token: zegoToken(userId, role === "host" ? { roomId, publish: true, streamIds: [streamId] } : { roomId, publish: false }),
    streamId,
    publish: role === "host",
  };
}
