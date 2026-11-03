import { randomUUID } from "node:crypto";
import { assertNotBlocked } from "../lib/account-blocks.ts";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors.ts";
import { chatRate, instantRate } from "../lib/billing.ts";
import { istDate, istTime, percentages, rupee } from "../lib/format.ts";
import { effectivePresence, hostedLiveRoom, touchViewer, viewerCount } from "../lib/presence.ts";
import { announceJoin, chatLineView, giftBalance, sendGift, sendProfileGift, sessionFeed } from "../lib/live.ts";
import { connectPrivate, customerPrivateView, expireUnanswered, joinQueue, leaveQueue, liveMedia, myRequest, privateInRoom } from "../lib/live-consult.ts";
import { flagContactAttempt } from "../lib/contact-flags.ts";
import { contactBlockedNotice, findContactDetails, rateLimit } from "../lib/safety.ts";
import { freeCallOpen, welcomePolicy } from "../lib/welcome.ts";
import { requireRole, requireUser } from "../middleware/auth.ts";
import type { Astrologer, LiveRoom, Review } from "../generated/prisma/client.ts";

export const catalogRouter = Router();

// ── Astrologers ──

type AstrologerWithReviews = Astrologer & { reviews?: Review[] };

/** The shape the website uses for an astrologer (same as frontend/src/lib/types.ts). */
export function astrologerView(a: AstrologerWithReviews, freeCall = false) {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    initials: a.initials,
    gender: a.gender,
    recognition: a.recognition.toLowerCase(),
    // The truth right now: an astrologer whose portal went quiet reads as offline at once.
    availability: effectivePresence(a).toLowerCase(),
    skills: a.skills,
    languages: a.languages,
    years: a.years,
    rating: a.rating,
    consults: a.consults,
    price: a.price,
    was: a.was,
    /** Chat rate (₹/min): the astrologer's own chat price, or the same as `price`. */
    chatPrice: chatRate(a),
    instant: instantRate(a.price, a.instantMultiplier),
    /** Instant Call rate = price × this. */
    instantMultiplier: a.instantMultiplier,
    /** A welcome free call can be taken with them right now (taking part, available, quota left). */
    freeCall,
    eta: a.eta,
    about: a.about,
    photo: a.photo,
    /** The astrologer's own intro video, or null. */
    introVideoUrl: a.introVideoUrl ?? null,
    /** The astrologer's own gallery photos, in display order. */
    gallery: a.gallery,
    ratingDistribution: a.ratingDistribution,
    reviews: (a.reviews ?? []).map((r) => ({ name: r.customerName, stars: r.stars, when: istDate(r.createdAt), text: r.text })),
  };
}

const visibleReviews = { where: { status: "VISIBLE" }, orderBy: { createdAt: "desc" as const }, take: 20 };

catalogRouter.get("/astrologers", async (_req, res) => {
  const list = await db.astrologer.findMany({
    where: { lifecycle: "active", suspension: { not: "full" } },
    orderBy: { rank: "asc" },
    include: { reviews: visibleReviews },
  });
  const free = await freeCallOpen(list);
  res.json({ astrologers: list.map((a) => astrologerView(a, free.has(a.id))), total: list.length });
});

/**
 * The free minutes the website advertises to visitors (the home banner's "N minutes free when you
 * join"): read from Config so the copy always matches what a new mobile number really gets.
 */
catalogRouter.get("/welcome-offer", async (_req, res) => {
  const { enabled, joiningBonusMinutes, weeklyMinutes } = await welcomePolicy();
  res.json({ enabled, joiningBonusMinutes, weeklyMinutes });
});

catalogRouter.get("/astrologers/:slug", async (req, res) => {
  const a = await db.astrologer.findUnique({ where: { slug: req.params.slug }, include: { reviews: visibleReviews } });
  if (!a || a.lifecycle !== "active") throw notFound("No astrologer at this address.");
  const free = await freeCallOpen([a]);
  res.json({ astrologer: astrologerView(a, free.has(a.id)) });
});

/** The gift catalogue for an astrologer's profile (live or not), and what the signed-in customer can spend on gifts. */
catalogRouter.get("/astrologers/:slug/gifts", async (req, res) => {
  const a = await db.astrologer.findUnique({ where: { slug: req.params.slug }, select: { lifecycle: true, suspension: true } });
  if (!a || a.lifecycle !== "active" || a.suspension === "full") throw notFound("No astrologer at this address.");
  const gifts = await db.gift.findMany({ where: { state: "ACTIVE", price: { gt: 0 } }, orderBy: [{ rank: "asc" }, { price: "asc" }] });
  const balance = req.auth?.role === "customer" ? await giftBalance(req.auth.user.id) : null;
  res.json({ gifts: gifts.map((g) => ({ id: g.id, icon: g.icon, name: g.name, price: g.price })), balance });
});

