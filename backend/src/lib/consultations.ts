import { db } from "../db.ts";
import { MAX_SESSION_SECONDS, affordableSeconds, settle } from "./billing.ts";
import { rupee } from "./format.ts";
import { syncPresence } from "./presence.ts";
import { configNumber } from "./settings.ts";
import { audit } from "./audit.ts";
import { freeMinutes, sharePctFor, sharePolicy, writeEarnings } from "./earnings.ts";
import { COMPLIMENTARY, consumeWelcome, reconcileWelcome, releaseWelcome, restoreAfterFault, welcomePolicy } from "./welcome.ts";
import { MAKE_GOOD, consumeMakeGood, releaseMakeGood, sweepMakeGood } from "./makegood.ts";
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
    const { count } = await db.consultation.updateMany({ where: { id: head.id, status: "REQUESTED" }, data: { status: "TIMED_OUT", endedAt: new Date(expiresAt) } });
    // Not answered in time: a free call held for it is the customer's again.
    if (count && head.billingMode === COMPLIMENTARY) await releaseWelcome(db, head.id);
    if (count && head.billingMode === MAKE_GOOD) await releaseMakeGood(db, head.id);
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

type Metered = Pick<Consultation, "heldAmount" | "rate" | "billingMode" | "complimentarySeconds">;

/** A session that starts with free time and then continues paid: a welcome free call or a free replacement call. */
export const startsFree = (c: Pick<Consultation, "billingMode">) => c.billingMode === COMPLIMENTARY || c.billingMode === MAKE_GOOD;

/**
 * Seconds at the start of a session that are never billed: a welcome call's (or a free replacement
 * call's) complimentary time, snapshotted when it was requested — instead of, not on top of, the
 * standard free window.
 */
export function freeWindow(c: Pick<Consultation, "billingMode" | "complimentarySeconds">, standardFree: number) {
  return startsFree(c) ? c.complimentarySeconds : standardFree;
}

/**
 * Longest the session can run: the 15-minute cap, or the free window plus what the held balance
 * pays for at the session's own rate. Nothing held means nothing can be billed after the free
 * window, so the session ends there (a free call with an empty wallet ends with its free time).
 * A welcome free call (Config: up to an hour) runs its whole complimentary time, and then a paid
 * part held to the same rules as any session: at most 15 minutes and what the balance pays for.
 */
export function sessionCapSeconds(c: Metered, standardFree: number) {
  if (startsFree(c)) {
    const paid = c.rate > 0 ? Math.min(MAX_SESSION_SECONDS, affordableSeconds(c.heldAmount, c.rate, 0)) : 0;
    return c.complimentarySeconds + paid;
  }
  if (c.rate <= 0) return MAX_SESSION_SECONDS;
  return Math.min(MAX_SESSION_SECONDS, affordableSeconds(c.heldAmount, c.rate, freeWindow(c, standardFree)));
}

export function settlementView(
  c: Pick<
    Consultation,
    "billedSeconds" | "billedMinutes" | "rate" | "total" | "promoUsed" | "serviceUsed" | "endReason" | "billingMode" | "complimentarySeconds" | "listRate" | "discountPct"
  >,
) {
  const discounted = c.listRate != null && c.listRate > c.rate;
  return {
    elapsed: c.billedSeconds,
    billedMins: c.billedMinutes,
    rate: c.rate,
    total: c.total,
    promo: c.promoUsed,
    service: c.serviceUsed,
    reason: c.endReason ?? "user",
    /** A welcome call (or a free replacement call): its first complimentarySeconds were free. */
    complimentary: startsFree(c),
    complimentarySeconds: startsFree(c) ? c.complimentarySeconds : 0,
    /** A free replacement call offered on a complaint. */
    makeGood: c.billingMode === MAKE_GOOD,
    /** A claimed offer's discount: the price before it, the percent off, and what it saved (₹). */
    listRate: discounted ? c.listRate : null,
    discountPct: discounted ? c.discountPct : 0,
    saved: discounted ? c.billedMinutes * (c.listRate! - c.rate) : 0,
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
    const connectedAt = new Date();
    const updated = await tx.consultation.update({
      where: { id: c.id },
      data: { status: "ACTIVE", connectedAt, heldAmount: held },
    });
    if (c.billingMode === COMPLIMENTARY) await consumeWelcome(tx, c.id, connectedAt);
    if (c.billingMode === MAKE_GOOD) await consumeMakeGood(tx, c.id);
    return { ok: true as const, consultation: updated };
  });
  if (result.ok) await syncPresence(astrologerId); // in a session → BUSY
  return result;
}

