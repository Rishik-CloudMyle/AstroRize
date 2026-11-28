"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { Profile } from "@/components/account/profile-form";

const FIELD = "h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-[16px] text-ink";
const MAIN = "h-10 rounded-full border-0 bg-amber-500 px-5 text-[13px] font-bold text-ink disabled:opacity-60";

/** Change (or add) the mobile number: a code sent to the new number proves it before anything changes. */
export default function PhoneChange({ current, onChanged }: { current: string | null; onChanged: (profile: Profile) => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setPhone("");
    setCode("");
    setSent(false);
    setDevCode("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!sent) {
        const r = await api.post<{ devCode?: string }>("/me/phone/request", { phone });
        setDevCode(r.devCode ?? "");
        setSent(true);
      } else {
        const r = await api.post<{ profile: Profile }>("/me/phone/verify", { phone, code });
        close();
        onChanged(r.profile);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ml-2 min-h-8 align-middle text-[12.5px] font-bold text-amber-800 underline">
        {current ? "Change" : "Add number"}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-xl border border-line bg-cream p-3 text-left font-normal">
      <label className="grid gap-1 text-[12px] font-bold text-stone-600">
        New mobile number
        <input inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} disabled={sent} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} className={FIELD} placeholder="10 digits" />
      </label>
      {sent && (
        <label className="grid gap-1 text-[12px] font-bold text-stone-600">
          6-digit code sent to {phone}
          <input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={FIELD} />
        </label>
      )}
      {devCode && <p className="m-0 text-[12px] text-stone-500">Test mode (no SMS is set up): your code is {devCode}</p>}
      <p className="m-0 text-[12px] text-stone-500">Your wallet, history and details stay on this account. You&apos;ll sign in with the new number.</p>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] font-semibold text-rose-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || (sent ? code.length !== 6 : phone.length !== 10)} className={MAIN}>
          {busy ? "Please wait…" : sent ? "Verify and update" : "Send code"}
        </button>
        {sent && (
          <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }} className="h-10 rounded-full border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Change number
          </button>
        )}
        <button type="button" disabled={busy} onClick={close} className="h-10 rounded-full border border-line bg-white px-4 text-[13px] font-bold text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
