"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminSession, Environment, NavGroup } from "@/lib/admin/types";
import LogoutButton from "../logout-button";

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

export default function Sidebar({
  session,
  roleLabel,
  environment,
  nav,
}: {
  session: AdminSession;
  roleLabel: string;
  environment: Environment;
  nav: NavGroup[];
}) {
  const pathname = usePathname();
  const [envLabel, envBg, envBorder, envDot, envFg] = ENV_STYLES[environment];

  return (
    <aside className="az-rail flex flex-col gap-0.5 px-3 py-[18px] text-[#d6cbb8]">
      <Link href="/admin" className="flex items-center gap-2.5 px-2 pb-3.5 hover:no-underline">
        <Image
          src="/assets/brand/logo-mark.png"
          alt=""
          width={34}
          height={34}
          priority
          className="h-[34px] w-[34px] flex-[0_0_34px] object-contain"
        />
        <div className="min-w-0">
          <div className="font-display text-[19px] leading-none font-semibold text-[#f8f4ec]">Astrorize</div>
          <div className="mt-0.5 text-[9.5px] font-bold tracking-[.1em] text-[#78716c] uppercase">Admin console</div>
        </div>
      </Link>

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
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-[9px] rounded-[9px] px-2.5 py-2 text-left text-[13px] transition-colors hover:no-underline ${
                    active
                      ? "bg-amber-500 font-bold text-ink hover:text-ink"
                      : "font-medium text-[#d6cbb8] hover:text-[#f8f4ec]"
                  }`}
                >
                  <span className="w-4 text-center text-[12px] opacity-85">{n.icon}</span>
                  <span className="min-w-0 flex-1">{n.label}</span>
                  {n.count ? (
                    <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-urgent px-[5px] text-[10px] font-extrabold text-white">
                      {n.count}
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
    </aside>
  );
}