/**
 * Sends a gift to an astrologer from their profile, live or offline, paid from the customer's
 * service balance like a live gift. Repeating a request id never charges twice.
 */
catalogRouter.post("/astrologers/:slug/gifts", async (req, res) => {
  const auth = requireRole(req, "customer");
  // A temporarily blocked account (repeated contact sharing) can't do this until the block ends.
  assertNotBlocked(auth);
  const requestIdField = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid request id.");
  const { giftId, requestId } = z
    .object({ giftId: z.string({ error: "Choose a gift." }).min(1, "Choose a gift.").max(64), requestId: requestIdField.optional() })
    .parse(req.body);
  const header = req.get("idempotency-key");
  const key = requestId ?? (header ? requestIdField.parse(header) : randomUUID());
  rateLimit(`gift:${auth.user.id}`, 10, 60_000, "You're sending gifts too quickly. Wait a minute and try again.");
  const a = await db.astrologer.findUnique({ where: { slug: String(req.params.slug) }, select: { id: true } });
  if (!a) throw notFound("No astrologer at this address.");
  const result = await sendProfileGift(a.id, auth.user, giftId, key);
  res.status(result.replayed ? 200 : 201).json({ ...result, balance: await giftBalance(auth.user.id) });
});

// ── Live rooms ──

/** Identifies a viewer for one-vote polls and reaction limits: the user, or an anonymous browser id. */
function viewerKey(req: Request, res: Response): string {
  if (req.auth) return `u:${req.auth.user.id}`;
  let vid = req.cookies?.astrorize_vid as string | undefined;
  if (!vid) {
    vid = randomUUID();
    res.cookie("astrorize_vid", vid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400000 });
  }
  return `v:${vid}`;
}

async function roomView(room: LiveRoom, voterKey: string | null, userId: string | null) {
  const [feed, waiting, myVote, announcements, inPrivate, mine, myPrivate] = await Promise.all([
    // This session's chat and gifts only (earlier sessions' stay on record but aren't shown).
    sessionFeed(room),
    db.liveQueueEntry.findMany({ where: { roomId: room.id, status: "WAITING" }, orderBy: { createdAt: "asc" }, select: { id: true, userId: true } }),
    voterKey ? db.pollVote.findUnique({ where: { roomId_voterKey: { roomId: room.id, voterKey } } }) : null,
    db.liveAnnouncement.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    privateInRoom(room.id),
    userId ? myRequest(room, userId) : null,
    userId ? customerPrivateView(room.id, userId) : null,
  ]);
  const pollPct = percentages(room.pollOptions.map((_, i) => room.pollCounts[i] ?? 0));
  const myIndex = userId ? waiting.findIndex((w) => w.userId === userId) : -1;
  return {
    id: room.id,
    astrologerId: room.astrologerId,
    // Session details set when going live (editable while live). Rooms from before these
    // existed have no title; the topic stands in.
    title: room.title || room.topic,
    topic: room.topic,
    category: room.category,
    language: room.language,
    durationMins: room.durationMins,
    startedAt: room.startedAt.toISOString(),
    viewers: viewerCount(room.id),
    thumb: room.thumb,
    // A private consultation in progress: everyone sees the "private consultation" banner.
    state: inPrivate ? "private" : room.state === "private" ? "normal" : room.state,
    /**
     * The live's sound is off for viewers: a private consultation is in session (from the moment
     * it connects until it ends). Server-driven, so every page and device agrees.
     */
    audioPaused: inPrivate?.status === "ACTIVE",
    queue: {
      position: myIndex >= 0 ? myIndex + 1 : waiting.length + 1,
      inQueue: myIndex >= 0,
      waiting: waiting.length,
      capacity: room.queueCapacity,
      eta: room.eta,
    },
    poll: {
      question: room.pollQuestion,
      options: room.pollOptions.map((label, i) => ({ label, pct: pollPct[i] ?? 0 })),
      myVote: myVote?.optionIndex ?? null,
    },
    /** Oldest first: messages, "<name> joined" and "<name> sent <gift>" lines. */
    chat: feed.chat,
    /** Newest first, with ids so each viewer's page animates each gift once. */
    gifts: feed.gifts,
    /** Newest first. Posted by the astrologer from the portal. */
    announcements: announcements.map((a) => ({ id: a.id, text: a.text, at: istTime(a.createdAt) })),
    /** The signed-in viewer's latest consult request in this live, and how it went. */
    myRequest: mine,
    /** The signed-in viewer's own private consultation in this room (only ever theirs). */
    private: myPrivate,
  };
}

