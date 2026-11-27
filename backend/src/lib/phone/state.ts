import { db } from "../../db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { getSetting } from "../settings.ts";
import { hangupCall, phoneConfigured, scrub } from "./acefone.ts";

// What the consultation engine needs to know about its phone calls (the calls themselves are run by
// lib/phone-calls.ts).

type Client = Prisma.TransactionClient | typeof db;

export const PSTN_SETTING = "pstn.enabled";
/** How long both phones get to be answered, and how long after a failed attempt the session stays open. */
export const DIAL_SECONDS = 120;
export const RETRY_GRACE_SECONDS = 60;

/** Phone calls are switched on (Super Admin) and the provider's settings are on the server. */
export async function phoneReady() {
  return phoneConfigured() && (await getSetting<boolean>(PSTN_SETTING, true)) !== false;
}

export const latestCall = (client: Client, consultationId: string) => client.phoneCall.findFirst({ where: { consultationId }, orderBy: { createdAt: "desc" } });

export const isLive = (status: string) => status === "DIALING" || status === "ANSWERED";

/** The session must not time out while the phones ring, or just after an attempt failed. */
export async function phoneKeepsOpen(consultationId: string, now = Date.now()) {
  const p = await latestCall(db, consultationId);
  if (!p) return false;
  if (p.status === "DIALING") return now - p.createdAt.getTime() < DIAL_SECONDS * 1000;
  return p.status === "FAILED" && !!p.endedAt && now - p.endedAt.getTime() < RETRY_GRACE_SECONDS * 1000;
}

/** Ends any phone call still up for a consultation (best effort; the sweep tries again). */
export async function hangupCalls(consultationId: string) {
  const live = await db.phoneCall.findMany({ where: { consultationId, status: { in: ["DIALING", "ANSWERED"] } } });
  for (const p of live) {
    try {
      await hangupCall({ ref: p.providerRef, callId: p.providerCallId });
      // A call that was never answered is over now; an answered one is closed by the hang-up webhook.
      if (p.status === "DIALING") await db.phoneCall.updateMany({ where: { id: p.id, status: "DIALING" }, data: { status: "FAILED", endedAt: new Date(), failureReason: "The session ended before the call connected." } });
    } catch (e) {
      console.error(`Hang up ${p.id}:`, scrub(e instanceof Error ? e.message : String(e)));
    }
  }
}
