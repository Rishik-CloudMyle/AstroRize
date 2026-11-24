"use client";

import { useEffect, useState } from "react";
import PasswordInput from "@/components/ui/password-input";
import { ApiError, api } from "@/lib/api/client";

const field = "mt-1.5 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-[14px] text-ink";

/** Change (or, for a customer who joined by mobile code, first set) the password. Shown on every profile. */
export default function ChangePassword({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<{ hasPassword: boolean; hasEmail: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get<{ hasPassword: boolean; hasEmail: boolean }>("/auth/password/status").then(setStatus).catch(() => {});
  }, [done]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return setError("Use at least 8 characters, with a letter and a number.");
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await api.post("/auth/password/change", { currentPassword: current || undefined, newPassword: next });
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change the password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  const has = status.hasPassword;
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 ${className}`} aria-label="Password">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[14px] text-ink">Password</b>
          <span className="text-[12.5px] text-stone-500">{has ? "Change the password you log in with." : "Add a password so you can also log in with your email."}</span>
        </div>
        {!open && (
          <button type="button" onClick={() => { setOpen(true); setDone(false); }} className="h-10 rounded-full border border-line bg-white px-5 text-[13.5px] font-bold text-ink">
            {has ? "Change password" : "Set password"}
          </button>
        )}
      </div>
      {done && !open && <p className="mt-2 mb-0 text-[12.5px] font-semibold text-emerald-700">✓ Password saved. Other devices were signed out.</p>}
      {open && (
        <form onSubmit={submit} className="mt-3 grid max-w-[420px] gap-3">
          {has && (
            <label className="text-[12.5px] font-semibold text-stone-700">
              Current password
              <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} wrapperClassName="mt-1.5" className={field.replace("mt-1.5 ", "")} />
            </label>
          )}
          <label className="text-[12.5px] font-semibold text-stone-700">
            New password
            <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} wrapperClassName="mt-1.5" className={field.replace("mt-1.5 ", "")} />
            <span className="mt-1 block text-[11.5px] font-normal text-stone-500">At least 8 characters, with a letter and a number.</span>
          </label>
          <label className="text-[12.5px] font-semibold text-stone-700">
            Confirm new password
            <PasswordInput id="pw-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} wrapperClassName="mt-1.5" className={field.replace("mt-1.5 ", "")} />
          </label>
          {!has && !status.hasEmail && <p className="m-0 text-[12.5px] text-rose-700">Add your email in your profile first.</p>}
          {error && <p role="alert" className="m-0 text-[12.5px] font-semibold text-rose-700">{error}</p>}
          <div className="flex gap-2.5">
            <button type="submit" disabled={busy} className="h-10 rounded-full bg-amber-400 px-5 text-[13.5px] font-bold text-ink disabled:opacity-60">{busy ? "Saving…" : "Save password"}</button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }} className="h-10 rounded-full border border-line bg-white px-5 text-[13.5px] font-bold">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
