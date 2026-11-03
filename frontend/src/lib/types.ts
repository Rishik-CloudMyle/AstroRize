// Shapes of the data the website works with, as the Node API returns them.

export type RecognitionKey = "premium" | "trusted" | "proven" | "rising" | "fresh";
export type AvailabilityKey = "on" | "busy" | "live" | "off";
export type ConsultMode = "chat" | "voice" | "video";
/**
 * The ways a NEW consultation can be started. Paid chat is no longer offered (customers chat free
 * in Messages); "chat" stays in ConsultMode only so past chat consultations still show and resume.
 */
export type OfferedMode = Exclude<ConsultMode, "chat">;

export interface Review {
  name: string;
  stars: number;
  when: string;
  text: string;
}

export interface Astrologer {
  id: string;
  slug: string;
  name: string;
  initials: string;
  /** "Male" | "Female", or null when not recorded */
  gender: string | null;
  recognition: RecognitionKey;
  availability: AvailabilityKey;
  skills: string[];
  languages: string[];
  years: number;
  /** null when there are not enough verified consultations yet */
  rating: number | null;
  consults: number;
  /** Effective per-minute rate, in rupees */
  price: number;
  /** Original rate before discount, or null if there is no discount */
  was: number | null;
  /** Instant Call per-minute rate */
  instant: number;
  /** Instant Call rate = price × this multiplier */
  instantMultiplier: number;
  /** A welcome free call can be taken with them right now (taking part, available, today's quota not used up) */
  freeCall: boolean;
  /** Wait estimate as a range, e.g. "~6–12 min" */
  eta: string | null;
  about: string;
  photo: string;
  /** The astrologer's intro video (shown on their profile), or null */
  introVideoUrl: string | null;
  /** The astrologer's gallery photos, in display order (may be empty) */
  gallery: string[];
  /** Count of 5★, 4★, 3★, 2★, 1★ ratings */
  ratingDistribution: [number, number, number, number, number];
  reviews: Review[];
}

export interface Tool {
  id: string;
  name: string;
  sub: string;
  art: string;
  bg: string;
  ink: string;
  scrim: string;
  description: string;
}

/** One line of a live room's feed: a chat message, "<name> joined" or "<name> sent 🪷 Lotus". */
export interface LiveChatLine {
  id: string;
  kind: "message" | "join" | "gift";
  who: string;
  text: string;
  /** The viewer's photo at the time, or null (initials are shown) */
  photo: string | null;
  initials: string;
}

/** A gift sent during the live session. */
export interface LiveGift {
  id: string;
  who: string;
  photo: string | null;
  initials: string;
  icon: string;
  name: string;
  price: number;
  /** ISO time it was sent */
  at: string;
}

/** A gift from the catalogue, as the room's gift panel offers it. */
export interface GiftOption {
  id: string;
  icon: string;
  name: string;
  price: number;
}

export interface LiveRoom {
  id: string;
  astrologerId: string;
  /** The session's title (the topic when no title was set) */
  title: string;
  topic: string;
  category: string | null;
  language: string | null;
  /** How long the astrologer expects to be live, in minutes, or null */
  durationMins: number | null;
  /** ISO time this live session started */
  startedAt: string;
  viewers: number;
  thumb: string;
  /** position is this viewer's place in the queue, or the place they would get if they joined. */
  queue: { position: number; inQueue: boolean; waiting: number; capacity: number; eta: string };
  /** myVote is the option this viewer voted for, or null. */
  poll: { question: string; options: { label: string; pct: number }[]; myVote: number | null };
  /** This session's feed, oldest first. */
  chat: LiveChatLine[];
  /** Recent gifts this session, newest first. */
  gifts: LiveGift[];
  /** Announcements from the astrologer, newest first. */
  announcements: { id: string; text: string; at: string }[];
  /** What viewers currently see: normal, a private consult, a compliance monitor, or high-load mode. */
  state: "normal" | "private" | "monitor" | "degrade";
  /** A private consultation is in session: the live's sound is off for viewers until it ends. */
  audioPaused: boolean;
  /** The signed-in viewer's latest consult request in this live (null: none, or signed out). */
  myRequest: LiveRequestStatus | null;
  /** The signed-in viewer's own private consultation in this room, while it is connecting or in session. */
  private: LivePrivateConsult | null;
}

