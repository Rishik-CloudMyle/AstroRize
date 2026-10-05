// Static copy for the wallet page's data-rights cards (07-wallet-account.html).
// Balances, transactions, recharge amounts and GST come from the API.

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
