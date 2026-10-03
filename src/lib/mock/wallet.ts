import type { WalletState } from "../types";

// Demo wallet and account data from the prototype (07-wallet-account.html + logic.js).
// ⚠ Wallet rules (bonuses, GST, promo expiry) must be confirmed by the client.

export const DEMO_USER = { name: "Sneha R", initials: "SR" };

export const INITIAL_WALLET: WalletState = {
  service: 900,
  promo: 340,
  promoExpires: "12 Sep 2026",
  transactions: [
    { date: "11 Aug 2026", type: "Consultation", ref: "SES-88214", bucket: "Promo ₹160 + Service ₹800", amount: -960 },
    { date: "10 Aug 2026", type: "Recharge", ref: "PAY-77120", bucket: "Service", amount: 1000 },
    { date: "10 Aug 2026", type: "Cashback", ref: "CMP-14", bucket: "Promotional · exp 14 Oct", amount: 100 },
    { date: "4 Aug 2026", type: "Gift sent", ref: "GFT-2201", bucket: "Service", amount: -501 },
  ],
};

export const GST_RATE = 0.18;

/** Recharge amounts and the promotional bonus each one adds. */
export const DENOMINATIONS: { amount: number; bonus: number }[] = [
  { amount: 200, bonus: 10 },
  { amount: 500, bonus: 40 },
  { amount: 1000, bonus: 100 },
  { amount: 2000, bonus: 250 },
  { amount: 5000, bonus: 700 },
  { amount: 10000, bonus: 0 },
];

export const DATA_RIGHTS = [
  {
    key: "download",
    title: "Access my data",
    body: "Download a summary of everything we hold — profile, consultations, wallet ledger and consents.",
    cta: "Request download",
    message: "Request logged. A summary of your profile, consultations, wallet ledger and consents will be emailed within 48 hours.",
  },
  {
    key: "correct",
    title: "Correct my data",
    body: "Fix your name, birth details or contact information. Corrections propagate to open tickets.",
    cta: "Open editor",
    message: "Profile editor opened. Your corrections will also update any open support tickets.",
  },
  {
    key: "consent",
    title: "Manage consent",
    body: "Per-channel promotional opt-outs — push, SMS, email and WhatsApp, each switched independently.",
    cta: "Manage channels",
    message: "Consent centre opened — push, SMS, email and WhatsApp each switch independently.",
  },
  {
    key: "nominee",
    title: "Nominate someone",
    body: "Name a person who may exercise these rights on your behalf if you are unable to.",
    cta: "Add nominee",
    message: "Nominee form opened. They may exercise these rights on your behalf if you are unable to.",
  },
];
