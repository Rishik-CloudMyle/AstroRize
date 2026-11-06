// Terms & Conditions content from the prototype (06-legal.html + logic.js).
// ⚠ Legal text must be confirmed by the client before launch.

export const TERMS_VERSION = { label: "v3.1 · effective 1 Jul 2026" };

export const TERMS_VERSION_HISTORY =
  "Version history — v3.1 (current, 1 Jul 2026), v3.0, v2.4. Each shows its effective date.";

export const HELPLINES = [
  { name: "TELE-MANAS", number: "14416", tel: "14416" },
  { name: "KiRAN", number: "1800-599-0019", tel: "18005990019" },
];

export const LEGAL_SECTIONS = [
  {
    id: "scope",
    title: "1 · Scope of service",
    highlight: false,
    body: "AstroRize connects you with independent astrologers for guidance and entertainment. Astrologers are not employees, and their guidance is not medical, legal, financial or psychiatric advice. If you are in distress, use the helplines above.",
  },
  {
    id: "money",
    title: "2 · Money & metering",
    highlight: false,
    body: "Consultations are metered by a server clock in UTC and displayed in IST. The first 60 seconds are free. After that, partial minutes round up. Your available balance is held when the session connects and debited once, after it ends — your balance never decreases minute by minute during a session.",
  },
  {
    // ⚠ PLACEHOLDER (Nov 2026): call recording began; the client's legal team must supply the real clause.
    id: "recording",
    title: "Call recording",
    highlight: false,
    body: "[Placeholder — wording pending AstroRize's approval] Voice and video consultations are recorded as audio only, after you accept the notice shown before the call; only AstroRize can access the recordings.",
  },
  {
    id: "discount",
    title: "3 · Discounts",
    highlight: false,
    body: "Discounts are exclusive and never stack. A platform campaign takes precedence over an astrologer discount. The effective price is floored at 80% of the original. Where a requested discount is clipped by that floor, only the effective percentage is displayed.",
  },
  {
    id: "fixed",
    title: "12 · Fixed Session Policy",
    highlight: true,
    body: "A Fixed Session is prepaid time with one astrologer at a package price. The full price is reserved when you confirm and charged only when you connect. If you never connect, the reservation is released in full. After you connect, unused time is not refunded if you end early. Temporary disconnects do not pause the package timer.",
  },
  {
    id: "ai",
    title: "18 · AI-assisted content",
    highlight: false,
    body: "Some insights, summaries and free-tool results are generated or assisted by automated systems. These carry a visible “AI-generated — for guidance; not professional advice” label wherever they appear.",
  },
];

export const LEGAL_TOC = [
  ...LEGAL_SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.title, highlight: s.highlight })),
  { href: "#grievance", label: "Grievance Officer", highlight: false },
];
