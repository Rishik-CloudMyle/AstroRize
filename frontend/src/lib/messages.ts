// Astrologer Messenger: free direct messages between a customer and an astrologer — text,
// photos and short videos.

/** How often an open conversation checks for new messages. */
export const MESSAGE_POLL_MS = 10_000;
export const MAX_MESSAGE_LENGTH = 1000;

export interface MessengerAstrologer {
  id: string;
  slug: string;
  name: string;
  initials: string;
  photo: string;
}

/** A photo or video sent in a customer–astrologer conversation. `url` works only for the two of them. */
export interface MessageAttachment {
  kind: "image" | "video";
  url: string;
}

export interface MessengerMessage {
  id: string;
  /** "blocked" = the notice shown when a message contained contact details */
  from: "me" | "astrologer" | "blocked";
  /** May be "" when only a photo or video was sent. */
  text: string;
  attachment: MessageAttachment | null;
  at: string;
}

/** GET /api/messages */
export interface ConversationSummary {
  id: string;
  astrologer: MessengerAstrologer;
  preview: string;
  lastAt: string | null;
  lastFrom: "me" | "astrologer" | null;
  /** Astrologer replies since the customer last opened the conversation (saved on the server). */
  unread: number;
}

/** A conversation the Astrorize team started with the customer ("Astrorize support"), in GET /api/messages. */
export interface SupportSummary {
  id: string;
  /** Always "Astrorize support" for a customer. */
  title: string;
  subject: string | null;
  preview: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

export interface SupportMessage {
  id: string;
  from: "me" | "team";
  /** "Neha · Astrorize support"; null for my own messages. */
  author: string | null;
  text: string;
  at: string;
}

/** GET /api/messages/support/:id (opening it marks it read) */
export interface SupportDetail {
  id: string;
  title: string;
  subject: string | null;
  messages: SupportMessage[];
}

/** Longest message in a conversation with the Astrorize team. */
export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;

/** GET /api/messages/search/astrologers?q= — listed astrologers to start a conversation with. */
export interface AstrologerMatch extends MessengerAstrologer {
  skills: string[];
  presence: "on" | "busy" | "live" | "off";
}

/** GET /api/messages/:slug */
export interface ConversationDetail {
  astrologer: MessengerAstrologer;
  conversation: { id: string; messages: MessengerMessage[] } | null;
  /** False when there is no conversation yet and none may be started (see `notice`). */
  canMessage: boolean;
  notice: string | null;
}

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });
const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
const dayMonth = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: IST }).replace("Sept", "Sep");

/** "18:10" today, "Yesterday" / "11 Oct" before (India time). With `withTime`, the time is added to older days. */
export function messageTime(iso: string, withTime = false, now = new Date()): string {
  const d = new Date(iso);
  const today = dayKey(now);
  if (dayKey(d) === today) return time(d);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const day = dayKey(d) === yesterday ? "Yesterday" : dayMonth(d);
  return withTime ? `${day} · ${time(d)}` : day;
}

/** "Raghav" from "Pt. Raghav Joshi" (titles dropped), as the app addresses astrologers. */
export function givenName(name: string): string {
  return name.replace(/^(Pt\.|Dr\.|Acharya|Pandit)\s+/i, "").split(" ")[0] ?? name;
}
