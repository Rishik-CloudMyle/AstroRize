"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { accountStateLabel } from "@/lib/portal/status";
import type { Account } from "@/lib/portal/types";
import LogoutButton from "../logout-button";
import { appButtonClass } from "../mobile/button";
import { AppHeader } from "../mobile/app-header";
import { IconCalendar, IconClock, IconDashboard, IconDoc, IconLive, IconMessage, IconMore, IconRupee, IconShield, IconUser } from "../mobile/icons";
import ListRow, { ListRows } from "../mobile/list-row";
import TabBar from "../mobile/tab-bar";
import Modal from "./modal";
import NotificationBell from "../notification-bell";
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

/** Portal places that live under "More" on the phone/tablet tab bar. */
const MORE: { href: string; label: string; icon: React.ReactNode; count?: (a: Account) => number }[] = [
  { href: "/portal/availability", label: "Availability", icon: <IconCalendar /> },
  { href: "/portal/earnings", label: "Earnings", icon: <IconRupee /> },
  { href: "/portal/profile", label: "Profile", icon: <IconUser /> },
  { href: "/portal/compliance", label: "Compliance", icon: <IconShield />, count: (a) => a.counts.compliance },
  { href: "/portal/application", label: "Application", icon: <IconDoc /> },
];

/**
 * Phones and tablets (< 1024px): the bottom tab bar — Dashboard · Consultations · Live · Messages ·
 * More. "More" opens a sheet with the rest of the portal and Log out.
 */
function PortalTabBar({ account, pathname }: { account: Account; pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  // Close the sheet whenever the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMoreOpen(false);
  }
  const at = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const c = account.counts;
  const moreCount = MORE.reduce((n, m) => n + (m.count?.(account) ?? 0), 0);

  return (
    <>
      <TabBar
        label="Portal"
        items={[
          { href: "/portal", label: "Dashboard", icon: <IconDashboard />, active: pathname === "/portal" },
          {
            href: "/portal/consultations",
            label: "Consultations",
            icon: <IconClock />,
            active: at("/portal/consultations"),
            badge: c.consultations,
            badgeLabel: `${c.consultations} need attention`,
          },
          { href: "/portal/live", label: "Live", icon: <IconLive />, active: at("/portal/live") },
          {
            href: "/portal/messages",
            label: "Messages",
            icon: <IconMessage />,
            active: at("/portal/messages"),
            badge: c.messages,
            badgeLabel: `${c.messages} unread`,
          },
          {
            label: "More",
            icon: <IconMore />,
            active: MORE.some((m) => at(m.href)),
            onClick: () => setMoreOpen(true),
            expanded: moreOpen,
            badge: moreCount,
            badgeLabel: `${moreCount} need attention`,
          },
        ]}
      />
      {moreOpen && (
        <Modal onClose={() => setMoreOpen(false)} labelledBy="portal-more-title">
          <h2 id="portal-more-title" className="m-0 mb-3 text-[18px] font-bold text-app-ink">
            More
          </h2>
          <div className="mb-3">
            <AccountCard account={account} onNavigate={() => setMoreOpen(false)} />
          </div>
          <ListRows>
            {MORE.map((m) => {
              const n = m.count?.(account) ?? 0;
              return (
                <ListRow
                  key={m.href}
                  href={m.href}
                  onNavigate={() => setMoreOpen(false)}
                  icon={m.icon}
                  title={m.label}
                  trailing={
                    n > 0 ? (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-app-urgent px-1.5 text-[10.5px] font-bold text-white">
                        {n}
                        <span className="sr-only"> need attention</span>
                      </span>
                    ) : at(m.href) ? (
                      <span className="text-[11px] font-bold text-app-active">Current</span>
                    ) : undefined
                  }
                />
              );
            })}
          </ListRows>
          <LogoutButton className={`${appButtonClass({ variant: "secondary", block: true })} mt-4`} />
        </Modal>
      )}
    </>
  );
}

export default function PortalShell({ account, children }: { account: Account; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = navItems(account);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Phones and tablets (< 1024px): the mobile app look — app header on top, tab bar at the bottom. */}
      <AppHeader
        href="/portal"
        kicker="Astrologer portal"
        actions={
          <>
            <NotificationBell variant="app" />
            <Link
              href="/portal/profile"
              aria-label={`Your profile (${account.astrologer.name})`}
              className="size-app-hit shrink-0 rounded-full border-2 border-gold bg-app-tint-2 bg-cover bg-center"
              style={{ backgroundImage: `url("${account.astrologer.photo}")` }}
            />
          </>
        }
      />

      <div className="flex-1 lg:grid lg:grid-cols-[238px_minmax(0,1fr)] lg:items-stretch">
        {/* Desktop sidebar */}
        {/* Above the main column, so the notifications panel opening from it isn't covered. */}
        <aside className="relative z-30 hidden border-r border-line bg-[rgba(255,253,248,.88)] px-3.5 py-5 backdrop-blur-[18px] backdrop-saturate-[1.2] lg:block">
          <div className="sticky top-5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 pb-4 pl-2">
              <Brand />
              <NotificationBell align="left" />
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

        <main className="min-w-0 px-4 pt-3 pb-6 lg:px-7 lg:pt-6 lg:pb-14">
          <StatusBanner status={account.status} />
          {children}
        </main>
      </div>

      <PortalTabBar account={account} pathname={pathname} />
    </div>
  );
}
