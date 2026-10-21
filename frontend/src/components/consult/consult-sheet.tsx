"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Astrologer, ConsultMode, WelcomeBenefit } from "@/lib/types";
import { rateFor, rupee } from "@/lib/format";
import { Portrait } from "../astrologer/parts";
import ModeIcon from "@/components/ui/mode-icon";

// "Consult now" opens this sheet (the app's consult sheet, laid out for the web): Chat, Voice
// Call and Video Call at the astrologer's rate, and Instant Call at its own rate. It follows the
// astrologer's availability while open: busy → every option is shown but disabled (for everyone,
// including the customer who is in that call), live → join their room instead, offline → unavailable.

export type ConsultChoice = ConsultMode | "instant";

/** The rate the customer is shown for a choice — sent with the request so a price change can't surprise them. */
export function quotedRateFor(a: Astrologer, choice: ConsultChoice): number {
  return choice === "instant" ? a.instant : rateFor(a.price, choice);
}

/** "3× standard" from the astrologer's real multiplier (never a fixed figure). */
export function multiplierLabel(a: Astrologer): string {
  const m = a.instantMultiplier || a.instant / Math.max(1, a.price);
  return `${Math.round(m * 10) / 10}× standard`;
}

const ROWS: { key: ConsultChoice; title: string; body: string }[] = [
  { key: "chat", title: "Chat", body: "Type back and forth. Best for a single, specific question." },
  { key: "voice", title: "Voice Call", body: "A masked call — your number is never shown." },
  { key: "video", title: "Video Call", body: "Face to face. Needs a stable connection on both sides." },
  { key: "instant", title: "Instant Call", body: "Rings them straight away; they have 3 minutes to accept." },
];

export const CHOICE_TITLE: Record<ConsultChoice, string> = { chat: "Chat", voice: "Voice call", video: "Video call", instant: "Instant Call" };

export interface RateChange {
  choice: ConsultChoice;
  from: number;
  to: number;
}

