"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { useAdmin } from "@/components/admin/admin-provider";

type State = "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "REVERSED";
interface Transfer {
  id: string;
  batchId: string;
  cycle: string;
  astrologerId: string;
  astrologer: string;
  gross: number;
  tds: number;
  amount: number;
  state: State;
  mode: string | null;
  method: string;
  utr: string | null;
  reference: string | null;
  reason: string | null;
  attempts: number;
  at: string;
}
interface AccountRow {
  astrologerId: string;
  name: string;
  account: { kind: "BANK" | "UPI"; holderName: string; ifsc: string | null; accountMasked: string | null; upiMasked: string | null; panMasked: string; isTest: boolean } | null;
}
interface Data {
  mode: "mock" | "test" | "live";
  transfers: Transfer[];
  accounts: AccountRow[];
}

const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const STATE: Record<State, [string, string, string]> = {
  QUEUED: ["Queued", "#fef3c7", "#92400e"],
  PROCESSING: ["Processing", "#eff6ff", "#1d4ed8"],
  PROCESSED: ["Paid", "#ecfdf5", "#047857"],
  FAILED: ["Failed", "#fff1f2", "#be123c"],
  REVERSED: ["Returned", "#fff1f2", "#be123c"],
};
const PANEL = "rounded-[20px] border border-line bg-paper p-5 shadow-xs";
const TH = "border-b border-line px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[.06em] text-[#78716c]";
const TD = "border-b border-line-soft px-2.5 py-[10px] align-top";

const MODE_NOTE = {
  mock: ["Simulation", "#fef3c7", "#92400e", "RazorpayX isn't connected yet, so no real money moves. Transfers are pretend: they settle a few seconds after release — paid, unless the astrologer's test account is the failing one. The real flow starts once RAZORPAYX_ACCOUNT_NUMBER and the keys are set on the server."],
  test: ["RazorpayX test mode", "#eff6ff", "#1d4ed8", "Transfers go to RazorpayX's test environment: realistic results, no real money."],
  live: ["RazorpayX live", "#ecfdf5", "#047857", "Transfers move real money from the RazorpayX account."],
} as const;

/** Every transfer to an astrologer, the payout details on file, and a retry for failed ones. */
export default function PayoutTransfers() {
  const { session, say } = useAdmin();
  const canRetry = session.capabilities.includes("payout.release");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>("/admin/payouts/transfers"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the transfers.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get<Data>("/admin/payouts/transfers")
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Couldn't load the transfers."));
    return () => {
      alive = false;
    };
  }, []);

  // While anything is on its way, look again every few seconds.
  const moving = data?.transfers.some((t) => t.state === "QUEUED" || t.state === "PROCESSING") ?? false;
  useEffect(() => {
    if (!moving) return;
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [moving, load]);

  const retry = async (t: Transfer) => {
    if (!window.confirm(`Retry ${rupee(t.amount)} to ${t.astrologer}? This sends a new transfer.`)) return;
    setBusy(t.id);
    try {
      await api.post(`/admin/payouts/transfers/${t.id}/retry`);
      say(`Retrying ${rupee(t.amount)} to ${t.astrologer}`);
      await load();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Couldn't retry that transfer.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="py-8 text-center text-[13px] text-[#78716c]">{error || "Loading the transfers…"}</p>;
  const [modeLabel, modeBg, modeFg, modeText] = MODE_NOTE[data.mode];
  const count = (s: State[]) => data.transfers.filter((t) => s.includes(t.state)).length;
  const missing = data.accounts.filter((a) => !a.account).length;

  return (
    <div className="space-y-4">
      <div className={PANEL}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-[24px] items-center rounded-full px-[11px] text-[11.5px] font-extrabold uppercase" style={{ background: modeBg, color: modeFg }}>
            {modeLabel}
          </span>
          <h2 className="m-0 text-[16px] font-bold">Payout transfers</h2>
        </div>
        <p className="mt-2 mb-0 text-[12.5px] leading-[1.55] text-[#57534e]">{modeText}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-bold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{count(["PROCESSED"])} paid</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{count(["QUEUED", "PROCESSING"])} on the way</span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-800">{count(["FAILED", "REVERSED"])} need attention</span>
          {missing > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{missing} astrologer{missing === 1 ? "" : "s"} without payout details</span>}
        </div>

        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Batch", "Astrologer", "Sent to", "Amount", "Status", "Reference", ""].map((h, i) => (
                  <th key={i} className={TH} style={{ textAlign: h === "Amount" ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.transfers.map((t) => {
                const [text, bg, fg] = STATE[t.state];
                return (
                  <tr key={t.id}>
                    <td className={TD}>
                      <span className="font-mono text-[11.5px] text-[#57534e]">{t.batchId}</span>
                      <span className="block text-[11.5px] text-[#78716c]">{t.cycle}</span>
                    </td>
                    <td className={`${TD} font-semibold`}>{t.astrologer}</td>
                    <td className={`${TD} whitespace-nowrap text-[#57534e]`}>
                      {t.method}
                      {t.mode && <span className="block text-[11.5px] text-[#78716c]">{t.mode}</span>}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>
                      <b>{rupee(t.amount)}</b>
                      <span className="block text-[11.5px] text-[#78716c]">
                        {rupee(t.gross)} − TDS {rupee(t.tds)}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold" style={{ background: bg, color: fg }}>
                        {text}
                      </span>
                      {t.attempts > 1 && <span className="ml-1.5 text-[11px] text-[#78716c]">attempt {t.attempts}</span>}
                      {t.reason && <span className="mt-1 block max-w-[260px] text-[11.5px] leading-[1.45] text-rose-700">{t.reason}</span>}
                    </td>
                    <td className={`${TD} text-[11.5px] break-all text-[#57534e]`}>
                      {t.utr ? `UTR ${t.utr}` : t.reference ?? "—"}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {(t.state === "FAILED" || t.state === "REVERSED") &&
                        (canRetry ? (
                          <button type="button" disabled={busy === t.id} onClick={() => void retry(t)} className="h-[30px] rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink disabled:opacity-60">
                            {busy === t.id ? "Retrying…" : "Retry"}
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-[#78716c]">A Super Admin retries</span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.transfers.length === 0 && (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No transfers yet. They are made when a payout batch is released (Finance → Payouts).</p>
        )}
      </div>

      <div className={PANEL}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">Payout details on file</h2>
        <p className="mt-0 mb-3 text-[12px] text-[#78716c]">Account numbers and PAN are stored encrypted and shown masked. Astrologers add or change theirs under Earnings → Payout details.</p>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2.5 p-0">
          {data.accounts.map((a) => (
            <li key={a.astrologerId} className="rounded-xl border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-[13.5px]">{a.name}</b>
                {a.account?.isTest && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 uppercase">Test</span>}
                {!a.account && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-700 uppercase">Missing</span>}
              </div>
              {a.account ? (
                <div className="mt-1 text-[12px] leading-[1.5] text-[#57534e]">
                  {a.account.holderName}
                  <br />
                  {a.account.kind === "BANK" ? `Bank ${a.account.accountMasked} · ${a.account.ifsc}` : `UPI ${a.account.upiMasked}`} · PAN {a.account.panMasked}
                </div>
              ) : (
                <div className="mt-1 text-[12px] text-[#78716c]">No details yet — a payout to this astrologer would fail until they add them.</div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