catalogRouter.get("/live-rooms", async (req, res) => {
  // Only rooms an astrologer is hosting right now.
  const rooms = await db.liveRoom.findMany({ where: hostedLiveRoom(), orderBy: { startedAt: "desc" } });
  const key = viewerKey(req, res);
  res.json({ rooms: await Promise.all(rooms.map((r) => roomView(r, key, req.auth?.user.id ?? null))) });
});

/** A room that is live with its host present, or "ended". */
async function liveRoomOr404(id: string) {
  const room = await db.liveRoom.findFirst({ where: { id, ...hostedLiveRoom() } });
  if (!room) throw notFound("This live room has ended.");
  return room;
}

/**
 * Who counts as watching: signed-in customers and astrologers who joined the room. Staff
 * (e.g. a compliance observer) and the host themselves are never counted or announced.
 */
function countsAsViewer(req: Request, room: LiveRoom): boolean {
  const auth = req.auth;
  if (!auth || auth.role === "admin") return false;
  return auth.role !== "astrologer" || auth.astrologerId !== room.astrologerId;
}

/**
 * The room. The preview (before joining) reads it without being counted; once joined, the
 * room page polls it every few seconds with ?watching=1, and each poll counts as still watching.
 */
catalogRouter.get("/live-rooms/:id", async (req, res) => {
  const room = await liveRoomOr404(String(req.params.id));
  // A private call nobody joined in time is withdrawn (₹0) and the room is public again.
  await expireUnanswered(room.id);
  const key = viewerKey(req, res);
  if (req.query.watching === "1" && countsAsViewer(req, room)) touchViewer(room.id, key);
  res.json({ room: await roomView(room, key, req.auth?.user.id ?? null) });
});

/** "Join live" from the preview: counts the viewer and, the first time this session, posts "<name> joined". */
catalogRouter.post("/live-rooms/:id/join", async (req, res) => {
  const auth = requireUser(req);
  const room = await liveRoomOr404(String(req.params.id));
  if (countsAsViewer(req, room)) {
    touchViewer(room.id, viewerKey(req, res));
    await announceJoin(room, auth.user);
  }
  res.json({ room: await roomView(room, viewerKey(req, res), auth.user.id) });
});

catalogRouter.post("/live-rooms/:id/chat", async (req, res) => {
  const auth = requireUser(req);
  assertNotBlocked(auth);
  const { text } = z
    .object({ text: z.string({ error: "Write a message first." }).trim().min(1, "Write a message first.").max(200, "Messages can be up to 200 characters.") })
    .parse(req.body);
  rateLimit(`chat:${auth.user.id}`, 5, 10_000, "You're sending messages too quickly. Wait a few seconds.");
  const room = await liveRoomOr404(String(req.params.id));
  // Public chat: no personal details at all (the FREE policy). Never posted; the attempt is
  // flagged for Trust & reviews (staff watching a room aren't flagged).
  const contact = findContactDetails(text, "FREE");
  if (contact.length) {
    if (auth.role !== "admin") {
      const side = auth.role === "astrologer" ? "ASTROLOGER" : "CUSTOMER";
      await flagContactAttempt({ userId: auth.user.id, name: auth.user.name, side, place: "live", ref: room.id, kinds: contact, text });
    }
    throw badRequest(contactBlockedNotice(contact, "FREE", "live chat"));
  }
  const msg = await db.chatMessage.create({
    data: { roomId: room.id, author: auth.user.name, text, userId: auth.user.id, kind: "message", photo: auth.user.photoUrl },
  });
  res.status(201).json({ message: chatLineView(msg) });
});

// ── Gifts ──

/** The gift catalogue for the room's gift panel, and what the signed-in customer can spend on gifts. */
catalogRouter.get("/live-rooms/:id/gifts", async (req, res) => {
  await liveRoomOr404(String(req.params.id));
  const gifts = await db.gift.findMany({ where: { state: "ACTIVE", price: { gt: 0 } }, orderBy: [{ rank: "asc" }, { price: "asc" }] });
  const balance = req.auth?.role === "customer" ? await giftBalance(req.auth.user.id) : null;
  res.json({ gifts: gifts.map((g) => ({ id: g.id, icon: g.icon, name: g.name, price: g.price })), balance });
});

