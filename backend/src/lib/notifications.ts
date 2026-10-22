import { db } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";

// In-app notifications (the bell) for customers and astrologers. Email and SMS are not connected
// yet; when they are, they hang off `notify` so every notification can also go out by those.

export interface NotificationInput {
  /** e.g. campaign.new | campaign.daily | campaign.expiring | makegood.offered | account.suspended */
  kind: string;
  title: string;
  body: string;
  /** Where tapping it goes, e.g. /offers */
  href?: string | null;
}

type Client = Prisma.TransactionClient | typeof db;

/** One notification for one person. Pass `tx` to write it inside a transaction. */
export async function notify(userId: string, n: NotificationInput, tx: Client = db) {
  await tx.notification.create({
    data: { userId, kind: n.kind, title: n.title.slice(0, 120), body: n.body.slice(0, 500), href: n.href ?? null },
  });
}

/** The same notification for many people (e.g. everyone a new campaign is for). */
export async function notifyMany(userIds: string[], n: NotificationInput, tx: Client = db) {
  if (!userIds.length) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({ userId, kind: n.kind, title: n.title.slice(0, 120), body: n.body.slice(0, 500), href: n.href ?? null })),
  });
}
