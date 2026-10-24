"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Astrologer, Settlement } from "@/lib/types";
import { clock, duration, rupee } from "@/lib/format";
import { freeLength, freeLengthLong } from "@/lib/free-calls";
import { VerifiedTick } from "../astrologer/parts";

// The customer's meter inside the session window (time, cost, free time, the reminders that
// come with them) and the settlement after it. The numbers follow the API's own billing rules:
// the free window is never billed, paid minutes round up, and one charge is taken at the end.

/** Longest single consultation (seconds), same as the API's cap. */
const MAX_SESSION_SECONDS = 15 * 60;
/** Paid balance left (seconds) at which the low-balance reminder appears. */
const LOW_BALANCE_SECONDS = 120;

/** "Two minutes", counting a part-minute as a minute. */
function minutesWord(secs: number): string {
  const m = Math.max(1, Math.ceil(secs / 60));
  return m === 1 ? "One minute" : m === 2 ? "Two minutes" : `${m} minutes`;
}

export interface MeterInput {
  /** A welcome free call */
  complimentary: boolean;
  /** Rate fixed for this session (₹/min) */
  rate: number;
  /** Balance held for the session (₹) */
  held: number;
  elapsed: number;
  freeSeconds: number;
  maxSeconds: number;
  reminderSeconds: number;
}

/** Where the session stands, from the customer's side. */
export function meterOf(m: MeterInput) {
  const inFree = m.elapsed < m.freeSeconds;
  const freeLeft = Math.max(0, m.freeSeconds - m.elapsed);
  const left = Math.max(0, m.maxSeconds - m.elapsed);
  const billed = Math.ceil(Math.max(0, m.elapsed - m.freeSeconds) / 60);
  const cost = Math.min(billed * m.rate, m.held);
  // Limited by the balance (not only the 15-minute cap): the call ends when it runs out. A free
  // call's paid part (after its free time) has the 15-minute cap of its own.
  const balanceLimited = m.maxSeconds - (m.complimentary ? m.freeSeconds : 0) < MAX_SESSION_SECONDS;
  // A free call that can't continue after its free time (nothing held to pay for more).
  const endsWithFree = m.complimentary && m.maxSeconds <= m.freeSeconds;
  const freeReminder = m.complimentary && inFree && freeLeft <= m.reminderSeconds;
  const lowBalance = !inFree && balanceLimited && left <= LOW_BALANCE_SECONDS;
  return { inFree, freeLeft, left, billed, cost, balanceLimited, endsWithFree, freeReminder, lowBalance };
}

const chip = "inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-bold tabular-nums";
/** Below 1024px the meter sits on the app's light call screens: small tags (.chip / .tag). */
const appChip = "max-lg:h-6 max-lg:px-2.5 max-lg:text-[11px]";
const appPlain = "max-lg:border max-lg:border-app-line max-lg:bg-app-surface";

/** The badges and numbers along the top of the window. */
export function MeterChips({ m, instant }: { m: MeterInput; instant: boolean }) {
  const s = meterOf(m);
  return (
    <>
      <span className={`${chip} bg-white/10 text-amber-200 ${appChip} max-lg:bg-app-tint-2 max-lg:text-app-active`}>{rupee(m.rate)}/min</span>
      {instant && <span className={`${chip} bg-blue-500/20 text-blue-200 ${appChip} max-lg:bg-app-info-bg max-lg:text-app-info`}>⚡ Instant Call</span>}
      {s.inFree ? (
        <span
          className={`${chip} ${m.complimentary ? "bg-emerald-400/15 text-emerald-200" : "bg-green-400/15 text-green-300"} ${appChip} max-lg:bg-app-success-bg max-lg:text-app-success`}
          aria-live="off"
        >
          {m.complimentary ? <>🎁 {clock(s.freeLeft)} free</> : <>First minute free · {s.freeLeft}s</>}
        </span>
      ) : (
        <span className={`${chip} bg-white/10 text-paper ${appChip} ${appPlain} max-lg:text-app-ink`}>
          Cost so far {rupee(s.cost)} · {s.billed} min
        </span>
      )}
      <span
        className={`${chip} ${s.lowBalance ? "bg-rose-500/25 text-rose-200" : "bg-white/10 text-stone-300"} ${appChip} ${
          s.lowBalance ? "max-lg:bg-app-error-bg max-lg:text-app-error" : `${appPlain} max-lg:text-app-ink-2`
        }`}
      >
        {s.balanceLimited ? "Time left" : "Limit"} {clock(s.left)}
      </span>
    </>
  );
}

