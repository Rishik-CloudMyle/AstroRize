"use client";

import Image from "next/image";
import type { Astrologer, Settlement } from "@/lib/types";
import { clock, duration, rupee, skillLine } from "@/lib/format";

// The in-call screen and the settlement after it. Calm and premium: the astrologer's portrait
// breathes inside a soft halo, a ring around it fills as the session's time is used, and the
// numbers that matter (time, rate, cost) sit underneath. Motion stops under reduced-motion.

/** Longest single consultation (seconds), same as the API's cap. */
const MAX_SESSION_SECONDS = 15 * 60;
/** Paid balance left (seconds) at which the low-balance reminder appears. */
const LOW_BALANCE_SECONDS = 120;

const RING = 2 * Math.PI * 70;

/** "Two minutes", counting a part-minute as a minute. */
function minutesWord(secs: number): string {
  const m = Math.max(1, Math.ceil(secs / 60));
  return m === 1 ? "One minute" : m === 2 ? "Two minutes" : `${m} minutes`;
}

export function CallStage({
  astrologer,
  modeTitle,
  instant,
  complimentary,
  rate,
  held,
  elapsed,
  freeSeconds,
  maxSeconds,
  reminderSeconds,
  ending,
  onEnd,
  onAddMoney,
}: {
  astrologer: Astrologer;
  modeTitle: string;
  instant: boolean;
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
  ending: boolean;
  onEnd: () => void;
  onAddMoney: () => void;
}) {
  const inFree = elapsed < freeSeconds;
  const freeLeft = Math.max(0, freeSeconds - elapsed);
  const left = Math.max(0, maxSeconds - elapsed);
  const billed = Math.ceil(Math.max(0, elapsed - freeSeconds) / 60);
  const cost = Math.min(billed * rate, held);
  // Limited by the balance (not only the 15-minute cap): the call ends when it runs out.
  const balanceLimited = maxSeconds < MAX_SESSION_SECONDS;
  // A free call that can't continue after its free time (nothing held to pay for more).
  const endsWithFree = complimentary && maxSeconds <= freeSeconds;
  const freeReminder = complimentary && inFree && freeLeft <= reminderSeconds;
  const lowBalance = !inFree && balanceLimited && left <= LOW_BALANCE_SECONDS;
  const progress = Math.min(1, elapsed / Math.max(1, maxSeconds));
  const tone = lowBalance || (freeReminder && endsWithFree) ? "#fb7185" : inFree ? "#34d399" : "#fbbf24";

  return (
    <div>
      <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_50%_0%,#3b2a5e_0%,#1f1630_45%,#120d1c_100%)] px-5 pb-6 pt-5 text-center text-line shadow-[0_24px_60px_rgba(18,13,28,.35)] sm:px-8">
        {/* Soft stars of light behind everything */}
        <span aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-amber-400/10 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-10 size-64 rounded-full bg-fuchsia-400/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/10 px-3 text-[12px] font-bold text-green-300">
            <span className="az-live-dot size-2 rounded-full bg-green-400" aria-hidden="true" />
            {modeTitle} · connected
          </span>
          <span className="inline-flex h-7 items-center rounded-full bg-white/10 px-3 text-[12px] font-bold tabular-nums text-amber-200">
            {rupee(rate)}/min
          </span>
          {instant && (
            <span className="inline-flex h-7 items-center rounded-full bg-blue-500/20 px-3 text-[12px] font-bold text-blue-200">⚡ Instant Call</span>
          )}
          {complimentary && (
            <span className="inline-flex h-7 items-center rounded-full bg-emerald-400/15 px-3 text-[12px] font-bold text-emerald-300">🎁 Free call</span>
          )}
        </div>

        <div className="relative mx-auto mt-6 grid size-[176px] place-items-center">
          {/* Halo: a slow, soft breathing glow */}
          <span
            aria-hidden="true"
            className="absolute inset-3 rounded-full motion-safe:animate-[azHalo_4.5s_ease-in-out_infinite]"
            style={{ background: `radial-gradient(circle, ${tone}55 0%, ${tone}00 70%)` }}
          />
          <span aria-hidden="true" className="az-pulse-ring absolute inset-[22px] rounded-full border border-white/25 [animation-duration:3.2s]" />
          {/* Time used, as a ring that fills */}
          <svg viewBox="0 0 160 160" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
            <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="4" />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke={tone}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - progress)}
              className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear"
            />
          </svg>
          <span className="relative block size-[120px] overflow-hidden rounded-full border-[3px] border-gold shadow-[0_0_0_6px_rgba(255,255,255,.06)]">
            <Image src={astrologer.photo} alt="" fill sizes="240px" className="object-cover" />
          </span>
        </div>

        <b className="relative mt-4 block font-name text-[20px] text-paper">{astrologer.name}</b>
        <span className="relative block text-[12.5px] text-stone-400">{skillLine(astrologer)}</span>

        <div className="relative mt-5 text-[56px] font-bold leading-none tabular-nums tracking-[-.02em] text-paper" aria-live="off">
          {clock(elapsed)}
        </div>
        <div className="relative mt-1.5 text-[12.5px] text-stone-400">elapsed · one charge after the call, never during it</div>

        {inFree && (
          <div
            className={`relative mt-4 inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] font-bold tabular-nums ${
              complimentary ? "bg-emerald-400/15 text-emerald-200" : "bg-green-400/15 text-green-300"
            }`}
            aria-live="off"
          >
            {complimentary ? <>🎁 {clock(freeLeft)} free</> : <>First minute free · {freeLeft}s left</>}
          </div>
        )}

        <div className="relative mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <Stat label="Cost so far" value={rupee(cost)} />
          <Stat label="Billed" value={`${billed} min`} />
          <Stat label={balanceLimited ? "Time left" : "Session limit"} value={clock(left)} warn={lowBalance} />
        </div>
      </div>

      {freeReminder && (
        <div
          role="status"
          className={`mt-3.5 flex flex-wrap items-start gap-3 rounded-2xl border-2 px-4 py-3.5 ${endsWithFree ? "border-amber-400 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
        >
          <span className="text-lg" aria-hidden="true">
            {endsWithFree ? "⏳" : "🎁"}
          </span>
          <div className="min-w-0 flex-1">
            <b className={`block text-[14px] ${endsWithFree ? "text-amber-900" : "text-emerald-800"}`}>
              {minutesWord(freeLeft)} of your free call left
            </b>
            <span className={`mt-0.5 block text-[13px] leading-normal ${endsWithFree ? "text-amber-900/85" : "text-emerald-900/85"}`}>
              {endsWithFree
                ? `Add money to continue at ${rupee(rate)}/min — the call stays connected while you pay.`
                : `After that the call continues at ${rupee(rate)}/min from your balance. End it any time.`}
            </span>
          </div>
          {endsWithFree && (
            <button type="button" onClick={onAddMoney} className="h-10 whitespace-nowrap rounded-xl bg-amber-500 px-4 text-[13.5px] font-bold text-ink">
              Add money
            </button>
          )}
        </div>
      )}

      {lowBalance && (
        <div role="status" className="mt-3.5 flex flex-wrap items-start gap-3 rounded-2xl border-2 border-rose-700 bg-rose-50 px-4 py-3.5">
          <span className="text-base" aria-hidden="true">
            ⚠
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-sm text-rose-700">{minutesWord(left)} of balance left</b>
            <span className="mt-0.5 block text-[13px] leading-normal text-rose-900">
              Add money now and the session continues without disconnecting.
            </span>
          </div>
          <button type="button" onClick={onAddMoney} className="h-10 whitespace-nowrap rounded-xl bg-rose-700 px-4 text-[13.5px] font-bold text-white">
            Add money
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onEnd}
        disabled={ending}
        className="mt-[18px] flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl bg-rose-700 text-base font-bold text-white shadow-[0_10px_24px_rgba(190,18,60,.25)] hover:bg-rose-800 disabled:opacity-70"
      >
        <svg viewBox="0 0 24 24" className="size-5 rotate-[135deg]" fill="currentColor" aria-hidden="true">
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
        </svg>
        {ending ? "Ending…" : "End consultation"}
      </button>
      <p className="mt-3 text-center text-[12.5px] leading-[1.55] text-stone-500">
        {complimentary
          ? "Free time is never charged. Paid minutes after it round up, and are taken in one charge when the call ends."
          : "One charge is taken after the session ends. Partial minutes round up."}
      </p>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[.06em] text-stone-500">{label}</div>
      <b className={`mt-0.5 block text-lg tabular-nums sm:text-xl ${warn ? "text-rose-300" : "text-amber-200"}`}>{value}</b>
    </div>
  );
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
  const freeMins = Math.round(s.complimentarySeconds / 60);
  const freeOnly = s.complimentary && s.billedMins === 0;
  const title = freeOnly
    ? s.reason === "exhausted"
      ? "Your free call has ended"
      : "Free call complete"
    : zero
      ? "You have not been charged"
      : s.reason === "exhausted"
        ? "Your balance ran out"
        : "Consultation complete";
  const lead = freeOnly
    ? s.reason === "exhausted"
      ? `Your ${freeMins} free minutes are up. Nothing was charged — we hope it helped.`
      : "Nothing was charged — your free call was on us."
    : s.complimentary
      ? `Your first ${freeMins} minutes were free. Only the minutes after them are charged, in one debit now.`
      : zero
        ? "You ended within the free first minute, so there is nothing to bill. The hold on your balance has been released in full."
        : s.reason === "exhausted"
          ? "The session ended on its own when your balance was used up. You have been billed only for the time you were connected — never more than was held."
          : "One debit, taken now that the session has ended. Your hold has been released.";

  const lines: { label: string; value: string; strong?: boolean; green?: boolean }[] = [{ label: "Connected time", value: duration(s.elapsed) }];
  if (s.complimentary) lines.push({ label: `Free call · first ${freeMins} min`, value: "₹0", green: true });
  else lines.push({ label: "Free first minute", value: "not billed", green: true });
  if (!freeOnly) lines.push({ label: s.complimentary ? "Paid after the free time, rounded up" : "Billed, rounded up", value: `${s.billedMins} min` });
  if (!zero) {
    lines.push({ label: "Rate, fixed when you started", value: `${rupee(s.rate)}/min` });
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
            <span className="block text-[12px] text-stone-500">{s.complimentary ? "Welcome free call" : "Consultation"}</span>
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
