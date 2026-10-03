import type { Metadata } from "next";
import { Cormorant_Garamond, Figtree, Inter, Playfair_Display } from "next/font/google";
import AppProvider from "@/components/app-provider";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { getAstrologers } from "@/lib/mock/astrologers";
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

export const metadata: Metadata = {
  title: {
    default: "Astrorize — Talk to a verified astrologer",
    template: "%s · Astrorize",
  },
  description:
    "Consult verified astrologers by chat, voice or video. Pay by the minute, first 60 seconds free, masked calls and one charge after the session ends.",
  icons: { icon: "/assets/brand/logo-mark.png" },
};

// The root layout wraps every page. `children` is whatever page is being shown.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const astrologers = await getAstrologers();

  return (
    <html
      lang="en"
      className={`${figtree.variable} ${cormorant.variable} ${playfair.variable} ${inter.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-cream font-sans text-ink">
        <AppProvider astrologers={astrologers}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AppProvider>
      </body>
    </html>
  );
}