/** The free-call reminder and the low-balance warning, with "Add money" (the call stays connected). */
export function MeterAlerts({ m, onAddMoney }: { m: MeterInput; onAddMoney: () => void }) {
  const s = meterOf(m);
  if (s.freeReminder) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-3.5 py-2.5 max-lg:rounded-app-btn max-lg:border-emerald-200 max-lg:bg-app-success-bg"
      >
        <div className="min-w-0 flex-1 text-[13px] leading-normal text-emerald-100 max-lg:text-[12.5px] max-lg:text-app-success">
          <b className="block">{minutesWord(s.freeLeft)} of your free call left</b>
          {s.endsWithFree
            ? `Add money to continue at ${rupee(m.rate)}/min — the call stays connected while you pay.`
            : `After that the call continues at ${rupee(m.rate)}/min from your balance. End it any time.`}
        </div>
        {s.endsWithFree && (
          <button
            type="button"
            onClick={onAddMoney}
            className="h-9 whitespace-nowrap rounded-lg bg-amber-400 px-3.5 text-[13px] font-bold text-ink max-lg:rounded-app-btn max-lg:bg-app-primary"
          >
            Add money
          </button>
        )}
      </div>
    );
  }
  if (s.lowBalance) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-300/50 bg-rose-500/15 px-3.5 py-2.5 max-lg:rounded-app-btn max-lg:border-orange-200 max-lg:bg-[#fff7ed]"
      >
        <div className="min-w-0 flex-1 text-[13px] leading-normal text-rose-100 max-lg:text-[12.5px] max-lg:text-[#9a3412]">
          <b className="block">{minutesWord(s.left)} of balance left</b>
          Add money now and the session continues without disconnecting.
        </div>
        <button
          type="button"
          onClick={onAddMoney}
          className="h-9 whitespace-nowrap rounded-lg bg-rose-500 px-3.5 text-[13px] font-bold text-white max-lg:rounded-app-btn max-lg:bg-app-urgent"
        >
          Add money
        </button>
      </div>
    );
  }
  return null;
}

/** What ending right now costs, in one line (shown where the devices couldn't be used). */
export function endNoteOf(m: MeterInput): string {
  const s = meterOf(m);
  if (s.inFree) return "You can end now without being charged — you're still in the free time.";
  return `Ending now charges only the ${s.billed} min already used (${rupee(s.cost)}).`;
}

