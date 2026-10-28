import { apiGet } from "@/lib/api/server";

// Wallet recharges on the Finance page (GET /admin/payments): Razorpay order and payment ids,
// method, status, failure reason and what was refunded. Old "mock" ones predate Razorpay.

export interface AdminPayment {
  orderId: string;
  /** pay_… once paid through Razorpay. */
  paymentId: string | null;
  provider: string;
  method: string | null;
  status: "CREATED" | "PAID" | "FAILED";
  failureReason: string | null;
  customer: string;
  amount: number;
  gst: number;
  total: number;
  bonus: number;
  cashback: number;
  refunded: number;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminPayments {
  razorpay: { connected: boolean; mode: "test" | "live" | null };
  payments: AdminPayment[];
}

export async function getPayments(): Promise<AdminPayments> {
  return apiGet<AdminPayments>("/admin/payments");
}
