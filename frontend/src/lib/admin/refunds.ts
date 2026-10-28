import { apiGet } from "@/lib/api/server";

// Customer wallet refunds on the Finance page (GET /admin/refunds). Created when a customer
// deletes their account: the service balance goes back to the original payment method — through
// Razorpay (over their Razorpay recharges, newest first) or, for what Razorpay can't cover, by hand.

/** PROCESSING: refunds sent to Razorpay that it hasn't finished yet. */
export type RefundStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED";

export interface RazorpayRefundPart {
  /** pay_… */
  paymentId: string;
  /** rfnd_… (null until Razorpay answered) */
  refundId: string | null;
  amount: number;
  status: "creating" | "pending" | "processed" | "failed";
  error: string | null;
}

export interface WalletRefund {
  ref: string;
  /** Rupees. */
  amount: number;
  /** "Deleted customer · CUS-3K9F2A" */
  customer: string;
  reason: string;
  method: string;
  status: RefundStatus;
  /** ISO time. */
  requestedAt: string;
  processedAt: string | null;
  processedBy: string | null;
  providerRef: string | null;
  note: string | null;
  razorpay: {
    parts: RazorpayRefundPart[];
    processed: number;
    inFlight: number;
    /** Still owed after Razorpay's processed and pending refunds. */
    remaining: number;
    /** How much of `remaining` Razorpay can refund now; the rest is paid by hand. */
    coverable: number;
  };
}

export interface WalletRefunds {
  /** Waiting ones first (oldest first), then paid and failed, newest first. */
  refunds: WalletRefund[];
  pendingTotal: number;
  razorpayConnected: boolean;
}

export async function getWalletRefunds(): Promise<WalletRefunds> {
  return apiGet<WalletRefunds>("/admin/refunds");
}
