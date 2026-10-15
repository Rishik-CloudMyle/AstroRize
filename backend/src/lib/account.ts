import { db } from "../db.ts";
import { audit } from "./audit.ts";
import { conflict } from "./errors.ts";
import { istDateKey, makeRef, rupee } from "./format.ts";
import { lockKey, OPEN_STATUSES } from "./consultations.ts";
import { deleteMedia } from "./media.ts";
import type { Prisma } from "../generated/prisma/client.ts";

// A customer closing their own account (Wallet & account → "Deactivate" / "Delete my account").
//
// Deactivate = pause: every session is signed out and pausedAt is set; the wallet stays as it
// is. Signing in again (mobile code or email) clears pausedAt straight away (routes/auth.ts).
//
// Delete = permanent: the service balance (money the customer paid) is refunded to the original
// payment method; promotional credit is forfeited. Personal details are then erased (DPDP Act),
// while financial records (transactions, payments, consultations, refunds) stay, linked to the
// anonymised account, for the accounting and tax retention the law requires.

type Tx = Prisma.TransactionClient;

export const DELETED_NAME = "Deleted customer";
export const DELETED_INITIALS = "DC";
/** Shown with every refund: the gateway's usual settlement time. */
export const REFUND_TIMELINE = "Refunds to the original payment method usually take 5–7 working days.";

const DISPUTE_OPEN = "Deletion isn't available while a dispute is open. We'll let you know as soon as it's resolved.";
const CONSULT_OPEN = "You have a consultation in progress. End or cancel it first.";

/** Support tickets count as open until they are resolved. */
const CLOSED_TICKET_STATES = ["RESOLVED"];

/** A support ticket or dispute about one of this customer's consultations that isn't resolved yet. */
async function openDispute(client: Tx | typeof db, userId: string) {
  const refs = (await client.consultation.findMany({ where: { customerId: userId }, select: { ref: true } })).map((c) => c.ref);
  if (!refs.length) return null;
  return client.supportTicket.findFirst({ where: { sessionRef: { in: refs }, state: { notIn: CLOSED_TICKET_STATES } }, select: { id: true } });
}

async function openConsultation(client: Tx | typeof db, userId: string) {
  return client.consultation.findFirst({ where: { customerId: userId, status: { in: OPEN_STATUSES } }, select: { id: true } });
}

/** "Original payment method · mock order_…": where a refund goes (provider and last paid order, when known). */
async function refundMethod(client: Tx | typeof db, userId: string): Promise<string> {
  const last = await client.payment.findFirst({ where: { userId, status: "PAID" }, orderBy: { paidAt: "desc" } });
  return last ? `Original payment method · ${last.provider} ${last.providerOrderId}` : "Original payment method";
}

/** What the "Deactivate" and "Delete my account" boxes show before the customer confirms. */
export async function accountStatus(userId: string) {
  const [user, wallet, consult, dispute] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.wallet.findUnique({ where: { userId } }),
    openConsultation(db, userId),
    openDispute(db, userId),
  ]);
  return {
    /** Paid balance refunded on deletion (₹). */
    refund: wallet?.service ?? 0,
    /** Promotional credit forfeited on deletion (₹). */
    forfeited: wallet?.promo ?? 0,
    /** How the customer confirms a deletion: a code to their mobile, or their password. */
    confirmWith: [...(user.phone ? (["otp"] as const) : []), ...(user.passwordHash && user.email ? (["password"] as const) : [])],
    /** "98••••3210" for the confirmation step. */
    phoneHint: user.phone ? `${user.phone.slice(0, 2)}••••${user.phone.slice(-4)}` : null,
    /** Why deactivation can't happen right now, or null. */
    deactivateBlocked: consult ? CONSULT_OPEN : null,
    /** Why deletion can't happen right now, or null. */
    deleteBlocked: consult ? CONSULT_OPEN : dispute ? DISPUTE_OPEN : null,
    refundTimeline: REFUND_TIMELINE,
  };
}

/** Customers waiting in a live room's queue are taken out of it when they leave. */
const leaveQueues = (tx: Tx, userId: string) =>
  tx.liveQueueEntry.updateMany({ where: { userId, status: "WAITING" }, data: { status: "LEFT" } });

const revokeSessions = (tx: Tx, userId: string) =>
  tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

/** Deactivate: signs the customer out everywhere. Their wallet and history stay as they are. */
export async function deactivateAccount(userId: string) {
  await db.$transaction(async (tx) => {
    // Same lock as starting a consultation, so one can't start while this runs.
    await lockKey(tx, `consult:${userId}`);
    if (await openConsultation(tx, userId)) throw conflict(CONSULT_OPEN);
    await tx.user.update({ where: { id: userId }, data: { pausedAt: new Date() } });
    await leaveQueues(tx, userId);
    await revokeSessions(tx, userId);
  });
  await audit(null, "account.deactivate", `Customer ${userId}`, "active → paused · by the customer");
}

