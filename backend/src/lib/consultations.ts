import { db } from "../db.ts";
import { MAX_SESSION_SECONDS, affordableSeconds, settle } from "./billing.ts";
import { rupee } from "./format.ts";
import { syncPresence } from "./presence.ts";
import { configNumber } from "./settings.ts";
import type { Consultation, Prisma } from "../generated/prisma/client.ts";

/** A request at the front of an astrologer's queue has this long to be accepted. */
export const INCOMING_WINDOW_SECS = 180;

/** A customer may have only one of these at a time, across all astrologers. */
export const OPEN_STATUSES = ["REQUESTED", "CONNECTING", "ACTIVE"];

type Tx = Prisma.TransactionClient;

/**
 * Serialises work on one customer (or one astrologer) until the surrounding transaction
 * ends, so two tabs clicking at the same moment can't both start a consultation.
 */
export async function lockKey(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** The customer's open consultation, if any. */
export function openConsultationOf(client: Tx | typeof db, customerId: string) {
  return client.consultation.findFirst({ where: { customerId, status: { in: OPEN_STATUSES } }, orderBy: { requestedAt: "desc" } });
}

/**
 * Requests wait in a queue. The one at the front is offered to the astrologer, who has
 * 3 minutes to accept; if not, it times out (the customer is told and charged ₹0) and the
 * next request is offered. Called by the portal and by the waiting customer's page, so a
 * request times out even when the astrologer isn't looking.
 */
export async function expireStaleRequests(astrologerId: string) {
  const now = Date.now();
  for (;;) {
    const head = await db.consultation.findFirst({ where: { astrologerId, status: "REQUESTED" }, orderBy: { requestedAt: "asc" } });
    if (!head) return;
    if (!head.offeredAt) {
      await db.consultation.updateMany({ where: { id: head.id, status: "REQUESTED", offeredAt: null }, data: { offeredAt: new Date(now) } });
      return;
    }
    const expiresAt = head.offeredAt.getTime() + INCOMING_WINDOW_SECS * 1000;
    if (expiresAt > now) return;
    await db.consultation.updateMany({ where: { id: head.id, status: "REQUESTED" }, data: { status: "TIMED_OUT", endedAt: new Date(expiresAt) } });
    const next = await db.consultation.findFirst({ where: { astrologerId, status: "REQUESTED" }, orderBy: { requestedAt: "asc" } });
    if (!next) return;
    if (!next.offeredAt) {
      await db.consultation.updateMany({ where: { id: next.id, offeredAt: null }, data: { offeredAt: new Date(Math.min(now, expiresAt)) } });
    }
  }
}

/** When the front-of-queue request stops waiting for the astrologer (null until it is offered). */
export function acceptBy(c: Pick<Consultation, "status" | "offeredAt">): Date | null {
  return c.status === "REQUESTED" && c.offeredAt ? new Date(c.offeredAt.getTime() + INCOMING_WINDOW_SECS * 1000) : null;
}

/** Longest the session can run: the 15-minute cap or what the held balance pays for. */
export function sessionCapSeconds(c: Pick<Consultation, "heldAmount" | "rate">, freeSeconds: number) {
  const affordable = c.heldAmount > 0 ? affordableSeconds(c.heldAmount, c.rate, freeSeconds) : MAX_SESSION_SECONDS;
  return Math.min(MAX_SESSION_SECONDS, affordable);
}

export function settlementView(c: Pick<Consultation, "billedSeconds" | "billedMinutes" | "rate" | "total" | "promoUsed" | "serviceUsed" | "endReason">) {
  return {
    elapsed: c.billedSeconds,
    billedMins: c.billedMinutes,
    rate: c.rate,
    total: c.total,
    promo: c.promoUsed,
    service: c.serviceUsed,
    reason: c.endReason ?? "user",
  };
}

/**
 * The astrologer accepts a waiting request: it becomes ACTIVE and the customer's available
 * balance is held for the session. Returns null when it was no longer waiting (the customer
 * cancelled, it timed out, or another tab accepted it first).
 */
export async function acceptConsultation(id: string, astrologerId: string) {
  const result = await db.$transaction(async (tx) => {
    await lockKey(tx, `astro:${astrologerId}`);
    const c = await tx.consultation.findUnique({ where: { id } });
    if (!c || c.astrologerId !== astrologerId || c.status !== "REQUESTED") return { ok: false as const, reason: "gone" as const };
    if (c.customerId) await lockKey(tx, `consult:${c.customerId}`);
    const busy = await tx.consultation.findFirst({ where: { astrologerId, status: "ACTIVE" }, select: { id: true } });
    if (busy) return { ok: false as const, reason: "busy" as const };

    let held = c.heldAmount;
    if (c.customerId && held === 0) {
      const wallet = await tx.wallet.findUnique({ where: { userId: c.customerId } });
      held = wallet ? Math.max(0, wallet.service + wallet.promo - wallet.held) : 0;
      if (held > 0) await tx.wallet.update({ where: { userId: c.customerId }, data: { held: { increment: held } } });
    }
    const updated = await tx.consultation.update({
      where: { id: c.id },
      data: { status: "ACTIVE", connectedAt: new Date(), heldAmount: held },
    });
    return { ok: true as const, consultation: updated };
  });
  if (result.ok) await syncPresence(astrologerId); // in a session → BUSY
  return result;
}

/**
 * Ends a consultation and takes the single debit, metered by the server clock.
 * Used when the customer ends it on the website and when the astrologer ends it in
 * the portal, so both are charged identically. Safe to call twice, and safe when both
 * sides end it at the same moment: only one of them settles.
 */
export async function endConsultation(c: Consultation, endedBy: "user" | "astrologer") {
  const freeSeconds = await configNumber("consult.free_seconds", 60);
  await db.$transaction(async (tx) => {
    if (c.customerId) await lockKey(tx, `consult:${c.customerId}`);
    const fresh = await tx.consultation.findUnique({ where: { id: c.id } });
    if (!fresh || !OPEN_STATUSES.includes(fresh.status)) return;
    const now = new Date();
    const wallet = fresh.customerId ? await tx.wallet.findUnique({ where: { userId: fresh.customerId } }) : null;
    const releaseHold = Math.min(wallet?.held ?? 0, fresh.heldAmount);

    if (fresh.status !== "ACTIVE" || !fresh.connectedAt) {
      // Never connected: release the hold, charge nothing.
      await tx.consultation.update({ where: { id: fresh.id }, data: { status: "CANCELLED", endedAt: now, endReason: endedBy } });
      if (wallet && releaseHold > 0) await tx.wallet.update({ where: { userId: wallet.userId }, data: { held: { decrement: releaseHold } } });
      return;
    }

    const affordable = fresh.heldAmount > 0 ? affordableSeconds(fresh.heldAmount, fresh.rate, freeSeconds) : MAX_SESSION_SECONDS;
    const connectedSeconds = Math.min(Math.floor((now.getTime() - fresh.connectedAt.getTime()) / 1000), sessionCapSeconds(fresh, freeSeconds));
    const reason =
      fresh.heldAmount > 0 && connectedSeconds >= affordable ? "exhausted" : connectedSeconds >= MAX_SESSION_SECONDS ? "cap" : endedBy;
    const s = settle({
      connectedSeconds,
      rate: fresh.rate,
      freeSeconds,
      held: fresh.heldAmount > 0 ? fresh.heldAmount : Number.MAX_SAFE_INTEGER,
      promo: wallet?.promo ?? 0,
    });

    await tx.consultation.update({
      where: { id: fresh.id },
      data: {
        status: "ENDED",
        endedAt: now,
        endReason: reason,
        billedSeconds: s.billedSeconds,
        billedMinutes: s.billedMinutes,
        total: s.total,
        promoUsed: s.promoUsed,
        serviceUsed: s.serviceUsed,
      },
    });
    await tx.astrologer.update({ where: { id: fresh.astrologerId }, data: { consults: { increment: 1 } } });
    if (wallet) {
      await tx.wallet.update({
        where: { userId: wallet.userId },
        data: { held: { decrement: releaseHold }, promo: { decrement: s.promoUsed }, service: { decrement: s.serviceUsed } },
      });
      if (s.total > 0) {
        const bucket = s.promoUsed > 0 ? `Promo ${rupee(s.promoUsed)} + Service ${rupee(s.serviceUsed)}` : "Service";
        await tx.transaction.create({ data: { userId: wallet.userId, type: "Consultation", ref: fresh.ref, bucket, amount: -s.total } });
      }
    }
    if (s.billedMinutes > 0) {
      const kind = fresh.kind === "INSTANT" ? "emergency" : fresh.mode.toLowerCase();
      const mode = fresh.kind === "INSTANT" ? "Emergency voice" : fresh.mode[0] + fresh.mode.slice(1).toLowerCase();
      await tx.earningsLine.create({ data: { astrologerId: fresh.astrologerId, date: now, sessionRef: fresh.ref, kind, mode, minutes: s.billedMinutes } });
    }
  });
  // Session over → back to ON (or LIVE), if they are still online.
  await syncPresence(c.astrologerId);
  return db.consultation.findUniqueOrThrow({ where: { id: c.id } });
}

/**
 * Closes consultations nobody closed: the customer shut the tab mid-session, or a
 * connect never finished. Billing is still capped at what the session could run for,
 * so a late sweep never over-charges. Runs every minute from server.ts.
 */
export async function sweepAbandonedConsultations() {
  const now = Date.now();
  const GRACE_MS = 60_000;
  const freeSeconds = await configNumber("consult.free_seconds", 60);
  const active = await db.consultation.findMany({ where: { status: "ACTIVE", connectedAt: { lt: new Date(now - GRACE_MS) } } });
  for (const c of active) {
    const capMs = sessionCapSeconds(c, freeSeconds) * 1000;
    if (c.connectedAt && c.connectedAt.getTime() + capMs + GRACE_MS < now) await endConsultation(c, "user");
  }
  const stuck = await db.consultation.findMany({ where: { status: "CONNECTING", requestedAt: { lt: new Date(now - 5 * 60_000) } } });
  for (const c of stuck) await endConsultation(c, "user");
  // Requests time out even when neither the astrologer nor the customer has the page open.
  const waiting = await db.consultation.findMany({ where: { status: "REQUESTED" }, distinct: ["astrologerId"], select: { astrologerId: true } });
  for (const { astrologerId } of waiting) await expireStaleRequests(astrologerId);
}
