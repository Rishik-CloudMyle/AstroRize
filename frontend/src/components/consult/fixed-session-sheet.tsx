"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Astrologer } from "@/lib/types";
import { rupee } from "@/lib/format";
import { totalBalance, useSession } from "@/lib/session-store";
import { useAppUI } from "@/components/app-provider";
import {
  PKG_DURATIONS,
  PKG_TIP,
  PKG_CONSENT_POINTS,
  PKG_POLICY_POINTS,
  pkgQuote,
  type PkgDuration,
} from "@/lib/fixed-sessions";

export type FixedSessionMode = "Chat" | "Voice";

export interface FixedSessionSheetProps {
  astrologer: Astrologer;
  onClose: () => void;
  onReserved?: (details: {
    astrologer: Astrologer;
    mode: FixedSessionMode;
    duration: PkgDuration;
    price: number;
  }) => void;
}

type Step = "select" | "consent" | "review" | "policy";

const QUOTE_TTL_SECONDS = 120; // 2 minutes quote expiry

export default function FixedSessionSheet({
  astrologer: a,
  onClose,
  onReserved,
}: FixedSessionSheetProps) {
  const router = useRouter();
  const session = useSession();
  const { openLogin, toast } = useAppUI();

  const [step, setStep] = useState<Step>("select");
  const [mode, setMode] = useState<FixedSessionMode>("Voice");
  const [duration, setDuration] = useState<PkgDuration>(30);
  const [consentChecked, setConsentChecked] = useState(false);
  const [previousStep, setPreviousStep] = useState<Step>("select");

  // TTL Countdown for review screen
  const [ttlSeconds, setTtlSeconds] = useState(QUOTE_TTL_SECONDS);
  const [isExpired, setIsExpired] = useState(false);

  // Price quote calculation based on effective mode rate
  const ratePerMin = mode === "Chat" ? a.chatPrice : a.price;
  const quote = pkgQuote(ratePerMin, duration);

  const walletHave = totalBalance(session);
  const shortfall = Math.max(0, quote.final - walletHave);
  const isShort = shortfall > 0;

  // Timer tick for Step 3 (Review screen)
  useEffect(() => {
    if (step !== "review" || isExpired) return;

    const timer = setInterval(() => {
      setTtlSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, isExpired]);

  const resetQuoteTimer = () => {
    setTtlSeconds(QUOTE_TTL_SECONDS);
    setIsExpired(false);
  };

  const handleOpenReview = () => {
    resetQuoteTimer();
    setStep("review");
  };

  const handleOpenPolicy = () => {
    setPreviousStep(step);
    setStep("policy");
  };

  const handleClosePolicy = () => {
    setStep(previousStep);
  };

  const handleConfirmReservation = () => {
    if (!session.loggedIn) {
      openLogin();
      return;
    }

    if (isShort) {
      router.push("/wallet#add-money");
      onClose();
      return;
    }

    toast(`Fixed Session reserved: ${duration} min ${mode === "Voice" ? "Audio Call" : "Chat"} with ${a.name}`);
    onReserved?.({
      astrologer: a,
      mode,
      duration,
      price: quote.final,
    });
    onClose();
  };

  const fmtTtl = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const modeLabel = mode === "Voice" ? "Audio Call" : "Chat";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fixed Session"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col rounded-t-[24px] border border-line bg-paper shadow-2xl sm:rounded-[24px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            {step !== "select" && step !== "policy" && (
              <button
                type="button"
                onClick={() => setStep(step === "review" ? "consent" : "select")}
                aria-label="Go back"
                className="grid size-8 place-items-center rounded-full hover:bg-stone-100 text-stone-600 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-[18px] font-bold text-ink">
              {step === "select" && "Fixed Session"}
              {step === "consent" && "Before your fixed session"}
              {step === "review" && "Reserve package"}
              {step === "policy" && "Fixed Session Policy"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-stone-700">
          {/* STEP 1: SELECT PACKAGE (APP-PKG-001) */}
          {step === "select" && (
            <div className="flex flex-col gap-4">
              {/* Informational Callout */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-950">
                <b className="block text-sm font-bold text-amber-900 mb-1">
                  Fixed Session, not pay per minute
                </b>
                Pay per minute is ₹{a.price}/min and can end when your wallet runs low. A Fixed Session is prepaid time — 15 to 60 min for a discounted package price. Other offers do not stack.
              </div>

              {/* Astrologer info row */}
              <div className="flex items-center gap-3">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-line">
                  <Image src={a.photo} alt={a.name} fill sizes="48px" className="object-cover" />
                </span>
                <div className="min-w-0">
                  <b className="block truncate text-sm font-bold text-ink">{a.name}</b>
                  <p className="text-xs text-stone-500">
                    Prepaid time with {a.name}. Confirm to reserve. Charged only when you connect.
                  </p>
                </div>
              </div>

              {/* Mode selector */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Select Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("Voice")}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                      mode === "Voice"
                        ? "border-amber-600 bg-amber-50 text-amber-900 shadow-xs ring-2 ring-amber-500/20"
                        : "border-line bg-white text-stone-600 hover:border-amber-300"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 text-amber-700">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H3.625A2.25 2.25 0 001.375 4.5v2.25z" />
                    </svg>
                    Audio Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("Chat")}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                      mode === "Chat"
                        ? "border-amber-600 bg-amber-50 text-amber-900 shadow-xs ring-2 ring-amber-500/20"
                        : "border-line bg-white text-stone-600 hover:border-amber-300"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 text-amber-700">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.974-.948l.942-2.544C3.882 15.82 3 14.015 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                    Chat
                  </button>
                </div>
              </div>

              {/* Duration Options */}
              <div className="flex flex-col gap-2.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                  Select Duration
                </label>
                {PKG_DURATIONS.map((mins) => {
                  const q = pkgQuote(ratePerMin, mins);
                  const isSelected = duration === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDuration(mins)}
                      className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? "border-amber-600 bg-amber-50/70 shadow-sm ring-2 ring-amber-500/20"
                          : "border-line bg-white hover:border-amber-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-bold text-ink">
                          {mins} minutes
                        </span>
                        {mins === 60 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
                            Best value
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-[17px] font-extrabold text-ink">
                          {rupee(q.final)}
                        </span>
                        <s className="text-xs text-stone-400">{rupee(q.original)}</s>
                        <span className="text-xs font-bold text-emerald-700">
                          {q.disc}% off
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {PKG_TIP[mins]}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Continue button */}
              <button
                type="button"
                onClick={() => setStep("consent")}
                className="mt-2 h-12 w-full rounded-full bg-amber-500 font-bold text-ink shadow-[0_6px_16px_rgba(255,140,26,.28)] hover:bg-amber-400 transition"
              >
                Review {duration}-min {modeLabel}
              </button>
            </div>
          )}

          {/* STEP 2: CONSENT CHECKLIST (APP-PKG-002) */}
          {step === "consent" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-line bg-stone-50 p-3.5">
                <span className="block text-[11px] font-bold tracking-wider uppercase text-amber-800">
                  {duration} MIN FIXED SESSION
                </span>
                <span className="mt-0.5 block text-sm font-bold text-ink">
                  {a.name} · {modeLabel} · {rupee(quote.final)}
                </span>
              </div>

              <div className="text-xs text-stone-600">
                Please acknowledge the Fixed Session terms before continuing:
              </div>

              {/* Numbered Consent Points */}
              <ol className="flex flex-col gap-3">
                {PKG_CONSENT_POINTS.map((pt, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-stone-700">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-100 font-bold text-[11px] text-amber-900">
                      {i + 1}
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ol>

              {/* Full Policy Link */}
              <button
                type="button"
                onClick={handleOpenPolicy}
                className="self-start text-xs font-bold text-amber-800 underline hover:text-amber-900"
              >
                View the full Fixed Session Policy
              </button>

              {/* Consent Checkbox */}
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-semibold text-amber-950">
                  I have read and agree to the Fixed Session Policy
                </span>
              </label>

              {/* Continue button */}
              <button
                type="button"
                disabled={!consentChecked}
                onClick={handleOpenReview}
                className="mt-2 h-12 w-full rounded-full bg-amber-500 font-bold text-ink shadow-[0_6px_16px_rgba(255,140,26,.28)] hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none transition"
              >
                Continue
              </button>
            </div>
          )}

          {/* STEP 3: RESERVATION & REVIEW (APP-PKG-003 / APP-PKG-004) */}
          {step === "review" && (
            <div className="flex flex-col gap-4">
              {isExpired ? (
                /* EXPIRED STATE (APP-PKG-004) */
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                  <h3 className="text-base font-bold text-red-900">Your quote expired</h3>
                  <p className="mt-1 text-xs text-red-800">
                    Your reservation quote expired. Please refresh the quote to continue at current pricing for {duration} min · {modeLabel} ({rupee(quote.final)}).
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        resetQuoteTimer();
                      }}
                      className="h-11 w-full rounded-full bg-amber-500 text-sm font-bold text-ink hover:bg-amber-400 transition"
                    >
                      Continue at {rupee(quote.final)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("select")}
                      className="h-11 w-full rounded-full border border-line bg-white text-sm font-bold text-stone-700 hover:bg-stone-50 transition"
                    >
                      Select package again
                    </button>
                  </div>
                </div>
              ) : (
                /* ACTIVE REVIEW STATE */
                <>
                  <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
                    <div className="flex flex-col gap-2.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-stone-500">Duration</span>
                        <b className="font-semibold text-ink">{duration} min · {modeLabel}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Astrologer</span>
                        <span className="font-semibold text-ink">{a.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Original price</span>
                        <s className="text-stone-400">{rupee(quote.original)}</s>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount ({quote.disc}%)</span>
                        <span className="font-semibold">− {rupee(quote.savings)}</span>
                      </div>
                      <div className="flex justify-between border-t border-line pt-2">
                        <span className="text-stone-600">Package price</span>
                        <b className="text-sm font-extrabold text-ink">{rupee(quote.final)}</b>
                      </div>
                      <div className="flex justify-between border-t border-line pt-2">
                        <span className="font-bold text-ink">Total payable from wallet</span>
                        <b className="text-base font-extrabold text-amber-900">{rupee(quote.final)}</b>
                      </div>
                      <div className="flex justify-between text-stone-500 pt-1">
                        <span>Wallet balance</span>
                        <b className="text-ink">{rupee(walletHave)}</b>
                      </div>
                    </div>

                    {/* TTL countdown note */}
                    <p className="mt-3.5 border-t border-dashed border-line pt-3 text-[11px] leading-relaxed text-stone-500">
                      Price valid for <b className="text-amber-800">{fmtTtl(ttlSeconds)}</b>. Confirm to reserve. Charged when you connect. Released in full if you never connect.
                    </p>
                  </div>

                  {/* Insufficient Balance Alert */}
                  {isShort && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                      <b>Add money to reserve</b>
                      <p className="mt-0.5">
                        Your wallet needs {rupee(shortfall)} more to reserve this package. Add money now to lock in this price.
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  {isShort ? (
                    <Link
                      href="/wallet#add-money"
                      onClick={onClose}
                      className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-amber-500 font-bold text-ink shadow-[0_6px_16px_rgba(255,140,26,.28)] hover:bg-amber-400 transition"
                    >
                      Add money to wallet
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmReservation}
                      className="mt-2 h-12 w-full rounded-full bg-amber-500 font-bold text-ink shadow-[0_6px_16px_rgba(255,140,26,.28)] hover:bg-amber-400 transition"
                    >
                      Reserve {rupee(quote.final)} & Continue
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 4: FULL POLICY (APP-PKG-008) */}
          {step === "policy" && (
            <div className="flex flex-col gap-4">
              <div className="text-xs text-stone-500">
                Please review our comprehensive Fixed Session policy terms:
              </div>

              <ol className="flex flex-col gap-2.5">
                {PKG_POLICY_POINTS.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-stone-700">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-stone-100 font-bold text-[11px] text-stone-700">
                      {i + 1}
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={handleClosePolicy}
                className="mt-2 h-11 w-full rounded-full bg-stone-900 text-sm font-bold text-white hover:bg-stone-800 transition"
              >
                Back to reservation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
