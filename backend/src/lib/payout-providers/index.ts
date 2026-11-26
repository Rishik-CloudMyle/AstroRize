import { createHash } from "node:crypto";
import { config } from "../../config.ts";
import type { PayoutAccount } from "../../generated/prisma/client.ts";
import { manualProvider } from "./manual.ts";
import { razorpayxProvider } from "./razorpayx.ts";

// How approved money reaches an astrologer. The payout engine (lib/earnings.ts, lib/payouts.ts) works
// out and tracks what is owed and knows nothing about any bank or gateway: it only talks to this
// interface. "manual" (the default): Finance downloads the bank file, transfers from the company
// account and records the UTR. "razorpayx": the money is sent automatically. To add another
// provider, write one file implementing PayoutProvider, list it here and set PAYOUT_PROVIDER.

export type Outcome = { state: "PROCESSING" | "PROCESSED" | "FAILED" | "REVERSED"; utr: string | null; reason: string | null };

export interface SendJob {
  amount: number;
  /** The same key on a repeated attempt means the money is never sent twice. */
  idempotencyKey: string;
  account: PayoutAccount;
}

export interface PayoutProvider {
  id: "manual" | "razorpayx";
  label: string;
  /** true: the provider moves the money itself. false: Finance transfers it and records it here. */
  automatic: boolean;
  environment(): "manual" | "mock" | "test" | "live";
  /** Automatic providers only: send one transfer. Throws PayoutProviderError. */
  send?(job: SendJob): Promise<{ reference: string; mode: string; outcome: Outcome }>;
  /** Automatic providers only: what happened to a transfer on its way (null: nothing new yet). */
  check?(reference: string, ageMs: number, account: PayoutAccount | null): Promise<Outcome | null>;
}

export class PayoutProviderError extends Error {
  /** We can't tell whether the provider got it: safe to try again with the same idempotency key. */
  transient: boolean;
  constructor(message: string, transient = false) {
    super(message);
    this.transient = transient;
  }
}

/** Anything that changes where money would go changes this. */
export const fingerprintOf = (kind: string, holder: string, number: string) => createHash("sha256").update(`${kind}|${holder}|${number}`).digest("hex").slice(0, 32);

export function payoutProvider(): PayoutProvider {
  return config.payoutProvider === "razorpayx" ? razorpayxProvider : manualProvider;
}

export const providerView = () => {
  const p = payoutProvider();
  return { id: p.id, label: p.label, automatic: p.automatic, mode: p.environment() };
};
