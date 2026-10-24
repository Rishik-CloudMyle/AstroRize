"use client";

// The bottom tab bar of the phone/tablet app look (< 1024px), as in the client's mobile app
// prototype (.tabbar / .tab): fixed to the bottom, white, a hairline on top, 20px line icons
// over 9px labels, the active tab in deep gold, and room for the iPhone home indicator.
// Hidden at ≥ 1024px (lg:hidden): desktop keeps its own header and sidebar.
//
// <TabBar items={…} label="Primary" />
//   items: TabItem[] —
//     href       where the tab goes (omit and pass onClick for a tab that opens something, e.g. "More")
//     label      the short label under the icon ("Home")
//     icon       a 20px icon element (see ./icons)
//     active     whether this tab is the current place (sets aria-current="page")
//     badge      number shown in an orange badge on the icon (0/undefined = none; 99+ above 99)
//     badgeLabel screen-reader text for the badge, e.g. "3 unread" (defaults to "<n> new")
//     onClick    for a button tab (no href)
//     expanded   for a button tab that opens a sheet: its aria-expanded state
//   label: the nav's aria-label.
//   hidden: hide it (the shell's own rule for full-screen routes).
//
// Full-screen screens (a live room, a chat thread…) hide it with <HideTabBar /> (rendered anywhere
// while that screen is open) or with useHideTabBar(true).
// It renders an invisible spacer of its own height in the page flow (place <TabBar> last in the
// shell), so the end of the page never sits under it. Anything a page pins to the bottom itself
// (a sticky CTA, a composer) must sit above it: bottom-[var(--app-tabbar-space)] while it shows.

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

export interface TabItem {
  href?: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: number;
  badgeLabel?: string;
  onClick?: () => void;
  expanded?: boolean;
}

// ---- "Hide the tab bar while this screen is open" (a counter, so overlapping screens nest) ----
let hiders = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True while any screen has asked to hide the tab bar. */
export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hiders > 0,
    () => false,
  );
}

/** Hides the bottom tab bar while `hide` is true and the calling component is mounted. */
export function useHideTabBar(hide = true): void {
  useEffect(() => {
    if (!hide) return;
    hiders += 1;
    notify();
    return () => {
      hiders -= 1;
      notify();
    };
  }, [hide]);
}

/** Render while a full-screen screen is open (live room, chat thread, call) to hide the tab bar. */
export function HideTabBar({ when = true }: { when?: boolean }) {
  useHideTabBar(when);
  return null;
}

/** The orange count on a tab's icon (visual only; the tab's accessible name carries the count). */
export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1.5 left-3 grid h-4 min-w-4 place-items-center rounded-full bg-app-urgent px-1 text-[10px] leading-none font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const TAB =
  "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[9px] border border-transparent px-px pt-[3px] pb-0.5 text-[9px] font-[650] hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app-primary";

export default function TabBar({ items, label, hidden = false }: { items: TabItem[]; label: string; hidden?: boolean }) {
  const hiddenByScreen = useTabBarHidden();
  if (hidden || hiddenByScreen) return null;
  return (
    <>
      <div aria-hidden="true" className="h-[var(--app-tabbar-space)] shrink-0 lg:hidden" />
      <nav
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-[90] grid h-[var(--app-tabbar-space)] gap-[3px] border-t border-app-line bg-app-surface pt-1 pr-[max(2px,env(safe-area-inset-right))] pb-[calc(6px+var(--app-safe-bottom))] pl-[max(2px,env(safe-area-inset-left))] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((t) => {
          const tone = t.active ? "text-app-active hover:text-app-active" : "text-app-ink-3 hover:text-app-ink-2";
          const inner = (
            <>
              <span className="relative grid size-5 place-items-center [&>svg]:size-5">
                {t.icon}
                {t.badge ? <TabBadge count={t.badge} /> : null}
              </span>
              <span className="max-w-full truncate">{t.label}</span>
              {t.badge ? <span className="sr-only">, {t.badgeLabel ?? `${t.badge} new`}</span> : null}
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} aria-current={t.active ? "page" : undefined} className={`${TAB} ${tone}`}>
              {inner}
            </Link>
          ) : (
            <button
              key={t.label}
              type="button"
              onClick={t.onClick}
              aria-expanded={t.expanded}
              aria-current={t.active ? "page" : undefined}
              className={`${TAB} ${tone}`}
            >
              {inner}
            </button>
          );
        })}
      </nav>
    </>
  );
}
