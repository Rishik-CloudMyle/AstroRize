// Chips and choices of the mobile app prototype.
//
// <ChipRow label="Filters">…<Chip/>…</ChipRow>
//     horizontally scrolling row with no scrollbar (.discover-chips); `label` = aria-label of the group
//     (omit when the chips aren't a group). Bleeds to the screen edges when `bleed` (default true)
//     so chips scroll under the 16px page gutter.
//
// <Chip on={sorted} onClick={…} icon={<IconFilter/>} count={2}>Filter</Chip>
//     the filter pill (.dchip): 34px, white, gold-tinted border, 12px bold; `on` = selected
//     (gold border, cream fill, deep-gold text, aria-pressed). `href` renders a Link instead.
//     `count` shows a small gold count bubble.
//
// <Segmented label="Mode" options={[{value:"chat",label:"Chat"}, …]} value={mode} onChange={setMode} />
//     single choice (.choice): 40px pills, the selected one filled gold. Real radio semantics
//     (role="radiogroup" / role="radio", arrow keys move). `size="sm"` = 32px.
//
// <Tag tone="gold|new|live|success|error|info|neutral">Verified</Tag>
//     the small 24px status chip (.chip / .chip-live …): 11px bold.

"use client";

import Link from "next/link";
import { useRef } from "react";

export function ChipRow({
  label,
  bleed = true,
  className = "",
  children,
}: {
  label?: string;
  bleed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      className={`flex gap-2 overflow-x-auto pt-px pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        bleed ? "-mx-4 scroll-px-4 px-4" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

const CHIP =
  "inline-flex h-[34px] flex-none items-center justify-center gap-1.5 rounded-app-chip border px-3 text-[12px] font-bold tracking-[.01em] whitespace-nowrap hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-selected";

export function Chip({
  on = false,
  onClick,
  href,
  icon,
  count,
  disabled,
  className = "",
  children,
}: {
  on?: boolean;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const tone = on
    ? "border-app-selected bg-app-tint text-app-active hover:text-app-active"
    : "border-app-line-gold bg-app-surface text-app-ink hover:text-app-ink";
  const inner = (
    <>
      {icon && <span className={`grid size-3.5 place-items-center [&>svg]:size-3.5 ${on ? "text-app-accent" : "text-app-ink-2"}`}>{icon}</span>}
      {children}
      {count ? (
        <i className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-app-tint-2 px-[5px] text-[10px] font-bold text-app-active not-italic">
          {count}
        </i>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} aria-current={on ? "true" : undefined} className={`${CHIP} ${tone} ${className}`}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled} className={`${CHIP} ${tone} disabled:opacity-40 ${className}`}>
      {inner}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  size?: "md" | "sm";
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = options.findIndex((o) => o.value === value);
  // Roving tab stop: the selected option, else the first enabled one.
  const tabStop = current >= 0 && !options[current].disabled ? current : (enabled[0] ?? -1);

  const move = (from: number, step: 1 | -1) => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + step + enabled.length) % enabled.length];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={`rounded-app-chip border px-3 font-semibold disabled:opacity-40 ${size === "sm" ? "min-h-8 text-[12px]" : "min-h-10 text-[13px]"} ${
              on ? "border-app-primary bg-app-primary text-app-on-primary" : "border-app-line bg-app-surface text-app-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const TAG_TONES = {
  gold: "bg-app-tint-2 text-app-active",
  new: "bg-app-tint-2 text-app-active",
  live: "bg-app-urgent text-white",
  success: "bg-app-success-bg text-app-success",
  error: "bg-app-error-bg text-app-error",
  info: "bg-app-info-bg text-app-info",
  neutral: "bg-app-bg text-app-ink-2",
} as const;

export function Tag({
  tone = "gold",
  className = "",
  children,
}: {
  tone?: keyof typeof TAG_TONES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex h-6 items-center rounded-app-chip px-2 text-[11px] font-bold whitespace-nowrap ${TAG_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
