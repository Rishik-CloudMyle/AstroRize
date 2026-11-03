import { apiGet } from "@/lib/api/server";

// Astrologers' own price changes (client decision, Oct 2026): a decrease goes live at once
// (APPLIED); an increase waits as PENDING until staff with `price.approve` on the Astrologer
// lifecycle page approve or reject it. The astrologer can withdraw a waiting one.

export type PriceChangeStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "WITHDRAWN";

export interface PriceChange {
  id: string;
  /** ₹/min, voice */
  from: number;
  to: number;
  kind: "increase" | "decrease";
  status: PriceChangeStatus;
  /** ISO time, and "22 Oct 2026" */
  requestedAt: string;
  requestedOn: string;
  decidedAt: string | null;
  decidedOn: string | null;
  /** Staff member who decided it, or the astrologer for a withdrawal */
  decidedBy: string | null;
  /** Why it was rejected (the astrologer sees it) */
  reason: string | null;
}

export interface PriceChangeAstrologer {
  id: string;
  name: string;
  photo: string;
}

/** One increase in the lifecycle queue. */
export interface PriceRequest extends PriceChange {
  astrologer: PriceChangeAstrologer & { slug: string; price: number };
  /** How long it has waited: "4 min", "6h", "2d" */
  waiting: string;
  lastChangedOn: string | null;
  /** Why it can't be approved as things stand (e.g. the price moved), or null */
  problem: string | null;
  /** That astrologer's recent decided changes, newest first */
  history: PriceChange[];
}

export interface PriceRequests {
  /** The signed-in staff member may approve and reject (price.approve) */
  canDecide: boolean;
  maxIncrease: number;
  /** Oldest first */
  pending: PriceRequest[];
  /** Decided in the last 30 days, newest first */
  recent: (PriceChange & { astrologer: PriceChangeAstrologer })[];
}

export async function getPriceRequests(): Promise<PriceRequests> {
  return apiGet<PriceRequests>("/admin/lifecycle/price-requests");
}

/** Finance's read-only list: the last 30 days, newest first. */
export async function getPriceChanges(): Promise<(PriceChange & { astrologer: PriceChangeAstrologer })[]> {
  const { changes } = await apiGet<{ changes: (PriceChange & { astrologer: PriceChangeAstrologer })[] }>("/admin/finance/price-changes");
  return changes;
}
