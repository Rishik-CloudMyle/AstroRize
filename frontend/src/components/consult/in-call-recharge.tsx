"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { LockIcon, methodName, payLabel, rechargeMessage, useRecharge, type Paid } from "../wallet/use-recharge";

interface Denomination {
  amount: number;
  bonus: number;
  /** Cashback a claimed offer adds (₹), and the offer's name. */
  cashback: number;
  cashbackFrom: string | null;
}

/**
 * "Add money" during a consultation: a recharge over the call screen, paid in Razorpay Checkout
 * (which opens on top). The call keeps running underneath; once paid, the API holds the new
 * balance for this session, so it simply runs longer at the same rate. The result shows in this
 * sheet (never the payment page, which would leave the call); "Back to your call" closes it.
 */
export default function InCallRecharge({
  rate,
  onPaid,
  onClose,
}: {
  /** The session's per-minute rate (₹), to show how long each amount lasts */
  rate: number;
  /** Paid: the caller re-reads the session's new length (the sheet stays open on its success state). */
  onPaid: (amount: number) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Denomination[] | null>(null);
  const [gstRate, setGstRate] = useState(0);
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState("");
  // Razorpay is connected (null until the amounts load).
  const [paymentsOn, setPaymentsOn] = useState<boolean | null>(null);
  const recharge = useRecharge(useCallback((p: Paid) => onPaid(p.order.amount), [onPaid]));
  const paying = recharge.busy;
  const note = rechargeMessage(recharge.state);
  const paid = recharge.state.stage === "paid" ? recharge.state.paid : null;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ denominations: Denomination[]; gstRate: number; payments?: { available: boolean } }>("/wallet/denominations")
      .then((res) => {
        if (cancelled) return;
        setList(res.denominations);
        setGstRate(res.gstRate);
        setPaymentsOn(res.payments?.available ?? false);
        // Pre-select the smallest amount that buys at least five more minutes.
        setAmount((res.denominations.find((d) => d.amount >= rate * 5) ?? res.denominations.at(-1))?.amount ?? null);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load the recharge amounts. Try again."));
    return () => {
      cancelled = true;
    };
  }, [rate]);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !paying && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, paying]);

  const selected = list?.find((d) => d.amount === amount) ?? null;
  const gst = selected ? Math.round(selected.amount * gstRate) : 0;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-[rgba(12,10,9,.55)] sm:items-center sm:p-6 max-lg:bg-app-scrim max-lg:sm:items-end max-lg:sm:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !paying) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="in-call-recharge-title"
        tabIndex={-1}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[26px] bg-paper px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,.3)] outline-none motion-safe:animate-[azToastIn_.28s_ease-out_both] sm:max-w-[460px] sm:rounded-[26px] sm:px-6 sm:pt-6 max-lg:max-h-[85dvh] max-lg:rounded-t-app-modal max-lg:bg-app-elev max-lg:pb-[calc(24px+var(--app-safe-bottom))] max-lg:shadow-app-modal max-lg:sm:max-w-none max-lg:sm:rounded-b-none max-lg:sm:px-4 max-lg:sm:pt-3"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-stone-300 sm:hidden max-lg:mt-1 max-lg:block max-lg:w-9 max-lg:bg-app-line" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="in-call-recharge-title" className="font-display text-[26px] font-semibold leading-tight text-ink max-lg:font-sans max-lg:text-[18px] max-lg:font-bold max-lg:text-app-ink">
              {paid ? "Payment successful" : "Add money"}
            </h2>
            <p className="mt-1 text-[13px] leading-normal text-stone-600 max-lg:text-app-ink-2">
              {paid ? `Your call is still connected and continues at ${rupee(rate)}/min.` : `Your call stays connected while you pay. It continues at ${rupee(rate)}/min.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-cream text-base text-stone-600 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {paid ? (
          <div role="status" className="mt-5 text-center">
            <span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-700 text-white max-lg:bg-app-success">
              <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <b className="mt-3 block text-[20px] tabular-nums text-ink max-lg:text-app-ink">{rupee(paid.order.amount)} added to your wallet</b>
            {paid.order.bonus + paid.cashback > 0 && (
              <span className="mt-0.5 block text-[13px] font-semibold text-emerald-700 max-lg:text-app-success">
                + {rupee(paid.order.bonus + paid.cashback)} {paid.cashback > 0 ? "bonus / cashback" : "bonus"} to your Promotional Balance
              </span>
            )}
            <span className="mt-1.5 block text-[12.5px] text-stone-500 max-lg:text-app-ink-3">
              You paid {rupee(paid.order.total)} incl. {rupee(paid.order.gst)} GST
              {paid.method ? ` · ${methodName(paid.method)}` : ""}
            </span>
            {paid.paymentId && (
              <span className="mt-0.5 block text-[12px] [overflow-wrap:anywhere] text-stone-500 max-lg:text-app-ink-3">
                Payment ID <b className="font-mono font-semibold text-ink max-lg:text-app-ink">{paid.paymentId}</b>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="mt-5 min-h-[52px] w-full rounded-[14px] text-[15px] font-bold az-cta max-lg:min-h-app-hit max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
            >
              Back to your call
            </button>
            <p className="mt-2.5 mb-0 text-[11.5px] leading-normal text-stone-500 max-lg:text-app-ink-3">
              The receipt is in your wallet&apos;s transactions.
            </p>
          </div>
        ) : (
          <>
          {!list && !error && (
            <div className="mt-5 grid grid-cols-2 gap-2.5" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-[72px] animate-pulse rounded-2xl bg-line-soft" />
              ))}
            </div>
          )}

          {list && list.length === 0 && (
            <p className="mt-5 text-[13px] text-stone-600">No recharge amounts are available right now.</p>
          )}

          {list && list.length > 0 && (
            <div role="radiogroup" aria-label="Amount" className="mt-5 grid grid-cols-2 gap-2.5">
              {list.map((d) => {
                const on = d.amount === amount;
                return (
                  <button
                    key={d.amount}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      if (paying) return;
                      setAmount(d.amount);
                      setError("");
                      recharge.reset();
                    }}
                    className={`rounded-2xl border-2 px-3 py-2.5 text-left max-lg:rounded-app-card max-lg:border ${
                      on ? "border-amber-500 bg-amber-50 max-lg:border-app-selected max-lg:bg-app-tint max-lg:shadow-[0_0_0_1px_var(--color-app-selected)]" : "border-line bg-white hover:border-amber-300 max-lg:border-app-line max-lg:bg-app-surface"
                    }`}
                  >
                    <b className="block text-[18px] tabular-nums text-ink">{rupee(d.amount)}</b>
                    <span className="block text-[11.5px] text-stone-500">
                      ≈ {Math.floor(d.amount / Math.max(1, rate))} min
                      {d.bonus > 0 && <span className="font-bold text-emerald-700"> · +{rupee(d.bonus)} bonus</span>}
                      {d.cashback > 0 && <span className="font-bold text-emerald-700"> · +{rupee(d.cashback)} cashback</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <p className="mt-3 text-[12.5px] text-stone-500">
              {rupee(selected.amount)} talk time + {rupee(gst)} GST · you pay {rupee(selected.amount + gst)}
              {selected.cashback > 0 && (
                <span className="block font-semibold text-emerald-700">
                  +{rupee(selected.cashback)} cashback from {selected.cashbackFrom ?? "your offer"}
                </span>
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-rose-700">
              {error}
            </p>
          )}
          {paymentsOn === false && (
            <p role="status" className="mt-3 text-[13px] font-semibold text-stone-600">
              Payments aren&apos;t connected yet, so money can&apos;t be added right now. Your call continues.
            </p>
          )}
          {note && (
            <p
              role={note.tone === "error" ? "alert" : "status"}
              className={`mt-3 rounded-xl px-3 py-2.5 text-[12.5px] leading-normal font-semibold max-lg:rounded-app-card ${
                note.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-900"
              }`}
            >
              {note.text} Your call continues.
            </p>
          )}
          {recharge.state.stage === "pending" ? (
            <button
              type="button"
              onClick={() => void recharge.check()}
              className="mt-4 min-h-[52px] w-full rounded-[14px] text-[15px] font-bold az-cta max-lg:min-h-app-hit max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
            >
              Check status
            </button>
          ) : (
            <button
              type="button"
              onClick={() => selected && void recharge.pay(selected.amount)}
              disabled={!selected || paying || !paymentsOn}
              className={`mt-4 min-h-[52px] w-full rounded-[14px] text-[15px] font-bold max-lg:min-h-app-hit max-lg:rounded-app-btn ${
                selected && !paying && paymentsOn ? "az-cta max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none" : "cursor-not-allowed bg-stone-200 text-stone-500"
              }`}
            >
              {selected ? payLabel(recharge.state, selected.amount + gst) : "Choose an amount"}
            </button>
          )}
          </>
        )}
        <p className="mt-2.5 mb-0 flex items-start gap-1.5 text-[11.5px] leading-normal text-stone-500 max-lg:text-app-ink-3">
          <LockIcon className="mt-px size-3.5 shrink-0" />
          <span>Paid securely with Razorpay — UPI, cards, netbanking and wallets.</span>
        </p>
      </div>
    </div>
  );
}
