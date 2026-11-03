import { z } from "zod";
import { db } from "../db.ts";
import type { Consultation, ConsultMessage } from "../generated/prisma/client.ts";
import { config } from "../config.ts";
import { conflict, forbidden, notFound } from "./errors.ts";
import { messageText } from "./messaging.ts";
import { flagContactAttempt } from "./contact-flags.ts";
import { contactBlockedNotice, findContactDetails, rateLimit } from "./safety.ts";
import { zegoConfigured, zegoRoom, zegoServerUrl, zegoToken, zegoUserId } from "./zego.ts";

// The inside of a one-to-one consultation: its written chat (every mode has one — the whole
// session for Chat, a side panel for Voice and Video) and the credentials for its voice/video
// room. Only the customer and the astrologer of that consultation ever get either.

export type Party = "CUSTOMER" | "ASTROLOGER";

/** Sessions whose media room may be joined (the customer joins while it is still connecting). */
const MEDIA_STATUSES = ["CONNECTING", "ACTIVE"];
/** Most messages returned in one answer (a 15-minute session stays well under it). */
const PAGE = 200;

/**
 * The consultation, if `party` really is one of its two sides; 403 for anyone else, so neither
 * the chat nor a media token can be had by guessing an id.
 */
export async function consultationFor(id: string, party: Party, partyId: string): Promise<Consultation> {
  const c = await db.consultation.findUnique({ where: { id } });
  if (!c) throw notFound("Consultation not found.");
  const mine = party === "CUSTOMER" ? c.customerId === partyId : c.astrologerId === partyId;
  if (!mine) throw forbidden("This isn't your consultation.");
  return c;
}

/**
 * A line as one side sees it. A blocked message is shown only to the person who tried to send
 * it (as the notice, never the original text).
 */
function lineView(m: ConsultMessage, viewer: Party) {
  const from =
    m.sender === "SYSTEM" ? "system" : m.blocked ? "blocked" : m.sender === viewer ? "me" : viewer === "ASTROLOGER" ? "customer" : "astrologer";
  return { id: m.id, from, text: m.text, at: m.createdAt.toISOString() };
}

const visibleTo = (viewer: Party) => (m: ConsultMessage) => !m.blocked || m.sender === viewer;

/** `?after=<ISO time>`: only what arrived since (inclusive — the caller drops ids it already has). */
const afterSchema = z.iso.datetime().optional().catch(undefined);

/**
 * The conversation so far, oldest first. Readable by the two parties in any state (also after it
 * ended, as their record); `open` says whether new messages can still be sent.
 */
export async function listMessages(c: Consultation, viewer: Party, after: unknown) {
  const since = afterSchema.parse(after);
  const rows = await db.consultMessage.findMany({
    where: { consultationId: c.id, ...(since ? { createdAt: { gte: new Date(since) } } : {}) },
    // The newest page, put back in order below.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE,
  });
  return {
    messages: rows.reverse().filter(visibleTo(viewer)).map((m) => lineView(m, viewer)),
    open: c.status === "ACTIVE",
  };
}

export const consultMessageBody = z.object({ text: messageText });

/**
 * Sends a message while the session is in progress. A consultation is paid, so only phone numbers
 * are kept out (PAID policy, client Nov 2026 — emails, links and the rest may be shared): such a
 * message is never delivered; the sender gets the notice instead (stored as blocked, without the
 * original text). The same rule for the chat of a Chat consultation and the side chat of a voice,
 * video or Instant Call session.
 */
export async function sendMessage(c: Consultation, sender: Party, userId: string, text: string) {
  if (c.status !== "ACTIVE") throw conflict("This consultation has ended — messages can no longer be sent.");
  rateLimit(`consult-chat:${userId}`, 8, 10_000, "You're sending messages too quickly. Wait a few seconds.");
  const found = findContactDetails(text, "PAID");
  const blocked = found.length > 0;
  const message = await db.consultMessage.create({
    data: blocked ? { consultationId: c.id, sender, text: contactBlockedNotice(found, "PAID"), blocked: true } : { consultationId: c.id, sender, text },
  });
  // An off-platform contact attempt: flagged for Trust & reviews (masked).
  if (blocked) await flagContactAttempt({ userId, side: sender, place: "consultation", ref: c.id, kinds: found, text });
  return { blocked, message: lineView(message, sender) };
}

/** What a consultation sends and receives: Chat none; Voice audio; Video and Instant Call both. */
export function mediaWants(c: Pick<Consultation, "mode" | "kind">) {
  if (c.kind === "INSTANT" || c.mode === "VIDEO") return { audio: true, video: true };
  if (c.mode === "VOICE") return { audio: true, video: false };
  return { audio: false, video: false };
}

/** The window each side opens for the session: chat, voice, or video (Instant Call is a video call). */
export function windowOf(c: Pick<Consultation, "mode" | "kind">): "chat" | "voice" | "video" {
  const w = mediaWants(c);
  return w.video ? "video" : w.audio ? "voice" : "chat";
}

/** The two deterministic stream ids of a consultation: each side may publish only its own. */
const streamIds = (id: string) => ({ CUSTOMER: `c_${id}_cust`, ASTROLOGER: `c_${id}_astro` });

/**
 * Credentials to join the session's voice/video room, for one of its two parties. Called again
 * when the token is about to expire (each answer carries a fresh one). Nothing is minted for a
 * chat session, a session that is over, or while ZEGO isn't set up — the reason says which.
 */
export function mediaFor(c: Consultation, party: Party, user: { id: string }, userName: string) {
  const wants = mediaWants(c);
  if (!MEDIA_STATUSES.includes(c.status)) return { available: false as const, reason: "ended", wants };
  if (!wants.audio && !wants.video) return { available: false as const, reason: "chat", wants };
  if (!zegoConfigured()) return { available: false as const, reason: "not_configured", wants };
  const ids = streamIds(c.id);
  const myStreamId = ids[party];
  const peerStreamId = ids[party === "CUSTOMER" ? "ASTROLOGER" : "CUSTOMER"];
  // A consultation taken from a live room has its own private room, never the live's.
  const roomId = c.origin === "LIVE" ? zegoRoom.livePrivate(c.id) : zegoRoom.consult(c.id);
  const userId = zegoUserId(user.id);
  return {
    available: true as const,
    appId: config.zegoAppId,
    server: zegoServerUrl(),
    roomId,
    userId,
    userName,
    token: zegoToken(userId, { roomId, publish: true, streamIds: [myStreamId] }),
    myStreamId,
    peerStreamId,
    wants,
  };
}
