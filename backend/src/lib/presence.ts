import { db } from "../db.ts";
import { audit } from "./audit.ts";
import type { Astrologer, Presence } from "../generated/prisma/client.ts";

// Presence: ON (available) · BUSY (in a consultation) · LIVE (hosting their live room) · OFF.
// Only the astrologer brings themselves online (the portal's toggle). While any portal page is
// open it sends a heartbeat (lastSeenAt); an astrologer whose portal has been closed for
// PRESENCE_STALE_MS is switched offline by the sweep below, so customers never see a stale
// "Available" or a live room nobody is hosting.

/** How long without a heartbeat before an online astrologer is treated as offline. */
export const PRESENCE_STALE_MS = 3 * 60_000;

const staleCutoff = () => new Date(Date.now() - PRESENCE_STALE_MS);

/** True while the astrologer's portal has sent a heartbeat recently. */
export function isFresh(a: Pick<Astrologer, "lastSeenAt">): boolean {
  return !!a.lastSeenAt && a.lastSeenAt.getTime() >= Date.now() - PRESENCE_STALE_MS;
}

/** True when the account may take sessions or go live (approved, not suspended). */
export function canWork(a: Pick<Astrologer, "lifecycle" | "suspension">): boolean {
  return a.lifecycle === "active" && a.suspension === "none";
}

/**
 * What customers should be told right now. Same as the stored presence, except that an
 * astrologer who can't work, or whose portal went quiet, reads as OFF before the sweep
 * catches up. BUSY stays BUSY while their session runs (it is metered and ends on its own).
 */
export function effectivePresence(a: Pick<Astrologer, "presence" | "lastSeenAt" | "lifecycle" | "suspension">): Presence {
  if (!canWork(a)) return "OFF";
  if (a.presence === "BUSY") return "BUSY";
  if (a.presence !== "OFF" && !isFresh(a)) return "OFF";
  return a.presence;
}

/** Prisma filter: live rooms whose host is still there (heartbeat within the stale window). */
export function hostedLiveRoom() {
  return { isLive: true, astrologer: { lastSeenAt: { gte: staleCutoff() } } };
}

/**
 * Re-derives ON / BUSY / LIVE for an online astrologer from what they are doing: a session in
 * progress → BUSY, else their room is live → LIVE, else ON. Never brings an OFF astrologer
 * online, so a session ending puts them back to ON only if they were online before.
 */
export async function syncPresence(astrologerId: string): Promise<Presence | null> {
  const [a, active, room] = await Promise.all([
    db.astrologer.findUnique({ where: { id: astrologerId }, select: { presence: true } }),
    db.consultation.findFirst({ where: { astrologerId, status: "ACTIVE" }, select: { id: true } }),
    db.liveRoom.findUnique({ where: { astrologerId }, select: { isLive: true } }),
  ]);
  if (!a) return null;
  if (a.presence === "OFF") return "OFF";
  const next: Presence = active ? "BUSY" : room?.isLive ? "LIVE" : "ON";
  if (next !== a.presence) {
    // Guarded so a simultaneous "go offline" is never undone.
    await db.astrologer.updateMany({ where: { id: astrologerId, presence: { not: "OFF" } }, data: { presence: next } });
  }
  return next;
}

/** Records a portal heartbeat. Returns the stored presence (the portal shows it). */
export async function markSeen(astrologerId: string): Promise<Presence> {
  const a = await db.astrologer.update({ where: { id: astrologerId }, data: { lastSeenAt: new Date() }, select: { presence: true } });
  return a.presence;
}

/** The astrologer comes online (from the portal). */
export async function goOnline(astrologerId: string): Promise<Presence> {
  await db.astrologer.update({ where: { id: astrologerId }, data: { presence: "ON", lastSeenAt: new Date() } });
  return (await syncPresence(astrologerId)) ?? "ON";
}

/**
 * Ends the astrologer's live room, if it is live: the room closes and everyone still waiting
 * in its consult queue leaves it. Announcements belonged to that session and are cleared.
 * Returns true when a live room was actually ended.
 */
