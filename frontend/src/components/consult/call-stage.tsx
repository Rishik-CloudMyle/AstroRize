"use client";

import Image from "next/image";
import type { Astrologer, Settlement } from "@/lib/types";
import { clock, duration, rupee } from "@/lib/format";

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
  // Limited by the balance (not only the 15-minute cap): the call ends when it runs out.
  const balanceLimited = m.maxSeconds < MAX_SESSION_SECONDS;
  // A free call that can't continue after its free time (nothing held to pay for more).
  const endsWithFree = m.complimentary && m.maxSeconds <= m.freeSeconds;
  const freeReminder = m.complimentary && inFree && freeLeft <= m.reminderSeconds;
  const lowBalance = !inFree && balanceLimited && left <= LOW_BALANCE_SECONDS;
  return { inFree, freeLeft, left, billed, cost, balanceLimited, endsWithFree, freeReminder, lowBalance };
}

const chip = "inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-bold tabular-nums";

/** The badges and numbers along the top of the window. */
export function MeterChips({ m, instant }: { m: MeterInput; instant: boolean }) {
  const s = meterOf(m);
  return (
    <>
      <span className={`${chip} bg-white/10 text-amber-200`}>{rupee(m.rate)}/min</span>
      {instant && <span className={`${chip} bg-blue-500/20 text-blue-200`}>⚡ Instant Call</span>}
      {s.inFree ? (
        <span className={`${chip} ${m.complimentary ? "bg-emerald-400/15 text-emerald-200" : "bg-green-400/15 text-green-300"}`} aria-live="off">
          {m.complimentary ? <>🎁 {clock(s.freeLeft)} free</> : <>First minute free · {s.freeLeft}s</>}
        </span>
      ) : (
        <span className={`${chip} bg-white/10 text-paper`}>
          Cost so far {rupee(s.cost)} · {s.billed} min
        </span>
      )}
      <span className={`${chip} ${s.lowBalance ? "bg-rose-500/25 text-rose-200" : "bg-white/10 text-stone-300"}`}>
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
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-3.5 py-2.5">
        <div className="min-w-0 flex-1 text-[13px] leading-normal text-emerald-100">
          <b className="block">{minutesWord(s.freeLeft)} of your free call left</b>
          {s.endsWithFree
            ? `Add money to continue at ${rupee(m.rate)}/min — the call stays connected while you pay.`
            : `After that the call continues at ${rupee(m.rate)}/min from your balance. End it any time.`}
        </div>
        {s.endsWithFree && (
          <button type="button" onClick={onAddMoney} className="h-9 whitespace-nowrap rounded-lg bg-amber-400 px-3.5 text-[13px] font-bold text-ink">
            Add money
          </button>
        )}
      </div>
    );
  }
  if (s.lowBalance) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-300/50 bg-rose-500/15 px-3.5 py-2.5">
        <div className="min-w-0 flex-1 text-[13px] leading-normal text-rose-100">
          <b className="block">{minutesWord(s.left)} of balance left</b>
          Add money now and the session continues without disconnecting.
        </div>
        <button type="button" onClick={onAddMoney} className="h-9 whitespace-nowrap rounded-lg bg-rose-500 px-3.5 text-[13px] font-bold text-white">
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
