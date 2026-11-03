import { db } from "../db.ts";
import { shortId } from "./format.ts";
import { maskContact, type ContactKind } from "./contact-filter.ts";
import { afterContactAttempt } from "./account-blocks.ts";

// Off-platform contact attempts (client, Nov 2026): every message stopped by the contact filter —
// free Messages, the chat inside a paid consultation, live-room chat, from either side — is
// flagged for Trust & reviews. A flag is an audit row (action "contact.blocked", the sender as the
// actor, so repeat attempts add up per person); reviewing it is another audit row pointing at it.
// The original text is never stored: only a masked snippet, so staff can see what kind of detail
// it was without ever seeing the number, email or address itself.

export const FLAG_ACTION = "contact.blocked";
export const FLAG_REVIEWED = "contact.flag.reviewed";

/** Where the attempt was made. The audit object is "<place>:<id>" (Messages: "<astrologerId>:<customerId>"). */
export type FlagPlace = "messages" | "consultation" | "live";
export type FlagSide = "CUSTOMER" | "ASTROLOGER";

export const flagObject = (place: FlagPlace, ref: string) => `${place}:${ref}`;

/**
 * Flags one blocked attempt, then warns the sender (or blocks a repeat offender). Never throws: the
 * sender's notice must not depend on it (a failed write is logged).
 */
export async function flagContactAttempt(f: {
  userId: string;
  /** The sender's name (looked up when not given). */
  name?: string;
  side: FlagSide;
  place: FlagPlace;
  ref: string;
  kinds: ContactKind[];
  text: string;
}) {
  if (!f.kinds.length) return;
  try {
    const name = f.name ?? (await db.user.findUnique({ where: { id: f.userId }, select: { name: true } }))?.name ?? "Unknown";
    await db.auditLog.create({
      data: {
        actorId: f.userId,
        actorName: name,
        action: FLAG_ACTION,
        object: flagObject(f.place, f.ref),
        // "customer · phone, address · “Call me on 98•••••••• …”" (read back by parseFlag).
        diff: `${f.side.toLowerCase()} · ${f.kinds.join(", ")} · “${maskContact(f.text)}”`,
        correlation: shortId(),
      },
    });
  } catch (e) {
    console.error("Couldn't record a contact flag:", e);
    return;
  }
  // Warn the sender, and block the account once the attempts add up (lib/account-blocks.ts).
  await afterContactAttempt(f.userId);
}

/** Flags a blocked Messages attempt from its thread (the sender is the thread's customer or astrologer). */
export async function flagThreadAttempt(threadId: string, side: FlagSide, kinds: ContactKind[], text: string) {
  if (!kinds.length) return;
  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    select: { astrologerId: true, customerId: true, customer: { select: { id: true, name: true } }, astrologer: { select: { userId: true, name: true } } },
  });
  if (!thread?.customerId) return;
  const who = side === "CUSTOMER" ? thread.customer : thread.astrologer.userId ? { id: thread.astrologer.userId, name: thread.astrologer.name } : null;
  if (!who) return;
  await flagContactAttempt({
    userId: who.id,
    name: who.name,
    side,
    place: "messages",
    ref: `${thread.astrologerId}:${thread.customerId}`,
    kinds,
    text,
  });
}

const KINDS: ContactKind[] = ["phone", "email", "link", "social", "upi", "address"];

/** A flag's audit row read back. */
export function parseFlag(row: { object: string; diff: string }) {
  const [place, ...rest] = row.object.split(":");
  const [side = "", kinds = "", ...snippet] = row.diff.split(" · ");
  return {
    place: (["messages", "consultation", "live"].includes(place!) ? place : "messages") as FlagPlace,
    ref: rest.join(":"),
    side: (side.toUpperCase() === "ASTROLOGER" ? "ASTROLOGER" : "CUSTOMER") as FlagSide,
    kinds: kinds.split(", ").filter((k): k is ContactKind => (KINDS as string[]).includes(k)),
    snippet: snippet.join(" · ").replace(/^“|”$/g, ""),
  };
}

/** Flags nobody has marked reviewed yet (for the console badge). */
export async function openFlagCount(): Promise<number> {
  const [flags, reviewed] = await Promise.all([
    db.auditLog.count({ where: { action: FLAG_ACTION } }),
    db.auditLog.findMany({ where: { action: FLAG_REVIEWED }, select: { object: true }, distinct: ["object"] }),
  ]);
  return Math.max(0, flags - reviewed.length);
}
