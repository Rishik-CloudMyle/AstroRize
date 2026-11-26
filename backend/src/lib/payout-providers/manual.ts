import type { PayoutProvider } from "./index.ts";

/** Finance pays from the company current account and records each result (lib/payout-manual.ts). */
export const manualProvider: PayoutProvider = {
  id: "manual",
  label: "Manual bank transfer",
  automatic: false,
  environment: () => "manual",
};
