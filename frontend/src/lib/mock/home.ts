// Home page content from the prototype (01-home.html). Customer reviews are not here: the home
// page shows real published reviews from the API (GET /reviews/featured).

export const TRUST_STRIP = [
  { icon: "✓", title: "Verified astrologers", sub: "Identity, credentials and sample sessions checked" },
  { icon: "🔒", title: "Secure payments", sub: "Razorpay · money held, debited once at the end" },
  { icon: "☎", title: "Masked calls", sub: "Your number is never shown to the astrologer" },
  { icon: "₹", title: "No surprise charges", sub: "First 60 seconds free · nothing bills before connect" },
];

export const STEPS = [
  {
    n: "1",
    title: "Recharge your wallet",
    body: "Pick a denomination. GST is added on top — your talk-time credit is the full amount you chose.",
  },
  {
    n: "2",
    title: "Choose an astrologer",
    body: "Filter by skill, language and availability. Prices and trust metrics are the same on web and in the app.",
  },
  {
    n: "3",
    title: "Consult",
    body: "Chat, voice or video. You see elapsed time and minutes remaining at this rate — never a draining balance.",
  },
];
