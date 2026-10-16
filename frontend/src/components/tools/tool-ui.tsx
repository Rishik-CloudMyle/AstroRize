"use client";

import Link from "next/link";
import type { Tool } from "@/lib/types";
import { RASHIS } from "@/lib/astro";
import { useAppUI } from "../app-provider";

// Building blocks shared by the free tools: form card, fields, result card, toggles, tables.

export const inputClass =
  "mt-1.5 h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-amber-500 disabled:bg-stone-100";

export const thClass =
  "border-b-2 border-line bg-cream px-2.5 py-[9px] text-left text-[11px] uppercase tracking-[.08em] text-stone-500";
export const tdClass = "border-b border-line-soft px-2.5 py-[9px] text-stone-600";

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-stone-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-snug text-stone-500">{hint}</span>}
    </label>
  );
}

/** A red line under a form, for validation and API errors. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">
      {children}
    </p>
  );
}

export function FormCard({
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
      className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]"
    >
      <h2 className="font-display text-[26px] font-semibold text-ink">{title}</h2>
      {intro && <div className="mt-1 max-w-[62ch] text-sm text-stone-600">{intro}</div>}
      <div className={`mt-4 grid gap-3.5 ${columns ? "sm:grid-cols-2" : ""}`}>{children}</div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="az-cta mt-5 h-12 w-full rounded-full px-6 text-[15px] font-bold disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}

export function SignSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {RASHIS.map((s) => (
        <option key={s.en} value={s.en}>
          {s.en} ({s.sa})
        </option>
      ))}
    </select>
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
    <section aria-live="polite" className="az-rise mt-6 min-w-0 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">{eyebrow}</div>
          <h2 className="mt-1 break-words font-display text-[28px] font-semibold leading-tight text-ink">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {sharePath && (
            <button
              type="button"
              onClick={copyLink}
              className="h-[34px] rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink"
            >
              Copy link
            </button>
          )}
        </div>
      </div>
      <div className="mt-5 min-w-0">{children}</div>
      <div className="mt-[18px] flex items-start gap-3 rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px]">
        <span className="text-[15px] leading-[1.3]">ⓘ</span>
        <div className="text-[13px] leading-normal text-blue-800">
          <b>AI-generated — for guidance; not professional advice.</b> Read the{" "}
          <Link href="/terms#ai">full disclaimer</Link>.
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3.5">
        <span className="text-xs text-stone-500">
          {sharePath ? "Share this result with “Copy link”" : `Astrorize free ${tool.name.toLowerCase()}`}
        </span>
        <Link
          href="/astrologers"
          className="az-cta inline-flex h-[42px] items-center rounded-full px-5 text-sm font-bold hover:text-cta-ink hover:no-underline"
        >
          Ask an astrologer about this →
        </Link>
      </div>
    </section>
  );
}

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
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            className={`h-[34px] rounded-full border px-3.5 text-[13px] font-bold ${
              on ? "border-amber-500 bg-amber-500 text-ink" : "border-line bg-white text-stone-600"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A soft placeholder block while a result loads. */
export function LoadingCard({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <div className="text-[13px] font-semibold text-stone-500">{label}</div>
      <div className="mt-4 grid gap-2.5">
        <div className="h-5 w-2/3 animate-pulse rounded-full bg-line-soft" />
        <div className="h-5 w-1/2 animate-pulse rounded-full bg-line-soft" />
        <div className="h-24 animate-pulse rounded-2xl bg-line-soft" />
      </div>
    </section>
  );
}

/** "Calculated by …" footnote under computed results. */
export function EngineLine({ engine, extra }: { engine: string; extra?: string }) {
  return (
    <p className="mt-3 text-[11.5px] text-stone-500">
      Calculated by Astrorize&apos;s astrology engine ({engine}){extra ? ` · ${extra}` : ""}.
    </p>
  );
}