/**
 * Money added while a consultation is open (e.g. "Add money" during a free call) is held for
 * it straight away, so the same session simply runs longer — at its own rate — without
 * disconnecting. A session that has already reached its end isn't revived.
 */
export async function extendHold(customerId: string) {
  const standardFree = await configNumber("consult.free_seconds", 60);
  return db.$transaction(async (tx) => {
    await lockKey(tx, `consult:${customerId}`);
    const c = await tx.consultation.findFirst({ where: { customerId, status: { in: ["CONNECTING", "ACTIVE"] } } });
    if (!c) return null;
    if (c.status === "ACTIVE" && c.connectedAt && Date.now() - c.connectedAt.getTime() >= sessionCapSeconds(c, standardFree) * 1000) return null;
    const wallet = await tx.wallet.findUnique({ where: { userId: customerId } });
    const extra = wallet ? wallet.service + wallet.promo - wallet.held : 0;
    if (extra <= 0) return null;
    await tx.wallet.update({ where: { userId: customerId }, data: { held: { increment: extra } } });
    return tx.consultation.update({ where: { id: c.id }, data: { heldAmount: { increment: extra } } });
  });
}

/**
 * Ends a consultation and takes the single debit, metered by the server clock.
 * Used when the customer ends it on the website and when the astrologer ends it in
 * the portal, so both are charged identically. Safe to call twice, and safe when both
 * sides end it at the same moment: only one of them settles.
 */
