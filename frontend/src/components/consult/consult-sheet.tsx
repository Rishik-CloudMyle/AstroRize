"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Astrologer, ConsultMode, WelcomeBenefit } from "@/lib/types";
import { rateFor, rupee } from "@/lib/format";
import { freeLength, freeLengthLong, resetWeekday } from "@/lib/free-calls";
import { discountedRate, type ConsultDiscount } from "@/lib/offers";
import type { MakeGoodCredit } from "@/lib/makegood";
import { Portrait } from "../astrologer/parts";
import ModeIcon from "@/components/ui/mode-icon";

// "Consult now" opens this sheet (the app's consult sheet, laid out for the web): Chat, Voice
// Call and Video Call at the astrologer's rate, and Instant Call at its own rate. It follows the
// astrologer's availability while open: busy → every option is shown but disabled (for everyone,
// including the customer who is in that call), live → join their room instead, offline → unavailable.
// When the customer could talk free here (weekly free minutes with an astrologer marked "Free
// call", or a free replacement call), they choose "Use free minutes" or "Paid call" first — nothing
// is preselected, and a free call never starts unless they picked it (and, for free minutes, a length).

export type ConsultChoice = ConsultMode | "instant";
/** How the customer pays for this consultation when a free option exists: their choice, null until made. */
export type PayChoice = "free" | "paid";

/**
 * The rate the customer is shown for a choice — sent with the request so a price change can't
 * surprise them. `discountPct`: a claimed offer's discount (never on Instant Call).
 */
