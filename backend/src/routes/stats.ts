import { Router } from "express";
import { db } from "../db.ts";
import { istDateKey } from "../lib/format.ts";
import { effectivePresence, hostedLiveRoom } from "../lib/presence.ts";

// Public "what's happening right now" figures for the website (the home page's Live now band,
// the header's live dot and the "just went live" notice). Everything is counted from real
// records; nothing is estimated or padded.
export const statsRouter = Router();

/** How far back the "Just now" feed looks. */
const EVENTS_WINDOW_MS = 6 * 3600_000;
const MODE_WORD: Record<string, string> = { VOICE: "voice", VIDEO: "video" };

statsRouter.get("/now", async (_req, res) => {
  const now = new Date();
  const since = new Date(now.getTime() - EVENTS_WINDOW_MS);
  const todayStart = new Date(`${istDateKey(now)}T00:00:00+05:30`);
  const [astrologers, rooms, consultationsToday, liveStarts, started] = await Promise.all([
    db.astrologer.findMany({
      where: { lifecycle: "active", suspension: "none", presence: { not: "OFF" } },
      select: { id: true, name: true, presence: true, lastSeenAt: true, lifecycle: true, suspension: true },
    }),
    db.liveRoom.findMany({
      where: hostedLiveRoom(),
      orderBy: { startedAt: "desc" },
      select: { id: true, topic: true, startedAt: true, astrologer: { select: { name: true } } },
    }),
    db.consultation.count({ where: { connectedAt: { gte: todayStart }, status: { in: ["ACTIVE", "ENDED"] } } }),
    db.auditLog.findMany({ where: { action: "live.start", at: { gte: since } }, orderBy: { at: "desc" }, take: 10 }),
    db.consultation.findMany({
      where: { connectedAt: { gte: since }, status: { in: ["ACTIVE", "ENDED"] } },
      orderBy: { connectedAt: "desc" },
      take: 10,
      select: { connectedAt: true, mode: true, kind: true, astrologer: { select: { name: true } } },
    }),
  ]);

  const presence = astrologers.map((a) => effectivePresence(a));
  // Names of the rooms that went live (audit rows name the room; the topic follows "LIVE · ").
  const roomIds = [...new Set(liveStarts.map((l) => l.object))];
  const hosts = new Map(
    (await db.liveRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, astrologer: { select: { name: true } } } })).map((r) => [
      r.id,
      r.astrologer.name,
    ]),
  );
  const liveIds = new Set(rooms.map((r) => r.id));
  const events = [
    ...liveStarts.flatMap((l) => {
      const name = hosts.get(l.object);
      if (!name) return [];
      const topic = l.diff.split(" · ").slice(1).join(" · ");
      return [{ text: `${name} went live${topic ? ` · ${topic}` : ""}`, at: l.at, href: liveIds.has(l.object) ? `/live?room=${encodeURIComponent(l.object)}` : null }];
    }),
    ...started.map((c) => ({
      text: `A ${c.kind === "INSTANT" ? "Instant Call" : `${MODE_WORD[c.mode] ?? "new"} consultation`} started with ${c.astrologer.name}`,
      at: c.connectedAt!,
      href: null,
    })),
  ]
    .sort((x, y) => y.at.getTime() - x.at.getTime())
    .slice(0, 6)
    .map((e) => ({ ...e, at: e.at.toISOString() }));

  res.json({
    now: {
      /** Astrologers online (available, in a session or live). */
      online: presence.filter((p) => p !== "OFF").length,
      available: presence.filter((p) => p === "ON").length,
      inSession: presence.filter((p) => p === "BUSY").length,
      liveRooms: rooms.length,
      consultationsToday,
      live: rooms.map((r) => ({ id: r.id, name: r.astrologer.name, topic: r.topic, startedAt: r.startedAt.toISOString() })),
      /** Newest first, from the last few hours. */
      events,
      at: now.toISOString(),
    },
  });
});
