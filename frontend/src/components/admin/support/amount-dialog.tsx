"use client";

import { useId, useState } from "react";
import AdminDialog from "@/components/admin/dialog";

/**
 * Asks for one whole number before an action (a refund amount, the minutes of a free replacement
 * call). Checked here against min/max, and again by the API. `onSubmit` resolves true when it worked.
 */
export default function AmountDialog({
  title,
  subtitle,
  intro,
  label,
  unit,
  initial,
  min,
  max,
  confirm,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  intro: React.ReactNode;
  label: string;
  /** "₹" before, or "min" after, the number. */
  unit: "₹" | "min";
  initial: number;
  min: number;
  max: number;
  confirm: string;
  onSubmit: (value: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!/^\d+$/.test(value.trim()) || !Number.isInteger(n)) return setError("Enter a whole number.");
    if (n < min || n > max) return setError(unit === "₹" ? `Enter ₹${min}–₹${max}.` : `Enter ${min}–${max} minutes.`);
    if (busy) return;
    setBusy(true);
    try {
      if (await onSubmit(n)) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog title={title} subtitle={subtitle} onClose={onClose} width={480}>
      <form onSubmit={submit} noValidate>
        <div className="mt-0 mb-3 text-[13px] leading-normal text-[#57534e]">{intro}</div>
        <label htmlFor={id} className="mb-1.5 block text-[12px] font-bold text-[#57534e]">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {unit === "₹" && <span className="text-[15px] font-bold text-ink">₹</span>}
          <input
            id={id}
            inputMode="numeric"
            value={value}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 6));
              setError("");
            }}
            className="h-11 w-[140px] rounded-[10px] border border-line bg-white px-3 text-[15px] font-bold text-ink tabular-nums outline-none focus:border-amber-500"
          />
          {unit === "min" && <span className="text-[14px] font-bold text-[#57534e]">min</span>}
          <span className="text-[12px] text-[#78716c]">
            {unit === "₹" ? `₹${min}–₹${max}` : `${min}–${max} min`}
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-10 rounded-[10px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60">
            {busy ? "Working…" : confirm}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
