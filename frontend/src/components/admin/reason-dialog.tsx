"use client";

import { useId, useState } from "react";
import AdminDialog from "@/components/admin/dialog";

/**
 * A console dialog that asks for a written reason before an action (reject a dispute, decline a
 * refund, pause payouts …). `onSubmit` runs the action and resolves true when it worked; the dialog
 * then closes. The reason is checked here first, and again by the API.
 */
export default function ReasonDialog({
  title,
  subtitle,
  intro,
  label = "Reason",
  placeholder,
  confirm,
  danger = false,
  min = 3,
  max = 200,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  intro: React.ReactNode;
  label?: string;
  placeholder?: string;
  confirm: string;
  danger?: boolean;
  min?: number;
  max?: number;
  onSubmit: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const reason = value.trim();
    if (reason.length < min) return setError(`Write a reason of at least ${min} characters.`);
    if (busy) return;
    setBusy(true);
    try {
      if (await onSubmit(reason)) onClose();
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
        <textarea
          id={id}
          value={value}
          maxLength={max}
          rows={3}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500"
        />
        <span className="mt-1 block text-right text-[11px] text-[#a8a29e] tabular-nums">
          {value.length}/{max}
        </span>
        {error && (
          <p role="alert" className="mt-1 mb-0 text-[12.5px] font-semibold text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`h-10 rounded-[10px] border-0 px-4 text-[13px] font-bold disabled:opacity-60 ${danger ? "bg-rose-700 text-white" : "bg-amber-500 text-ink"}`}
          >
            {busy ? "Working…" : confirm}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
