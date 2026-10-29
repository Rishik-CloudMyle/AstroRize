import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The site's fonts, stored in src/app/fonts and served from our own site: nothing is fetched from
// Google, neither while building or running the dev server (a slow or blocked connection used to
// stop the dev server with "Can't resolve …/font/google/font") nor from the visitor's browser.
// Each is the Latin variable font from Google Fonts (all weights in one file, plus its italic).
// Each exposes a CSS variable that globals.css maps to a Tailwind class (font-sans, font-display…).
const figtree = localFont({
  variable: "--font-figtree",
  src: [
    { path: "./fonts/Figtree-normal.woff2", weight: "300 900", style: "normal" },
    { path: "./fonts/Figtree-italic.woff2", weight: "300 900", style: "italic" },
  ],
  // No generated "Figtree Fallback": symbols Figtree lacks (→, ≠) fall back to Segoe UI, as in the prototype.
  adjustFontFallback: false,
  fallback: ["Segoe UI", "sans-serif"],
});

const cormorant = localFont({
  variable: "--font-cormorant",
  src: [
    { path: "./fonts/CormorantGaramond-normal.woff2", weight: "300 700", style: "normal" },
    { path: "./fonts/CormorantGaramond-italic.woff2", weight: "300 700", style: "italic" },
  ],
  adjustFontFallback: "Times New Roman",
});

const playfair = localFont({
  variable: "--font-playfair",
  src: [
    { path: "./fonts/PlayfairDisplay-normal.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/PlayfairDisplay-italic.woff2", weight: "400 900", style: "italic" },
  ],
  adjustFontFallback: "Times New Roman",
});

const inter = localFont({
  variable: "--font-inter",
  src: [
    { path: "./fonts/Inter-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/Inter-italic.woff2", weight: "100 900", style: "italic" },
  ],
});

// Monospace for IDs, config keys and audit entries in the admin console.
const jetbrains = localFont({
  variable: "--font-jetbrains",
  src: [
    { path: "./fonts/JetBrainsMono-normal.woff2", weight: "100 800", style: "normal" },
    { path: "./fonts/JetBrainsMono-italic.woff2", weight: "100 800", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Astrorize — Talk to a verified astrologer",
    template: "%s · Astrorize",
  },
  description:
    "Consult verified astrologers by voice or video call. Pay by the minute, first 60 seconds free, masked calls and one charge after the session ends.",
  icons: { icon: "/assets/brand/logo-mark.png" },
};

// "cover" lets the phone/tablet app look (< 1024px) reach under the iPhone home indicator; the app
// header and bottom tab bar pad themselves with env(safe-area-inset-*) so nothing sits beneath it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
