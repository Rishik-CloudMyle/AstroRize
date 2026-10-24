"use client";

// Screen titles of the mobile app prototype.
//
// <AppPageTitle>Profile</AppPageTitle>
//     a main-tab screen's title (Profile, Consult, Live Room): the outlined title pill (.az-sec —
//     30px, 8px radius, cream fill, gold-tinted border, 14px bold). Renders an <h1>; `as="h2"` to change.
//     `actions` = optional element on the right of the same row. `className` for spacing.
//
// <AppTopbar title="Wallet" backHref="/me" />
//     a sub-screen's bar (.topbar with .back): back chevron left, centred 16px bold title, cream
//     (#fffdf8) bar. `backHref` links back; without it the button goes back in history (falling back
//     to "/" when there is no history). `subtitle` = small line under the title; `actions` = right slot
//     (keeps the title centred). Not sticky by itself (the site header is); pass `sticky` to pin it.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBack } from "./icons";

export function AppPageTitle({
  as: Heading = "h1",
  actions,
  className = "",
  children,
}: {
  as?: "h1" | "h2";
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <Heading className="m-0 inline-flex h-[30px] items-center rounded-[8px] border border-app-line-gold-2 bg-app-elev px-3 text-[14px] leading-none font-bold tracking-[.01em] whitespace-nowrap text-app-ink">
        {children}
      </Heading>
      {actions}
    </div>
  );
}

export function AppTopbar({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  sticky = false,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const back =
    "grid size-9 shrink-0 place-items-center rounded-[10px] text-app-ink hover:text-app-ink [&>svg]:size-6 focus-visible:outline-2 focus-visible:outline-app-selected";
  return (
    <div
      className={`grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 bg-app-elev px-4 pt-2 pb-2.5 ${
        sticky ? "sticky top-0 z-40" : ""
      } ${className}`}
    >
      {backHref ? (
        <Link href={backHref} aria-label={backLabel} className={back}>
          <IconBack />
        </Link>
      ) : (
        <button
          type="button"
          aria-label={backLabel}
          className={back}
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        >
          <IconBack />
        </button>
      )}
      <div className="min-w-0 text-center">
        <h1 className="m-0 truncate text-[16px] font-bold text-app-ink">{title}</h1>
        {subtitle && <p className="m-0 truncate text-[12px] text-app-ink-3">{subtitle}</p>}
      </div>
      <div className="flex justify-end">{actions}</div>
    </div>
  );
}
