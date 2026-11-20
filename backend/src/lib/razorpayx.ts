import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";

// RazorpayX Payouts (https://razorpay.com/docs/x/payouts/): money goes from AstroRize's RazorpayX
// account to an astrologer's bank account or UPI id. Three calls: a Contact (the person), a Fund
// Account (their bank/UPI), then a Payout. Amounts at RazorpayX are in paise; ours are rupees.
//
// Until RAZORPAYX_ACCOUNT_NUMBER is set this runs in SIMULATION ("mock"): no network, nothing moves,
// ids are made up, and a payout settles a few seconds later — paid, unless the test account is
// the failing one (UPI failure@razorpay, or a bank account ending 0000). The same screens and
// states work in every mode, so Finance can try the whole flow before the real keys arrive.

const API = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 20_000;
/** How long a simulated payout stays "processing" before it settles. */
export const MOCK_SETTLE_MS = 6_000;

export type PayoutMode = "mock" | "test" | "live";

/** "mock" with no RazorpayX account number; else "test"/"live" by the key. */
export function payoutMode(): PayoutMode {
  if (!config.razorpayxAccountNumber || !config.razorpayxKeyId || !config.razorpayxKeySecret) return "mock";
  return config.razorpayxKeyId.startsWith("rzp_live_") ? "live" : "test";
}

export class RazorpayXError extends Error {
  status: number;
  code: string;
  description: string;
  constructor(status: number, code: string, description: string) {
    super(`RazorpayX ${status} ${code}: ${description}`);
    this.status = status;
    this.code = code;
    this.description = description;
  }
  /** We couldn't tell whether RazorpayX got it: safe to try again with the same idempotency key. */
  get transient() {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const auth = Buffer.from(`${config.razorpayxKeyId}:${config.razorpayxKeySecret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        authorization: `Basic ${auth}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(idempotencyKey ? { "X-Payout-Idempotency": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RazorpayXError(0, "NETWORK", "Couldn't reach RazorpayX.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // A gateway error page: handled below.
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; description?: string } } | null)?.error;
    throw new RazorpayXError(res.status, err?.code ?? "ERROR", err?.description ?? `RazorpayX answered ${res.status}.`);
  }
  return json as T;
}

export interface FundTarget {
  name: string;
  /** Used to tell the person apart at RazorpayX (our astrologer id). */
  reference: string;
  bank?: { accountNumber: string; ifsc: string };
  upi?: string;
}

/** Makes (or fakes) the RazorpayX Contact and Fund Account for one set of payout details. */
export async function createFundAccount(t: FundTarget): Promise<{ contactId: string; fundAccountId: string }> {
  if (payoutMode() === "mock") return { contactId: `cont_mock_${t.reference}`, fundAccountId: `fa_mock_${randomBytes(5).toString("hex")}` };
  const contact = await call<{ id: string }>("POST", "/contacts", { name: t.name, type: "vendor", reference_id: t.reference });
  const fund = await call<{ id: string }>(
    "POST",
    "/fund_accounts",
    t.upi
      ? { contact_id: contact.id, account_type: "vpa", vpa: { address: t.upi } }
      : { contact_id: contact.id, account_type: "bank_account", bank_account: { name: t.name, ifsc: t.bank!.ifsc, account_number: t.bank!.accountNumber } },
  );
  return { contactId: contact.id, fundAccountId: fund.id };
}

/** RazorpayX's own states, folded into ours. */
export type Outcome = { state: "PROCESSING" | "PROCESSED" | "FAILED" | "REVERSED"; utr: string | null; reason: string | null };

export interface RxPayout {
  id: string;
  status: string;
  utr?: string | null;
  failure_reason?: string | null;
  status_details?: { description?: string; reason?: string } | null;
}

export function outcomeOf(p: Pick<RxPayout, "status" | "utr" | "failure_reason" | "status_details">): Outcome {
  const reason = p.failure_reason || p.status_details?.description || p.status_details?.reason || null;
  switch (p.status) {
    case "processed":
      return { state: "PROCESSED", utr: p.utr ?? null, reason: null };
    case "reversed":
      return { state: "REVERSED", utr: p.utr ?? null, reason: reason ?? "The bank returned the money." };
    case "rejected":
    case "cancelled":
    case "failed":
      return { state: "FAILED", utr: null, reason: reason ?? `RazorpayX ${p.status} the payout.` };
    default:
      // queued | pending | processing
      return { state: "PROCESSING", utr: null, reason: null };
  }
}

export interface SendInput {
  fundAccountId: string;
  amount: number;
  mode: "IMPS" | "UPI";
  reference: string;
  narration: string;
  idempotencyKey: string;
  /** Simulation only: what the pretend bank does with it. */
  mockFails?: boolean;
}

/** Sends one payout. In simulation it comes back "processing" and settles later (see settleMock). */
export async function sendPayout(i: SendInput): Promise<RxPayout> {
  if (payoutMode() === "mock") {
    return { id: `pout_mock_${randomBytes(6).toString("hex")}`, status: "processing", utr: null, failure_reason: i.mockFails ? "MOCK_FAIL" : null };
  }
  return call<RxPayout>(
    "POST",
    "/payouts",
    {
      account_number: config.razorpayxAccountNumber,
      fund_account_id: i.fundAccountId,
      amount: Math.round(i.amount * 100),
      currency: "INR",
      mode: i.mode,
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: i.reference,
      narration: i.narration.slice(0, 30),
    },
    i.idempotencyKey,
  );
}

export const fetchPayout = (id: string) => call<RxPayout>("GET", `/payouts/${encodeURIComponent(id)}`);

/** What a pretend bank decides for a simulated payout. */
export function settleMock(failing: boolean, payoutId: string): RxPayout {
  return failing
    ? { id: payoutId, status: "failed", failure_reason: "Beneficiary bank rejected the transfer (test account)." }
    : { id: payoutId, status: "processed", utr: `MOCK${payoutId.slice(-8).toUpperCase()}` };
}

function sameHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** RazorpayX signs the exact bytes it sends (header X-Razorpay-Signature). */
export function xWebhookSignatureValid(rawBody: Buffer, signature: string | undefined): boolean {
  if (!config.razorpayxWebhookSecret || !signature) return false;
  return sameHex(createHmac("sha256", config.razorpayxWebhookSecret).update(rawBody).digest("hex"), signature);
}
