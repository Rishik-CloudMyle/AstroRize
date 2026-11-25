"use client";

import { useEffect, useState } from "react";
import ChangePassword from "@/components/account/change-password";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

interface Profile {
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  phoneMasked: string | null;
  handover: { kind: string; endsAtLabel: string | null } | null;
}

const field = "h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink";
const ROLE: Record<string, string> = { SUPER: "Super Admin", FINANCE: "Finance", SUPPORT: "Support", COMPLIANCE: "Compliance", MARKETING: "Marketing", HR: "HR" };
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/** Every staff member's own profile: who they are, a verified mobile number (used for confirmation codes), and the password. */
export default function AdminProfileView() {
  const [p, setP] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () =>
    api
      .get<{ profile: Profile }>("/admin/profile")
      .then((r) => setP(r.profile))
      .catch((e) => setLoadError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);

  const send = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const r = await api.post<{ devCode?: string }>("/admin/profile/phone/request", { phone });
      setDevCode(r.devCode ?? "");
      setStep("code");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.post("/admin/profile/phone/verify", { phone, code });
      setStep("idle");
      setCode("");
      setPhone("");
      setDevCode("");
      setMsg("Mobile number verified.");
      await load();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p role="alert" className="mt-4 text-[13px] font-semibold text-rose-700">{loadError}</p>;
  if (!p) return <div className="mt-5 h-48 rounded-2xl bg-cream" aria-busy="true" />;

  return (
    <div className="mt-5 grid max-w-[720px] gap-4">
      <section className={`${PANEL} p-5`} aria-label="Your details">
        <h2 className="m-0 text-[16px] font-bold">Your details</h2>
        <dl className="m-0 mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13.5px]">
          <dt className="text-[#78716c]">Name</dt>
          <dd className="m-0 font-semibold">{p.name}</dd>
          <dt className="text-[#78716c]">Email</dt>
          <dd className="m-0 font-semibold [overflow-wrap:anywhere]">{p.email}</dd>
          <dt className="text-[#78716c]">Department</dt>
          <dd className="m-0 font-semibold">{p.role ? (ROLE[p.role] ?? p.role) : "—"}</dd>
          {p.handover && (
            <>
              <dt className="text-[#78716c]">Super Admin</dt>
              <dd className="m-0 font-semibold text-amber-800">
                {p.handover.kind === "TEMPORARY" ? `Temporary, until ${p.handover.endsAtLabel}` : "Permanent (second Super Admin)"}
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className={`${PANEL} p-5`} aria-label="Mobile number">
        <h2 className="m-0 text-[16px] font-bold">Mobile number</h2>
        <p className="mt-1 mb-3 text-[12.5px] text-[#78716c]">
          Confirmation codes for sensitive actions, such as handing over the Super Admin role, are sent here.
        </p>
        {p.phoneMasked && (
          <p className="mb-3 mt-0 text-[13.5px] font-semibold text-emerald-700">✓ Verified: {p.phoneMasked}</p>
        )}
        {step === "idle" ? (
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="min-w-[200px] flex-1 text-[12.5px] font-semibold text-stone-700">
              {p.phone ? "Change number" : "Add your mobile number"}
              <input
                id="profile-phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${field} mt-1.5`}
              />
            </label>
            <button type="button" disabled={busy || phone.replace(/\D/g, "").length < 10} onClick={() => void send()} className="h-11 rounded-xl bg-amber-500 px-5 text-[13.5px] font-bold text-ink disabled:opacity-50">
              Send code
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="min-w-[200px] flex-1 text-[12.5px] font-semibold text-stone-700">
              Code sent to {phone}
              <input id="profile-code" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className={`${field} mt-1.5 tracking-[.3em]`} />
            </label>
            <button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()} className="h-11 rounded-xl bg-amber-500 px-5 text-[13.5px] font-bold text-ink disabled:opacity-50">
              Verify
            </button>
            <button type="button" onClick={() => { setStep("idle"); setCode(""); }} className="h-11 rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold">
              Back
            </button>
            {devCode && <p className="m-0 basis-full text-[12px] text-stone-500">Development only: the code is {devCode}.</p>}
          </div>
        )}
        {msg && <p className="mt-2.5 mb-0 text-[12.5px] font-semibold text-emerald-700">{msg}</p>}
        {err && <p role="alert" className="mt-2.5 mb-0 text-[12.5px] font-semibold text-rose-700">{err}</p>}
      </section>

      <ChangePassword />
    </div>
  );
}
