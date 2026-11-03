"use client";

// Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
// A third-party script, so it is loaded only when the customer actually pays, never on page load.
// The checkout window shows every method enabled on the Razorpay account (UPI, cards,
// netbanking, wallets). Only the key id comes from our API; the secret never reaches the browser.

const SRC = "https://checkout.razorpay.com/v1/checkout.js";
const LOAD_TIMEOUT_MS = 20_000;

export const CHECKOUT_LOAD_FAILED = "We couldn't open the secure payment window. Check your connection (or an ad blocker) and try again.";

interface CheckoutSuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface CheckoutFailure {
  error?: { description?: string; reason?: string; metadata?: { payment_id?: string } };
}

interface CheckoutInstance {
  open(): void;
  close(): void;
  on(event: "payment.failed", handler: (r: CheckoutFailure) => void): void;
}

type CheckoutConstructor = new (options: Record<string, unknown>) => CheckoutInstance;

declare global {
  interface Window {
    Razorpay?: CheckoutConstructor;
  }
}

let loading: Promise<CheckoutConstructor> | null = null;

/** Loads checkout.js once. A failed load can be tried again (the next call starts over). */
export function loadCheckout(): Promise<CheckoutConstructor> {
  if (typeof window === "undefined") return Promise.reject(new Error(CHECKOUT_LOAD_FAILED));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  loading = new Promise<CheckoutConstructor>((resolve, reject) => {
    document.querySelector(`script[src="${SRC}"]`)?.remove();
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error(CHECKOUT_LOAD_FAILED));
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    script.onload = () => {
      clearTimeout(timer);
      if (window.Razorpay) resolve(window.Razorpay);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

/** The order our API created (POST /wallet/recharge). */
export interface RechargeOrder {
  provider: "razorpay";
  keyId: string;
  orderId: string;
  currency: string;
  totalPaise: number;
  amount: number;
  gst: number;
  bonus: number;
  cashback: number;
  cashbackFrom: string | null;
  total: number;
  prefill: { name: string; email: string; contact: string };
}

/**
 * The order Checkout lists methods in (Razorpay "config.display"): UPI, cards, netbanking and
 * wallets first, then everything else the Razorpay account has enabled (EMI, Pay Later…), so
 * nothing is hidden. Which UPI ways show is Razorpay's call under NPCI's rules (UPI "collect"
 * ended 28 Feb 2026 except where exempt), not ours: desktop gets the QR code; Android browsers the
 * QR code and UPI apps; iPhone browsers also "Pay with UPI ID / Number". Asking for more flows
 * here doesn't change that (checked in test mode), so we don't.
 */
const CHECKOUT_DISPLAY = {
  display: {
    sequence: ["upi", "card", "netbanking", "wallet"],
    preferences: { show_default_blocks: true },
  },
};

export type CheckoutResult =
  | { kind: "paid"; response: CheckoutSuccess }
  /** Closed without paying. `failure`: the last failed attempt's reason, if there was one. */
  | { kind: "closed"; failure: string | null };

/**
 * Opens Checkout for the order and waits until it's paid or closed. A failed attempt keeps the
 * window open (Razorpay offers "Retry" there); its reason is returned if the customer then closes it.
 */
export async function openCheckout(order: RechargeOrder): Promise<CheckoutResult> {
  const Razorpay = await loadCheckout();
  return new Promise<CheckoutResult>((resolve) => {
    let failure: string | null = null;
    let settled = false;
    const finish = (r: CheckoutResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.totalPaise,
      currency: order.currency,
      name: "AstroRize",
      description: `Wallet recharge ₹${order.amount.toLocaleString("en-IN")}`,
      prefill: order.prefill,
      theme: { color: "#f59e0b" },
      config: CHECKOUT_DISPLAY,
      modal: {
        // Asks before closing a payment in progress, so a UPI approval isn't abandoned by accident.
        confirm_close: true,
        ondismiss: () => finish({ kind: "closed", failure }),
      },
      handler: (response: CheckoutSuccess) => finish({ kind: "paid", response }),
    });
    rzp.on("payment.failed", (r) => {
      failure = r.error?.description?.trim() || "The payment didn't go through.";
    });
    rzp.open();
  });
}
