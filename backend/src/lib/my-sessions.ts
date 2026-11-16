import { createHmac, timingSafeEqual } from "node:crypto";
import type { Consultation } from "../generated/prisma/client.ts";
import { config } from "../config.ts";

// The customer's own paid consultations ("My consultations"): which sessions count, how a recording
// is described to the customer, and the short-lived signed token the in-app player streams with.
// Client decision, 16 Nov 2026: the customer may play their own paid-session recordings and read
// their paid-chat transcripts inside the app (playback only, no download); Super Admin still can.

/** Sessions the customer sees: really billed and paid in money — not the free minutes, welcome or free replacement calls. */
export const PAID_SESSION_WHERE = {
  billingMode: "PAID",
  kind: { not: "WELCOME" },
  status: "ENDED",
  billingStartedAt: { not: null },
  total: { gt: 0 },
} as const;

/** Left to finish uploading and being closed before an ended call's recording is called unavailable. */
const PROCESSING_MS = 6 * 60_000;

export type RecordingState =
  /** playable */
  | "ready"
  /** playable, but the take ended early (the recording browser stopped sending) */
  | "partial"
  /** the call is still going / its audio is still arriving */
  | "processing"
  /** deleted after the retention period */
  | "deleted"
  /** consent was given but no usable audio exists */
  | "unavailable"
  /** the consultation was never recorded (chat, or before recording began) */
  | "none"
  /** customer playback is switched off in Config */
  | "off";

interface TakeRow {
  id: string;
  status: string;
  storageKey: string | null;
  durationMs: number;
  startedAt: Date;
}

/** The playable takes of a call in order, and the state to show. */
export function recordingOf(c: Pick<Consultation, "mode" | "kind" | "status" | "endedAt" | "customerRecordingConsentAt">, takes: TakeRow[], enabled: boolean, now = new Date()) {
  const audio = c.kind === "INSTANT" || c.mode === "VOICE" || c.mode === "VIDEO";
  if (!audio) return { state: "none" as RecordingState, parts: [] };
  if (!enabled) return { state: "off" as RecordingState, parts: [] };
  const playable = takes
    .filter((t) => (t.status === "READY" || t.status === "PARTIAL") && !!t.storageKey)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const parts = playable.map((t) => ({ id: t.id, durationSeconds: Math.round(t.durationMs / 1000), partial: t.status === "PARTIAL", startedAt: t.startedAt.toISOString() }));
  let state: RecordingState;
  if (playable.length) state = playable.every((t) => t.status === "READY") ? "ready" : "partial";
  else if (takes.some((t) => t.status === "RECORDING") || c.status === "ACTIVE" || (!!c.customerRecordingConsentAt && !takes.length && !!c.endedAt && now.getTime() - c.endedAt.getTime() < PROCESSING_MS)) state = "processing";
  else if (takes.some((t) => t.status === "DELETED")) state = "deleted";
  else if (!c.customerRecordingConsentAt) state = "none";
  else state = "unavailable";
  return { state, parts };
}

// ── The stream token ──
// Bound to one customer and one recording, valid for a couple of minutes (the player asks for a new
// one while it plays). The audio route also needs the signed-in session, so a copied link is useless
// to anyone else and to the same person a few minutes later.

const sign = (body: string) => createHmac("sha256", `${config.sessionSecret}:recording-stream`).update(body).digest("base64url");

export function streamToken(userId: string, recordingId: string, ttlSeconds: number, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + ttlSeconds * 1000;
  const body = Buffer.from(JSON.stringify({ u: userId, r: recordingId, e: expiresAt })).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt };
}

/** The token's claims, or null when it is malformed, forged or expired. */
export function readStreamToken(token: unknown, now = Date.now()): { userId: string; recordingId: string } | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; r?: unknown; e?: unknown };
    if (typeof c.u !== "string" || typeof c.r !== "string" || typeof c.e !== "number" || c.e < now) return null;
    return { userId: c.u, recordingId: c.r };
  } catch {
    return null;
  }
}
