// Site-wide copy and company details, from the prototype.
// ⚠ Grievance officer, CIN, address and policy versions are the prototype's
// placeholder values — replace them with the client's real details before launch.

export const COMPANY = {
  legalName: "AstroRize Private Limited",
  cin: "U74999KA2026PTC000000",
  address: ["AstroRize Private Limited", "D-E-407, MPR Urban City, Patiganpur, Patencheru, Hyderabad, 502319"],
  tagline: "Guidance and entertainment — not medical, legal or financial advice.",
};

export const GRIEVANCE_OFFICER = {
  name: "Kunal Prasad",
  email: "support@astrorize.com",
  timeline: "Acknowledged within 48 hours; resolved within 30 days or as required by law",
};

export const NAV_LINKS = [
  { href: "/astrologers", label: "Astrologers" },
  { href: "/fixed-sessions", label: "Fixed Sessions" },
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
      { label: "Fixed Sessions", href: "/fixed-sessions" },
      { label: "Live now", href: "/live" },
      { label: "Free tools", href: "/free-tools" },
      { label: "Wallet", href: "/wallet" },
      { label: "Help & support", href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About AstroRize", href: "/terms#general-description" },
      { label: "Careers", href: "/terms" },
      { label: "Press", href: "/terms" },
    ],
  },
  {
    title: "T&C",
    links: [
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Refund & Cancellation", href: "/terms#refund-and-cancellation-policy" },
      { label: "Data Deletion Policy", href: "/data-deletion-policy" },
      { label: "Delete Account", href: "/delete-account" },
      { label: "Grievance Officer", href: "/terms#grievance-redressal" },
    ],
  },
];

// App store links: the client still has to provide the real store URLs.
export const APP_STORE_URL = "#";
export const PLAY_STORE_URL = "#";
