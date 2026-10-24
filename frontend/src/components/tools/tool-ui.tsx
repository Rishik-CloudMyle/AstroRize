"use client";

import Link from "next/link";
import type { Tool } from "@/lib/types";
import { APP_CTA, APP_SECONDARY } from "../account/app-look";
import { useAppUI } from "../app-provider";
import { ToolMedallion } from "./tool-icons";

// Building blocks shared by the free tools: panels, form card, fields, result card, stat chips,
// toggles, tables and loading skeletons — one look for every tool. Below 1024px the same blocks take
// the mobile app prototype's look (white 16px cards, 50px inputs, flat gold button) via max-lg: classes.

/** A tool panel: warm paper card with a soft shadow. */
export const panelClass =
  "relative min-w-0 rounded-3xl border border-line-warm bg-paper shadow-[0_1px_0_rgba(255,255,255,.9)_inset,0_12px_32px_rgba(62,38,18,.06)] max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card";
export const panelPad = "p-5 sm:p-7 max-lg:p-4!";

/** A text input without the top margin (for inputs that sit beside a button). */
export const inputBase =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-[14.5px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-stone-500 hover:border-[#dccfb9] focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(245,158,11,.18)] disabled:bg-stone-100 max-lg:h-[50px] max-lg:rounded-app-input max-lg:border-app-line max-lg:text-[16px] max-lg:focus:border-app-selected";
export const inputClass = `mt-1.5 ${inputBase}`;

export const thClass =
  "border-b border-line-warm bg-[#faf3e3] px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.08em] text-amber-900";
export const tdClass = "border-b border-line-soft px-3 py-2.5 text-stone-600";

/** The small gold hairline across the top of a panel. */
export function GoldHairline() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-[#d6a84a] to-transparent"
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[12.5px] font-semibold text-stone-700 max-lg:text-[12px] max-lg:font-medium max-lg:text-app-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] leading-snug text-stone-500 max-lg:text-app-ink-3">{hint}</span>}
    </label>
  );
}

/** A red line under a form, for validation and API errors. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 max-lg:rounded-app-btn">
      {children}
    </p>
  );
}

/** A section heading inside a result: display serif with a small gold diamond. */
export function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`mb-3 flex items-center gap-2 font-display text-[22px] font-semibold leading-tight text-ink max-lg:text-[20px] ${className}`}>
      <span aria-hidden="true" className="size-[7px] shrink-0 rotate-45 bg-[#d6a84a]" />
      {children}
    </h3>
  );
}

