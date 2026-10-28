"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import type { RechargeOrder } from "@/lib/razorpay-checkout";
import { sessionActions, type RechargeOutcome } from "@/lib/session-store";

// One recharge through Razorpay, shared by the wallet (desktop and phone) and "Add money" during
// a consultation: pay → Razorpay Checkout → verified by our API → the wallet is updated.
// The wallet then opens the payment's own page (/wallet/payment/<order id>: paid, failed or
// pending); "Add money" during a call never leaves the call and shows the result in its sheet.

export type Paid = Extract<RechargeOutcome, { status: "PAID" }>;

export type RechargeState =
  | { stage: "idle" }
  /** Our order is being created, Checkout is open, or the payment is being confirmed. */
  | { stage: "busy" }
  | { stage: "paid"; paid: Paid }
  | { stage: "pending"; order: RechargeOrder; message: string }
  | { stage: "failed"; message: string }
  | { stage: "closed" };

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : "Something went wrong. Check your connection and try again.";

/** Where a recharge's payment page is. */
export const paymentPageHref = (orderId: string) => `/wallet/payment/${encodeURIComponent(orderId)}`;

/**
 * `resultPage`: once Razorpay has an answer (paid, failed, or still being confirmed), open the
 * payment's page — "push" keeps this page in the history, "replace" swaps it out (a step of a
 * flow the customer shouldn't land on again with Back). Omitted: stay here (during a call).
 */
export function useRecharge(onPaid?: (paid: Paid) => void, resultPage?: "push" | "replace") {
  const router = useRouter();
  const [state, setState] = useState<RechargeState>({ stage: "idle" });
  // A second click (or tap) while one payment is open never starts another.
  const busy = useRef(false);

  const settle = useCallback(
    (outcome: RechargeOutcome) => {
      // Closing the checkout without paying stays here (nothing happened to show on a page).
      if (resultPage && outcome.status !== "CLOSED") {
        const href = paymentPageHref(outcome.order.orderId);
        if (resultPage === "replace") router.replace(href);
        else router.push(href);
      }
      if (outcome.status === "PAID") {
        setState({ stage: "paid", paid: outcome });
        onPaid?.(outcome);
      } else if (outcome.status === "PENDING") setState({ stage: "pending", order: outcome.order, message: outcome.message });
      else if (outcome.status === "FAILED") setState({ stage: "failed", message: outcome.message });
      else setState({ stage: "closed" });
    },
    [onPaid, resultPage, router],
  );

  const pay = useCallback(
    async (amount: number) => {
      if (busy.current) return;
      busy.current = true;
      setState({ stage: "busy" });
      try {
        settle(await sessionActions.recharge(amount));
      } catch (e) {
        // The order or the checkout couldn't start: nothing was charged.
        setState({ stage: "failed", message: errorText(e) });
      } finally {
        busy.current = false;
      }
    },
    [settle],
  );

  const check = useCallback(async () => {
    if (busy.current || state.stage !== "pending") return;
    busy.current = true;
    const { order } = state;
    setState({ stage: "busy" });
    try {
      settle(await sessionActions.checkRecharge(order));
    } catch (e) {
      setState({ stage: "pending", order, message: errorText(e) });
    } finally {
      busy.current = false;
    }
  }, [settle, state]);

  const reset = useCallback(() => {
    if (!busy.current) setState({ stage: "idle" });
  }, []);

  return { state, pay, check, reset, busy: state.stage === "busy" };
}

/** What to tell the customer after a recharge that didn't (yet) go through, or null. */
export function rechargeMessage(state: RechargeState): { tone: "error" | "info"; text: string } | null {
  if (state.stage === "failed") {
    return {
      tone: "error",
      text: `${/[.!?]$/.test(state.message) ? state.message : `${state.message}.`} Nothing was added to your wallet — if money left your account, your bank returns it automatically.`,
    };
  }
  if (state.stage === "closed") return { tone: "info", text: "Payment cancelled. You closed the payment window, so nothing was charged." };
  if (state.stage === "pending") return { tone: "info", text: state.message };
  return null;
}

/** The pay button's label for the current stage. */
export function payLabel(state: RechargeState, total: number) {
  if (state.stage === "busy") return "Waiting for payment…";
  if (state.stage === "failed" || state.stage === "closed") return `Try again · pay ${rupee(total)}`;
  return `Pay ${rupee(total)} securely with Razorpay`;
}

const METHOD_NAMES: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI", cardless_emi: "Cardless EMI", paylater: "Pay Later" };

/** "UPI", "Card", "Netbanking"… for Razorpay's method code. */
export const methodName = (method: string) => METHOD_NAMES[method] ?? method;

export const RAZORPAY_TRUST =
  "Payments are processed securely by Razorpay — UPI, cards, netbanking and wallets. Astrorize never sees your card details or UPI PIN.";

/** Small padlock for the trust line. */
export function LockIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
