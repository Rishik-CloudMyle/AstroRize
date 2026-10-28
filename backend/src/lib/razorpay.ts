import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";

// Razorpay's REST API (https://razorpay.com/docs/api/), called with fetch and Basic auth
// (key id : key secret). Amounts at Razorpay are in paise; ours are whole rupees.
// The key secret never leaves this server: it is not logged, and errors carry only
// Razorpay's own description of what went wrong.

const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 20_000;

/** Both keys are set: recharges can go through Razorpay. */
export const razorpayConfigured = () => !!(config.razorpayKeyId && config.razorpayKeySecret);

/** "test" for rzp_test_ keys, "live" for rzp_live_ ones. */
export const razorpayMode = () => (config.razorpayKeyId.startsWith("rzp_live_") ? "live" : "test");

/** Razorpay answered with an error (or couldn't be reached). `description` is safe to show to staff. */
export class RazorpayError extends Error {
  status: number;
  code: string;
  description: string;
  constructor(status: number, code: string, description: string) {
    super(`Razorpay ${status} ${code}: ${description}`);
    this.status = status;
    this.code = code;
    this.description = description;
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
  if (!razorpayConfigured()) throw new RazorpayError(0, "NOT_CONFIGURED", "Razorpay keys aren't configured.");
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: { authorization: `Basic ${auth}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RazorpayError(0, "NETWORK", "Couldn't reach Razorpay.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (a gateway error page): handled below.
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; description?: string } } | null)?.error;
    throw new RazorpayError(res.status, err?.code ?? "ERROR", err?.description ?? `Razorpay answered ${res.status}.`);
  }
  return json as T;
}

export interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
}

export interface RzpPayment {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  order_id: string | null;
  method: string | null;
  captured: boolean;
  amount_refunded: number;
  error_code: string | null;
  error_description: string | null;
  notes?: Record<string, string> | [];
  created_at: number;
  /** How it was paid: the UPI ID, the netbanking bank code, the wallet, and (expanded) the card. */
  vpa?: string | null;
  bank?: string | null;
  wallet?: string | null;
  card?: { network?: string | null; last4?: string | null; type?: string | null } | null;
}

export interface RzpRefund {
  id: string;
  entity: "refund";
  amount: number;
  currency: string;
  payment_id: string;
  /** pending | processed | failed */
  status: string;
  notes?: Record<string, string> | [];
  created_at: number;
}

export const toPaise = (rupees: number) => Math.round(rupees * 100);

export function createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return call<RzpOrder>("POST", "/orders", { amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes });
}

export const fetchPayment = (paymentId: string) => call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);

/** A payment with its card's network and last 4 digits, for the customer's receipt (answers within `timeoutMs`). */
export const fetchPaymentDetail = (paymentId: string, timeoutMs: number) =>
  call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}?expand[]=card`, undefined, timeoutMs);

/** Every payment attempt made against an order (failed ones included). */
export const fetchOrderPayments = (orderId: string) =>
  call<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`).then((r) => r.items ?? []);

/** Captures an authorized payment (only needed when the account doesn't capture automatically). */
export const capturePayment = (paymentId: string, amountPaise: number) =>
  call<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" });

/** A (partial) refund of a captured payment, at Razorpay's normal speed. */
export const createRefund = (paymentId: string, input: { amountPaise: number; receipt: string; notes: Record<string, string> }) =>
  call<RzpRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: input.amountPaise,
    speed: "normal",
    receipt: input.receipt,
    notes: input.notes,
  });

/** Every refund made on a payment (to find one whose answer was lost, by its receipt). */
export const fetchPaymentRefunds = (paymentId: string) =>
  call<{ items: (RzpRefund & { receipt?: string | null })[] }>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds`).then((r) => r.items ?? []);

export const fetchRefund = (refundId: string) => call<RzpRefund>("GET", `/refunds/${encodeURIComponent(refundId)}`);

/** Constant-time comparison of two hex signatures (false for different lengths or non-hex). */
function sameHex(expected: string, given: string): boolean {
  if (typeof given !== "string" || !/^[0-9a-f]+$/i.test(given)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout's success signature: HMAC-SHA256("<order_id>|<payment_id>", key secret), hex. */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string, secret = config.razorpayKeySecret): boolean {
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return sameHex(expected, signature);
}

/** A webhook's X-Razorpay-Signature: HMAC-SHA256(raw request body, webhook secret), hex. */
export function webhookSignatureValid(rawBody: Buffer, signature: string | undefined, secret = config.razorpayWebhookSecret): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameHex(expected, signature);
}

/** Reads one of our notes back from a Razorpay entity (Razorpay sends [] when there are none). */
export function noteOf(entity: { notes?: Record<string, string> | [] }, key: string): string | null {
  const notes = entity.notes;
  if (!notes || Array.isArray(notes)) return null;
  const v = notes[key];
  return typeof v === "string" ? v : null;
}
