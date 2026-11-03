"use client";

import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import { api } from "@/lib/api/client";
import type { FinanceData } from "@/lib/admin/types";

const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");

/**
 * Custom recharge amounts (client, Nov 2026): whether customers can type their own amount on the
 * wallet page, and the smallest and largest allowed. Saving changes the wallet page at once. Audited.
 */
export default function CustomAmountControl({ value, canConfigure }: { value: FinanceData["customAmount"]; canConfigure: boolean }) {
  const { run, busy } = useAction();
  const [min, setMin] = useState(String(value.min));
  const [max, setMax] = useState(String(value.max));
  const [problem, setProblem] = useState("");

  const save = (enabled: boolean) => {
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1) return setProblem("Enter both amounts in whole rupees.");
    if (hi < lo) return setProblem("The largest amount must be at least the smallest.");
    setProblem("");
    void run(
      () => api.put("/admin/settings/custom-amount", { enabled, min: lo, max: hi }),
      enabled ? `Customers can now recharge any amount from ${rupee(lo)} to ${rupee(hi)}. Audited.` : "Custom recharge amounts switched off. Audited.",
    );
  };

  const field = "h-9 w-[110px] rounded-[10px] border border-[#e7e0d6] bg-white px-2.5 text-[13px] font-bold tabular-nums text-ink outline-none focus:border-amber-500";
  return (
    <div className="mt-4 border-t border-[#f3e9d8] pt-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14px] font-bold">Custom amount</h3>
        <button
          type="button"
          aria-pressed={value.enabled}
          disabled={!canConfigure || busy}
          onClick={() => save(!value.enabled)}
          className="h-[30px] rounded-full border px-3 text-[12px] font-bold"
          style={{
            background: value.enabled ? "#ecfdf5" : "#fff",
            color: value.enabled ? "#047857" : "#78716c",
            borderColor: value.enabled ? "#a7f3d0" : "#e7e0d6",
          }}
        >
          {value.enabled ? "On" : "Off"}
        </button>
      </div>
      <p className="mt-1 mb-3 text-[12px] text-[#78716c]">
        Customers can also type any whole amount in this range on the wallet page. No bonus is added to custom amounts.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save(value.enabled);
        }}
        className="flex flex-wrap items-end gap-2.5"
      >
        <label className="text-[11.5px] font-semibold text-[#57534e]">
          Smallest (₹)
          <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} disabled={!canConfigure} className={`mt-1 block ${field}`} />
        </label>
        <label className="text-[11.5px] font-semibold text-[#57534e]">
          Largest (₹)
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} disabled={!canConfigure} className={`mt-1 block ${field}`} />
        </label>
        <button type="submit" disabled={!canConfigure || busy} className="h-9 rounded-[10px] bg-ink px-3.5 text-[12.5px] font-bold text-white disabled:opacity-60">
          Save range
        </button>
      </form>
      {problem && (
        <p role="alert" className="mt-2 mb-0 text-[12px] font-semibold text-rose-700">
          {problem}
        </p>
      )}
    </div>
  );
}
