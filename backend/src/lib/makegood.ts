// Free replacement calls ("make-good"): on a complaint, Support can offer the customer a free call
// of up to `support.makegood.max_minutes` with the SAME astrologer instead of a refund. A second
// person (Finance or a Super Admin) approves it, exactly like a refund (routes/admin/support.ts).
//
// The credit's life: AVAILABLE (approved, until `expiresAt`) → reserved by a consultation that asks
// for it (consultationId set, still AVAILABLE) → USED once that consultation connects. A request
// that never connects (cancelled, declined, timed out) gives it back. Unused credits EXPIRE after
// `expiresAt` (the minute sweep).
//
// The replacement consultation runs like a welcome free call — its first `minutes` are free to the
// customer and any time after that is paid at the session's own rate — but nobody compensates the
// astrologer for the free minutes: they keep what they earned on the original session. Paid minutes
// after the free time earn as usual. It can't be combined with a welcome free call or an offer.

import { db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { configNumber } from "./settings.ts";

type Client = Prisma.TransactionClient | typeof db;

/** Consultation.billingMode of a free replacement call: `complimentarySeconds` free, then paid. */
export const MAKE_GOOD = "MAKE_GOOD_THEN_PAID";

/** Consultation statuses that still hold a reserved credit. */
const OPEN = ["REQUESTED", "CONNECTING", "ACTIVE"];

export async function makeGoodPolicy() {
  const [maxMinutes, validDays] = await Promise.all([
    configNumber("support.makegood.max_minutes", 15),
    configNumber("support.makegood.valid_days", 14),
  ]);
  return { maxMinutes: Math.max(1, Math.round(maxMinutes)), validDays: Math.max(1, Math.round(validDays)) };
}

/**
 * The customer's usable replacement call with this astrologer (the one expiring soonest), or null.
 * A credit reserved by a request that has since closed without connecting counts as free again.
 */
export async function usableMakeGood(client: Client, userId: string, astrologerId: string, now = new Date()) {
  const credits = await client.makeGoodCredit.findMany({
    where: { userId, astrologerId, status: "AVAILABLE", expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
  });
  for (const credit of credits) {
    if (!credit.consultationId) return { credit, inUse: false };
    const c = await client.consultation.findUnique({ where: { id: credit.consultationId }, select: { status: true } });
    if (c && OPEN.includes(c.status)) return { credit, inUse: true };
    return { credit, inUse: false };
  }
  return null;
}

/** Binds the credit to a new consultation. False when it was used, expired or taken meanwhile. */
export async function reserveMakeGood(tx: Prisma.TransactionClient, creditId: string, previous: string | null, consultationId: string) {
  const { count } = await tx.makeGoodCredit.updateMany({
    where: { id: creditId, status: "AVAILABLE", consultationId: previous, expiresAt: { gt: new Date() } },
    data: { consultationId },
  });
  return count === 1;
}

/** The replacement consultation connected: its credit is used. */
export async function consumeMakeGood(client: Client, consultationId: string) {
  await client.makeGoodCredit.updateMany({ where: { consultationId, status: "AVAILABLE" }, data: { status: "USED" } });
}

/** The replacement consultation closed without connecting: the credit is the customer's again. */
export async function releaseMakeGood(client: Client, consultationId: string) {
  await client.makeGoodCredit.updateMany({ where: { consultationId, status: "AVAILABLE" }, data: { consultationId: null } });
}

/**
 * Minute sweep: gives back credits whose request closed without connecting (any path — declined,
 * timed out, astrologer went offline), marks credits whose consultation connected as used, and
 * expires unused credits past their date (unless a consultation using one is still open).
 */
export async function sweepMakeGood(now = new Date()) {
  const reserved = await db.makeGoodCredit.findMany({ where: { status: "AVAILABLE", consultationId: { not: null } } });
  for (const credit of reserved) {
    const c = await db.consultation.findUnique({ where: { id: credit.consultationId! }, select: { status: true, connectedAt: true } });
    if (c?.connectedAt) await consumeMakeGood(db, credit.consultationId!);
    else if (!c || !OPEN.includes(c.status)) await releaseMakeGood(db, credit.consultationId!);
  }
  await db.makeGoodCredit.updateMany({ where: { status: "AVAILABLE", consultationId: null, expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
}
