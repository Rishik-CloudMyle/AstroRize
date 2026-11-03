"use client";

import { useEffect, useId, useState } from "react";
import { rupee } from "@/lib/format";
import type { Denomination } from "./wallet-mobile";

// Custom recharge amounts (client, Nov 2026): besides the fixed amounts, the customer can type any
// whole amount in the range Finance sets on the admin Finance page (GET /wallet/denominations →
// custom). Custom amounts get no bonus; a claimed cashback offer still applies when they pay.

export interface CustomAmount {
  enabled: boolean;
  min: number;
  max: number;
}

/** A whole amount the customer may type in (custom amounts are on and it is in range). */
export function isCustomAmount(amount: number, custom: CustomAmount | null): boolean {
  return !!custom?.enabled && Number.isInteger(amount) && amount >= custom.min && amount <= custom.max;
}

/** The chosen recharge: one of the fixed amounts, or a valid custom amount (no bonus), else undefined. */
export function pickedDenomination(list: Denomination[] | null, amount: number, custom: CustomAmount | null): Denomination | undefined {
  const fixed = list?.find((d) => d.amount === amount);
  if (fixed) return fixed;
  return list && isCustomAmount(amount, custom) ? { amount, bonus: 0, cashback: 0, cashbackFrom: null } : undefined;
}

/**
 * "Or enter an amount": typing a valid amount selects it (onPick); choosing a fixed amount clears
 * the field. Nothing is shown while Finance has custom amounts off.
 */
export default function CustomAmountField({
  custom,
  denom,
  fixed,
  onPick,
  variant = "site",
}: {
  custom: CustomAmount | null;
  /** The amount chosen now. */
  denom: number;
  /** The fixed amounts offered (a fixed one chosen clears the field). */
  fixed: number[];
  onPick: (amount: number) => void;
  variant?: "site" | "app";
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");

  // A fixed amount was chosen: the typed one no longer applies.
  useEffect(() => {
    if (fixed.includes(denom)) {
      setText("");
      setProblem("");
    }
  }, [denom, fixed]);

  if (!custom?.enabled) return null;

  function change(value: string) {
    const digits = value.replace(/[^\d]/g, "").slice(0, 7);
    setText(digits);
    if (!digits) return setProblem("");
    const amount = Number(digits);
    if (amount < custom!.min || amount > custom!.max) {
      setProblem(`Enter an amount from ${rupee(custom!.min)} to ${rupee(custom!.max)}.`);
      return;
    }
    setProblem("");
    onPick(amount);
  }

  const app = variant === "app";
  const chosen = !!text && !problem && Number(text) === denom;
  return (
    <div className={app ? "mt-3" : "mt-3"}>
      <label htmlFor={id} className={app ? "mb-1.5 block text-[13px] font-semibold text-app-ink-2" : "mb-1.5 block text-xs font-semibold text-stone-600"}>
        Or enter an amount
      </label>
      <div
        className={
          app
            ? `flex h-12 items-center gap-1.5 rounded-app-btn border bg-app-surface px-3.5 ${chosen ? "border-app-selected" : problem ? "border-rose-400" : "border-app-line"}`
            : `flex h-11 items-center gap-1.5 rounded-[14px] border bg-white px-3.5 ${chosen ? "border-amber-600 bg-amber-50" : problem ? "border-rose-400" : "border-line"}`
        }
      >
        <span aria-hidden="true" className="text-[15px] font-bold text-stone-500">
          ₹
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={`${custom.min.toLocaleString("en-IN")} – ${custom.max.toLocaleString("en-IN")}`}
          onChange={(e) => change(e.target.value)}
          aria-invalid={!!problem}
          aria-describedby={`${id}-note`}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-stone-400"
        />
      </div>
      <p
        id={`${id}-note`}
        role={problem ? "alert" : undefined}
        className={`mt-1.5 mb-0 text-[11.5px] ${problem ? "font-semibold text-rose-700" : app ? "text-app-ink-3" : "text-stone-500"}`}
      >
        {problem || `Any amount from ${rupee(custom.min)} to ${rupee(custom.max)}. Bonuses apply to the amounts above only.`}
      </p>
    </div>
  );
}
