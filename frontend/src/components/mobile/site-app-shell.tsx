"use client";

// The public website's phone/tablet chrome (< 1024px), in the look of the client's customer mobile
// app prototype: the app header on top and the bottom tab bar
// (Home · Live · Consult · Messages · Profile). Rendered by components/site-chrome.tsx next to the
// desktop header/footer, which are hidden below 1024px (and these above it).

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { homeFor } from "@/lib/auth";
import { rupee } from "@/lib/format";
import { totalBalance, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import { ConsultInProgressBar } from "../consult/consult-lock";
import NotificationBell from "../notification-bell";
import { AppHeader, HeaderPill, WalletChip } from "./app-header";
import { IconHome, IconLive, IconMessage, IconPeople, IconUser } from "./icons";
import TabBar from "./tab-bar";

const UNREAD_POLL_MS = 60_000;

/**
 * Unread replies across the customer's conversations (astrologers + Astrorize support), from
 * GET /api/messages — the same count the Messages page shows. Checked on load, every minute while
 * the tab is visible, when the tab comes back, and on every page change (opening a conversation
 * marks it read on the server). 0 when signed out or not a customer.
 */
function useUnreadMessages(enabled: boolean, pathname: string): number {
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api
      .get<{ conversations: { unread: number }[]; support?: { unread: number }[] }>("/messages")
      .then((r) => {
        const sum = (list: { unread: number }[] = []) => list.reduce((n, c) => n + (c.unread > 0 ? c.unread : 0), 0);
        setUnread(sum(r.conversations) + sum(r.support));
      })
      .catch((e: unknown) => {
        // Signed out meanwhile: no badge. Anything else keeps the last count until the next check.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setUnread(0);
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load, pathname]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => document.visibilityState === "visible" && load();
    const id = setInterval(run, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled, load]);

  return enabled ? unread : 0;
}

export function SiteAppHeader() {
  const session = useSession();
  const { openLogin } = useAppUI();

  let actions: React.ReactNode = null;
  if (session.ready && session.loggedIn && session.role === "customer") {
    const balance = rupee(totalBalance(session));
    actions = (
      <>
        <WalletChip href="/wallet" amount={balance} label={`Wallet balance ${balance}`} />
        <NotificationBell variant="app" />
      </>
    );
  } else if (session.ready && session.loggedIn) {
    // Astrologers and staff browsing the public site: the way back to their portal.
    actions = <HeaderPill href={homeFor(session.role)}>{session.role === "astrologer" ? "My portal" : "Admin"}</HeaderPill>;
  } else if (session.ready) {
    actions = <HeaderPill onClick={() => openLogin()}>Log in</HeaderPill>;
  }

  return (
    <AppHeader actions={actions}>
      {/* A consultation is open: the way back to it, on every page. */}
      <ConsultInProgressBar />
    </AppHeader>
  );
}

/** Screens that are full-screen in the app prototype: no tab bar while they're open. */
function isImmersive(pathname: string, search: URLSearchParams | null): boolean {
  // A conversation thread (its composer sits at the bottom of the screen).
  if (/^\/messages\/[^/]+/.test(pathname)) return true;
  // Inside a live room.
  if (pathname === "/live" && search?.has("room")) return true;
  // Sign in / sign up are full-screen in the app.
  return pathname === "/login" || pathname === "/signup";
}

/**
 * The tab bar. `search` = the page's query (only used to spot a live room). site-chrome.tsx renders
 * <SiteTabBarWithQuery /> inside <Suspense> with <SiteTabBar search={null} /> as its fallback, so the
 * bar is in the server HTML even where reading the query has to wait for the browser.
 */
export function SiteTabBar({ search }: { search: URLSearchParams | null }) {
  const pathname = usePathname();
  const session = useSession();
  const isCustomer = session.ready && session.loggedIn && session.role === "customer";
  const unread = useUnreadMessages(isCustomer, pathname);

  const at = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");
  return (
    <TabBar
      label="Primary"
      hidden={isImmersive(pathname, search)}
      items={[
        { href: "/", label: "Home", icon: <IconHome />, active: pathname === "/" },
        { href: "/live", label: "Live", icon: <IconLive />, active: at("/live") },
        { href: "/astrologers", label: "Consult", icon: <IconPeople />, active: at("/astrologers") || at("/astrologer") },
        {
          href: "/messages",
          label: "Messages",
          icon: <IconMessage />,
          active: at("/messages"),
          badge: unread,
          badgeLabel: `${unread} unread`,
        },
        { href: "/me", label: "Profile", icon: <IconUser />, active: at("/me") || at("/wallet") },
      ]}
    />
  );
}

export function SiteTabBarWithQuery() {
  const search = useSearchParams();
  return <SiteTabBar search={search} />;
}