export async function endConsultation(c: Consultation, endedBy: "user" | "astrologer") {
  const [standardFree, policy, shares] = await Promise.all([configNumber("consult.free_seconds", 60), welcomePolicy(), sharePolicy()]);
  const restored = await db.$transaction(async (tx) => {
    if (c.customerId) await lockKey(tx, `consult:${c.customerId}`);
    const fresh = await tx.consultation.findUnique({ where: { id: c.id } });
    if (!fresh || !OPEN_STATUSES.includes(fresh.status)) return false;
    const now = new Date();
    const wallet = fresh.customerId ? await tx.wallet.findUnique({ where: { userId: fresh.customerId } }) : null;
    const releaseHold = Math.min(wallet?.held ?? 0, fresh.heldAmount);

    if (fresh.status !== "ACTIVE" || !fresh.connectedAt) {
      // Never connected: release the hold, charge nothing.
      await tx.consultation.update({ where: { id: fresh.id }, data: { status: "CANCELLED", endedAt: now, endReason: endedBy } });
      if (wallet && releaseHold > 0) await tx.wallet.update({ where: { userId: wallet.userId }, data: { held: { decrement: releaseHold } } });
      // A free call that never connected doesn't use up the free call.
      if (fresh.billingMode === COMPLIMENTARY) await releaseWelcome(tx, fresh.id);
      // Nor a free replacement call.
      if (fresh.billingMode === MAKE_GOOD) await releaseMakeGood(tx, fresh.id);
      return false;
    }

    // Everything here uses the rate and free window fixed when the session was requested:
    // a price change while it runs never affects it.
    const freeSeconds = freeWindow(fresh, standardFree);
    const cap = sessionCapSeconds(fresh, standardFree);
    const connectedSeconds = Math.min(Math.floor((now.getTime() - fresh.connectedAt.getTime()) / 1000), cap);
    // At the cap: the 15-minute paid limit ("cap"), or the money ran out first ("exhausted"). A free
    // call's own free time doesn't count towards the 15 minutes.
    const complimentary = startsFree(fresh) ? (fresh.complimentarySeconds ?? 0) : 0;
    const reason = connectedSeconds >= cap ? (cap - complimentary >= MAX_SESSION_SECONDS ? "cap" : "exhausted") : endedBy;
    const s = settle({ connectedSeconds, rate: fresh.rate, freeSeconds, held: fresh.heldAmount, promo: wallet?.promo ?? 0 });

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
    const astrologer = await tx.astrologer.update({ where: { id: fresh.astrologerId }, data: { consults: { increment: 1 } } });
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
    // Dropped in its first seconds and not by the customer: the free call is given back (bounded).
    const restored =
      fresh.billingMode === COMPLIMENTARY && endedBy !== "user" && connectedSeconds < policy.minMeaningfulSeconds
        ? await restoreAfterFault(tx, fresh.id, policy)
        : false;

    // Earnings, at the share the astrologer has today (snapshotted on the line).
    const sharePct = sharePctFor(astrologer, now, shares);
    const modeName = fresh.mode[0] + fresh.mode.slice(1).toLowerCase();
    if (s.billedMinutes > 0) {
      // What the customer paid for the paid minutes.
      const kind = fresh.kind === "INSTANT" ? "emergency" : fresh.mode.toLowerCase();
      const mode =
        fresh.kind === "INSTANT"
          ? "Emergency voice"
          : fresh.billingMode === COMPLIMENTARY
            ? `${modeName} · after free call`
            : fresh.billingMode === MAKE_GOOD
              ? `${modeName} · after free replacement call`
              : fresh.origin === "LIVE"
                ? `Live private · ${modeName.toLowerCase()}`
                : modeName;
      // A claimed offer's discount is paid by Astrorize: the astrologer earns their share of the
      // full price (the minutes at the list rate); `discount` is the part the customer didn't pay.
      const discount = fresh.listRate != null && fresh.listRate > fresh.rate ? s.billedMinutes * (fresh.listRate - fresh.rate) : 0;
      await writeEarnings(tx, {
        astrologerId: fresh.astrologerId,
        date: now,
        sessionRef: fresh.ref,
        kind,
        mode: discount ? `${mode} · ${fresh.discountPct}% offer` : mode,
        minutes: s.billedMinutes,
        gross: s.total + discount,
        sharePct,
        discount,
      });
    }
    // A free replacement call's free minutes have no line: the astrologer was paid for the original session.
    if (fresh.billingMode === COMPLIMENTARY && !restored) {
      // The free minutes: the customer pays nothing, Astrorize pays the astrologer for them at the
      // session's own rate × their share (paid in the free-call batch). A free call given back after
      // an early drop isn't used, so it isn't compensated.
      const used = Math.min(connectedSeconds, fresh.complimentarySeconds);
      const minutes = freeMinutes(used);
      await writeEarnings(tx, {
        astrologerId: fresh.astrologerId,
        date: now,
        sessionRef: fresh.ref,
        kind: "free_call",
        mode: `Free call · ${modeName}`,
        minutes,
        gross: minutes * fresh.rate,
        sharePct,
        fundedBy: "PLATFORM",
        freeSeconds: used,
      });
    }
    return restored;
  });
  if (restored) {
    await audit(null, "welcome.fault_restore", c.ref, `free call given back (no longer counted) · ended early by the ${endedBy}`);
  }
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
  // Free calls held for requests that have since closed (e.g. the astrologer went offline).
  await reconcileWelcome();
  // Free replacement calls: give back ones whose request closed, expire unused ones.
  await sweepMakeGood();
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