async function freeRef(tx: Tx): Promise<string> {
  for (;;) {
    const ref = makeRef("WRF");
    const [refund, txn] = await Promise.all([
      tx.walletRefund.findUnique({ where: { ref }, select: { id: true } }),
      tx.transaction.findUnique({ where: { ref }, select: { id: true } }),
    ]);
    if (!refund && !txn) return ref;
  }
}

async function freeTxnRef(tx: Tx, prefix: string): Promise<string> {
  for (;;) {
    const ref = makeRef(prefix);
    if (!(await tx.transaction.findUnique({ where: { ref }, select: { id: true } }))) return ref;
  }
}

/**
 * Delete: refunds the service balance (WalletRefund, PENDING until Finance — or, once the
 * Razorpay keys exist, the gateway — pays it), forfeits promotional credit, erases personal
 * details and signs out everywhere. The caller has already checked the OTP or password.
 */
export async function deleteAccount(userId: string) {
  const result = await db.$transaction(async (tx) => {
    await lockKey(tx, `consult:${userId}`);
    if (await openConsultation(tx, userId)) throw conflict(CONSULT_OPEN);
    if (await openDispute(tx, userId)) throw conflict(DISPUTE_OPEN);

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    const refundAmount = Math.max(0, wallet?.service ?? 0);
    const forfeited = Math.max(0, wallet?.promo ?? 0);

    let refund: { ref: string; amount: number; method: string } | null = null;
    if (refundAmount > 0) {
      const ref = await freeRef(tx);
      const method = await refundMethod(tx, userId);
      await tx.walletRefund.create({ data: { ref, userId, amount: refundAmount, reason: "ACCOUNT_DELETION", method } });
      // Same reference on the ledger line, so the refund can be traced from either side.
      await tx.transaction.create({
        data: { userId, type: "Refund to original payment method", ref, bucket: "Service", amount: -refundAmount },
      });
      refund = { ref, amount: refundAmount, method };
    }
    if (forfeited > 0) {
      await tx.transaction.create({
        data: { userId, type: "Promotional credit forfeited", ref: await freeTxnRef(tx, "FFT"), bucket: "Promotional", amount: -forfeited },
      });
    }
    if (wallet) await tx.wallet.update({ where: { userId }, data: { service: 0, promo: 0, promoExpiresAt: null, held: 0 } });

    // Erase personal details. Clearing the mobile number and email frees them for a new account.
    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_NAME,
        initials: DELETED_INITIALS,
        email: null,
        phone: null,
        passwordHash: null,
        firstName: null,
        lastName: null,
        gender: null,
        birthDate: null,
        birthTime: null,
        birthPlace: null,
        city: null,
        state: null,
        photoUrl: null,
        pausedAt: null,
        deletedAt: new Date(),
        active: false,
      },
    });
    // Sign-in codes are keyed by the mobile number.
    if (user.phone) await tx.otpCode.deleteMany({ where: { phone: user.phone } });
    // Published reviews carry a short form of the customer's name.
    const consultIds = (await tx.consultation.findMany({ where: { customerId: userId }, select: { id: true } })).map((c) => c.id);
    if (consultIds.length) await tx.review.updateMany({ where: { consultationId: { in: consultIds } }, data: { customerName: DELETED_NAME } });
    // Future bookings go back to the astrologer as open time.
    await tx.availabilitySlot.updateMany({
      where: { customerId: userId, state: "BOOKED", date: { gte: new Date(istDateKey(new Date()) + "T00:00:00Z") } },
      data: { state: "OPEN", customerId: null, detail: null },
    });
    // The welcome free call stays with the (hashed) number, unlinked: signing up again with it
    // never grants a new one, and an unused one is linked to the new account instead.
    await tx.welcomeBenefit.updateMany({ where: { userId }, data: { userId: null } });
    await leaveQueues(tx, userId);
    await revokeSessions(tx, userId);
    await tx.dataRequest.create({ data: { userId, kind: "delete", status: "DONE" } });
    return { refund, forfeited, photoUrl: user.photoUrl };
  });

  // The uploaded photo file goes once the database no longer points at it.
  await deleteMedia(result.photoUrl);
  await audit(
    null,
    "account.delete",
    `Customer ${userId}`,
    `Deleted by the customer · ${result.refund ? `refund ${result.refund.ref} ${rupee(result.refund.amount)} pending` : "no refund due"}` +
      (result.forfeited ? ` · ${rupee(result.forfeited)} promotional credit forfeited` : ""),
  );
  return { refund: result.refund, forfeited: result.forfeited, refundTimeline: REFUND_TIMELINE };
}
