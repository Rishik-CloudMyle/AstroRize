import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.ts";
import { istStamp, istTime } from "../../lib/format.ts";
import { goOffline, hostedLiveRoom, viewerCount } from "../../lib/presence.ts";
import { actorName, capabilitiesOf, requireCapability, requirePage } from "../../lib/rbac.ts";
import { containsContactDetails } from "../../lib/safety.ts";
import { notify } from "../../lib/notifications.ts";
import { getSetting } from "../../lib/settings.ts";
import type { LiveRoom, ObserverLease, Prisma } from "../../generated/prisma/client.ts";

// Live monitoring, built only from what is really happening:
//  · public live rooms an astrologer is hosting right now (observable, watch-only), and
//  · private consultations in progress (never observable; listed for awareness only, without
//    any customer detail).
// Signals are facts read from the database (admin flags, contact details posted in the room's
// chat, a newly approved astrologer) — there is no invented risk score.
// An observer reads the room through this router only, never through the public room API, so
// they are not counted as a viewer, can't chat or vote, and nobody in the room can tell.

export const monitoringRouter = Router();

/** Observer seats when no capacity is configured (Setting "monitoring.observerCapacity"). */
const DEFAULT_CAPACITY = 25;
const LEASE_SECONDS = 600;
/** An astrologer approved this recently is "new" and their lives are worth a look. */
const NEW_ASTROLOGER_DAYS = 30;
const DAY_MS = 86_400_000;

export const FLAG_REASONS = [
  "Contact details shared",
  "Abusive or unsafe content",
  "Guaranteed-outcome claims",
  "Asking for payment off the platform",
  "Other policy concern",
] as const;

const MODE_LABEL: Record<string, string> = { CHAT: "Chat", VOICE: "Voice call", VIDEO: "Video call" };

/** Live rooms being hosted right now, with their host. */
function liveRooms(where: Prisma.LiveRoomWhereInput = {}) {
  return db.liveRoom.findMany({
    where: { ...hostedLiveRoom(), ...where },
    include: { astrologer: { select: { id: true, name: true, slug: true, photo: true } } },
    orderBy: { startedAt: "asc" },
  });
}

type RoomWithHost = Awaited<ReturnType<typeof liveRooms>>[number];

/** Observer leases holding a seat right now. */
const activeLeases = (now: Date) => ({ releasedAt: null, expiresAt: { gt: now } });

async function capacity() {
  const n = await getSetting<number>("monitoring.observerCapacity", DEFAULT_CAPACITY);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CAPACITY;
}

/**
 * What is worth knowing about each live room this session: admin flags, chat messages that
 * contain contact details, and whether the host was approved recently. "review" when someone
 * flagged it or contact details were posted; "new" for a newly approved astrologer.
 */
export async function roomSignals(rooms: RoomWithHost[], now = new Date()) {
  if (!rooms.length) return new Map<string, { priority: "review" | "new" | null; signals: string[] }>();
  const ids = rooms.map((r) => r.id);
  const since = new Date(Math.min(...rooms.map((r) => r.startedAt.getTime())));
  const [flags, chat, activations, starts] = await Promise.all([
    db.auditLog.findMany({ where: { action: "live.observer.flag", object: { in: ids }, at: { gte: since } }, orderBy: { at: "desc" } }),
    db.chatMessage.findMany({ where: { roomId: { in: ids }, createdAt: { gte: since } }, select: { roomId: true, text: true, createdAt: true } }),
    db.auditLog.findMany({ where: { action: "application.activate", at: { gte: new Date(now.getTime() - NEW_ASTROLOGER_DAYS * DAY_MS) } }, select: { diff: true, at: true } }),
    db.auditLog.groupBy({ by: ["object"], where: { action: "live.start", object: { in: ids } }, _count: { _all: true } }),
  ]);
  const out = new Map<string, { priority: "review" | "new" | null; signals: string[] }>();
  for (const r of rooms) {
    const signals: string[] = [];
    const roomFlags = flags.filter((f) => f.object === r.id && f.at >= r.startedAt);
    if (roomFlags.length) {
      const latest = roomFlags[0]!;
      signals.push(
        roomFlags.length === 1
          ? `Flagged by ${latest.actorName}: ${latest.diff}`
          : `Flagged ${roomFlags.length} times — latest by ${latest.actorName}: ${latest.diff}`,
      );
    }
    const contact = chat.filter((c) => c.roomId === r.id && c.createdAt >= r.startedAt && containsContactDetails(c.text)).length;
    if (contact) signals.push(`${contact} chat ${contact === 1 ? "message" : "messages"} with contact details`);
    const approved = activations.find((a) => a.diff.includes(`· ${r.astrologerId} ·`));
    if (approved) {
      const days = Math.floor((now.getTime() - approved.at.getTime()) / DAY_MS);
      const lives = starts.find((s) => s.object === r.id)?._count._all ?? 0;
      signals.push(
        `New astrologer — approved ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}${lives <= 1 ? " · first live" : ""}`,
      );
    }
    out.set(r.id, { priority: roomFlags.length || contact ? "review" : approved ? "new" : null, signals });
  }
  return out;
}

