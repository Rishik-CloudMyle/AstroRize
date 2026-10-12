import { apiGet } from "@/lib/api/server";

// Customer wallet refunds on the Finance page (GET /admin/refunds). Created when a customer
// deletes their account: the service balance goes back to the original payment method.
// ⚠ Until the Razorpay keys are configured Finance pays these by hand and records the reference;
// once Razorpay is connected they should be refunded automatically through the gateway.

export type RefundStatus = "PENDING" | "PAID" | "FAILED";

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
}

export interface WalletRefunds {
  /** Waiting ones first (oldest first), then paid and failed, newest first. */
  refunds: WalletRefund[];
  pendingTotal: number;
}

export async function getWalletRefunds(): Promise<WalletRefunds> {
  return apiGet<WalletRefunds>("/admin/refunds");
}