/** The heading block of a panel: optional tool medallion, title and intro. */
export function PanelHeading({ toolId, title, intro }: { toolId?: string; title: string; intro?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      {toolId && (
        <span className="mt-0.5 hidden min-[400px]:block">
          <ToolMedallion id={toolId} />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="font-display text-[26px] font-semibold leading-tight text-ink sm:text-[28px] max-lg:text-[24px]!">{title}</h2>
        {intro && <div className="mt-1.5 max-w-[64ch] text-[14px] leading-normal text-stone-600 max-lg:text-[12.5px] max-lg:text-app-ink-2">{intro}</div>}
      </div>
    </div>
  );
}

/** A plain panel with the tool heading (used where there's no form to submit, e.g. Tarot). */
export function Panel({
  toolId,
  title,
  intro,
  children,
  className = "",
}: {
  toolId?: string;
  title?: string;
  intro?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-6 max-lg:mt-3.5 ${panelClass} ${panelPad} ${className}`}>
      <GoldHairline />
      {title && <PanelHeading toolId={toolId} title={title} intro={intro} />}
      {children}
    </section>
  );
}

export function FormCard({
  toolId,
  title,
  intro,
  onSubmit,
  submitLabel,
  busy = false,
  busyLabel = "Working it out…",
  error,
  children,
  columns = true,
}: {
  /** Shows the tool's gold medallion beside the title. */
  toolId?: string;
  title: string;
  intro?: React.ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  children: React.ReactNode;
  /** Two columns on wider screens (default); false for a single column. */
  columns?: boolean;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      className={`mt-6 max-lg:mt-3.5 ${panelClass} ${panelPad}`}
    >
      <GoldHairline />
      <PanelHeading toolId={toolId} title={title} intro={intro} />
      <div className={`mt-5 grid gap-x-5 gap-y-4 max-lg:mt-4 max-lg:gap-y-3 ${columns ? "sm:grid-cols-2" : ""}`}>{children}</div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <SubmitButton busy={busy} label={submitLabel} busyLabel={busyLabel} />
    </form>
  );
}

/** The gold submit button of a tool form, with a spinner while it works. */
export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className={`az-cta mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-[15px] font-bold disabled:cursor-wait disabled:opacity-75 sm:w-auto max-lg:mt-5 ${APP_CTA}`}
    >
      {busy && <Spinner />}
      {busy ? busyLabel : label}
    </button>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-cta-ink/25 border-t-cta-ink" />;
}

/**
 * A key fact: small uppercase label, bold value and an optional line under it. `tone` tints
 * warnings (Rahu Kaal…) and good news; `icon` sits before the label.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "plain",
  icon,
  big = false,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "plain" | "gold" | "warn" | "good";
  icon?: React.ReactNode;
  /** A larger value, for the headline facts of a result. */
  big?: boolean;
  children?: React.ReactNode;
}) {
  const box = {
    plain: "border-line-warm bg-white",
    gold: "border-[#ecd49a] bg-linear-to-b from-[#fffaf0] to-[#fbefd2]",
    warn: "border-orange-200 bg-orange-50",
    good: "border-emerald-200 bg-emerald-50",
  }[tone];
  const labelTone = tone === "warn" ? "text-orange-800" : tone === "good" ? "text-emerald-800" : "text-amber-900";
  return (
    <div className={`min-w-0 rounded-2xl border px-4 py-3.5 ${box}`}>
      <div className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[.09em] ${labelTone}`}>
        {icon}
        {label}
      </div>
      <div className={`mt-1 break-words font-bold leading-snug text-ink ${big ? "text-[19px] sm:text-[21px]" : "text-[16px]"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] leading-snug text-stone-600">{sub}</div>}
      {children}
    </div>
  );
}

/**
 * The result panel: title, extra header buttons, disclaimer and the astrologer CTA. `sharePath`
 * (e.g. "/free-tools/tarot?cards=1-5-9") adds a "Copy link" that reopens this exact result;
 * results that are private or personal (Kundli, matchmaking) have none.
 */
export function ResultCard({
  tool,
  title,
  eyebrow = "Your result",
  actions,
  sharePath,
  children,
}: {
  tool: Tool;
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  sharePath?: string;
  children: React.ReactNode;
}) {
  const { toast } = useAppUI();

  async function copyLink() {
    if (!sharePath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
      toast(`${tool.name} result link copied to your clipboard.`);
    } catch {
      toast("Couldn't copy automatically — copy the link from your address bar.");
    }
  }

  return (
    <section aria-live="polite" className={`az-rise mt-6 max-lg:mt-3.5 ${panelClass} ${panelPad}`}>
      <GoldHairline />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line-soft pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-amber-800">
            <span aria-hidden="true">✦</span>
            {eyebrow}
          </div>
          <h2 className="mt-1 break-words font-display text-[28px] font-semibold leading-tight text-ink sm:text-[32px] max-lg:text-[26px]!">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {sharePath && (
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink hover:border-amber-400"
            >
              <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
              </svg>
              Copy link
            </button>
          )}
        </div>
      </div>
      <div className="mt-6 min-w-0">{children}</div>
      <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px] max-lg:rounded-app-btn max-lg:border-0 max-lg:bg-app-info-bg">
        <span className="text-[15px] leading-[1.3]">ⓘ</span>
        <div className="text-[13px] leading-normal text-blue-800">
          <b>AI-generated — for guidance; not professional advice.</b> Read the{" "}
          <Link href="/terms#ai" className="text-blue-900 underline">
            full disclaimer
          </Link>
          .
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3.5">
        <span className="text-[12.5px] text-stone-500">
          {sharePath ? "Share this result with “Copy link”" : `Astrorize free ${tool.name.toLowerCase()}`}
        </span>
        <Link
          href="/astrologers"
          className={`az-cta inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-sm font-bold hover:text-cta-ink hover:no-underline sm:w-auto ${APP_CTA} max-lg:text-[15px]`}
        >
          Ask an astrologer about this →
        </Link>
      </div>
    </section>
  );
}

/** A two-or-more option segmented control. */
export function PillToggle({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-full border border-line-warm bg-[#f8f0de] p-1 max-lg:border-app-line max-lg:bg-app-surface"
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`h-8 rounded-full px-3.5 text-[13px] font-bold ${
              on ? "bg-amber-500 text-ink shadow-[0_2px_6px_rgba(180,83,9,.25)] max-lg:bg-app-primary max-lg:shadow-none" : "text-stone-600 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A skeleton of a result while it loads: header, a row of stat chips and a block. */
export function LoadingCard({ label }: { label: string }) {
  return (
    <section aria-busy="true" className={`mt-6 max-lg:mt-3.5 ${panelClass} ${panelPad}`}>
      <GoldHairline />
      <div className="flex items-center gap-2 text-[13px] font-semibold text-amber-900" role="status">
        <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
        {label}
      </div>
      <div className="mt-4 h-8 w-2/3 max-w-[340px] animate-pulse rounded-full bg-line-soft" />
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-2xl bg-line-soft" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <div className="mt-3 h-32 animate-pulse rounded-2xl bg-line-soft" />
    </section>
  );
}

/** An error panel with a retry button. */
export function FailedCard({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className={`mt-6 max-lg:mt-3.5 ${panelClass} ${panelPad}`}>
      <ErrorNote>{error}</ErrorNote>
      <button
        type="button"
        onClick={retry}
        className={`mt-3 h-10 rounded-full border border-line bg-white px-4 text-[13px] font-bold text-ink hover:border-amber-400 ${APP_SECONDARY}`}
      >
        Try again
      </button>
    </section>
  );
}

/** "Calculated by …" footnote under computed results. */
export function EngineLine({ engine, extra }: { engine: string; extra?: string }) {
  return (
    <p className="mt-3 text-[12px] text-stone-500">
      Calculated by Astrorize&apos;s astrology engine ({engine}){extra ? ` · ${extra}` : ""}.
    </p>
  );
}