export interface LiveRequestStatus {
  id: string;
  status: "waiting" | "accepted" | "declined" | "left";
  consultationId: string | null;
  /** queued · connecting · active · ended · cancelled · rejected */
  consultation: string | null;
  /** Why it ended: user · astrologer · unanswered · balance · live_ended · cap · exhausted */
  reason: string | null;
  /** What it cost (₹), once settled */
  charged: number;
  /** How they asked to be consulted */
  mode: ConsultMode | null;
}

/**
 * Billing starts only once BOTH sides have really joined a connected session (voice/video: each is
 * publishing and playing the other's stream; chat: both windows open). Until then nothing is billed
 * and the clock stays at 0; if they don't both join by `joinBy`, the session ends by itself at ₹0.
 */
export interface JoinState {
  /** When billing started (null while waiting for a side to join) */
  billingStartedAt: string | null;
  customerJoined: boolean;
  astrologerJoined: boolean;
  /** While waiting: when the session ends by itself (₹0) if a side hasn't joined */
  joinBy: string | null;
}

/** A private consultation taken from a live room, by the server clock. */
export interface LivePrivateConsult extends JoinState {
  id: string;
  ref: string;
  status: "connecting" | "active";
  /** Chosen when joining the queue */
  mode: ConsultMode;
  /** The window it opens in: the same as a direct consultation in that mode */
  window: ConsultMode;
  /** Locked when the request joined the queue (₹/min) */
  rate: number;
  held: number;
  connectedAt: string | null;
  elapsedSeconds: number;
  /** Seconds not billed at the start */
  freeSeconds: number;
  /** Longest it can run (free time plus what the held balance pays for, at most 15 minutes) */
  maxSeconds: number;
  /** Seconds left to join the call (connecting only) */
  secondsToAnswer: number | null;
  answerWindow: number;
}

export interface Transaction {
  date: string;
  type: string;
  ref: string;
  bucket: string;
  /** Positive = credit, negative = debit, in rupees */
  amount: number;
  /** A recharge line (or its bonus/cashback): the Razorpay order id of its payment page, else null. */
  payment?: string | null;
}

/** The customer's weekly free minutes (GET /wallet → welcome). */
export interface WelcomeBenefit {
  /** granted (a free call fits in this week's minutes) | reserved (one is being requested) | consumed (none left this week) | revoked */
  status: "granted" | "reserved" | "consumed" | "revoked";
  /** This Mon–Sun week's (IST) free minutes (set by AstroRize) */
  weekly: {
    total: number;
    used: number;
    remaining: number;
    /** ISO time they reset: Monday 00:00 IST */
    resetsAt: string;
  };
  /** The one-time joining bonus a new mobile number gets (used after the week's minutes; never resets) */
  joining: { total: number; used: number; remaining: number };
  /** Free minutes the customer can use now: this week's plus the joining bonus */
  remaining: number;
  /** The lengths a free call can be (minutes, smallest first); `fits` = fits in the free minutes left. The whole length is used. */
  lengths: { minutes: number; fits: boolean }[];
  /** True while a free call can be started (at least one length fits). */
  available: boolean;
  /** How long before the free time ends the customer is reminded to add money */
  reminderSeconds: number;
  /** Modes it can be used for */
  modes: ConsultMode[];
}

export interface WalletState {
  service: number;
  promo: number;
  promoExpires: string;
  transactions: Transaction[];
  /** null when this account never had a welcome free call */
  welcome: WelcomeBenefit | null;
}

/** The single debit after a consultation ends (POST /consultations/:id/end). */
export interface Settlement {
  /** Connected seconds, by the server clock */
  elapsed: number;
  billedMins: number;
  rate: number;
  total: number;
  promo: number;
  service: number;
  reason: "user" | "astrologer" | "cap" | "exhausted";
  /** A welcome free call: its first complimentarySeconds were free */
  complimentary: boolean;
  complimentarySeconds: number;
  /** A free replacement call (offered after a complaint) rather than the welcome free call */
  makeGood?: boolean;
  /** A claimed offer's discount: the price before it (null = none), percent off, and ₹ saved. Optional: older API answers. */
  listRate?: number | null;
  discountPct?: number;
  saved?: number;
}

/** A published customer review shown on the home page (GET /reviews/featured). */
export interface FeaturedReview {
  id: string;
  stars: number;
  text: string;
  /** Short form stored with the review, e.g. "A. Mehta" */
  customerName: string;
  astrologerName: string;
  astrologerSlug: string;
  /** chat | voice | video, or null when unknown */
  mode: string | null;
  /** "11 Aug 2026" (IST) */
  date: string;
}
