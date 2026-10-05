import type { Metadata } from "next";
import { Cormorant_Garamond, Figtree, Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from our own site
// (no request to Google from the visitor's browser). Each one exposes a CSS
// variable that globals.css maps to a Tailwind class (font-sans, font-display…).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Monospace for IDs, config keys and audit entries in the admin console.
// Loaded as the variable font (all weights in one file). Listing separate weights
// makes the dev server fail with "next/font/google queries have exactly one entry".
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Astrorize — Talk to a verified astrologer",
    template: "%s · Astrorize",
  },
  description:
    "Consult verified astrologers by chat, voice or video. Pay by the minute, first 60 seconds free, masked calls and one charge after the session ends.",
  icons: { icon: "/assets/brand/logo-mark.png" },
};

// The root layout wraps every page: the public website (app/(site)), the astrologer
// portal (app/portal) and the admin console (app/admin). Each area adds its own chrome.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${cormorant.variable} ${playfair.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="bg-cream font-sans text-ink">{children}</body>
    </html>
  );
}
