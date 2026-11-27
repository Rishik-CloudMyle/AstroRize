"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";

// The backup for a voice call: when the in-app call can't connect, the customer can have both mobiles
// rung instead (POST <base>/phone). This side's screen only ever gets its own number, masked, and
// AstroRize's number; the other person's number never reaches the browser.

type PhoneState =
  | { enabled: false }
  | {
      enabled: true;
      canStart: boolean;
      reason: string | null;
      yourNumber: string | null;
      from: string;
      call: { status: "DIALING" | "ANSWERED" | "ENDED" | "FAILED"; reason: string | null } | null;
    };

export function usePhoneBackup(base: string, active: boolean, onChange?: () => void) {
  const [state, setState] = useState<PhoneState | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });
  const last = useRef<string>("");
  const take = useCallback((p: PhoneState) => {
    setState(p);
    const status = p.enabled ? (p.call?.status ?? "") : "";
    // The call moved on: the session's clock and bill may have too.
    if (status !== last.current) {
      last.current = status;
      changed.current?.();
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      api
        .get<{ phone: PhoneState }>(`${base}/phone`)
        .then((r) => alive && take(r.phone))
        .catch(() => {})
        .finally(() => {
          if (alive) timer = setTimeout(tick, 4000);
        });
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, base, take]);

  const start = useCallback(async () => {
    const r = await api.post<{ phone: PhoneState }>(`${base}/phone`);
    take(r.phone);
  }, [base, take]);

  const info = active && state?.enabled ? state : null;
  const live = info?.call?.status === "DIALING" || info?.call?.status === "ANSWERED";
  return { info, live, start };
}

export function PhoneBackupNotice({
  phone,
  customer,
  trouble,
  peerName,
  className,
}: {
  phone: ReturnType<typeof usePhoneBackup>;
  /** The customer's side (only they can start the call). */
  customer: boolean;
  /** The in-app call isn't working. */
  trouble: boolean;
  peerName: string;
  className: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { info, live } = phone;
  if (!info) return null;

  const call = async () => {
    setBusy(true);
    setError("");
    try {
      await phone.start();
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The phone call couldn't be placed.");
    } finally {
      setBusy(false);
    }
  };

  const box = `${className} border-amber-300/60 bg-[#2b2013] leading-normal text-amber-50`;
  if (live) {
    return (
      <div role="status" className={box}>
        <b>{info.call?.status === "ANSWERED" ? "You're on a phone call." : "Calling your phones…"}</b>{" "}
        {info.call?.status === "ANSWERED"
          ? "Keep talking on your phone. The session ends when you hang up."
          : `${customer ? `We ring ${peerName} first, then your phone` : "Answer your phone"}${info.yourNumber ? ` (${info.yourNumber})` : ""}. The call comes from ${info.from}.`}{" "}
        Numbers stay private and the call is recorded.
      </div>
    );
  }
  const failed = info.call?.status === "FAILED" ? info.call.reason : null;
  if (!trouble && !failed) return null;
  if (!customer) {
    return (
      <div role="status" className={box}>
        <b>Keep your phone near.</b> If the app call doesn&apos;t connect, the customer can switch to a phone call: you&apos;ll be rung from {info.from}
        {info.yourNumber ? ` on ${info.yourNumber}` : ""}.
      </div>
    );
  }
  return (
    <div role="status" className={box}>
      {failed && <span className="block font-bold text-rose-200">{failed}</span>}
      {!info.canStart ? (
        <span>{info.reason ?? "A phone call isn't available for this session."}</span>
      ) : confirming ? (
        <>
          <span className="block">
            We ring {peerName} first, then your phone {info.yourNumber}. Neither of you sees the other&apos;s number. The call is recorded and costs the same per minute.
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void call()} className="h-10 rounded-full bg-amber-400 px-5 text-[13px] font-bold text-[#1c1917] disabled:opacity-60">
              {busy ? "Calling…" : "Call my phone"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="h-10 rounded-full border border-white/25 px-4 text-[13px] font-bold">
              Not now
            </button>
          </span>
        </>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1">Trouble with the app call?</span>
          <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-full bg-amber-400 px-5 text-[13px] font-bold text-[#1c1917]">
            {failed ? "Try the phone call again" : "Call by phone instead"}
          </button>
        </span>
      )}
      {error && (
        <span role="alert" className="mt-1.5 block font-bold text-rose-200">
          {error}
        </span>
      )}
    </div>
  );
}
