"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminSession, Environment, NavGroup } from "@/lib/admin/types";
import LogoutButton from "../logout-button";
import { useNavCounts } from "./admin-provider";
import MessagesUnreadBadge from "./messages/unread-badge";

// [label, background, border, dot, text] — from the prototype's envMap.
const ENV_STYLES: Record<Environment, [string, string, string, string, string]> = {
  production: ["Production", "#292524", "#44403c", "#4ade80", "#d6cbb8"],
  staging: ["Staging", "#422006", "#a16207", "#facc15", "#fde68a"],
  sandbox: ["Sandbox", "#1e3a5f", "#1d4ed8", "#60a5fa", "#bfdbfe"],
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

type RailProps = {
  session: AdminSession;
  roleLabel: string;
  environment: Environment;
  nav: NavGroup[];
};

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/admin" onNavigate={onNavigate} className="flex items-center gap-2.5 px-2 hover:no-underline">
      <Image
        src="/assets/brand/logo-mark.png"
        alt=""
        width={34}
        height={34}
        priority
        className="h-[34px] w-[34px] flex-[0_0_34px] object-contain"
      />
      <div className="min-w-0">
        <div className="font-display text-[19px] leading-none font-semibold text-[#f8f4ec]">AstroRize</div>
        <div className="mt-0.5 text-[9.5px] font-bold tracking-[.1em] text-[#78716c] uppercase">Admin console</div>
      </div>
    </Link>
  );
}

/** Environment, signed-in admin and the console menu; shared by the desktop rail and the phone menu. */
function RailBody({ session, roleLabel, environment, nav, onNavigate }: RailProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  // Kept current by the provider: re-read after every action and every 30 seconds.
  const { counts, hints } = useNavCounts();
  const [envLabel, envBg, envBorder, envDot, envFg] = ENV_STYLES[environment];

  return (
    <>
      <div
        className="mb-3 flex items-center gap-2 rounded-[10px] border px-[11px] py-2"
        style={{ background: envBg, borderColor: envBorder }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: envDot }} />
        <b className="text-[11px] tracking-[.1em] uppercase" style={{ color: envFg }}>
          {envLabel}
        </b>
      </div>

      <div className="mb-3.5 flex items-center gap-[9px] rounded-xl bg-[#292524] p-2.5">
        <span className="grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-full bg-[#44403c] text-[12px] font-extrabold text-amber-300">
          {session.initials}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[12.5px] text-[#f8f4ec]">{session.name}</b>
          <span className="text-[10.5px] font-bold text-amber-300">{roleLabel}</span>
        </div>
      </div>

      <nav aria-label="Console" className="flex flex-col gap-0.5">
        {nav.map((g) => (
          <div key={g.title} className="mb-2">
            <div className="px-2.5 pt-2 pb-[5px] text-[9.5px] font-extrabold tracking-[.12em] text-[#78716c] uppercase">
              {g.title}
            </div>
            {g.items.map((n) => {
              const active = isActive(pathname, n.href);
              const count = counts[n.key] ?? 0;
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  onNavigate={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-[9px] rounded-[9px] px-2.5 py-2 text-left text-[13px] transition-colors hover:no-underline ${
                    active
                      ? "bg-amber-500 font-bold text-ink hover:text-ink"
                      : "font-medium text-[#d6cbb8] hover:text-[#f8f4ec]"
                  }`}
                >
                  <span className="w-4 text-center text-[12px] opacity-85">{n.icon}</span>
                  <span className="min-w-0 flex-1">{n.label}</span>
                  {n.key === "messages" ? (
                    <MessagesUnreadBadge />
                  ) : count > 0 ? (
                    <span
                      title={hints[n.key]}
                      className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-urgent px-[5px] text-[10px] font-extrabold text-white"
                    >
                      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
                      <span className="sr-only">{hints[n.key] ?? `${count} waiting`}</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-[#292524] px-2.5 pt-3.5">
        <LogoutButton className="flex w-full items-center gap-[9px] rounded-[9px] px-0 py-1.5 text-left text-[13px] font-medium text-[#a8a29e] hover:text-[#f8f4ec]">
          <span className="w-4 text-center text-[12px] opacity-85">⎋</span>
          <span>Log out</span>
        </LogoutButton>
      </div>
    </>
  );
}

/** Desktop (1024px and up): the dark rail, pinned to the screen. */
export default function Sidebar(props: RailProps) {
  return (
    // Pinned to the screen: only the page on the right scrolls. Log out stays at the bottom, and
    // the rail scrolls on its own if the menu is ever taller than the screen.
    <aside className="az-rail sticky top-0 hidden h-screen flex-col gap-0.5 self-start overflow-y-auto px-3 py-[18px] text-[#d6cbb8] lg:flex">
      <div className="pb-3.5">
        <Brand />
      </div>
      <RailBody {...props} />
    </aside>
  );
}

/** Phones and tablets (below 1024px): a dark top bar whose menu button opens the same rail. */
export function AdminTopBar(props: RailProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Links close the menu as they navigate; Escape closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    // The blurred bar would trap fixed-position children, so the menu and its backdrop sit beside it.
    <div className="sticky top-0 z-50 lg:hidden">
      <header className="az-rail flex h-[58px] items-center justify-between gap-3 px-3 text-[#d6cbb8]">
        <Brand onNavigate={close} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="admin-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid size-10 place-items-center rounded-xl border border-[#44403c] text-lg text-[#f8f4ec]"
        >
          {open ? "✕" : "☰"}
        </button>
      </header>
      {open && (
        <>
          <div className="fixed inset-0 top-[58px] bg-[rgba(28,25,23,.45)]" onClick={close} aria-hidden="true" />
          <div
            id="admin-menu"
            className="fixed inset-x-0 top-[58px] flex max-h-[calc(100dvh-58px)] flex-col gap-0.5 overflow-y-auto bg-[#0c0b09] px-3 pt-3 pb-4 text-[#d6cbb8] shadow-[0_16px_40px_rgba(0,0,0,.35)]"
          >
            <RailBody {...props} onNavigate={close} />
          </div>
        </>
      )}
    </div>
  );
}