export async function endLiveRoom(astrologerId: string): Promise<boolean> {
  const room = await db.liveRoom.findUnique({ where: { astrologerId } });
  if (!room?.isLive) return false;
  const ended = await db.$transaction(async (tx) => {
    const { count } = await tx.liveRoom.updateMany({ where: { id: room.id, isLive: true }, data: { isLive: false, viewers: 0 } });
    if (!count) return false;
    await tx.liveQueueEntry.updateMany({ where: { roomId: room.id, status: "WAITING" }, data: { status: "LEFT" } });
    await tx.liveAnnouncement.deleteMany({ where: { roomId: room.id } });
    return true;
  });
  if (ended) forgetViewers(room.id);
  return ended;
}

/**
 * The astrologer goes offline (portal toggle, or the sweep): their live room ends and requests
 * still waiting for them are timed out (nothing was charged). A session in progress continues
 * to its own end.
 */
export async function goOffline(astrologerId: string): Promise<{ endedLive: boolean }> {
  const endedLive = await endLiveRoom(astrologerId);
  await db.astrologer.update({ where: { id: astrologerId }, data: { presence: "OFF" } });
  await db.consultation.updateMany({ where: { astrologerId, status: "REQUESTED" }, data: { status: "TIMED_OUT", endedAt: new Date() } });
  return { endedLive };
}

/**
 * Switches off astrologers who are shown online but whose portal has gone quiet for
 * PRESENCE_STALE_MS (or who may no longer work). Someone in a session keeps BUSY until it
 * ends — the consultation sweep closes abandoned sessions — and goes offline on a later sweep.
 * Runs every minute from server.ts. Returns who was switched off.
 */
export async function sweepStalePresence(): Promise<string[]> {
  const candidates = await db.astrologer.findMany({
    where: {
      presence: { not: "OFF" },
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleCutoff() } }, { lifecycle: { not: "active" } }, { suspension: { not: "none" } }],
    },
    select: { id: true, lifecycle: true, suspension: true },
  });
  const switched: string[] = [];
  for (const a of candidates) {
    const inSession = await db.consultation.findFirst({ where: { astrologerId: a.id, status: "ACTIVE" }, select: { id: true } });
    if (inSession && canWork(a)) continue;
    const { endedLive } = await goOffline(a.id);
    const why = canWork(a) ? "portal closed" : "account can't take sessions";
    await audit(null, "astrologer.presence.auto_off", a.id, `online → OFF · ${why}${endedLive ? ", live room ended" : ""}`);
    switched.push(a.id);
  }
  // A room can't stay live without its host online (e.g. an admin set them offline).
  const orphaned = await db.liveRoom.findMany({ where: { isLive: true, astrologer: { presence: "OFF" } }, select: { id: true, astrologerId: true } });
  for (const r of orphaned) {
    if (await endLiveRoom(r.astrologerId)) await audit(null, "live.end", r.id, "LIVE → ended · host offline");
  }
  return switched;
}

// ── Live room viewers ──
// Who is watching: each open live room page polls GET /api/live-rooms/:id every few seconds,
// and every poll counts as "still watching". Viewers = distinct viewers (signed-in user or
// anonymous browser id) seen in the last VIEWER_WINDOW_MS.
// ⚠ Kept in this process's memory, which is right for a single API instance. With several
// instances behind a load balancer this must move to a shared store (e.g. Redis).

const VIEWER_WINDOW_MS = 60_000;
const viewersByRoom = new Map<string, Map<string, number>>();

/** Counts `viewerKey` as watching `roomId` now. */
export function touchViewer(roomId: string, viewerKey: string) {
  let room = viewersByRoom.get(roomId);
  if (!room) viewersByRoom.set(roomId, (room = new Map()));
  room.set(viewerKey, Date.now());
}

/** Distinct viewers of the room in the last minute. */
export function viewerCount(roomId: string): number {
  const room = viewersByRoom.get(roomId);
  if (!room) return 0;
  const since = Date.now() - VIEWER_WINDOW_MS;
  for (const [key, at] of room) if (at < since) room.delete(key);
  return room.size;
}

function forgetViewers(roomId: string) {
  viewersByRoom.delete(roomId);
}