export default function ConsultSheet({
  astrologer: a,
  choice,
  onChoose,
  balance,
  welcome,
  busy,
  error,
  rateChange,
  onAcceptRate,
  onStart,
  onClose,
}: {
  astrologer: Astrologer;
  choice: ConsultChoice | null;
  onChoose: (choice: ConsultChoice) => void;
  /** Wallet balance (₹) */
  balance: number;
  /** The customer's usable welcome free call, or null */
  welcome: WelcomeBenefit | null;
  /** A request is being placed */
  busy: boolean;
  error: string;
  /** The API refused because the rate changed since it was shown */
  rateChange: RateChange | null;
  onAcceptRate: () => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const state = a.availability;
  const freeMins = welcome ? Math.round(welcome.freeSeconds / 60) : 0;
  // A free call here: the customer holds one and the astrologer takes free calls right now.
  const freeHere = !!welcome && a.freeCall && state === "on";
  const isFree = (c: ConsultChoice | null) => freeHere && !!c && c !== "instant" && welcome!.modes.includes(c);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = state === "on" ? choice : null;
  const rate = selected ? quotedRateFor(a, selected) : 0;
  const needed = rate * 5;
  const free = isFree(selected);
  const eligible = free || balance >= needed;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-[rgba(28,25,23,.5)] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consult-sheet-title"
        tabIndex={-1}
        className="relative motion-safe:animate-[azToastIn_.28s_ease-out_both] max-h-[92dvh] w-full overflow-y-auto rounded-t-[26px] bg-paper px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(11,31,51,.22)] outline-none sm:max-w-[520px] sm:rounded-[26px] sm:px-6 sm:pb-7 sm:pt-6"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-stone-300 sm:hidden" />
        <div className="flex items-center gap-3">
          <Portrait astrologer={a} size={48} statusDot />
          <div className="min-w-0 flex-1">
            <h2 id="consult-sheet-title" className="truncate font-display text-[24px] font-semibold leading-tight text-ink">
              {state === "live" ? `${a.name} is live` : state === "off" ? `${a.name} is unavailable` : `Consult ${a.name}`}
            </h2>
            <SheetLead state={state} freeHere={freeHere} freeMins={freeMins} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center self-start rounded-full bg-cream text-base text-stone-600 hover:bg-line-soft"
          >
            ✕
          </button>
        </div>

        {state === "live" && (
          <div className="mt-5">
            <p className="text-[14px] leading-[1.55] text-stone-600">
              {a.name} is live — private consults aren&apos;t available while they&apos;re in a live room. Join the room to watch,
              or come back when they&apos;re available.
            </p>
            <Link
              href={`/live?room=${encodeURIComponent(a.id)}`}
              onClick={onClose}
              className="mt-5 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-urgent text-[15px] font-bold text-white hover:text-white hover:no-underline"
            >
              <span className="az-live-dot size-2 rounded-full bg-white" aria-hidden="true" />
              Join live
            </Link>
            <CloseRow onClose={onClose} />
          </div>
        )}

        {state === "off" && (
          <div className="mt-5">
            <p className="text-[14px] leading-[1.55] text-stone-600">
              They aren&apos;t taking consultations right now. This sheet switches on by itself when they come online.
            </p>
            <Link
              href="/astrologers?availability=Available"
              onClick={onClose}
              className="az-cta mt-5 flex h-12 items-center justify-center rounded-[14px] text-[15px] font-bold hover:text-cta-ink hover:no-underline"
            >
              See astrologers available now
            </Link>
            <CloseRow onClose={onClose} />
          </div>
        )}

        {(state === "on" || state === "busy") && (
          <>
            {state === "busy" && (
              <div role="status" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-[1.5] text-rose-900">
                <b className="block text-rose-800">{a.name} is in a consultation</b>
                Every option opens again by itself as soon as they&apos;re free{a.eta ? ` — usually ${a.eta.replace(/^~/, "")}` : ""}.
              </div>
            )}

            <div role="radiogroup" aria-label="How would you like to talk?" className="mt-4 flex flex-col gap-2">
              {ROWS.map((row) => {
                const on = selected === row.key;
                const instant = row.key === "instant";
                const rowFree = isFree(row.key);
                const disabled = state !== "on";
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={disabled}
                    disabled={disabled}
                    onClick={() => onChoose(row.key)}
                    className={`group flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                      disabled
                        ? "border-rose-100 bg-white/70"
                        : on
                          ? instant
                            ? "border-blue-600 bg-blue-50"
                            : "border-amber-500 bg-amber-50"
                          : instant
                            ? "border-blue-200 bg-white hover:border-blue-400"
                            : "border-line bg-white hover:border-amber-300"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-10 shrink-0 place-items-center rounded-xl ${disabled ? "bg-stone-100 text-stone-400" : instant ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}
                    >
                      <ModeIcon mode={row.key} size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className={`block text-[15.5px] font-bold ${disabled ? "text-stone-500" : instant ? "text-blue-800" : "text-ink"}`}>
                        {row.title}
                      </b>
                      <span className={`mt-0.5 block text-[12.5px] leading-snug ${disabled ? "font-semibold text-rose-700" : "text-stone-500"}`}>
                        {disabled ? `In consultation${a.eta ? ` · wait ${a.eta}` : ""}` : instant ? `${multiplierLabel(a)} · ${row.body}` : row.body}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {rowFree ? (
                        <>
                          <b className="block text-[14.5px] font-extrabold text-emerald-700">Free · {freeMins} min</b>
                          <span className="block text-[11px] text-stone-500">then {rupee(quotedRateFor(a, row.key))}/min</span>
                        </>
                      ) : (
                        <b className={`text-[15px] tabular-nums ${disabled ? "text-stone-400" : instant ? "text-blue-700" : "text-plum"}`}>
                          {rupee(quotedRateFor(a, row.key))}/min
                        </b>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {welcome && state === "on" && !a.freeCall && (
              <p className="mt-3 text-[12.5px] leading-normal text-stone-500">
                Your free call works with astrologers marked “Free call”.{" "}
                <Link href="/astrologers?availability=Free%20call" onClick={onClose} className="font-bold text-amber-700 underline">
                  See them
                </Link>
              </p>
            )}

            {selected && (
              <ChoiceDetail astrologer={a} choice={selected} free={free} freeMins={freeMins} balance={balance} eligible={eligible} onClose={onClose} />
            )}

            {rateChange && rateChange.choice === selected ? (
              <div role="alert" className="mt-4 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3.5">
                <b className="block text-[14px] text-amber-900">
                  The rate changed from {rupee(rateChange.from)} to {rupee(rateChange.to)}/min — continue at {rupee(rateChange.to)}?
                </b>
                <span className="mt-1 block text-[12.5px] leading-normal text-amber-900/80">
                  Nothing has started and you haven&apos;t been charged. Once you start, this rate is fixed for the whole session.
                </span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={onClose} className="h-11 rounded-xl border border-amber-300 bg-white text-[14px] font-bold text-amber-900">
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={onAcceptRate}
                    disabled={busy}
                    className="h-11 rounded-xl bg-amber-500 text-[14px] font-bold text-ink disabled:opacity-60"
                  >
                    Continue at {rupee(rateChange.to)}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <p role="alert" className="mt-3 text-center text-[13px] font-semibold text-rose-700">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onStart}
                  disabled={!selected || !eligible || busy}
                  className={`mt-4 min-h-[54px] w-full rounded-[14px] text-[15.5px] font-bold transition-colors ${
                    !selected || !eligible || busy
                      ? "cursor-not-allowed bg-stone-200 text-stone-500"
                      : selected === "instant"
                        ? "bg-blue-700 text-white hover:bg-blue-800"
                        : free
                          ? "bg-emerald-700 text-white hover:bg-emerald-800"
                          : "az-cta"
                  }`}
                >
                  {startLabel(state, selected, free, rate, busy)}
                </button>
              </>
            )}
            <p className="mt-3 text-center text-[12px] leading-normal text-stone-500">
              Nothing is billed before the call connects — a request that doesn&apos;t connect costs ₹0.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function startLabel(state: Astrologer["availability"], choice: ConsultChoice | null, free: boolean, rate: number, busy: boolean): string {
  if (state === "busy") return "In consultation";
  if (busy) return choice === "instant" ? "Placing the call…" : "Starting…";
  if (!choice) return "Choose how to talk";
  if (choice === "instant") return `Confirm ${rupee(rate)}/min`;
  if (free) return `Start free ${CHOICE_TITLE[choice].toLowerCase()}`;
  return `Start ${CHOICE_TITLE[choice].toLowerCase()} · ${rupee(rate)}/min`;
}

function SheetLead({ state, freeHere, freeMins }: { state: Astrologer["availability"]; freeHere: boolean; freeMins: number }) {
  if (state === "live") return <p className="mt-0.5 text-[12.5px] font-semibold text-orange-700">Hosting a live room now</p>;
  if (state === "off") return <p className="mt-0.5 text-[12.5px] text-stone-500">Offline right now</p>;
  if (state === "busy") return <p className="mt-0.5 text-[12.5px] font-semibold text-rose-700">In consultation</p>;
  if (freeHere) {
    return (
      <p className="mt-0.5 text-[12.5px] text-stone-600">
        <span className="font-bold text-emerald-700">{freeMins} minutes free</span> · Chat or Voice. Video and Instant Call stay paid.
      </p>
    );
  }
  return <p className="mt-0.5 text-[12.5px] text-stone-500">Billed per minute once you connect. The first minute is free.</p>;
}

/** What happens with the chosen option, and whether the balance covers it. */
function ChoiceDetail({
  astrologer: a,
  choice,
  free,
  freeMins,
  balance,
  eligible,
  onClose,
}: {
  astrologer: Astrologer;
  choice: ConsultChoice;
  free: boolean;
  freeMins: number;
  balance: number;
  eligible: boolean;
  onClose: () => void;
}) {
  const rate = quotedRateFor(a, choice);
  const needed = rate * 5;
  if (free) {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-[13px] leading-[1.55] text-emerald-900">
        <b className="block text-[14px] text-emerald-800">🎁 Your free call · {freeMins} minutes</b>
        Complimentary {freeMins} minutes, then {rupee(rate)}/min if you continue.{" "}
        {balance >= rate
          ? `When the free time ends, the call carries on from your balance (${rupee(balance)}) — end it any time.`
          : "No balance is needed: with an empty wallet the call ends when the free time does. You can add money during the call to keep going."}
      </div>
    );
  }
  return (
    <div className="mt-4">
      {choice === "instant" && (
        <div className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-[13px] leading-[1.55] text-blue-900">
          <div className="flex flex-wrap items-baseline gap-2">
            <b className="text-[22px] tabular-nums text-blue-900">{rupee(a.instant)}</b>
            <span className="text-[13px] font-semibold">/min</span>
            <span className="ml-auto inline-flex h-6 items-center rounded-full bg-orange-100 px-2.5 text-[11.5px] font-extrabold text-orange-700">
              {multiplierLabel(a)}
            </span>
          </div>
          Standard rate {rupee(a.price)}/min. {a.name} is asked straight away and has 3 minutes to accept — you go into the
          call as soon as they do. If they decline or don&apos;t answer, you&apos;re not charged.
        </div>
      )}
      {eligible ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] leading-[1.55] text-emerald-800">
          ✓ Your balance is {rupee(balance)}. You need {rupee(needed)} for five minutes at {rupee(rate)}/min — you are eligible.
        </div>
      ) : (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] leading-[1.55] text-rose-900">
          Your balance is {rupee(balance)}. You need {rupee(needed)} for five minutes at {rupee(rate)}/min.{" "}
          <Link href="/wallet#add-money" onClick={onClose} className="font-bold underline">
            Add money
          </Link>{" "}
          to continue.
        </div>
      )}
    </div>
  );
}

function CloseRow({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="mt-2.5 min-h-[48px] w-full rounded-[14px] border border-line bg-white text-[15px] font-bold text-ink"
    >
      Close
    </button>
  );
}
