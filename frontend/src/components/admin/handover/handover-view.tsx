"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PasswordInput from "@/components/ui/password-input";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

interface Handover {
  id: string;
  person: string | null;
  email: string | null;
  kind: "TEMPORARY" | "PERMANENT";
  state: "ACTIVE" | "ENDED" | "REVOKED";
  endsAtLabel: string | null;
  createdAtLabel: string;
  grantedBy: string | null;
  note: string | null;
  newAccount: boolean;
  endedAtLabel: string | null;
}
interface Eligible {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
}
interface Data {
  handovers: Handover[];
  eligible: Eligible[];
  phoneMasked: string | null;
}

const field = "h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink";
const label = "block text-[12.5px] font-semibold text-stone-700";
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");
const DEPT: Record<string, string> = { FINANCE: "Finance", SUPPORT: "Support", COMPLIANCE: "Compliance", MARKETING: "Marketing", HR: "HR" };

/** Local date-time input value (yyyy-MM-ddTHH:mm) a given number of days ahead. */
function inDays(days: number) {
  const d = new Date(Date.now() + days * 86400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Hand the Super Admin role to someone else, for a time or for good, confirmed by a code sent to your mobile. */
export default function HandoverView() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(
    () =>
      api
        .get<Data>("/admin/handovers")
        .then(setData)
        .catch((e) => setLoadError(errorText(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [kind, setKind] = useState<"TEMPORARY" | "PERMANENT">("TEMPORARY");
  const [endsAt, setEndsAt] = useState(inDays(7));
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [revoking, setRevoking] = useState<Handover | null>(null);
  const [revokeOtp, setRevokeOtp] = useState("");

  const sendCode = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.post<{ phoneMasked: string; devCode?: string }>("/admin/handovers/otp", {});
      setSentTo(r.phoneMasked);
      setDevCode(r.devCode ?? "");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setDone("");
    setBusy(true);
    try {
      await api.post("/admin/handovers", {
        otp,
        kind,
        ...(kind === "TEMPORARY" ? { endsAt: new Date(endsAt).toISOString() } : {}),
        mode,
        ...(mode === "existing" ? { userId } : { name, email, password }),
        note: note || undefined,
      });
      setDone(mode === "new" ? `Handed over. ${name} can log in now with ${email} and the temporary password you set.` : "Handed over. They must log in again to see the Super Admin console.");
      setOtp("");
      setSentTo("");
      setDevCode("");
      setName("");
      setEmail("");
      setPassword("");
      setUserId("");
      setNote("");
      await load();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    setErr("");
    try {
      await api.post(`/admin/handovers/${revoking.id}/revoke`, { otp: revokeOtp });
      setRevoking(null);
      setRevokeOtp("");
      setSentTo("");
      await load();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p role="alert" className="mt-4 text-[13px] font-semibold text-rose-700">{loadError}</p>;
  if (!data) return <div className="mt-5 h-48 rounded-2xl bg-cream" aria-busy="true" />;

  const active = data.handovers.filter((h) => h.state === "ACTIVE");
  const past = data.handovers.filter((h) => h.state !== "ACTIVE");
  const needsPhone = !data.phoneMasked;

  return (
    <div className="mt-5 grid max-w-[820px] gap-4">
      {needsPhone && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Add and verify your mobile number first. The confirmation code is sent there.{" "}
          <Link href="/admin/profile" className="font-bold underline">Open My profile</Link>
        </div>
      )}

      <section className={`${PANEL} p-5`} aria-label="Current handovers">
        <h2 className="m-0 text-[16px] font-bold">Who holds the Super Admin role for you</h2>
        {active.length === 0 ? (
          <p className="mt-2 mb-0 text-[13px] text-[#78716c]">Nobody right now. Use the form below to hand it over.</p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {active.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
                <span className="min-w-0 text-[13.5px]">
                  <b className="block">{h.person}</b>
                  <span className="text-[12px] text-[#78716c] [overflow-wrap:anywhere]">{h.email}</span>
                  <span className="mt-0.5 block text-[12px] font-semibold text-amber-800">
                    {h.kind === "TEMPORARY" ? `Temporary, until ${h.endsAtLabel}` : "Permanent second Super Admin"}
                    {h.newAccount ? " · new account" : " · promoted colleague"}
                  </span>
                  {h.note && <span className="block text-[12px] text-[#57534e]">{h.note}</span>}
                </span>
                <button type="button" onClick={() => { setRevoking(h); setErr(""); setSentTo(""); }} className="h-9 rounded-[10px] border border-rose-200 bg-white px-3.5 text-[12.5px] font-bold text-rose-700">
                  Take back
                </button>
              </li>
            ))}
          </ul>
        )}
        {revoking && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <b className="block text-[13.5px] text-rose-900">Take the Super Admin role back from {revoking.person}?</b>
            <p className="mt-1 mb-2 text-[12.5px] text-rose-900">
              {revoking.newAccount ? "Their account is switched off." : "They go back to their department."} They are signed out straight away.
            </p>
            <div className="flex flex-wrap items-end gap-2.5">
              <button type="button" disabled={busy || needsPhone} onClick={() => void sendCode()} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold disabled:opacity-50">
                {sentTo ? "Send again" : "Send me a code"}
              </button>
              <input aria-label="Confirmation code" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={revokeOtp} onChange={(e) => setRevokeOtp(e.target.value)} className="h-10 w-36 rounded-xl border border-line bg-white px-3 text-[14px] tracking-[.25em]" />
              <button type="button" disabled={busy || revokeOtp.length !== 6} onClick={() => void revoke()} className="h-10 rounded-xl bg-rose-600 px-4 text-[13px] font-bold text-white disabled:opacity-50">
                Take back
              </button>
              <button type="button" onClick={() => setRevoking(null)} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold">
                Cancel
              </button>
            </div>
            {sentTo && <p className="mt-2 mb-0 text-[12px] text-rose-900">Code sent to {sentTo}.{devCode ? ` Development only: ${devCode}.` : ""}</p>}
          </div>
        )}
      </section>

      <form onSubmit={grant} className={`${PANEL} p-5`} aria-label="Hand over">
        <h2 className="m-0 text-[16px] font-bold">Hand over the Super Admin role</h2>
        <p className="mt-1 mb-4 text-[12.5px] text-[#78716c]">
          The new Super Admin can do everything you can, except hand the role on or take it back if theirs is temporary.
        </p>

        <fieldset className="m-0 border-0 p-0">
          <legend className={`${label} mb-1.5`}>Who</legend>
          <div className="flex flex-wrap gap-2">
            {(["existing", "new"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`h-10 rounded-full border px-4 text-[13px] font-bold ${mode === m ? "border-amber-500 bg-amber-100 text-amber-900" : "border-line bg-white text-ink"}`}>
                {m === "existing" ? "A colleague already on the team" : "A new person (email and password)"}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "existing" ? (
          <label className={`${label} mt-3.5`}>
            Colleague
            <select id="handover-user" value={userId} onChange={(e) => setUserId(e.target.value)} className={`${field} mt-1.5`}>
              <option value="">Choose a person…</option>
              {data.eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.department ? (DEPT[s.department] ?? s.department) : ""} · {s.email}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Full name
              <input id="handover-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={`${field} mt-1.5`} />
            </label>
            <label className={label}>
              Email (their login)
              <input id="handover-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={`${field} mt-1.5`} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Temporary password
              <PasswordInput id="handover-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} wrapperClassName="mt-1.5" className={field} />
              <span className="mt-1 block text-[11.5px] font-normal text-stone-500">At least 10 characters with a letter and a number. Share it with them safely; they can change it in My profile.</span>
            </label>
          </div>
        )}

        <fieldset className="m-0 mt-4 border-0 p-0">
          <legend className={`${label} mb-1.5`}>For how long</legend>
          <div className="flex flex-wrap items-center gap-2">
            {(["TEMPORARY", "PERMANENT"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-10 rounded-full border px-4 text-[13px] font-bold ${kind === k ? "border-amber-500 bg-amber-100 text-amber-900" : "border-line bg-white text-ink"}`}>
                {k === "TEMPORARY" ? "For a time" : "Permanent (second Super Admin)"}
              </button>
            ))}
          </div>
          {kind === "TEMPORARY" && (
            <label className={`${label} mt-3 max-w-[300px]`}>
              Ends on
              <input id="handover-ends" type="datetime-local" value={endsAt} min={inDays(0)} onChange={(e) => setEndsAt(e.target.value)} className={`${field} mt-1.5`} />
              <span className="mt-1 block text-[11.5px] font-normal text-stone-500">It ends by itself then. Up to a year.</span>
            </label>
          )}
        </fieldset>

        <label className={`${label} mt-4`}>
          Note (optional)
          <input id="handover-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Covering while I am on leave" className={`${field} mt-1.5`} />
        </label>

        <div className="mt-4 rounded-xl border border-line bg-cream p-4">
          <b className="block text-[13.5px]">Confirm with a code</b>
          <p className="mt-1 mb-2.5 text-[12.5px] text-[#57534e]">
            {data.phoneMasked ? `We send a 6-digit code to your verified number ${data.phoneMasked}.` : "Add your mobile number in My profile to get a code."}
          </p>
          <div className="flex flex-wrap items-end gap-2.5">
            <button type="button" disabled={busy || needsPhone} onClick={() => void sendCode()} className="h-11 rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold disabled:opacity-50">
              {sentTo ? "Send again" : "Send me a code"}
            </button>
            <input id="handover-otp" aria-label="Confirmation code" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} className="h-11 w-40 rounded-xl border border-line bg-white px-3 text-[14px] tracking-[.25em]" />
          </div>
          {sentTo && <p className="mt-2 mb-0 text-[12px] text-[#57534e]">Code sent to {sentTo}.{devCode ? ` Development only: ${devCode}.` : ""}</p>}
        </div>

        {err && <p role="alert" className="mt-3 mb-0 text-[13px] font-semibold text-rose-700">{err}</p>}
        {done && <p role="status" className="mt-3 mb-0 text-[13px] font-semibold text-emerald-700">{done}</p>}
        <button type="submit" disabled={busy || needsPhone || otp.length !== 6 || (mode === "existing" ? !userId : !(name && email && password))} className="mt-4 h-12 rounded-xl bg-amber-500 px-6 text-[14px] font-bold text-ink disabled:opacity-50">
          {busy ? "Working…" : "Hand over"}
        </button>
      </form>

      {past.length > 0 && (
        <section className={`${PANEL} p-5`} aria-label="History">
          <h2 className="m-0 text-[16px] font-bold">History</h2>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {past.map((h) => (
              <li key={h.id} className="text-[13px] text-[#57534e]">
                <b className="text-ink">{h.person}</b> · {h.kind === "TEMPORARY" ? "temporary" : "permanent"} · {h.state === "ENDED" ? "ended" : "taken back"} {h.endedAtLabel}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
