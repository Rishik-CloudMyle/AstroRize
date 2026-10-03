// Shapes of the data the website works with. When the real Node API is ready,
// it should return objects in these shapes so the pages don't need to change.

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
  queue: { position: number; waiting: number; capacity: number; eta: string };
  poll: { question: string; options: { label: string; pct: number }[] };
  chat: { who: string; text: string }[];
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