/** Counts for the console's nav badge and overview: public lives now, and how many need review. */
export async function monitoringCounts() {
  const rooms = await liveRooms();
  const signals = await roomSignals(rooms);
  return { lives: rooms.length, review: [...signals.values()].filter((s) => s.priority === "review").length };
}

/** "This live has ended" covers a room that closed, or that closed and started again since the lease. */
const sameSession = (room: LiveRoom | null, lease: ObserverLease) => !!room && room.startedAt <= lease.startedAt;

monitoringRouter.get("/monitoring", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const now = new Date();
  // Expired leases free their seat.
  await db.observerLease.updateMany({ where: { releasedAt: null, expiresAt: { lte: now } }, data: { releasedAt: now } });
  const rooms = await liveRooms();
  // A lease on a room that is no longer live (or has restarted) frees its seat too.
  const open = await db.observerLease.findMany({ where: { releasedAt: null } });
  const stale = open.filter((l) => !sameSession(rooms.find((r) => r.id === l.targetId) ?? null, l)).map((l) => l.id);
  if (stale.length) await db.observerLease.updateMany({ where: { id: { in: stale }, releasedAt: null }, data: { releasedAt: now } });

  const [signals, privates, used, total, mine, waiting] = await Promise.all([
    roomSignals(rooms, now),
    db.consultation.findMany({
      where: { status: "ACTIVE" },
      select: { ref: true, mode: true, kind: true, source: true, connectedAt: true, requestedAt: true, astrologer: { select: { name: true } } },
      orderBy: { connectedAt: "asc" },
    }),
    db.observerLease.count({ where: activeLeases(now) }),
    capacity(),
    db.observerLease.findFirst({ where: { adminId: admin.user.id, ...activeLeases(now) }, orderBy: { startedAt: "desc" } }),
    db.liveQueueEntry.groupBy({ by: ["roomId"], where: { roomId: { in: rooms.map((r) => r.id) }, status: "WAITING" }, _count: { _all: true } }),
  ]);
  const rank = { review: 0, new: 1 } as const;
  const lives = rooms
    .map((r) => {
      const s = signals.get(r.id) ?? { priority: null, signals: [] };
      return {
        id: r.id,
        astrologer: r.astrologer.name,
        photo: r.astrologer.photo,
        topic: r.topic,
        startedAt: r.startedAt.toISOString(),
        viewers: viewerCount(r.id),
        waiting: waiting.find((w) => w.roomId === r.id)?._count._all ?? 0,
        priority: s.priority,
        signals: s.signals,
      };
    })
    .sort((a, b) => (a.priority ? rank[a.priority] : 2) - (b.priority ? rank[b.priority] : 2));
  const myRoom = mine ? rooms.find((r) => r.id === mine.targetId) : undefined;

  res.json({
    monitoring: {
      generatedAt: now.toISOString(),
      capacity: { used, total },
      lives,
      privates: privates.map((c) => ({
        id: c.ref,
        astrologer: c.astrologer.name,
        mode: c.kind === "INSTANT" ? `Instant ${(MODE_LABEL[c.mode] ?? c.mode).toLowerCase()}` : (MODE_LABEL[c.mode] ?? c.mode),
        fromLive: c.source === "LIVE",
        startedAt: (c.connectedAt ?? c.requestedAt).toISOString(),
      })),
      summary: {
        lives: lives.length,
        privates: privates.length,
        review: lives.filter((l) => l.priority === "review").length,
        newAstrologers: lives.filter((l) => l.signals.some((s) => s.startsWith("New astrologer"))).length,
      },
      flagReasons: FLAG_REASONS,
      myLease: mine && myRoom ? { id: mine.id, roomId: mine.targetId, astrologer: myRoom.astrologer.name } : null,
    },
  });
});