/** The single charge, shown once the session has ended. */
export function SettlementView({
  s,
  astrologer,
  endedByAstrologer,
  onContinue,
}: {
  s: Settlement;
  astrologer: Astrologer;
  endedByAstrologer: boolean;
  onContinue: () => void;
}) {
  const zero = s.total === 0;
  const freeLabel = freeLengthLong(s.complimentarySeconds);
  // Ended on its own (free time, balance or the paid cap used up) rather than by either side.
  const ranOut = s.reason === "exhausted" || s.reason === "cap";
  const freeOnly = s.complimentary && s.billedMins === 0;
  const callName = s.makeGood ? "free replacement call" : "free call";
  const title = freeOnly
    ? ranOut
      ? `Your ${callName} has ended`
      : s.makeGood
        ? "Free replacement call complete"
        : "Free call complete"
    : zero
      ? "You have not been charged"
      : s.reason === "exhausted"
        ? "Your balance ran out"
        : "Consultation complete";
  const lead = freeOnly
    ? ranOut
      ? `Your ${freeLabel} of free time is up. Nothing was charged — we hope it helped.`
      : `Nothing was charged — your ${callName} was on us.`
    : s.complimentary
      ? `Your free time (${freeLabel}) cost nothing. Only the minutes after it are charged, in one debit now.`
      : zero
        ? "You ended within the free first minute, so there is nothing to bill. The hold on your balance has been released in full."
        : s.reason === "exhausted"
          ? "The session ended on its own when your balance was used up. You have been billed only for the time you were connected — never more than was held."
          : "One debit, taken now that the session has ended. Your hold has been released.";

  const lines: { label: string; value: string; strong?: boolean; green?: boolean }[] = [{ label: "Connected time", value: duration(s.elapsed) }];
  if (s.complimentary)
    lines.push({ label: `${s.makeGood ? "Free replacement call" : "Free call"} · first ${freeLength(s.complimentarySeconds)}`, value: "₹0", green: true });
  else lines.push({ label: "Free first minute", value: "not billed", green: true });
  if (!freeOnly) lines.push({ label: s.complimentary ? "Paid after the free time, rounded up" : "Billed, rounded up", value: `${s.billedMins} min` });
  if (!zero) {
    if (s.listRate && s.discountPct) {
      // A claimed offer: the discounted rate, and what it saved.
      lines.push({ label: `${s.discountPct}% off applied · instead of ${rupee(s.listRate)}/min`, value: `${rupee(s.rate)}/min`, green: true });
      if (s.saved) lines.push({ label: "You saved", value: rupee(s.saved), green: true });
    } else {
      lines.push({ label: "Rate, fixed when you started", value: `${rupee(s.rate)}/min` });
    }
    lines.push({ label: "Promotional balance used first", value: `−${rupee(s.promo)}`, green: true });
    lines.push({ label: "Service balance", value: `−${rupee(s.service)}` });
  }

  return (
    <div>
      {endedByAstrologer && (
        <p className="mb-4 rounded-[14px] border border-line bg-white px-4 py-3 text-center text-[13px] text-stone-600">
          {astrologer.name} ended the consultation.
        </p>
      )}
      <div className="relative mx-auto grid size-[84px] place-items-center">
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-emerald-100 motion-safe:animate-[azHalo_3.5s_ease-in-out_infinite]" />
        <span className="relative grid size-[64px] place-items-center rounded-full bg-emerald-700 text-[28px] text-white shadow-[0_10px_24px_rgba(4,120,87,.3)]">
          {s.complimentary ? "🎁" : "✓"}
        </span>
      </div>
      <h1 className="mt-[18px] text-center font-display text-[32px] font-semibold leading-tight text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-[42ch] text-center text-sm leading-[1.55] text-stone-600">{lead}</p>

      <div className="mt-6 overflow-hidden rounded-[22px] border border-line bg-white">
        <div className="flex items-center gap-3 border-b border-dashed border-line px-5 py-3.5">
          <span className="relative block size-9 shrink-0 overflow-hidden rounded-full border-2 border-gold">
            <Image src={astrologer.photo} alt="" fill sizes="72px" className="object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[14px] text-ink">{astrologer.name}</b>
            <span className="block text-[12px] text-stone-500">{s.makeGood ? "Free replacement call" : s.complimentary ? "Welcome free call" : "Consultation"}</span>
          </div>
        </div>
        <div className="px-5 py-2">
          {lines.map((l, i) => (
            <div
              key={l.label}
              className={`flex justify-between gap-3 py-[9px] text-sm ${i > 0 ? "border-t border-line-soft" : ""}`}
              style={{ color: l.green ? "#047857" : "#57534e", fontWeight: l.green ? 600 : 500 }}
            >
              <span>{l.label}</span>
              <b className="tabular-nums">{l.value}</b>
            </div>
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-line bg-cream px-5 py-4">
          <span className="text-[14px] font-bold text-ink">{zero ? "Total charged" : "Charged once, now"}</span>
          <b className={`text-[26px] tabular-nums ${zero ? "text-emerald-700" : "text-ink"}`}>{rupee(s.total)}</b>
        </div>
      </div>
      <button type="button" onClick={onContinue} className="mt-5 min-h-[54px] w-full rounded-[14px] bg-amber-500 text-base font-bold text-ink">
        Continue
      </button>
    </div>
  );
}

// ---------- Phone/tablet (< 1024px): the app's Summary and Rating screens ----------

/** Who ended it and why, in the app's words. */
function endedLine(s: Settlement, astrologerName: string, endedByAstrologer: boolean): string {
  const freeOnly = s.complimentary && s.billedMins === 0;
  if (endedByAstrologer || s.reason === "astrologer") return `${astrologerName} ended this consultation.`;
  if (s.reason === "exhausted") return freeOnly ? "Your free time is up." : "Your usable balance ran out.";
  if (s.reason === "cap") return freeOnly ? "Your free time is up." : "The session reached its time limit.";
  return "You ended this consultation.";
}

/**
 * The app's "Summary" after a consultation (below 1024px): who, the money lines in one card, and
 * the way on — rate it, or see the wallet. The desktop keeps SettlementView.
 */
export function SettlementSummary({
  s,
  astrologer,
  mode,
  endedByAstrologer,
  balance,
  onRate,
  onClose,
}: {
  s: Settlement;
  astrologer: Astrologer;
  /** "Chat", "Voice call", "Instant Call"… */
  mode: string;
  endedByAstrologer: boolean;
  /** Spendable balance now (₹), once the wallet has been re-read. */
  balance: number;
  onRate: () => void;
  onClose: () => void;
}) {
  const zero = s.total === 0;
  const freeOnly = s.complimentary && s.billedMins === 0;
  const kind = s.makeGood ? "free replacement call" : s.complimentary ? "free call" : "pay per minute";
  const status = s.reason === "exhausted" && !freeOnly ? "Ended — balance exhausted" : "Completed";
  const note = freeOnly
    ? `₹0 — your ${s.makeGood ? "free replacement call" : "free call"} was on us.`
    : s.complimentary
      ? `The first ${freeLength(s.complimentarySeconds)} were free. Only the minutes after them are billed, rounded up.`
      : zero
        ? "₹0 — ended within the first minute."
        : "Partial minutes round up after the first 60 seconds.";
  const lines: { label: string; value: string; strong?: boolean; green?: boolean }[] = [
    { label: "Duration", value: clock(s.elapsed), strong: true },
    { label: s.complimentary ? "Billed after the free time" : "Billed", value: `${s.billedMins} min`, strong: true },
  ];
  if (s.complimentary) lines.push({ label: `Free · first ${freeLength(s.complimentarySeconds)}`, value: "₹0", green: true });
  if (!freeOnly) lines.push({ label: "Rate", value: `${rupee(s.rate)}/min`, strong: true });
  if (s.listRate && s.discountPct && !zero) {
    lines.push({ label: `${s.discountPct}% off · instead of ${rupee(s.listRate)}/min`, value: s.saved ? `−${rupee(s.saved)}` : "applied", green: true });
  }
  lines.push(
    { label: "Amount", value: rupee(s.total), strong: true },
    { label: "From promotional", value: rupee(s.promo) },
    { label: "From service", value: rupee(s.service) },
    { label: "Status", value: status, strong: true },
    { label: "Spendable now", value: rupee(balance), strong: true },
  );

  return (
    <div className="min-h-dvh bg-app-bg text-app-ink">
      <div className="sticky top-0 z-[2] flex min-h-[52px] items-center justify-between gap-2 bg-app-elev px-4 pt-[env(safe-area-inset-top)]">
        <h1 className="m-0 text-[16px] font-bold">Summary</h1>
        <button type="button" onClick={onClose} className="min-h-9 rounded-app-btn px-2 text-[14px] font-bold text-app-accent">
          Close
        </button>
      </div>
      <div className="px-4 pb-8">
        {endedByAstrologer && <span className="sr-only">{astrologer.name} ended the consultation.</span>}
        <div className="mt-2 mb-3.5 flex items-center gap-3">
          <span className="relative block size-14 shrink-0 overflow-hidden rounded-full bg-app-tint-2">
            <Image src={astrologer.photo} alt="" fill sizes="112px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <b className="block text-[16px] font-bold [overflow-wrap:anywhere]">{astrologer.name}</b>
            <p className="m-0 text-[12px] leading-[1.4] text-app-ink-3">
              {mode} · {kind} · {endedLine(s, astrologer.name, endedByAstrologer)}
            </p>
          </div>
        </div>
        <div className="rounded-app-card border border-app-line bg-app-surface px-3 py-2.5 leading-[1.6] shadow-app-card">
          {lines.map((l) => (
            <div key={l.label} className={`flex justify-between gap-3 py-1.5 text-[14px] ${l.green ? "text-app-success" : ""}`}>
              <span>{l.label}</span>
              {l.strong ? <b className="text-right tabular-nums">{l.value}</b> : <span className="text-right tabular-nums">{l.value}</span>}
            </div>
          ))}
          <p className="m-0 mt-1 text-[12px] leading-[1.45] text-app-ink-3">{note}</p>
          <p className="m-0 text-[12px] leading-[1.45] text-app-ink-3">GST was applied when you added money — not again on this sitting.</p>
        </div>
        <button type="button" onClick={onRate} className="mt-4 min-h-app-hit w-full rounded-app-btn bg-app-primary text-[15px] font-bold text-app-on-primary">
          Rate this consultation
        </button>
        <Link
          href="/wallet"
          onClick={onClose}
          className="mt-2 flex min-h-app-hit w-full items-center justify-center rounded-app-btn text-[15px] font-bold text-app-accent hover:text-app-active hover:no-underline"
        >
          View wallet
        </Link>
      </div>
    </div>
  );
}

/** The app's "Rate this consultation" card over the Summary (below 1024px). */
export function RateCard({
  astrologer,
  mode,
  stars,
  review,
  busy,
  error,
  onStars,
  onReview,
  onSubmit,
  onLater,
}: {
  astrologer: Astrologer;
  mode: string;
  stars: number;
  review: string;
  busy: boolean;
  error: string;
  onStars: (n: number) => void;
  onReview: (text: string) => void;
  onSubmit: () => void;
  onLater: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="fixed inset-0 z-[5] flex items-center justify-center bg-app-scrim p-6">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rate-card-title"
        className="max-h-full w-full max-w-[400px] overflow-y-auto rounded-app-modal bg-app-elev px-5 pt-5 pb-4 text-app-ink shadow-app-modal outline-none"
      >
        <h2 id="rate-card-title" className="m-0 text-[18px] font-bold">
          Rate this consultation
        </h2>
        <span className="relative mt-3 block size-16 overflow-hidden rounded-full bg-app-tint-2">
          <Image src={astrologer.photo} alt="" fill sizes="128px" className="object-cover" />
        </span>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <b className="min-w-0 text-[15px] font-bold [overflow-wrap:anywhere]">{astrologer.name}</b>
          <VerifiedTick size={16} />
        </div>
        <p className="m-0 mt-0.5 text-[12px] text-app-ink-3">{mode}</p>
        <p className="m-0 mt-3 text-center text-[12px] text-app-ink-2">Stars are required. Review is optional.</p>
        <div role="radiogroup" aria-label="Rating" className="mt-1 mb-2 flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => onStars(n)}
              className={`grid size-11 place-items-center rounded-app-btn text-[28px] leading-none ${n <= stars ? "text-app-primary" : "text-app-ink-3"}`}
            >
              {n <= stars ? "★" : "☆"}
            </button>
          ))}
        </div>
        {stars > 0 ? (
          <textarea
            placeholder="Add a review (optional)"
            aria-label="Review"
            value={review}
            onChange={(e) => onReview(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full resize-none rounded-app-input border border-app-line bg-app-surface px-3 py-2.5 text-[14px] text-app-ink outline-none placeholder:text-app-ink-3 focus:border-app-selected"
          />
        ) : (
          <p className="m-0 text-center text-[12px] text-app-ink-3">Choose a star rating to continue.</p>
        )}
        {error && (
          <p role="alert" className="m-0 mt-2 text-center text-[13px] font-semibold text-app-error">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!stars || busy}
          aria-busy={busy || undefined}
          className="mt-4 min-h-app-hit w-full rounded-app-btn bg-app-primary text-[15px] font-bold text-app-on-primary disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Submit rating"}
        </button>
        <button type="button" onClick={onLater} disabled={busy} className="mt-1 min-h-app-hit w-full text-[15px] font-bold text-app-accent">
          Not now
        </button>
      </div>
    </div>
  );
}
