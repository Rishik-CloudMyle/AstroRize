"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_LINKS } from "@/lib/mock/site";
import { homeFor } from "@/lib/auth";
import { rupee } from "@/lib/format";
import { sessionActions, totalBalance, useSession } from "@/lib/session-store";
import { useAppUI } from "./app-provider";
import { ConsultInProgressBar } from "./consult/consult-lock";

export default function SiteHeader() {
  const session = useSession();
  const { openLogin } = useAppUI();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the mobile menu whenever the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper">
      <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-3 sm:px-6 lg:gap-7">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 hover:no-underline">
          <Image
            src="/assets/brand/logo-mark.png"
            alt="Astrorize"
            width={40}
            height={40}
            priority
            className="size-10 shrink-0 object-contain"
          />
          <span className="font-display text-[25px] font-semibold leading-none tracking-[.01em] text-ink">Astrorize</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-wrap items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-amber-100 hover:text-amber-800 hover:no-underline"
            >
              {link.live && <span className="size-[7px] rounded-full bg-urgent" />}
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {session.loggedIn && session.role !== "customer" ? (
            // Astrologers and staff browsing the public site get a way back to their portal.
            <>
              <Link
                href={homeFor(session.role)}
                className="az-cta hidden h-[38px] items-center rounded-full px-[18px] text-sm font-bold hover:text-cta-ink hover:no-underline sm:inline-flex"
              >
                {session.role === "astrologer" ? "Astrologer portal" : "Admin console"}
              </Link>
              <Link
                href={homeFor(session.role)}
                aria-label="Open your portal"
                className="grid size-[38px] place-items-center rounded-full border-2 border-gold bg-linear-160 from-amber-100 to-amber-300 text-[13px] font-extrabold text-amber-900 hover:no-underline"
              >
                {session.user.initials}
              </Link>
            </>
          ) : session.loggedIn ? (
            <>
              <Link
                href="/wallet"
                className="inline-flex h-[38px] items-center gap-[7px] rounded-full border border-line bg-white pl-[11px] pr-3.5 text-[13px] font-bold tabular-nums text-ink hover:no-underline"
              >
                <span className="size-2 rounded-full bg-amber-500" />
                {rupee(totalBalance(session))}
              </Link>
              <Link
                href="/wallet"
                aria-label="Your account"
                className="grid size-[38px] place-items-center rounded-full border-2 border-gold bg-linear-160 from-amber-100 to-amber-300 text-[13px] font-extrabold text-amber-900 hover:no-underline"
              >
                {session.user.initials}
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openLogin()}
                className="hidden h-[38px] rounded-xl border border-line bg-transparent px-4 text-sm font-bold text-ink sm:block"
              >
                Log in
              </button>
              <Link
                href="/signup"
                aria-current={pathname === "/signup" ? "page" : undefined}
                className="hidden h-[38px] items-center rounded-xl border border-ink bg-ink px-4 text-sm font-bold text-amber-300 hover:text-amber-200 hover:no-underline sm:inline-flex"
              >
                Sign up
              </Link>
              <Link
                href="/astrologers"
                className="az-cta az-sheen hidden h-[38px] items-center rounded-full px-[18px] text-sm font-bold hover:text-cta-ink hover:no-underline sm:inline-flex"
              >
                Consult an astrologer
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid size-[38px] place-items-center rounded-xl border border-line text-ink lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* A consultation is open: the way back to it, on every page. */}
      <ConsultInProgressBar />

      {menuOpen && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-line px-4 pb-4 pt-2 sm:px-6 lg:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-[10px] px-3 py-3 text-[15px] font-semibold text-stone-600 hover:bg-amber-100 hover:text-amber-800 hover:no-underline"
            >
              {link.live && <span className="size-[7px] rounded-full bg-urgent" />}
              {link.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2.5">
            {session.loggedIn && session.role !== "customer" && (
              <Link
                href={homeFor(session.role)}
                onClick={() => setMenuOpen(false)}
                className="az-cta flex h-11 items-center justify-center rounded-full text-sm font-bold hover:text-cta-ink hover:no-underline sm:hidden"
              >
                {session.role === "astrologer" ? "Astrologer portal" : "Admin console"}
              </Link>
            )}
            {session.loggedIn ? (
              <button
                type="button"
                onClick={() => {
                  sessionActions.logOut();
                  setMenuOpen(false);
                }}
                className="h-11 rounded-xl border border-line text-sm font-bold text-ink"
              >
                Log out
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openLogin();
                  }}
                  className="h-11 rounded-xl border border-line text-sm font-bold text-ink sm:hidden"
                >
                  Log in
                </button>
                <Link
                  href="/signup"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-xl border border-ink bg-ink text-sm font-bold text-amber-300 hover:text-amber-200 hover:no-underline sm:hidden"
                >
                  Sign up
                </Link>
                <Link
                  href="/astrologers"
                  onClick={() => setMenuOpen(false)}
                  className="az-cta flex h-11 items-center justify-center rounded-full text-sm font-bold hover:text-cta-ink hover:no-underline sm:hidden"
                >
                  Consult an astrologer
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
