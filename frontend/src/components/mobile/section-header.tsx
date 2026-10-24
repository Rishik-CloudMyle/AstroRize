// A section heading with an optional "See all" link — the mobile app prototype's .section-h,
// .home-live-h + .home-see, and .az-go.
//
// <SectionHeader title="Live Now" href="/live" />
//   title      heading text (16px bold)
//   href       optional "See all" destination
//   linkLabel  link text (default "See all")
//   variant    look of the link:
//                "pill" (default) — 34px white pill with a gold-tinted border and "→" (Home "Live Now")
//                "chip"           — 24px rounded-7 white chip in deep gold with "›" (Home "Astrologers for you")
//                "link"           — plain gold text link (.section-h a)
//   icon       optional element before the title (e.g. a live icon)
//   level      heading level (default 2)
//   className  extra classes for the row (spacing)

import Link from "next/link";

export default function SectionHeader({
  title,
  href,
  linkLabel = "See all",
  variant = "pill",
  icon,
  level = 2,
  className = "",
}: {
  title: React.ReactNode;
  href?: string;
  linkLabel?: string;
  variant?: "pill" | "chip" | "link";
  icon?: React.ReactNode;
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  const link =
    variant === "pill"
      ? "inline-flex h-[34px] shrink-0 items-center gap-1 rounded-app-chip border border-app-line-gold-2 bg-app-surface px-3.5 text-[13px] font-semibold text-app-ink hover:text-app-ink hover:no-underline"
      : variant === "chip"
        ? "inline-flex h-6 shrink-0 items-center gap-[3px] rounded-[7px] border border-app-line-gold-2 bg-app-surface px-[9px] text-[12px] leading-none font-semibold text-app-active hover:text-app-active hover:no-underline"
        : "shrink-0 text-[13px] font-semibold text-app-accent hover:text-app-active";
  return (
    <div className={`mb-2.5 flex items-center justify-between gap-2.5 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <Heading className="m-0 min-w-0 text-[16px] font-bold text-app-ink">{title}</Heading>
      </div>
      {href && (
        <Link href={href} className={link}>
          {linkLabel}
          {variant !== "link" && (
            <span aria-hidden="true" className="text-[13px] leading-none">
              {variant === "pill" ? "→" : "›"}
            </span>
          )}
        </Link>
      )}
    </div>
  );
}
