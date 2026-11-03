import { Router } from "express";
import { z } from "zod";
import { db } from "../../db.ts";
import { audit } from "../../lib/audit.ts";
import { badRequest, conflict, notFound } from "../../lib/errors.ts";
import { FLAG_ACTION, FLAG_REVIEWED, parseFlag } from "../../lib/contact-flags.ts";
import { istStamp } from "../../lib/format.ts";
import { capabilitiesOf, requireCapability, requirePage } from "../../lib/rbac.ts";
import { BLOCK_ACTION, BLOCK_EXTEND_ACTION, activeBlock, blockEndLabel, contactBlockPolicy, liftBlock, placeBlock } from "../../lib/account-blocks.ts";

// Trust & reviews → "Off-platform contact attempts": every message the contact filter stopped
// (lib/contact-flags.ts), newest first, with who tried, where, what kind of detail and a masked
// snippet, how many times that person has tried, and a "Reviewed" action (audited). Above it, the
// accounts blocked now for repeated attempts (lib/account-blocks.ts), which Compliance or a Super
// Admin ("account.contact_block") can lift at once, extend, or block by hand.
export const contactFlagsRouter = Router();

/** The most flags one page of the queue shows. */
const LIST_LIMIT = 200;

contactFlagsRouter.get("/contact-flags", async (req, res) => {
  const admin = requirePage(req, "trust");
  const show = z.enum(["open", "reviewed", "all"]).catch("open").parse(req.query.show);
  const reviewedRows = await db.auditLog.findMany({ where: { action: FLAG_REVIEWED }, orderBy: { at: "desc" } });
  const reviewed = new Map<string, (typeof reviewedRows)[number]>();
  for (const r of reviewedRows) if (!reviewed.has(r.object)) reviewed.set(r.object, r);
  const reviewedIds = [...reviewed.keys()];

  const [rows, totalOpen, totalAll, perPerson] = await Promise.all([
    db.auditLog.findMany({
      where: {
        action: FLAG_ACTION,
        ...(show === "open" ? { id: { notIn: reviewedIds } } : show === "reviewed" ? { id: { in: reviewedIds } } : {}),
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: LIST_LIMIT,
    }),
    db.auditLog.count({ where: { action: FLAG_ACTION, id: { notIn: reviewedIds } } }),
    db.auditLog.count({ where: { action: FLAG_ACTION } }),
    db.auditLog.groupBy({ by: ["actorId"], where: { action: FLAG_ACTION }, _count: { _all: true } }),
  ]);
  const attempts = new Map(perPerson.map((p) => [p.actorId, p._count._all]));
  const flags = rows.map((r) => ({ row: r, ...parseFlag(r) }));
  const now = new Date();
  // Who is blocked now: everyone on this page, and every blocked account (the list above the flags).
  const [blockedUsers, senders, policy] = await Promise.all([
    db.user.findMany({ where: { blockedUntil: { gt: now } }, select: { id: true, name: true, role: true, blockedUntil: true, blockReason: true }, orderBy: { blockedUntil: "asc" } }),
    db.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))] } },
      select: { id: true, blockedUntil: true, blockReason: true },
    }),
    contactBlockPolicy(),
  ]);
  const blockOf = new Map(senders.map((u) => [u.id, activeBlock(u, now)]));
  const blockEntries = blockedUsers.length
    ? await db.auditLog.findMany({
        where: { action: { in: [BLOCK_ACTION, BLOCK_EXTEND_ACTION] }, object: { in: blockedUsers.map((u) => u.id) } },
        orderBy: { at: "desc" },
      })
    : [];

  // Where each one happened, in words.
  const pairs = flags.filter((f) => f.place === "messages").map((f) => f.ref.split(":") as [string, string]);
  const consultIds = flags.filter((f) => f.place === "consultation").map((f) => f.ref);
  const roomIds = flags.filter((f) => f.place === "live").map((f) => f.ref);
  const [astrologers, customers, consultations, rooms] = await Promise.all([
    db.astrologer.findMany({
      where: { id: { in: [...new Set(pairs.map((p) => p[0]))] } },
      select: { id: true, name: true },
    }),
    db.user.findMany({ where: { id: { in: [...new Set(pairs.map((p) => p[1]))] } }, select: { id: true, name: true } }),
    db.consultation.findMany({
      where: { id: { in: consultIds } },
      select: { id: true, ref: true, mode: true, kind: true, astrologer: { select: { name: true } }, customer: { select: { name: true } } },
    }),
    db.liveRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, title: true, topic: true, astrologer: { select: { name: true } } } }),
  ]);
  const astroName = new Map(astrologers.map((a) => [a.id, a.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const consultation = new Map(consultations.map((c) => [c.id, c]));
  const room = new Map(rooms.map((r) => [r.id, r]));
  const where = (f: (typeof flags)[number]) => {
    if (f.place === "messages") {
      const [astrologerId = "", customerId = ""] = f.ref.split(":");
      return {
        label: "Messages (free chat)",
        detail: `${customerName.get(customerId) ?? "A customer"} ↔ ${astroName.get(astrologerId) ?? "an astrologer"}`,
      };
    }
    if (f.place === "consultation") {
      const c = consultation.get(f.ref);
      if (!c) return { label: "Consultation (paid chat)", detail: "Consultation no longer on record" };
      const mode = c.kind === "INSTANT" ? "Instant Call" : c.mode === "VIDEO" ? "Video" : c.mode === "VOICE" ? "Voice" : "Chat";
      return { label: `Consultation ${c.ref} (paid chat)`, detail: `${mode} · ${c.customer?.name ?? "Customer"} ↔ ${c.astrologer.name}` };
    }
    const r = room.get(f.ref);
    return { label: "Live room chat", detail: r ? `${r.astrologer.name} · ${r.title || r.topic}` : "Live room no longer on record" };
  };

  res.json({
    flags: flags.map((f) => {
      const done = reviewed.get(f.row.id);
      return {
        id: f.row.id,
        at: istStamp(f.row.at),
        who: {
          name: f.row.actorName,
          side: f.side === "ASTROLOGER" ? "Astrologer" : "Customer",
          userId: f.row.actorId,
          blockedUntil: (() => {
            const b = f.row.actorId ? blockOf.get(f.row.actorId) : null;
            return b ? blockEndLabel(b.until) : null;
          })(),
        },
        where: where(f),
        kinds: f.kinds,
        snippet: f.snippet,
        attempts: (f.row.actorId && attempts.get(f.row.actorId)) || 1,
        reviewed: done ? { by: done.actorName, at: istStamp(done.at) } : null,
      };
    }),
    open: totalOpen,
    total: totalAll,
    limit: LIST_LIMIT,
    blocked: blockedUsers.map((u) => {
      const last = blockEntries.find((e) => e.object === u.id);
      return {
        userId: u.id,
        name: u.name,
        side: u.role === "ASTROLOGER" ? "Astrologer" : "Customer",
        untilLabel: blockEndLabel(u.blockedUntil!),
        reason: u.blockReason ?? "Repeatedly sharing contact details",
        since: last ? istStamp(last.at) : null,
        by: last?.actorName ?? null,
        attempts: attempts.get(u.id) ?? 0,
      };
    }),
    canBlock: capabilitiesOf(admin.adminRole).includes("account.contact_block"),
    policy,
  });
});

const blockReason = z
  .string({ error: "Write a reason." })
  .trim()
  .min(3, "Write a reason of at least 3 characters.")
  .max(200, "Keep the reason to 200 characters.");

/** The customer or astrologer account a block is about (never a staff account). */
async function blockable(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, blockedUntil: true, blockReason: true } });
  if (!user || (user.role !== "CUSTOMER" && user.role !== "ASTROLOGER")) throw notFound("Account not found.");
  return user;
}