/**
 * Sends a gift to a live room, paid from the customer's service balance. The page sends a
 * request id (body `requestId` or an Idempotency-Key header); repeating it never charges twice.
 */
catalogRouter.post("/live-rooms/:id/gifts", async (req, res) => {
  const auth = requireRole(req, "customer");
  assertNotBlocked(auth);
  const requestIdField = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid request id.");
  const { giftId, requestId } = z
    .object({ giftId: z.string({ error: "Choose a gift." }).min(1, "Choose a gift.").max(64), requestId: requestIdField.optional() })
    .parse(req.body);
  const header = req.get("idempotency-key");
  const key = requestId ?? (header ? requestIdField.parse(header) : randomUUID());
  rateLimit(`gift:${auth.user.id}`, 10, 60_000, "You're sending gifts too quickly. Wait a minute and try again.");
  const room = await liveRoomOr404(String(req.params.id));
  const result = await sendGift(room.id, auth.user, giftId, key);
  res.status(result.replayed ? 200 : 201).json({ ...result, balance: await giftBalance(auth.user.id) });
});

catalogRouter.post("/live-rooms/:id/poll-vote", async (req, res) => {
  const { optionIndex } = z.object({ optionIndex: z.number().int().min(0) }).parse(req.body);
  const room = await liveRoomOr404(String(req.params.id));
  if (optionIndex >= room.pollOptions.length) throw badRequest("That option doesn't exist.");
  const key = viewerKey(req, res);
  // One vote per viewer; votes cannot be changed (the unique index enforces it).
  try {
    await db.$transaction([
      db.pollVote.create({ data: { roomId: room.id, voterKey: key, optionIndex } }),
      db.liveRoom.update({
        where: { id: room.id },
        data: { pollCounts: room.pollCounts.map((c, i) => (i === optionIndex ? c + 1 : c)) },
      }),
    ]);
  } catch {
    throw conflict("You have already voted in this poll. Votes cannot be changed.");
  }
  const fresh = await db.liveRoom.findUniqueOrThrow({ where: { id: room.id } });
  res.json({ room: await roomView(fresh, key, req.auth?.user.id ?? null) });
});

catalogRouter.post("/live-rooms/:id/reactions", async (req, res) => {
  z.object({ emoji: z.enum(["❤️", "🙏", "🔥", "✨", "👏"]) }).parse(req.body);
  rateLimit(`react:${viewerKey(req, res)}`, 5, 10_000, "Slow down a little — reactions are limited to 5 every 10 seconds.");
  res.status(202).json({ ok: true });
});

/**
 * Join the room's consult queue. Consultations from a live are always private (the astrologer's
 * video stays on for everyone; the conversation is only with the customer being consulted), by
 * chat, voice or video (`mode`; chat at the astrologer's chat price; Instant Call isn't offered from a live). The
 * page sends the rate it showed for that mode (`quotedRate`); that rate is locked for this request.
 */
catalogRouter.post("/live-rooms/:id/queue", async (req, res) => {
  const auth = requireRole(req, "customer");
  assertNotBlocked(auth);
  // Older pages sent `mode: "PUBLIC" | "PRIVATE"` (and `consent`): there is no public option, and
  // such a request is the voice consultation those pages offered.
  const { quotedRate, mode } = z
    .object({
      quotedRate: z.number().int().nonnegative().optional(),
      mode: z.preprocess(
        (m) => (typeof m !== "string" ? m : ["PUBLIC", "PRIVATE"].includes(m.toUpperCase()) ? undefined : m.toUpperCase()),
        z.enum(["CHAT", "VOICE", "VIDEO"], { message: "A private consultation from a live is by chat, voice or video." }).optional(),
      ),
    })
    .parse(req.body ?? {});
  const room = await liveRoomOr404(String(req.params.id));
  const result = await joinQueue(room, auth.user.id, mode ?? "VOICE", quotedRate);
  if (result.kind === "rate_changed") {
    return res.status(409).json({
      error: {
        code: "rate_changed",
        message: `The rate changed from ${rupee(quotedRate ?? 0)} to ${rupee(result.rate)}/min. Join the queue at ${rupee(result.rate)}/min?`,
        quotedRate,
        rate: result.rate,
      },
    });
  }
  if (result.kind === "open") {
    return res.status(409).json({
      error: {
        code: "consultation_in_progress",
        message: "You already have a consultation in progress. End or cancel it before joining a queue.",
        consultationId: result.open.id,
        ref: result.open.ref,
      },
    });
  }
  if (result.kind === "full") throw conflict("The queue is full right now. Try again in a few minutes.");
  if (result.kind === "short") {
    throw new HttpError(
      400,
      `Your balance is ${rupee(result.spendable)}. You need ${rupee(result.needed)} for five minutes at ${rupee(result.rate)}/min.`,
      "insufficient_balance",
    );
  }
  res.json({ room: await roomView(room, viewerKey(req, res), auth.user.id) });
});

