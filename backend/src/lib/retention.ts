import { db } from "../db.ts";
import { audit } from "./audit.ts";
import { getSetting, putSetting } from "./settings.ts";

// How long written conversations are kept: live-room chat (ChatMessage) and astrologer–customer
// messages (Message). The Super Admin sets the period on the Recording page; once a day the
// server sweep deletes anything older. Voice and video are not recorded at all (no calling or
// streaming provider is connected), so there is nothing else to purge.

export const RETENTION_SETTING = "retention.conversations";
export const LAST_PURGE_SETTING = "retention.lastPurge";

export const RETENTION_DEFAULT_DAYS = 3 * 365;
export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 5 * 365;

const DAY_MS = 86_400_000;
const PURGE_EVERY_MS = DAY_MS;

export interface RetentionPolicy {
  days: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PurgeResult {
  at: string;
  cutoff: string;
  chatMessages: number;
  messages: number;
  threads: number;
}

/** The period in force: the saved one if it is valid, otherwise the default. */
export async function retentionPolicy(): Promise<RetentionPolicy> {
  const saved = await getSetting<Partial<RetentionPolicy> | null>(RETENTION_SETTING, null);
  const days = saved?.days;
  const valid = Number.isInteger(days) && days! >= RETENTION_MIN_DAYS && days! <= RETENTION_MAX_DAYS;
  return valid
    ? { days: days!, updatedAt: saved?.updatedAt ?? null, updatedBy: saved?.updatedBy ?? null }
    : { days: RETENTION_DEFAULT_DAYS, updatedAt: null, updatedBy: null };
}

export const lastPurge = () => getSetting<PurgeResult | null>(LAST_PURGE_SETTING, null);

/**
 * Deletes live-room chat and messages older than the retention period, then conversations with
 * nothing left in them and no activity inside the period. Records what it removed (and audits it
 * when anything was removed).
 */
export async function purgeExpiredConversations(now = new Date()): Promise<PurgeResult> {
  const { days } = await retentionPolicy();
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const [chat, messages, threads] = await db.$transaction([
    db.chatMessage.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.message.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    db.messageThread.deleteMany({ where: { updatedAt: { lt: cutoff }, messages: { none: {} } } }),
  ]);
  const result: PurgeResult = { at: now.toISOString(), cutoff: cutoff.toISOString(), chatMessages: chat.count, messages: messages.count, threads: threads.count };
  await putSetting(LAST_PURGE_SETTING, result);
  if (chat.count || messages.count || threads.count) {
    await audit(null, "retention.purge", "conversations", `older than ${days} days · ${chat.count} live chat, ${messages.count} messages, ${threads.count} empty conversations deleted`);
  }
  return result;
}

/** Runs the purge if it hasn't run in the last day. Called every minute by the server sweep. */
export async function purgeDaily(now = new Date()): Promise<PurgeResult | null> {
  const last = await lastPurge();
  if (last && now.getTime() - new Date(last.at).getTime() < PURGE_EVERY_MS) return null;
  return purgeExpiredConversations(now);
}
