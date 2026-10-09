import Image from "next/image";
import type { ApiUser, Session } from "@/lib/session-store";
import { homeFor } from "@/lib/auth";

// Layout and helpers shared by the /login and /signup pages.

/**
 * Where to go after signing in: `next` when it is a path on this site the person may open,
 * otherwise their role's home (customers stay on the website).
 */
export function destinationFor(role: ApiUser["role"], next: string | null): string {
  const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
  if (role === "customer") return safe && !/^\/(portal|admin)(\/|$)/.test(safe) && !/^\/(login|signup)(\/|\?|$)/.test(safe) ? safe : "/";
  const home = homeFor(role);
  return safe && (safe === home || safe.startsWith(home + "/")) ? safe : home;
}

/** Display name for "You're logged in as …". */
export function sessionName(s: Session): string {
  return s.user.name || s.email || "your account";
}

/**
 * Two columns from 1024px (welcome panel + form card), just the card on phones.
 */
export default function AuthShell({
  eyebrow,
  title,
  points,
  children,
}: {
  eyebrow: string;
  title: string;
  points: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-[1240px] items-start gap-8 px-4 pt-6 pb-16 sm:px-6 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-12">
      <aside className="relative top-24 hidden min-h-[560px] lg:sticky overflow-hidden rounded-[22px] border border-line lg:block">
        <Image src="/assets/spotlight/spotlight-welcome.jpg" alt="" fill priority sizes="(min-width: 1240px) 700px, 50vw" className="object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-[rgba(28,25,23,.78)] via-[rgba(28,25,23,.25)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-9 text-white">
          <span className="text-[11.5px] font-bold tracking-[.14em] text-amber-300 uppercase">{eyebrow}</span>
          <p className="mt-2 mb-4 max-w-[480px] font-display text-[40px] leading-[1.08] font-semibold">{title}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[14px] leading-[1.45] text-white/90">
                <span className="mt-[3px] text-amber-300" aria-hidden="true">
                  ✦
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="mx-auto w-full max-w-[480px] rounded-[22px] border border-line bg-paper p-5 shadow-[0_16px_40px_rgba(11,31,51,.08)] sm:p-[26px]">
        {children}
      </div>
    </div>
  );
}
