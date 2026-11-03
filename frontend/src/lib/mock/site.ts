// Site-wide copy and company details, from the prototype.
// ⚠ Grievance officer, CIN, address and policy versions are the prototype's
// placeholder values — replace them with the client's real details before launch.

export const COMPANY = {
  legalName: "AstroRize Private Limited",
  cin: "U74999KA2026PTC000000",
  address: ["AstroRize Private Limited", "Bengaluru, Karnataka 560001"],
  tagline: "Guidance and entertainment — not medical, legal or financial advice.",
  policyVersions: "Terms v3.1 · Privacy v2.4 · Refund & Cancellation v1.2",
};

export const GRIEVANCE_OFFICER = {
  name: "Kunal Prasad",
  email: "grievance@astrorize.com",
  timeline: "Acknowledged in 24 h, resolved in 15 days",
};

export const NAV_LINKS = [
  { href: "/astrologers", label: "Astrologers" },
  { href: "/live", label: "Live", live: true },
  { href: "/free-tools", label: "Free tools" },
  { href: "/offers", label: "Offers" },
  { href: "/wallet", label: "Wallet" },
  { href: "/terms", label: "T&C" },
];

export const FOOTER_COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Astrologers", href: "/astrologers" },
      { label: "Live now", href: "/live" },
      { label: "Free tools", href: "/free-tools" },
      { label: "Wallet", href: "/wallet" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About AstroRize", href: "/terms#scope" },
      { label: "Careers", href: "/terms" },
      { label: "Press", href: "/terms" },
    ],
  },
  {
    title: "T&C",
    links: [
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/terms" },
      { label: "Refund & Cancellation", href: "/terms#money" },
      { label: "Grievance Officer", href: "/terms#grievance" },
    ],
  },
];

// App store links: the client still has to provide the real store URLs.
export const APP_STORE_URL = "#";
export const PLAY_STORE_URL = "#";
