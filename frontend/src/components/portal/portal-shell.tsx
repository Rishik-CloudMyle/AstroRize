"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { accountStateLabel } from "@/lib/portal/status";
import type { Account } from "@/lib/portal/types";
import LogoutButton from "../logout-button";
import StatusBanner from "./status-banner";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  count?: number;
}

function navItems(account: Account): NavItem[] {
  const c = account.counts;
  return [
    { href: "/portal", label: "Dashboard", icon: "◱" },
    { href: "/portal/application", label: "Application", icon: "▤" },
    { href: "/portal/availability", label: "Availability", icon: "▦" },
    { href: "/portal/consultations", label: "Consultations", icon: "◉", count: c.consultations },
    { href: "/portal/live", label: "Live", icon: "◎" },
    { href: "/portal/messages", label: "Messages", icon: "✉", count: c.messages },
    { href: "/portal/earnings", label: "Earnings", icon: "₹" },
    { href: "/portal/profile", label: "Profile", icon: "◍" },
    { href: "/portal/compliance", label: "Compliance", icon: "⚖", count: c.compliance },
  ];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Image src="/assets/brand/logo-mark.png" alt="" width={36} height={36} className="size-9 flex-[0_0_36px] object-contain" priority />
      <div className="min-w-0">
        <div className="font-display text-[20px] leading-none font-semibold">Astrorize</div>
        <div className="mt-0.5 text-[10px] font-bold tracking-[.1em] text-stone-400 uppercase">Astrologer portal</div>
      </div>
    </div>
  );
}

/** The signed-in astrologer. Links to their profile (no account switching in the real portal). */
function AccountCard({ account, onNavigate }: { account: Account; onNavigate?: () => void }) {
  const me = account.astrologer;
  const state = accountStateLabel(account.status);
  return (
    <Link
      href="/portal/profile"
      onNavigate={onNavigate}
      className="flex w-full items-center gap-2.5 rounded-[14px] border border-line-warm bg-card p-2.5 text-left text-ink hover:text-ink hover:no-underline"
    >
      <span
        className="size-[38px] flex-[0_0_38px] rounded-full border-2 border-gold bg-cover bg-center"
        style={{ backgroundImage: `url("${me.photo}")` }}
        role="img"
        aria-label={me.name}
      />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px] font-bold text-ink">{me.name}</b>
        <em className="block text-[11px] font-bold uppercase not-italic" style={{ color: state.color }}>
          {state.label}
        </em>
      </span>
    </Link>
  );
}

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Portal" className="flex flex-col gap-1">
      {items.map((n) => {
        const active = n.href === "/portal" ? pathname === "/portal" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onNavigate={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex w-full items-center gap-2.5 rounded-[10px] px-[11px] py-[9px] text-left text-[13.5px] hover:no-underline ${
              active ? "bg-amber-100 font-bold text-amber-800 hover:text-amber-800" : "font-medium text-stone-600 hover:text-stone-600"
            }`}
          >
            <span className="w-[18px] text-center text-sm">{n.icon}</span>
            <span className="min-w-0 flex-1">{n.label}</span>
            {n.count ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-urgent px-1.5 text-[10.5px] font-extrabold text-white">
                {n.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export default function PortalShell({ account, children }: { account: Account; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = navItems(account);
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  // Escape closes the phone menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Phone / small tablet: compact top bar with a menu button */}
      <header className="sticky top-0 z-50 border-b border-line bg-[rgba(255,253,248,.92)] backdrop-blur-[18px] backdrop-saturate-[1.2] min-[900px]:hidden">
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <Link href="/portal" onNavigate={close} className="text-ink hover:text-ink hover:no-underline">
            <Brand />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="portal-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="relative grid size-10 place-items-center rounded-xl border border-line bg-white text-lg text-stone-600"
          >
            {menuOpen ? "✕" : "☰"}
            {!menuOpen && account.counts.consultations + account.counts.messages + account.counts.compliance > 0 && (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-paper bg-urgent" />
            )}
          </button>
        </div>
        {menuOpen && (
          <>
            <div className="fixed inset-0 top-[61px] z-0 bg-[rgba(28,25,23,.35)]" onClick={close} aria-hidden="true" />
            <div
              id="portal-menu"
              className="absolute inset-x-0 top-full z-10 max-h-[calc(100dvh-61px)] overflow-y-auto border-b border-line bg-paper px-3.5 pt-3 pb-4 shadow-[0_16px_40px_rgba(90,62,40,.18)]"
            >
              <div className="mb-3">
                <AccountCard account={account} onNavigate={close} />
              </div>
              <NavList items={items} pathname={pathname} onNavigate={close} />
              <LogoutButton className="mt-3 h-10 w-full rounded-xl border border-line bg-white text-[13px] font-bold text-stone-600" />
            </div>
          </>
        )}
      </header>

      <div className="flex-1 min-[900px]:grid min-[900px]:grid-cols-[238px_minmax(0,1fr)] min-[900px]:items-stretch">
        {/* Desktop sidebar */}
        <aside className="hidden border-r border-line bg-[rgba(255,253,248,.88)] px-3.5 py-5 backdrop-blur-[18px] backdrop-saturate-[1.2] min-[900px]:block">
          <div className="sticky top-5 flex flex-col gap-1">
            <div className="px-2 pb-4">
              <Brand />
            </div>
            <div className="mb-3">
              <AccountCard account={account} />
            </div>
            <NavList items={items} pathname={pathname} />
            <LogoutButton className="mt-4 flex w-full items-center gap-2.5 rounded-[10px] px-[11px] py-[9px] text-left text-[13.5px] font-medium text-stone-500 hover:bg-stone-100">
              <span className="w-[18px] text-center text-sm">⎋</span>
              <span>Log out</span>
            </LogoutButton>
          </div>
        </aside>

        <main className="min-w-0 px-3.5 pt-6 pb-14 min-[900px]:px-7">
          <StatusBanner status={account.status} />
          {children}
        </main>
      </div>
    </div>
  );
}