export function quotedRateFor(a: Astrologer, choice: ConsultChoice, discountPct = 0): number {
  if (choice === "instant") return a.instant;
  const rate = rateFor(a.price, choice);
  return discountPct > 0 ? discountedRate(rate, discountPct) : rate;
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
  pay = null,
  onPay,
  freeMinutes = null,
  onFreeMinutes,
  makeGood = null,
  discount = null,
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
  /** The customer's usable welcome free minutes, or null */
  welcome: WelcomeBenefit | null;
  /** Free or paid, as the customer chose it (null = not chosen yet; only asked when a free option exists here) */
  pay?: PayChoice | null;
  onPay?: (pay: PayChoice) => void;
  /** The free-call length chosen (minutes; one that fits this week), or null until chosen */
  freeMinutes?: number | null;
  onFreeMinutes?: (minutes: number) => void;
  /** A free replacement call with this astrologer (offered on a complaint), or null. Takes the place of the welcome call and offers. */
  makeGood?: MakeGoodCredit | null;
  /** A claimed consultation offer that applies to paid Chat, Voice and Video, or null */
  discount?: ConsultDiscount | null;
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
  // A free replacement call here: Chat, Voice or Video with this astrologer, free for its minutes.
  const replacement = !!makeGood && state === "on";
  // A welcome free call's length is the customer's choice (0 until chosen).
  const freeSecs = replacement ? makeGood.minutes * 60 : (freeMinutes ?? 0) * 60;
  // A free option here: the customer holds free minutes and the astrologer takes free calls right now (or a replacement call).
  const freeHere = replacement || (!!welcome && a.freeCall && state === "on");
  /** The option can be free (Chat or Voice for free minutes; Chat, Voice or Video for a replacement call). */
  const canBeFree = (c: ConsultChoice | null) => freeHere && !!c && c !== "instant" && (replacement || welcome!.modes.includes(c));
  // Free only when the customer chose it.
  const payFree = freeHere && pay === "free";
  const isFree = (c: ConsultChoice | null) => payFree && canBeFree(c);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The offer's percent off for a choice: paid Chat, Voice or Video only (not a free call, not Instant Call).
  const pctFor = (c: ConsultChoice | null) => (discount && c && c !== "instant" && !isFree(c) ? discount.pct : 0);
  const selected = state === "on" ? choice : null;
  const rate = selected ? quotedRateFor(a, selected, pctFor(selected)) : 0;
  const needed = rate * 5;
  const free = isFree(selected);
  // Where it could be free, the customer must choose free or paid first — nothing is assumed.
  const payMissing = canBeFree(selected) && pay === null;
  // A welcome free call needs its length chosen before it can start.
  const lengthMissing = free && !replacement && !freeMinutes;
  const eligible = payMissing ? false : free ? !lengthMissing : balance >= needed;
  // The rate the "Paid call" option shows: the chosen way to talk's, else Chat's (with an offer's discount).
  const paidRate = quotedRateFor(a, selected && selected !== "instant" ? selected : "chat", discount ? discount.pct : 0);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-[rgba(28,25,23,.5)] max-lg:bg-app-scrim lg:items-center lg:p-6"
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
        className="relative motion-safe:animate-[azToastIn_.28s_ease-out_both] max-h-[92dvh] w-full overflow-y-auto rounded-t-[26px] bg-paper px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(11,31,51,.22)] outline-none lg:max-w-[520px] lg:rounded-[26px] lg:px-6 lg:pb-7 lg:pt-6 max-lg:max-h-[85dvh] max-lg:overscroll-contain max-lg:rounded-t-app-modal max-lg:bg-app-elev max-lg:pb-[calc(24px+var(--app-safe-bottom))] max-lg:shadow-app-modal"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-stone-300 lg:hidden max-lg:mt-1 max-lg:w-9 max-lg:bg-app-line" />
        <div className="flex items-center gap-3">
          <Portrait astrologer={a} size={48} statusDot />
          <div className="min-w-0 flex-1">
            <h2 id="consult-sheet-title" className="truncate font-display text-[24px] font-semibold leading-tight text-ink max-lg:font-sans max-lg:text-[18px] max-lg:font-bold">
              {state === "live" ? `${a.name} is live` : state === "off" ? `${a.name} is unavailable` : `Consult ${a.name}`}
            </h2>
            <SheetLead state={state} freeHere={freeHere} freeSecs={freeSecs} replacement={replacement} welcome={welcome} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center self-start rounded-full bg-cream text-base text-stone-600 hover:bg-line-soft max-lg:size-10 max-lg:bg-app-surface max-lg:shadow-[inset_0_0_0_1px_#e7e0d6]"
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
              className="mt-5 flex h-12 items-center justify-center gap-2 rounded-[14px] max-lg:rounded-app-btn bg-urgent text-[15px] font-bold text-white hover:text-white hover:no-underline"
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
              className="az-cta mt-5 flex h-12 items-center justify-center rounded-[14px] text-[15px] font-bold hover:text-cta-ink hover:no-underline max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
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

            {freeHere && (
              <PayChooser
                pay={pay}
                onPay={onPay}
                paidRate={paidRate}
                replacement={replacement ? makeGood : null}
                welcome={replacement ? null : welcome}
                freeMinutes={freeMinutes}
                onFreeMinutes={onFreeMinutes}
              />
            )}

            <div role="radiogroup" aria-label="How would you like to talk?" className="mt-4 flex flex-col gap-2">
              {ROWS.map((row) => {
                const on = selected === row.key;
                const instant = row.key === "instant";
                const rowFree = isFree(row.key);
                // Free minutes don't cover this one (Video, Instant Call): pick "Paid call" to use it.
                const notFree = payFree && !canBeFree(row.key);
                const disabled = state !== "on" || notFree;
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={disabled}
                    disabled={disabled}
                    onClick={() => onChoose(row.key)}
                    className={`group flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left max-lg:min-h-[52px] max-lg:gap-2.5 max-lg:rounded-app-btn max-lg:px-3 transition-colors disabled:cursor-not-allowed ${
                      notFree
                        ? "border-line bg-white/60"
                        : disabled
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
                      <span className={`mt-0.5 block text-[12.5px] leading-snug ${notFree ? "text-stone-500" : disabled ? "font-semibold text-rose-700" : "text-stone-500"}`}>
                        {notFree
                          ? `Not with free minutes — choose “Paid call” for ${row.title}`
                          : disabled
                            ? `In consultation${a.eta ? ` · wait ${a.eta}` : ""}`
                            : instant
                              ? `${multiplierLabel(a)} · ${row.body}`
                              : row.body}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {rowFree ? (
                        <>
                          <b className="block text-[14.5px] font-extrabold text-emerald-700">Free{freeSecs > 0 ? ` · ${freeLength(freeSecs)}` : ""}</b>
                          <span className="block text-[11px] text-stone-500">then {rupee(quotedRateFor(a, row.key))}/min</span>
                        </>
                      ) : pctFor(row.key) > 0 && !disabled ? (
                        <>
                          <b className="block text-[15px] tabular-nums text-emerald-700">{rupee(quotedRateFor(a, row.key, pctFor(row.key)))}/min</b>
                          <span className="block text-[11px] text-stone-500">
                            <s>{rupee(quotedRateFor(a, row.key))}</s> · {pctFor(row.key)}% off
                          </span>
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

            {welcome && state === "on" && !a.freeCall && !replacement && (
              <p className="mt-3 text-[12.5px] leading-normal text-stone-500">
                {a.name} doesn&apos;t take free calls, so this one is paid. Your free minutes work with astrologers marked “Free call”.{" "}
                <Link href="/astrologers?availability=Free%20call" onClick={onClose} className="font-bold text-amber-700 underline">
                  Find astrologers taking free calls
                </Link>
              </p>
            )}

            {selected && !payMissing && (
              <ChoiceDetail
                astrologer={a}
                choice={selected}
                free={free}
                freeSecs={freeSecs}
                replacement={replacement ? makeGood : null}
                welcome={replacement ? null : welcome}
                freeMinutes={freeMinutes}
                balance={balance}
                eligible={eligible}
                discount={pctFor(selected) > 0 ? discount : null}
                onClose={onClose}
              />
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
                  className={`mt-4 min-h-[54px] w-full rounded-[14px] text-[15.5px] font-bold transition-colors max-lg:min-h-12 max-lg:rounded-app-btn max-lg:text-[15px] ${
                    !selected || !eligible || busy
                      ? "cursor-not-allowed bg-stone-200 text-stone-500"
                      : selected === "instant"
                        ? "bg-blue-700 text-white hover:bg-blue-800"
                        : free
                          ? "bg-emerald-700 text-white hover:bg-emerald-800"
                          : "az-cta max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
                  }`}
                >
                  {startLabel(state, selected, free, rate, busy, payMissing, lengthMissing ? null : free && !replacement ? freeMinutes : undefined)}
                </button>
              </>
            )}
            <p className="mt-3 text-center text-[12px] leading-normal text-stone-500">
              Nothing is billed until you and the astrologer are both connected — a call that doesn&apos;t start costs ₹0.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** `freeMinutes`: a welcome free call's chosen length (null = not chosen yet; undefined = not a welcome free call). */
function startLabel(
  state: Astrologer["availability"],
  choice: ConsultChoice | null,
  free: boolean,
  rate: number,
  busy: boolean,
  payMissing: boolean,
  freeMinutes?: number | null,
): string {
  if (state === "busy") return "In consultation";
  if (busy) return choice === "instant" ? "Placing the call…" : "Starting…";
  if (!choice) return "Choose how to talk";
  if (payMissing) return "Choose free minutes or a paid call";
  if (choice === "instant") return `Confirm ${rupee(rate)}/min`;
  if (free && freeMinutes === null) return "Choose how long your free call is";
  if (free && freeMinutes) return `Start free ${CHOICE_TITLE[choice].toLowerCase()} · ${freeMinutes} min`;
  if (free) return `Start free ${CHOICE_TITLE[choice].toLowerCase()}`;
  return `Start ${CHOICE_TITLE[choice].toLowerCase()} · ${rupee(rate)}/min`;
}

function SheetLead({
  state,
  freeHere,
  freeSecs,
  replacement,
  welcome,
}: {
  state: Astrologer["availability"];
  freeHere: boolean;
  freeSecs: number;
  replacement: boolean;
  welcome: WelcomeBenefit | null;
}) {
  if (state === "live") return <p className="mt-0.5 text-[12.5px] font-semibold text-orange-700">Hosting a live room now</p>;
  if (state === "off") return <p className="mt-0.5 text-[12.5px] text-stone-500">Offline right now</p>;
  if (state === "busy") return <p className="mt-0.5 text-[12.5px] font-semibold text-rose-700">In consultation</p>;
  if (replacement) {
    return (
      <p className="mt-0.5 text-[12.5px] text-stone-600">
        <span className="font-bold text-emerald-700">Free replacement call · {freeLengthLong(freeSecs)}</span> · Chat, Voice or Video.
      </p>
    );
  }
  if (freeHere && welcome) {
    return (
      <p className="mt-0.5 text-[12.5px] text-stone-600">
        <span className="font-bold text-emerald-700">Takes free calls</span> · use {welcome.weekly.remaining} free minutes (Chat or Voice) or
        pay per minute — your choice.
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
  freeSecs,
  replacement,
  welcome,
  freeMinutes,
  balance,
  eligible,
  discount,
  onClose,
}: {
  astrologer: Astrologer;
  choice: ConsultChoice;
  free: boolean;
  freeSecs: number;
  /** The free replacement call this choice uses, or null */
  replacement: MakeGoodCredit | null;
  /** The welcome free minutes this choice uses (its length is chosen above, in PayChooser), or null */
  welcome: WelcomeBenefit | null;
  freeMinutes: number | null;
  balance: number;
  eligible: boolean;
  /** The claimed offer that applies to this choice, or null */
  discount: ConsultDiscount | null;
  onClose: () => void;
}) {
  const rate = quotedRateFor(a, choice, discount?.pct ?? 0);
  const needed = rate * 5;
  if (free && welcome) {
    if (!freeMinutes) return null;
    return (
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-[13px] leading-[1.55] text-emerald-900">
        <b className="block text-[14px] text-emerald-800">
          🎁 Free {CHOICE_TITLE[choice].toLowerCase()} · {freeMinutes} min
        </b>
        {balance >= rate
          ? `When the free time ends, the call carries on at ${rupee(rate)}/min from your balance (${rupee(balance)}) — end it any time.`
          : "No balance is needed: with an empty wallet the call ends when the free time does. You can add money during the call to keep going."}
      </div>
    );
  }
  if (free) {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-[13px] leading-[1.55] text-emerald-900">
        <b className="block text-[14px] text-emerald-800">
          🎁 {replacement ? "Your free replacement call" : "Your free call"} · {freeLengthLong(freeSecs)}
        </b>
        {replacement && (
          <span className="block">
            We&apos;re sorry about session {replacement.sessionRef}. Use it by {replacement.validUntil}.{" "}
          </span>
        )}
        Complimentary {freeLengthLong(freeSecs)}, then {rupee(rate)}/min if you continue.{" "}
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
      {discount && (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-[13px] leading-[1.55] text-emerald-900">
          <b className="block text-[14px] text-emerald-800">
            {discount.pct}% off applied · {rupee(rate)}/min instead of {rupee(quotedRateFor(a, choice))}
          </b>
          Your offer “{discount.name}” — fixed for this whole session, paid by Astrorize. It&apos;s used once the call connects.
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

/**
 * "Use free minutes" or "Paid call", side by side — nothing chosen until the customer picks one.
 * With free minutes, the length is chosen here too (lengths that don't fit this week are disabled).
 */
function PayChooser({
  pay,
  onPay,
  paidRate,
  replacement,
  welcome,
  freeMinutes,
  onFreeMinutes,
}: {
  pay: PayChoice | null;
  onPay?: (pay: PayChoice) => void;
  /** The paid rate to show (₹/min) */
  paidRate: number;
  /** The free replacement call the free option uses, or null */
  replacement: MakeGoodCredit | null;
  /** The weekly free minutes the free option uses, or null */
  welcome: WelcomeBenefit | null;
  freeMinutes: number | null;
  onFreeMinutes?: (minutes: number) => void;
}) {
  const card = (on: boolean, tone: "free" | "paid") =>
    `flex min-h-[64px] min-w-0 flex-col items-start justify-center rounded-2xl border-2 px-3 py-2.5 text-left transition-colors max-lg:rounded-app-btn ${
      on
        ? tone === "free"
          ? "border-emerald-600 bg-emerald-50"
          : "border-amber-500 bg-amber-50"
        : tone === "free"
          ? "border-emerald-200 bg-white hover:border-emerald-500"
          : "border-line bg-white hover:border-amber-300"
    }`;
  const dot = (on: boolean, tone: "free" | "paid") => (
    <span
      aria-hidden="true"
      className={`grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${
        on ? (tone === "free" ? "border-emerald-600" : "border-amber-500") : "border-stone-300"
      }`}
    >
      {on && <span className={`size-2 rounded-full ${tone === "free" ? "bg-emerald-600" : "bg-amber-500"}`} />}
    </span>
  );
  return (
    <div className="mt-4">
      <b className="block text-[13px] font-bold text-ink">How would you like to pay?</b>
      <div role="radiogroup" aria-label="Free minutes or paid call" className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" role="radio" aria-checked={pay === "free"} onClick={() => onPay?.("free")} className={card(pay === "free", "free")}>
          <span className="flex items-center gap-1.5">
            {dot(pay === "free", "free")}
            <b className="text-[14px] font-bold text-emerald-800">{replacement ? "Free replacement call" : "Use free minutes"}</b>
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-stone-600">
            {replacement
              ? `${replacement.minutes} min · Chat, Voice or Video`
              : welcome
                ? `${welcome.weekly.remaining} of ${welcome.weekly.total} min left · Chat or Voice`
                : ""}
          </span>
        </button>
        <button type="button" role="radio" aria-checked={pay === "paid"} onClick={() => onPay?.("paid")} className={card(pay === "paid", "paid")}>
          <span className="flex items-center gap-1.5">
            {dot(pay === "paid", "paid")}
            <b className="text-[14px] font-bold text-ink">Paid call</b>
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-stone-600">
            <b className="font-bold tabular-nums text-plum">{rupee(paidRate)}/min</b> · from your wallet
          </span>
        </button>
      </div>
      {pay === "free" && welcome && (
        <div className="mt-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-[1.5] text-emerald-900">
          <b className="block text-[13.5px] text-emerald-800">How long should your free call be?</b>
          <div role="radiogroup" aria-label="Free call length" className="mt-2 flex flex-wrap gap-2">
            {welcome.lengths.map((l) => {
              const on = freeMinutes === l.minutes;
              return (
                <button
                  key={l.minutes}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!l.fits}
                  title={l.fits ? undefined : `Only ${welcome.weekly.remaining} free minutes left this week`}
                  onClick={() => onFreeMinutes?.(l.minutes)}
                  className={`min-h-11 min-w-[72px] rounded-full border-2 px-4 text-[14px] font-bold tabular-nums transition-colors disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 disabled:line-through ${
                    on ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-300 bg-white text-emerald-800 hover:border-emerald-600"
                  }`}
                >
                  {l.minutes} min
                </button>
              );
            })}
          </div>
          <span className="mt-2 block">
            {welcome.weekly.remaining} of {welcome.weekly.total} free minutes left this week · resets {resetWeekday(welcome.weekly.resetsAt)}. The full
            length you choose is used once the call starts, even if you end it sooner (a call that never starts uses nothing).
          </span>
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
      className="mt-2.5 min-h-[48px] w-full rounded-[14px] border border-line bg-white text-[15px] font-bold text-ink max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-transparent"
    >
      Close
    </button>
  );
}
