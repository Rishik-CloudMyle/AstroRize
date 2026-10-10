import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { instantRate } from "../lib/billing.ts";
import { istDate, istTime, percentages } from "../lib/format.ts";
import { effectivePresence, hostedLiveRoom, touchViewer, viewerCount } from "../lib/presence.ts";
import { rateLimit } from "../lib/safety.ts";
import { requireRole, requireUser } from "../middleware/auth.ts";
import type { Astrologer, LiveRoom, Review } from "../generated/prisma/client.ts";

export const catalogRouter = Router();

// ── Astrologers ──

type AstrologerWithReviews = Astrologer & { reviews?: Review[] };

/** The shape the website uses for an astrologer (same as frontend/src/lib/types.ts). */
export function astrologerView(a: AstrologerWithReviews) {
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
    instant: instantRate(a.price, a.instantMultiplier),
    eta: a.eta,
    about: a.about,
    photo: a.photo,
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
  res.json({ astrologers: list.map(astrologerView), total: list.length });
});

catalogRouter.get("/astrologers/:slug", async (req, res) => {
  const a = await db.astrologer.findUnique({ where: { slug: req.params.slug }, include: { reviews: visibleReviews } });
  if (!a || a.lifecycle !== "active") throw notFound("No astrologer at this address.");
  res.json({ astrologer: astrologerView(a) });
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
  const [chat, waiting, myVote, announcements] = await Promise.all([
    // This session's chat only (earlier sessions' messages stay on record but aren't shown).
    db.chatMessage.findMany({ where: { roomId: room.id, createdAt: { gte: room.startedAt } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.liveQueueEntry.findMany({ where: { roomId: room.id, status: "WAITING" }, orderBy: { createdAt: "asc" }, select: { id: true, userId: true } }),
    voterKey ? db.pollVote.findUnique({ where: { roomId_voterKey: { roomId: room.id, voterKey } } }) : null,
    db.liveAnnouncement.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const pollPct = percentages(room.pollOptions.map((_, i) => room.pollCounts[i] ?? 0));
  const myIndex = userId ? waiting.findIndex((w) => w.userId === userId) : -1;
  return {
    id: room.id,
    astrologerId: room.astrologerId,
    topic: room.topic,
    viewers: viewerCount(room.id),
    thumb: room.thumb,
    state: room.state,
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
    chat: chat.reverse().map((c) => ({ who: c.author, text: c.text })),
    /** Newest first. Posted by the astrologer from the portal. */
    announcements: announcements.map((a) => ({ id: a.id, text: a.text, at: istTime(a.createdAt) })),
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

/** The open room page polls this every few seconds; each poll counts the viewer as watching. */
catalogRouter.get("/live-rooms/:id", async (req, res) => {
  const room = await liveRoomOr404(String(req.params.id));
  const key = viewerKey(req, res);
  touchViewer(room.id, key);
  res.json({ room: await roomView(room, key, req.auth?.user.id ?? null) });
});

catalogRouter.post("/live-rooms/:id/chat", async (req, res) => {
  const auth = requireUser(req);
  const { text } = z.object({ text: z.string().trim().min(1).max(200) }).parse(req.body);
  rateLimit(`chat:${auth.user.id}`, 5, 10_000, "You're sending messages too quickly. Wait a few seconds.");
  const room = await liveRoomOr404(String(req.params.id));
  const msg = await db.chatMessage.create({ data: { roomId: room.id, author: auth.user.name, text, userId: auth.user.id } });
  res.status(201).json({ message: { who: msg.author, text: msg.text } });
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

catalogRouter.post("/live-rooms/:id/queue", async (req, res) => {
  const auth = requireRole(req, "customer");
  // Private unless the customer explicitly chooses Public (which also needs consent).
  const { mode, consent } = z
    .object({ mode: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"), consent: z.boolean().default(false) })
    .parse(req.body);
  if (mode === "PUBLIC" && !consent) throw badRequest("Public consultations need your on-camera consent.");
  const room = await liveRoomOr404(String(req.params.id));

  const existing = await db.liveQueueEntry.findFirst({ where: { roomId: room.id, userId: auth.user.id, status: "WAITING" } });
  if (!existing) {
    const waiting = await db.liveQueueEntry.count({ where: { roomId: room.id, status: "WAITING" } });
    if (waiting >= room.queueCapacity) throw conflict("The queue is full right now. Try again in a few minutes.");
    const alias = `${String.fromCharCode(65 + (waiting % 26))}-${Math.floor(1000 + Math.random() * 8999)}`;
    await db.liveQueueEntry.create({ data: { roomId: room.id, userId: auth.user.id, alias, mode, consent } });
  }
  res.json({ room: await roomView(room, viewerKey(req, res), auth.user.id) });
});