monitoringRouter.post("/monitoring/:id/join", async (req, res) => {
  requirePage(req, "compliance");
  const admin = requireCapability(req, "live.observer.join");
  const { breakGlass, justification } = z
    .object({ breakGlass: z.boolean().default(false), justification: z.string().trim().max(500).optional() })
    .parse(req.body ?? {});
  const id = String(req.params.id);
  // Private consultations are one-to-one; nobody observes them, break-glass included.
  const consult = await db.consultation.findUnique({ where: { ref: id }, select: { status: true } });
  if (consult) throw forbidden("Denied — this is a private consultation. Observers can never join a private session, even with break-glass.");
  const [room] = await liveRooms({ id });
  if (!room) throw notFound("This live has ended, so there is nothing to observe.");
  if (breakGlass && (!justification || justification.length < 10)) throw badRequest("Break-glass access needs a written justification of at least 10 characters.");

  const now = new Date();
  // Read before the transaction: a query on `db` inside it would wait for the transaction's connection.
  const total = await capacity();
  const lease = await db.$transaction(async (tx) => {
    // One lease per admin: joining another room leaves the previous one.
    await tx.observerLease.updateMany({ where: { adminId: admin.user.id, releasedAt: null }, data: { releasedAt: now } });
    const used = await tx.observerLease.count({ where: activeLeases(now) });
    if (used >= total && !breakGlass) {
      throw conflict(`All ${total} observer seats are in use. Try again when someone leaves, or use break-glass in a genuine emergency.`);
    }
    return tx.observerLease.create({
      data: { adminId: admin.user.id, adminName: actorName(admin), targetId: room.id, breakGlass, startedAt: now, expiresAt: new Date(now.getTime() + LEASE_SECONDS * 1000) },
    });
  });
  await audit(
    admin,
    breakGlass ? "live.observer.break_glass" : "live.observer.join",
    room.id,
    `— → OBSERVING · ${room.astrologer.name}${breakGlass ? ` · justification: ${justification}` : ""}`,
    { breakGlass },
  );
  res.json({ lease: { id: lease.id, roomId: room.id, astrologer: room.astrologer.name } });
});

/**
 * The observer's view of the room they hold a lease on, polled every few seconds. Never counts
 * as a viewer. When the room has ended the lease is released and { status: "ended" } returned.
 */
