"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/lib/mock/site";
import { homeFor } from "@/lib/auth";
import { rupee } from "@/lib/format";
import { totalBalance, useSession } from "@/lib/session-store";
import { useAppUI } from "./app-provider";
import { useLiveNow } from "./live-notifier";
import { ConsultInProgressBar } from "./consult/consult-lock";
import NotificationBell from "./notification-bell";

export default function SiteHeader() {
  const session = useSession();
  const { openLogin } = useAppUI();
  const pathname = usePathname();
  // The "Live" dot shows (and pulses) only while someone is actually live.
  const someoneLive = (useLiveNow()?.liveRooms ?? 0) > 0;

  return (
    // Desktop only (≥ 1024px). Phones and tablets get the app header and tab bar (components/mobile/site-app-shell.tsx).
    <header className="sticky top-0 z-50 border-b border-line bg-paper max-lg:hidden">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 min-[380px]:gap-4 sm:px-6 lg:gap-7">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 hover:no-underline">
          <Image
            src="/assets/brand/logo-mark.png"
            alt="Astrorize"
            width={40}
            height={40}
            priority
            className="size-10 shrink-0 object-contain"
          />
          <span className="font-display text-[22px] font-semibold leading-none min-[380px]:text-[25px] tracking-[.01em] text-ink">Astrorize</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-wrap items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-amber-100 hover:text-amber-800 hover:no-underline"
            >
              {link.live && someoneLive && <span aria-hidden="true" className="az-live-dot size-[7px] rounded-full bg-urgent" />}
              {link.label}
            </Link>
          ))}
          {session.loggedIn && session.role === "customer" && (
            <Link
              href="/messages"
              aria-current={pathname.startsWith("/messages") ? "page" : undefined}
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-amber-100 hover:text-amber-800 hover:no-underline"
            >
              Messages
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 min-[380px]:gap-2.5">
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
              <NotificationBell />
              <Link
                href="/wallet#add-money"
                aria-label={`Balance ${rupee(totalBalance(session))} — add money`}
                className="inline-flex h-[38px] items-center gap-[7px] rounded-full border border-line bg-white pl-[11px] pr-3.5 text-[13px] font-bold tabular-nums text-ink hover:no-underline min-[440px]:pr-[5px]"
              >
                <span className="size-2 rounded-full bg-amber-500" />
                {rupee(totalBalance(session))}
                <span aria-hidden="true" className="hidden size-[26px] place-items-center rounded-full bg-amber-500 text-[16px] leading-none text-ink min-[440px]:grid">
                  +
                </span>
              </Link>
              {/* Hidden on the narrowest phones to make room for the bell; Wallet is in the menu there. */}
              <Link
                href="/wallet"
                aria-label="Your account"
                className="hidden size-[38px] place-items-center min-[400px]:grid rounded-full border-2 border-gold bg-linear-160 from-amber-100 to-amber-300 text-[13px] font-extrabold text-amber-900 hover:no-underline"
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
        </div>
      </div>

      {/* A consultation is open: the way back to it, on every page. */}
      <ConsultInProgressBar />
    </header>
  );
}
