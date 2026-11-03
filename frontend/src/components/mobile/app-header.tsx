// The top bar of the phone/tablet app look (< 1024px), as on the prototype's Home
// (.home-head): the gold logo mark and "AstroRize" in the display serif on the left, round
// controls on the right (wallet chip, notification bell…). Sticky, on the page background.
// Hidden at ≥ 1024px (lg:hidden): desktop keeps its own header.
//
// <AppHeader href="/" kicker="Astrologer portal" actions={<>…</>}>{below}</AppHeader>
//   href     where the brand links (default "/")
//   kicker   optional small caps line under "AstroRize" (the portal says "Astrologer portal")
//   actions  the right-hand controls (use WalletChip / HeaderIconButton / NotificationBell variant="app")
//   children optional full-width strip under the bar (e.g. the "consultation in progress" bar)
//
// <WalletChip href amount label />  the prototype's balance pill (gold dot + ₹ amount, 36px)
// <HeaderPill href|onClick>Log in</HeaderPill>  same pill, for a short text action
// <HeaderIconButton href|onClick label>{icon}</HeaderIconButton>  44px white rounded-12 icon button

import Image from "next/image";
import Link from "next/link";

export function AppHeader({
  href = "/",
  kicker,
  actions,
  children,
}: {
  href?: string;
  kicker?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-50 bg-app-bg pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex min-h-14 items-center gap-2 px-4 py-1.5">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2 text-app-ink hover:text-app-ink hover:no-underline">
          <Image src="/assets/brand/logo-mark.png" alt="" width={36} height={36} priority className="size-9 shrink-0 object-contain" />
          <span className="min-w-0">
            <span className="block truncate font-display text-[20px] leading-tight font-semibold tracking-[.01em]">AstroRize</span>
            {kicker && <span className="block truncate text-[10px] leading-tight font-bold tracking-[.1em] text-app-ink-3 uppercase">{kicker}</span>}
          </span>
        </Link>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

const PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-app-line bg-app-surface text-[13px] font-bold tabular-nums text-app-ink hover:text-app-ink hover:no-underline";

export function WalletChip({ href, amount, label }: { href: string; amount: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={`${PILL} pr-3 pl-2`}>
      <span aria-hidden="true" className="size-2 rounded-full bg-app-primary" />
      {amount}
    </Link>
  );
}

export function HeaderPill({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={`${PILL} px-3.5`}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${PILL} px-3.5`}>
      {children}
    </button>
  );
}

export function HeaderIconButton({
  href,
  onClick,
  label,
  children,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const cls =
    "relative grid size-app-hit place-items-center rounded-app-btn bg-app-surface text-app-ink hover:text-app-ink hover:no-underline [&>svg]:size-[22px]";
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {children}
    </button>
  );
}