/**
 * Blocks an account by hand for `days` days, or — when it is blocked already — moves the end of the
 * block `days` later. Compliance or a Super Admin. Audited; the person is told.
 */
contactFlagsRouter.post("/contact-blocks/:userId", async (req, res) => {
  requirePage(req, "trust");
  const admin = requireCapability(req, "account.contact_block", "Your role can't block accounts.");
  const { days, reason } = z
    .object({ days: z.number({ error: "Choose how many days." }).int("Whole days only.").min(1, "At least 1 day.").max(90, "At most 90 days."), reason: blockReason })
    .parse(req.body ?? {});
  const user = await blockable(String(req.params.userId));
  const current = activeBlock(user);
  const from = current ? current.until : new Date();
  const until = new Date(from.getTime() + days * 86_400_000);
  if (current && until <= current.until) throw badRequest("The new end must be later than the current one.");
  await placeBlock({ userId: user.id, until, reason, actor: admin, how: current ? "extend" : "manual" });
  res.json({ ok: true, until: blockEndLabel(until), extended: !!current });
});

/** Lifts a block now, before or during its period (urgent cases). Compliance or a Super Admin. Audited. */
contactFlagsRouter.post("/contact-blocks/:userId/lift", async (req, res) => {
  requirePage(req, "trust");
  const admin = requireCapability(req, "account.contact_block", "Your role can't lift blocks.");
  const { reason } = z.object({ reason: blockReason }).parse(req.body ?? {});
  const user = await blockable(String(req.params.userId));
  if (!activeBlock(user)) throw conflict(`${user.name} isn't blocked.`);
  if (!(await liftBlock({ userId: user.id, actor: admin, reason }))) throw conflict(`${user.name}'s block just changed. Reload to see the latest.`);
  res.json({ ok: true });
});

contactFlagsRouter.post("/contact-flags/:id/review", async (req, res) => {
  const admin = requirePage(req, "trust");
  const flag = await db.auditLog.findFirst({ where: { id: String(req.params.id), action: FLAG_ACTION } });
  if (!flag) throw notFound("Flag not found.");
  const done = await db.auditLog.findFirst({ where: { action: FLAG_REVIEWED, object: flag.id } });
  if (done) throw conflict(`Already marked reviewed by ${done.actorName}.`);
  const f = parseFlag(flag);
  await audit(admin, FLAG_REVIEWED, flag.id, `${flag.actorName} (${f.side.toLowerCase()}) · ${f.place} · ${f.kinds.join(", ")}`);
  res.json({ ok: true });
});
