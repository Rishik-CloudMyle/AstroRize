// Home page content from the prototype (01-home.html and its live-band script).

/** Live activity band: [starting value, random drift, suffix] */
export const LIVE_STATS = [
  { key: "online", value: 142, drift: 5, suffix: "", label: "astrologers online" },
  { key: "rooms", value: 23, drift: 3, suffix: "", label: "public live rooms" },
  { key: "today", value: 3184, drift: 26, suffix: "", label: "consultations today" },
  { key: "wait", value: 42, drift: 6, suffix: "s", label: "median wait to connect" },
];

export const LIVE_FEED = [
  "A consultation just started in Hyderabad · Vedic",
  "Pt. Raghav Joshi opened a live room · Saturn transit Q&A",
  "A customer in Pune rated a session 5 stars",
  "Dr. Lalita Bose is taking instant calls · under a minute",
  "A Kundli match was generated in Bengaluru",
  "Acharya Meera Iyer came online · KP timing",
];

export const VOICES = [
  {
    quote: "The wait time was the thing. Forty seconds and I was talking to someone who actually knew the chart.",
    who: "Sneha R. · Hyderabad · Vedic consultation",
  },
  {
    quote: "I could see the per-minute rate the whole way through. No surprise bill at the end.",
    who: "Arun M. · Pune · Voice consultation",
  },
  {
    quote: "My number was never shown. That mattered more to me than anything else on the page.",
    who: "Fatima K. · Chennai · Chat consultation",
  },
  {
    // ⚠ Says "free five minutes", but the rest of the site says the first 60 seconds are free. Confirm with the client.
    quote: "The free five minutes were real. I used them, decided it was worth it, and topped up.",
    who: "Vikas D. · Indore · First consultation",
  },
];

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

export const TESTIMONIALS = [
  {
    quote: "He told me what not to decide this week. That was worth more than a prediction.",
    who: "A. Mehta",
    when: "11 Aug 2026",
  },
  {
    quote: "She named what the chart can answer and what it cannot. I left calmer, not more anxious.",
    who: "K. Rao",
    when: "8 Aug 2026",
  },
  {
    quote: "Twelve minutes, one decision, one charge at the end. No drip of little deductions.",
    who: "S. Iyer",
    when: "24 Jul 2026",
  },
];
