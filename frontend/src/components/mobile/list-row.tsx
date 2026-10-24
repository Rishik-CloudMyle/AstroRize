// A tappable row card — the mobile app prototype's Profile / Settings rows (.card.acc-row):
// white card, hairline border, 16px radius, 12px padding, 44px minimum height, "›" at the end.
//
// <ListRow href="/wallet" icon={<IconWallet />} title="Wallet" subtitle="₹1,240" />
//   title     main text (13.3px, like the prototype's rows)
//   subtitle  optional second line (12px, secondary colour)
//   icon      optional 18px icon, shown in a 32px round well on the left
//   trailing  optional element before the chevron (a value like "On", a badge…)
//   href      makes it a link; `external` opens it in a new tab
//   onClick   makes it a button (when there is no href)
//   onNavigate  for a link: called when it is followed (e.g. close the sheet it sits in)
//   chevron   show the "›" (default true for links and buttons, false for static rows)
//   tone      "default" | "danger" (red text, e.g. a destructive action)
//   className spacing (rows stack with 8px gaps when placed in <ListRows>)
//
// <ListRows>{rows}</ListRows>  stacks rows with the prototype's 8px gap.

import Link from "next/link";

export function ListRows({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`flex flex-col gap-2 ${className}`}>{children}</div>;
}

export default function ListRow({
  title,
  subtitle,
  icon,
  trailing,
  href,
  external,
  onClick,
  onNavigate,
  chevron,
  tone = "default",
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  onNavigate?: () => void;
  chevron?: boolean;
  tone?: "default" | "danger";
  className?: string;
}) {
  const interactive = !!href || !!onClick;
  const showChevron = chevron ?? interactive;
  const text = tone === "danger" ? "text-app-error hover:text-app-error" : "text-app-ink hover:text-app-ink";
  const cls = `flex min-h-app-hit w-full items-center gap-3 rounded-app-card border border-app-line bg-app-surface p-3 text-left shadow-app-card hover:no-underline ${text} ${
    interactive ? "active:bg-app-elev" : ""
  } ${className}`;
  const inner = (
    <>
      {icon && (
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-app-bg text-app-ink-2 [&>svg]:size-[18px]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.333px] leading-[1.35] break-words">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[12px] leading-[1.35] break-words text-app-ink-3">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-[13.333px] font-bold">{trailing}</span>}
      {showChevron && (
        <span aria-hidden="true" className="shrink-0 text-[12px] text-app-ink-3">
          ›
        </span>
      )}
    </>
  );
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    ) : (
      <Link href={href} onNavigate={onNavigate} className={cls}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
