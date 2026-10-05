import { db } from "../db.ts";
import { MAX_SESSION_SECONDS, affordableSeconds, settle } from "./billing.ts";
import { rupee } from "./format.ts";
import { configNumber } from "./settings.ts";
import type { Consultation, Prisma } from "../generated/prisma/client.ts";

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
 * Ends a consultation and takes the single debit, metered by the server clock.
 * Used when the customer ends it on the website and when the astrologer ends it in
 * the portal, so both are charged identically. Safe to call twice.
 */
export async function endConsultation(c: Consultation, endedBy: "user" | "astrologer") {
  if (c.status === "ENDED" || c.status === "CANCELLED") return c;
  const now = new Date();
  const wallet = c.customerId ? await db.wallet.findUnique({ where: { userId: c.customerId } }) : null;
  const releaseHold = (w: typeof wallet) => Math.min(w?.held ?? 0, c.heldAmount);

  if (c.status !== "ACTIVE" || !c.connectedAt) {
    // Never connected: release the hold, charge nothing.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      db.consultation.update({ where: { id: c.id }, data: { status: "CANCELLED", endedAt: now, endReason: endedBy } }),
    ];
    if (wallet) ops.push(db.wallet.update({ where: { userId: wallet.userId }, data: { held: { decrement: releaseHold(wallet) } } }));
    await db.$transaction(ops);
    return db.consultation.findUniqueOrThrow({ where: { id: c.id } });
  }

  const freeSeconds = await configNumber("consult.free_seconds", 60);
  const affordable = c.heldAmount > 0 ? affordableSeconds(c.heldAmount, c.rate, freeSeconds) : MAX_SESSION_SECONDS;
  const cap = Math.min(MAX_SESSION_SECONDS, affordable);
  const connectedSeconds = Math.min(Math.floor((now.getTime() - c.connectedAt.getTime()) / 1000), cap);
  const reason =
    c.heldAmount > 0 && connectedSeconds >= affordable ? "exhausted" : connectedSeconds >= MAX_SESSION_SECONDS ? "cap" : endedBy;
  const s = settle({
    connectedSeconds,
    rate: c.rate,
    freeSeconds,
    held: c.heldAmount > 0 ? c.heldAmount : Number.MAX_SAFE_INTEGER,
    promo: wallet?.promo ?? 0,
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.consultation.update({
      where: { id: c.id },
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
    }),
    db.astrologer.update({ where: { id: c.astrologerId }, data: { consults: { increment: 1 } } }),
  ];
  if (wallet) {
    ops.push(
      db.wallet.update({
        where: { userId: wallet.userId },
        data: { held: { decrement: releaseHold(wallet) }, promo: { decrement: s.promoUsed }, service: { decrement: s.serviceUsed } },
      }),
    );
    if (s.total > 0) {
      const bucket = s.promoUsed > 0 ? `Promo ${rupee(s.promoUsed)} + Service ${rupee(s.serviceUsed)}` : "Service";
      ops.push(db.transaction.create({ data: { userId: wallet.userId, type: "Consultation", ref: c.ref, bucket, amount: -s.total } }));
    }
  }
  if (s.billedMinutes > 0) {
    const kind = c.kind === "INSTANT" ? "emergency" : c.mode.toLowerCase();
    const mode = c.kind === "INSTANT" ? "Emergency voice" : c.mode[0] + c.mode.slice(1).toLowerCase();
    ops.push(db.earningsLine.create({ data: { astrologerId: c.astrologerId, date: now, sessionRef: c.ref, kind, mode, minutes: s.billedMinutes } }));
  }
  await db.$transaction(ops);
  return db.consultation.findUniqueOrThrow({ where: { id: c.id } });
}

/** Places a hold on the customer's available balance when a consultation connects. */
export async function holdBalance(c: Consultation) {
  if (!c.customerId || c.heldAmount > 0) return 0;
  const wallet = await db.wallet.findUnique({ where: { userId: c.customerId } });
  if (!wallet) return 0;
  const spendable = Math.max(0, wallet.service + wallet.promo - wallet.held);
  await db.$transaction([
    db.wallet.update({ where: { userId: wallet.userId }, data: { held: { increment: spendable } } }),
    db.consultation.update({ where: { id: c.id }, data: { heldAmount: spendable } }),
  ]);
  return spendable;
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
    const affordable = c.heldAmount > 0 ? affordableSeconds(c.heldAmount, c.rate, freeSeconds) : MAX_SESSION_SECONDS;
    const capMs = Math.min(MAX_SESSION_SECONDS, affordable) * 1000;
    if (c.connectedAt && c.connectedAt.getTime() + capMs + GRACE_MS < now) await endConsultation(c, "user");
  }
  const stuck = await db.consultation.findMany({ where: { status: "CONNECTING", requestedAt: { lt: new Date(now - 5 * 60_000) } } });
  for (const c of stuck) await endConsultation(c, "user");
}
