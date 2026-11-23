import { db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { rupee } from "./format.ts";

// Promotional credit lives for Config wallet.promo.validity_months after it is granted (a recharge
// bonus or cashback, a campaign credit, a support credit). One expiry date covers the whole
// promotional balance: each new grant moves it out to "now + validity" if that is later. Once the
// date has passed, a sweep takes the unused promotional balance off the wallet and writes a ledger
// line ("Promo expired"), so what the wallet shows and what the ledger says always agree.

type Tx = Prisma.TransactionClient | typeof db;

const MONTHS_DEFAULT = 12;

async function validityMonths(client: Tx): Promise<number> {
  // Read through the caller's own connection: inside a transaction a second one would wait on it.
  const row = await client.configKey.findUnique({ where: { key: "wallet.promo.validity_months" }, select: { value: true } });
  const n = Math.round(Number(row?.value));
  return Number.isFinite(n) && n >= 1 && n <= 36 ? n : MONTHS_DEFAULT;
}

/** Calendar months after `from`, to the end of that day in India (23:59:59 IST). */
function endOfDayAfter(from: Date, months: number): Date {
  const ist = new Date(from.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(ist.getUTCDate(), last);
  return new Date(Date.UTC(y, m, day, 23, 59, 59) - 5.5 * 3600_000);
}

/** After promotional credit was added to the wallet: its expiry is at least "now + the configured validity". */
export async function stampPromoExpiry(client: Tx, userId: string, now = new Date()) {
  const wallet = await client.wallet.findUnique({ where: { userId }, select: { promo: true, promoExpiresAt: true } });
  if (!wallet || wallet.promo <= 0) return;
  const until = endOfDayAfter(now, await validityMonths(client));
  if (!wallet.promoExpiresAt || wallet.promoExpiresAt < until) {
    await client.wallet.update({ where: { userId }, data: { promoExpiresAt: until } });
  }
}

let counter = 0;

/** Takes expired promotional credit off wallets (never money held for a running session). */
export async function sweepExpiredPromo(now = new Date()) {
  const due = await db.wallet.findMany({ where: { promo: { gt: 0 }, promoExpiresAt: { lt: now } }, select: { userId: true }, take: 100 });
  for (const { userId } of due) {
    const done = await db.$transaction(async (tx) => {
      const w = await tx.wallet.findUnique({ where: { userId } });
      if (!w || w.promo <= 0 || !w.promoExpiresAt || w.promoExpiresAt >= now) return null;
      // Only what isn't held for a session in progress; the rest goes at the next sweep.
      const expire = Math.min(w.promo, Math.max(0, w.service + w.promo - w.held));
      if (expire <= 0) return null;
      const { count } = await tx.wallet.updateMany({ where: { userId, promo: w.promo }, data: { promo: { decrement: expire }, ...(expire === w.promo ? { promoExpiresAt: null } : {}) } });
      if (!count) return null;
      const ref = `EXP-${now.getTime().toString(36).toUpperCase()}${(counter++ % 1296).toString(36).toUpperCase()}`;
      await tx.transaction.create({ data: { userId, type: "Promo expired", ref, bucket: "Promotional", amount: -expire } });
      return { expire, was: w.promoExpiresAt };
    });
    // Recorded after the transaction: the audit log uses its own connection.
    if (done) await audit(null, "wallet.promo.expire", userId, `${rupee(done.expire)} promotional credit expired (${done.was.toISOString().slice(0, 10)})`);
  }
}