monitoringRouter.get("/monitoring/leases/:id", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const lease = await db.observerLease.findUnique({ where: { id: String(req.params.id) } });
  if (!lease || lease.adminId !== admin.user.id) throw notFound("Lease not found.");
  const now = new Date();
  const [room] = await liveRooms({ id: lease.targetId });
  if (!room || !sameSession(room, lease)) {
    if (!lease.releasedAt) {
      await db.observerLease.updateMany({ where: { id: lease.id, releasedAt: null }, data: { releasedAt: now } });
      await audit(admin, "live.observer.leave", lease.targetId, "OBSERVING → — · the live ended");
    }
    return res.json({ status: "ended" });
  }
  if (lease.releasedAt && lease.releasedAt < lease.expiresAt) return res.json({ status: "released" });
  if (lease.releasedAt || lease.expiresAt <= now) {
    if (!lease.releasedAt) await db.observerLease.updateMany({ where: { id: lease.id, releasedAt: null }, data: { releasedAt: now } });
    return res.json({ status: "expired" });
  }

  const [chat, waiting, announcements] = await Promise.all([
    db.chatMessage.findMany({ where: { roomId: room.id, createdAt: { gte: room.startedAt } }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.liveQueueEntry.count({ where: { roomId: room.id, status: "WAITING" } }),
    db.liveAnnouncement.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const votes = room.pollOptions.map((_, i) => room.pollCounts[i] ?? 0);
  const totalVotes = votes.reduce((s, v) => s + v, 0);
  res.json({
    status: "observing",
    lease: { id: lease.id, secondsLeft: Math.max(0, Math.floor((lease.expiresAt.getTime() - now.getTime()) / 1000)), breakGlass: lease.breakGlass },
    room: {
      id: room.id,
      topic: room.topic,
      astrologer: room.astrologer.name,
      photo: room.astrologer.photo,
      slug: room.astrologer.slug,
      startedAt: room.startedAt.toISOString(),
      viewers: viewerCount(room.id),
      queue: { waiting, capacity: room.queueCapacity },
      poll: {
        question: room.pollQuestion,
        totalVotes,
        options: room.pollOptions.map((label, i) => ({
          label,
          votes: votes[i] ?? 0,
          pct: totalVotes ? Math.round(((votes[i] ?? 0) / totalVotes) * 100) : 0,
        })),
      },
      chat: chat.reverse().map((c) => ({ id: c.id, who: c.author, text: c.text, at: istTime(c.createdAt), contact: containsContactDetails(c.text) })),
      announcements: announcements.map((a) => ({ id: a.id, text: a.text, at: istTime(a.createdAt) })),
    },
  });
});

monitoringRouter.post("/monitoring/leases/:id/release", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const lease = await db.observerLease.findUnique({ where: { id: String(req.params.id) } });
  if (!lease || lease.adminId !== admin.user.id) throw notFound("Lease not found.");
  const { count } = await db.observerLease.updateMany({ where: { id: lease.id, releasedAt: null }, data: { releasedAt: new Date() } });
  if (count) await audit(admin, "live.observer.leave", lease.targetId, "OBSERVING → —");
  res.json({ ok: true });
});

/** Flags the room's current session for review. The flag shows on the monitoring list until the live ends. */
monitoringRouter.post("/monitoring/:id/flag", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const { reason, note } = z
    .object({ reason: z.enum(FLAG_REASONS), note: z.string().trim().max(200).optional() })
    .parse(req.body ?? {});
  const [room] = await liveRooms({ id: String(req.params.id) });
  if (!room) throw conflict("This live has ended, so it can't be flagged any more.");
  await audit(admin, "live.observer.flag", room.id, note ? `${reason} — ${note}` : reason);
  res.json({ ok: true });
});

// ── Account suspensions ──
// Partial: no new consultations and no lives, but the profile stays on the website and customers
// can still message them. Full: also hidden from the website and from messaging. A consultation
// already in progress is allowed to finish. Suspending needs "astrologer.suspend"; lifting or
// easing a suspension needs "astrologer.restore". The reason is kept in the audit entry and on the
// astrologer (shown in their portal), and they get a notification.

const SUSPENSION_LEVELS = ["none", "partial", "full"] as const;
type SuspensionLevel = (typeof SUSPENSION_LEVELS)[number];
const LEVEL_RANK: Record<SuspensionLevel, number> = { none: 0, partial: 1, full: 2 };
const LEVEL_NAME: Record<SuspensionLevel, string> = { none: "not suspended", partial: "partially suspended", full: "fully suspended" };

/** The reason written after " · " in a suspension audit entry. */
const reasonOf = (diff: string) => diff.split(" · ").slice(1).join(" · ") || null;

monitoringRouter.get("/suspensions", async (req, res) => {
  const admin = requirePage(req, "compliance");
  const caps = capabilitiesOf(admin.adminRole);
  const list = await db.astrologer.findMany({
    // Active astrologers, plus anyone still suspended whatever their stage (so it can be lifted).
    where: { OR: [{ lifecycle: "active" }, { suspension: { not: "none" } }] },
    select: { id: true, name: true, photo: true, lifecycle: true, suspension: true },
    orderBy: { name: "asc" },
  });
  const suspended = list.filter((a) => a.suspension !== "none");
  const entries = suspended.length
    ? await db.auditLog.findMany({
        where: { action: { in: ["astrologer.suspend", "astrologer.restore"] }, object: { in: suspended.map((a) => a.id) } },
        orderBy: { at: "desc" },
      })
    : [];
  res.json({
    suspensions: {
      suspended: suspended.map((a) => {
        const last = entries.find((e) => e.object === a.id);
        return {
          id: a.id,
          name: a.name,
          photo: a.photo,
          level: a.suspension,
          since: last ? istStamp(last.at) : null,
          by: last?.actorName ?? null,
          reason: last ? reasonOf(last.diff) : null,
        };
      }),
      // Active astrologers who can be suspended (the picker).
      astrologers: list.filter((a) => a.lifecycle === "active" && a.suspension === "none").map((a) => ({ id: a.id, name: a.name })),
      canSuspend: caps.includes("astrologer.suspend"),
      canRestore: caps.includes("astrologer.restore"),
    },
  });
});

monitoringRouter.post("/suspensions/:id", async (req, res) => {
  requirePage(req, "compliance");
  const { level, reason } = z
    .object({
      level: z.enum(SUSPENSION_LEVELS, { error: "Choose partial, full or lift the suspension." }),
      reason: z
        .string({ error: "Write the reason (at least 10 characters)." })
        .trim()
        .min(10, "Write the reason (at least 10 characters).")
        .max(300, "Keep the reason under 300 characters."),
    })
    .parse(req.body ?? {});
  const a = await db.astrologer.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true, lifecycle: true, suspension: true, presence: true, userId: true } });
  if (!a) throw notFound("Astrologer not found.");
  const from = (SUSPENSION_LEVELS as readonly string[]).includes(a.suspension) ? (a.suspension as SuspensionLevel) : "none";
  if (from === level) throw conflict(`${a.name} is already ${LEVEL_NAME[level]}.`);
  const stricter = LEVEL_RANK[level] > LEVEL_RANK[from];
  // Suspending (or making it stricter) and lifting (or easing it) are separate permissions.
  const admin = stricter
    ? requireCapability(req, "astrologer.suspend", "Your role can't suspend astrologers.")
    : requireCapability(req, "astrologer.restore", "Only a Super Admin can lift or ease a suspension.");
  if (stricter && a.lifecycle !== "active") throw conflict(`${a.name} isn't an active astrologer, so there is nothing to suspend.`);
  // Only if nobody changed it meanwhile.
  // The reason is shown to the astrologer on their portal; `suspendedAt` is when this suspension
  // started (kept when it is only made stricter or eased), and both are cleared when it is lifted.
  const now = new Date();
  const { count } = await db.astrologer.updateMany({
    where: { id: a.id, suspension: a.suspension },
    data:
      level === "none"
        ? { suspension: level, suspensionReason: null, suspendedAt: null }
        : { suspension: level, suspensionReason: reason, ...(from === "none" ? { suspendedAt: now } : {}) },
  });
  if (!count) throw conflict("This astrologer's suspension just changed. Reload to see the latest.");
  // A suspended astrologer goes offline at once (an open live ends; requests waiting for them time out).
  await audit(admin, stricter ? "astrologer.suspend" : "astrologer.restore", a.id, `${from} → ${level} · ${reason}`);
  if (a.userId) {
    await notify(
      a.userId,
      level === "none"
        ? { kind: "account.restored", title: "Your account suspension was lifted", body: `You can take consultations and go live again. Note from Astrorize: ${reason}`, href: "/portal" }
        : {
            kind: "account.suspended",
            title: `Your account was ${LEVEL_NAME[level]}`,
            body: `Reason: ${reason}${/[.!?]$/.test(reason) ? "" : "."} ${
              level === "partial"
                ? "You can't start new sessions or go live until it is lifted. Your profile and earnings stay readable."
                : "Your profile is hidden from customers and you can't take sessions until it is lifted."
            }`,
            href: "/portal",
          },
    );
  }
  if (level !== "none" && a.presence !== "OFF") {
    const { endedLive } = await goOffline(a.id);
    await audit(null, "astrologer.presence.auto_off", a.id, `online → OFF · account suspended${endedLive ? ", live room ended" : ""}`);
  }
  res.json({ ok: true, level });
});
