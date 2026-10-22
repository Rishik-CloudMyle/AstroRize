import { apiGet } from "@/lib/api/server";

// Payout holds on the Finance page (GET /admin/payouts/holds): astrologers whose payouts Finance
// has paused. Their earnings keep accruing and join the first batch prepared after the pause ends.

export interface PayoutHold {
  astrologerId: string;
  name: string;
  /** Null on holds made before reasons were recorded. */
  reason: string | null;
  by: string | null;
  /** "22 Oct 2026" */
  since: string | null;
}

export interface PayoutHolds {
  holds: PayoutHold[];
  /** Astrologers who can be paused (not paused now). */
  astrologers: { id: string; name: string }[];
}

export async function getPayoutHolds(): Promise<PayoutHolds> {
  return apiGet<PayoutHolds>("/admin/payouts/holds");
}
