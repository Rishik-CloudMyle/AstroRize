"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { rupee } from "@/lib/portal/format";
import { useToast } from "../portal-provider";
import { Panel } from "../ui";

interface Account {
  kind: "BANK" | "UPI";
  holderName: string;
  ifsc: string | null;
  accountMasked: string | null;
  upiMasked: string | null;
  panMasked: string;
  isTest: boolean;
}
interface PayoutRow {
  id: string;
  cycle: string;
  amount: number;
  tds: number;
  state: "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "REVERSED";
  utr: string | null;
  reason: string | null;
  at: string;
}
interface Data {
  account: Account | null;
  payouts: PayoutRow[];
}

const STATE: Record<PayoutRow["state"], [string, string, string]> = {
  QUEUED: ["On its way", "#fef3c7", "#92400e"],
  PROCESSING: ["On its way", "#fef3c7", "#92400e"],
  PROCESSED: ["Paid", "#ecfdf5", "#047857"],
  FAILED: ["Not paid — action needed", "#fff1f2", "#be123c"],
  REVERSED: ["Returned by the bank", "#fff1f2", "#be123c"],
};

const input = "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14px] text-ink outline-none focus:border-amber-500 max-lg:rounded-app-btn max-lg:border-app-line";
const label = "mb-1.5 mt-3 block text-xs font-semibold text-stone-600";

/** Where the astrologer's payouts go, and what has been paid. Account number and PAN are never shown in full. */
export default function PayoutAccountCard() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"BANK" | "UPI">("BANK");
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmNumber, setConfirmNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [pan, setPan] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get<Data>("/portal/payout-account")
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const startEdit = () => {
    setKind(data?.account?.kind ?? "BANK");
    setHolderName(data?.account?.isTest ? "" : (data?.account?.holderName ?? ""));
    setAccountNumber("");
    setConfirmNumber("");
    setIfsc("");
    setUpiId("");
    setPan("");
    setError("");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "BANK" && accountNumber.replace(/\s+/g, "") !== confirmNumber.replace(/\s+/g, "")) {
      setError("The two account numbers don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await api.put<Data>("/portal/payout-account", { kind, holderName, pan, ...(kind === "BANK" ? { accountNumber, ifsc } : { upiId }) });
      setData(d);
      setEditing(false);
      toast("Payout details saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your payout details.");
    } finally {
      setBusy(false);
    }
  };

  const a = data?.account ?? null;
  return (
    <Panel className="mt-4 p-5">
      <h2 className="m-0 text-base font-bold">Payout details</h2>
      <p className="mt-1 mb-0 text-[12.5px] text-stone-500">
        Where your earnings are sent when a payout is released. Your account number and PAN are stored encrypted and never shown in full.
      </p>

      {!data ? (
        <p className="mt-3 mb-0 text-[13px] text-stone-500">Loading…</p>
      ) : (
        <>
          {a && !editing && (
            <div className="mt-3 rounded-xl border border-line bg-stone-50 p-3.5 max-lg:rounded-app-btn max-lg:border-app-line">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[14px]">{a.holderName}</b>
                {a.isTest && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-extrabold text-amber-800 uppercase">Test details</span>}
              </div>
              <div className="mt-1 text-[13px] text-stone-600">
                {a.kind === "BANK" ? `Bank account ${a.accountMasked} · IFSC ${a.ifsc}` : `UPI ${a.upiMasked}`} · PAN {a.panMasked}
              </div>
              {a.isTest && <p className="mt-2 mb-0 text-[12px] text-amber-800">These are made-up details for testing. Save your own to be paid for real.</p>}
            </div>
          )}
          {!a && !editing && (
            <p className="mt-3 mb-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">No payout details yet. Add them so your payouts can be sent.</p>
          )}

          {!editing && (
            <button type="button" onClick={startEdit} className="mt-3 h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-ink max-lg:rounded-app-btn">
              {a ? "Change payout details" : "Add payout details"}
            </button>
          )}

          {editing && (
            <form onSubmit={save} className="mt-3">
              <div role="radiogroup" aria-label="Payout method" className="grid grid-cols-2 gap-2">
                {(["BANK", "UPI"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`h-11 rounded-xl border-2 text-[13.5px] font-bold max-lg:rounded-app-btn ${kind === k ? "border-amber-500 bg-amber-50 text-ink" : "border-line bg-white text-stone-600"}`}
                  >
                    {k === "BANK" ? "Bank account" : "UPI id"}
                  </button>
                ))}
              </div>
              <label htmlFor="po-name" className={label}>
                Account holder name
              </label>
              <input id="po-name" className={input} value={holderName} onChange={(e) => setHolderName(e.target.value)} autoComplete="off" maxLength={80} />
              {kind === "BANK" ? (
                <>
                  <label htmlFor="po-acc" className={label}>
                    Account number
                  </label>
                  <input id="po-acc" className={input} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" autoComplete="off" maxLength={24} />
                  <label htmlFor="po-acc2" className={label}>
                    Re-enter account number
                  </label>
                  <input id="po-acc2" className={input} value={confirmNumber} onChange={(e) => setConfirmNumber(e.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" autoComplete="off" maxLength={24} />
                  <label htmlFor="po-ifsc" className={label}>
                    IFSC code
                  </label>
                  <input id="po-ifsc" className={`${input} uppercase`} value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} autoComplete="off" maxLength={11} placeholder="HDFC0001234" />
                </>
              ) : (
                <>
                  <label htmlFor="po-upi" className={label}>
                    UPI id
                  </label>
                  <input id="po-upi" className={input} value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} autoComplete="off" maxLength={80} placeholder="name@bank" />
                </>
              )}
              <label htmlFor="po-pan" className={label}>
                PAN (for TDS)
              </label>
              <input id="po-pan" className={`${input} uppercase`} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} autoComplete="off" maxLength={10} placeholder="ABCDE1234F" />
              {error && (
                <p role="alert" className="mt-3 mb-0 text-[12.5px] font-semibold text-rose-700">
                  {error}
                </p>
              )}
              <div className="mt-4 flex gap-2.5">
                <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-xl border border-line bg-white text-[14px] font-bold max-lg:rounded-app-btn">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 flex-1 rounded-xl bg-amber-500 text-[14px] font-bold text-ink disabled:opacity-60 max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-app-on-primary"
                >
                  {busy ? "Saving…" : "Save details"}
                </button>
              </div>
            </form>
          )}

          {data.payouts.length > 0 && (
            <div className="mt-5 border-t border-line pt-3.5">
              <h3 className="m-0 text-[13.5px] font-bold">Your payouts</h3>
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {data.payouts.map((p) => {
                  const [text, bg, fg] = STATE[p.state];
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0">
                        <b className="tabular-nums">{rupee(p.amount)}</b> <span className="text-stone-500">· {p.cycle}</span>
                        {p.utr && <span className="block text-[11.5px] text-stone-500">Bank reference {p.utr}</span>}
                        {p.reason && <span className="block text-[11.5px] text-rose-700">{p.reason}</span>}
                      </span>
                      <span className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold" style={{ background: bg, color: fg }}>
                        {text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
