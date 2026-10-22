"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { sessionActions } from "@/lib/session-store";

interface Denomination {
  amount: number;
  bonus: number;
  /** Cashback a claimed offer adds (₹), and the offer's name. */
  cashback: number;
  cashbackFrom: string | null;
}

/**
 * "Add money" during a consultation: a recharge over the call screen. The call keeps running
 * underneath; once paid, the API holds the new balance for this session, so it simply runs
 * longer at the same rate.
 */
export default function InCallRecharge({
  rate,
  onPaid,
  onClose,
}: {
  /** The session's per-minute rate (₹), to show how long each amount lasts */
  rate: number;
  /** Paid: the caller re-reads the session's new length. */
  onPaid: (amount: number) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Denomination[] | null>(null);
  const [gstRate, setGstRate] = useState(0);
  const [amount, setAmount] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ denominations: Denomination[]; gstRate: number }>("/wallet/denominations")
      .then((res) => {
        if (cancelled) return;
        setList(res.denominations);
        setGstRate(res.gstRate);
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

  async function pay() {
    if (!selected || paying) return;
    setPaying(true);
    setError("");
    try {
      await sessionActions.recharge(selected.amount);
      onPaid(selected.amount);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The payment didn't go through. Your call continues — try again.");
      setPaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-[rgba(12,10,9,.55)] sm:items-center sm:p-6"
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
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[26px] bg-paper px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,.3)] outline-none motion-safe:animate-[azToastIn_.28s_ease-out_both] sm:max-w-[460px] sm:rounded-[26px] sm:px-6 sm:pt-6"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-stone-300 sm:hidden" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="in-call-recharge-title" className="font-display text-[26px] font-semibold leading-tight text-ink">
              Add money
            </h2>
            <p className="mt-1 text-[13px] leading-normal text-stone-600">
              Your call stays connected while you pay. It continues at {rupee(rate)}/min.
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
                    setAmount(d.amount);
                    setError("");
                  }}
                  className={`rounded-2xl border-2 px-3 py-2.5 text-left ${on ? "border-amber-500 bg-amber-50" : "border-line bg-white hover:border-amber-300"}`}
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
        <button
          type="button"
          onClick={() => void pay()}
          disabled={!selected || paying}
          className={`mt-4 min-h-[52px] w-full rounded-[14px] text-[15px] font-bold ${selected && !paying ? "az-cta" : "cursor-not-allowed bg-stone-200 text-stone-500"}`}
        >
          {paying ? "Confirming payment…" : selected ? `Pay ${rupee(selected.amount + gst)}` : "Choose an amount"}
        </button>
      </div>
    </div>
  );
}