/** Leave the queue before being accepted. Nothing is charged. */
catalogRouter.post("/live-rooms/:id/queue/leave", async (req, res) => {
  const auth = requireRole(req, "customer");
  const room = await liveRoomOr404(String(req.params.id));
  await leaveQueue(room.id, auth.user.id);
  res.json({ room: await roomView(room, viewerKey(req, res), auth.user.id) });
});

/**
 * The customer joins the private call the astrologer accepted: metering starts now. The call's
 * chat, end and voice credentials are the consultation's own (/api/consultations/:id/…).
 */
catalogRouter.post("/live-rooms/:id/private/connect", async (req, res) => {
  const auth = requireRole(req, "customer");
  assertNotBlocked(auth);
  const room = await liveRoomOr404(String(req.params.id));
  await expireUnanswered(room.id);
  const mine = await customerPrivateView(room.id, auth.user.id);
  if (!mine) throw conflict("This private consultation is no longer waiting for you — you have not been charged.");
  if (mine.status === "connecting" && !(await connectPrivate(mine.id, auth.user.id))) {
    throw conflict("This private consultation is no longer waiting for you — you have not been charged.");
  }
  res.json({ room: await roomView(room, viewerKey(req, res), auth.user.id) });
});

/**
 * Credentials to watch the live's video (play only). For signed-in viewers who joined this live;
 * never the host (their console publishes) and never staff. A private consultation's audio is in
 * a separate room only its two parties can enter.
 */
catalogRouter.get("/live-rooms/:id/media", async (req, res) => {
  const auth = requireUser(req);
  const room = await liveRoomOr404(String(req.params.id));
  if (!countsAsViewer(req, room)) throw forbidden("This live's video is for viewers who joined it.");
  const joined = await db.chatMessage.findFirst({
    where: { roomId: room.id, userId: auth.user.id, kind: "join", createdAt: { gte: room.startedAt } },
    select: { id: true },
  });
  if (!joined) throw forbidden("Join the live first.");
  res.json({ media: liveMedia(room, auth.user, "viewer", "Viewer") });
});

// ── Featured reviews (home page) ──

/**
 * Recent published customer reviews for the home page: visible, 4★ or more, with text, written
 * after a real consultation, about an astrologer customers can see. Newest first, one per
 * customer and astrologer. An empty list means the home page shows no reviews section at all.
 */
catalogRouter.get("/reviews/featured", async (_req, res) => {
  const rows = await db.review.findMany({
    where: {
      status: "VISIBLE",
      stars: { gte: 4 },
      text: { not: "" },
      consultationId: { not: null },
      astrologer: { lifecycle: "active", suspension: { not: "full" } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { astrologer: { select: { name: true, slug: true } } },
  });
  const consultations = await db.consultation.findMany({
    where: { id: { in: rows.map((r) => r.consultationId!) } },
    select: { id: true, mode: true },
  });
  const modeOf = new Map(consultations.map((c) => [c.id, c.mode]));
  const seen = new Set<string>();
  const reviews = [];
  for (const r of rows) {
    const text = r.text.trim();
    const key = `${r.customerName}|${r.astrologerId}`;
    if (text.length < 12 || seen.has(key) || !r.astrologer) continue;
    seen.add(key);
    const mode = modeOf.get(r.consultationId!);
    reviews.push({
      id: r.id,
      stars: r.stars,
      text,
      customerName: r.customerName,
      astrologerName: r.astrologer.name,
      astrologerSlug: r.astrologer.slug,
      mode: mode ? mode.toLowerCase() : null,
      date: istDate(r.createdAt),
    });
    if (reviews.length === 7) break;
  }
  res.json({ reviews });
});
