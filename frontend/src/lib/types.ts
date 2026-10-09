// Shapes of the data the website works with, as the Node API returns them.

export type RecognitionKey = "premium" | "trusted" | "proven" | "rising" | "fresh";
export type AvailabilityKey = "on" | "busy" | "live" | "off";
export type ConsultMode = "chat" | "voice" | "video";

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
  /** Wait estimate as a range, e.g. "~6–12 min" */
  eta: string | null;
  about: string;
  photo: string;
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

export interface LiveRoom {
  id: string;
  astrologerId: string;
  topic: string;
  viewers: number;
  thumb: string;
  /** position is this viewer's place in the queue, or the place they would get if they joined. */
  queue: { position: number; inQueue: boolean; waiting: number; capacity: number; eta: string };
  /** myVote is the option this viewer voted for, or null. */
  poll: { question: string; options: { label: string; pct: number }[]; myVote: number | null };
  chat: { who: string; text: string }[];
  /** Announcements from the astrologer, newest first. */
  announcements: { id: string; text: string; at: string }[];
  /** What viewers currently see: normal, a private consult, a compliance monitor, or high-load mode. */
  state: "normal" | "private" | "monitor" | "degrade";
}

export interface Transaction {
  date: string;
  type: string;
  ref: string;
  bucket: string;
  /** Positive = credit, negative = debit, in rupees */
  amount: number;
}

export interface WalletState {
  service: number;
  promo: number;
  promoExpires: string;
  transactions: Transaction[];
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
}
