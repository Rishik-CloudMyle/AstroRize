"use client";

import { useEffect, useState } from "react";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";
import { downloadSheet } from "@/lib/payout-files";

interface Row {
  batch: string;
  astrologerId: string;
  astrologer: string;
  earned: number;
  tds: number;
  net: number;
  state: string;
  utr: string;
  paidOn: string;
}
interface Data {
  month: string;
  rows: Row[];
  totals: { earned: number; tds: number; net: number; paid: number; atBank: number; awaiting: number; problems: number; notFinalised: number; notPrepared: number; notPreparedLines: number };
}

const STATE: Record<string, string> = {
  DRAFT: "Draft batch",
  APPROVED: "Approved, not finalised",
  QUEUED: "Awaiting transfer",
  PROCESSING: "In bank file",
  PROCESSED: "Paid",
  FAILED: "Failed",
  REVERSED: "Returned",
  NOTHING: "Nothing to transfer",
};
const rupee = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN")}`;
const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).slice(0, 7);

/** Month by month: what was owed, what has been paid with which bank reference, and what is still open. */
export default function Reconciliation() {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get<Data>(`/admin/payouts/reconciliation?month=${month}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Couldn't load the report."));
    return () => {
      alive = false;
    };
  }, [month]);

  const t = data?.totals;
  const cards: [string, number, string][] = t
    ? [
        ["Earned", t.earned, "in batches of this month"],
        ["TDS", t.tds, "withheld"],
        ["Net payable", t.net, "earned − TDS"],
        ["Paid", t.paid, "recorded with a UTR"],
        ["In bank file", t.atBank, "not yet recorded"],
        ["Awaiting transfer", t.awaiting, "finalised"],
        ["Failed / returned", t.problems, "needs attention"],
        ["Not finalised", t.notFinalised, "draft or approved"],
        ["Not in a batch", t.notPrepared, `${t.notPreparedLines} earning lines`],
      ]
    : [];

  const exportReport = () => {
    if (!data) return;
    void downloadSheet(
      `astrorize-reconciliation-${data.month}.xlsx`,
      "Reconciliation",
      ["Batch", "Astrologer", "Earned (₹)", "TDS (₹)", "Net payable (₹)", "Status", "UTR", "Payment date"],
      data.rows.map((r) => [r.batch, r.astrologer, r.earned, r.tds, r.net, STATE[r.state] ?? r.state, r.utr, r.paidOn]),
      cards.map(([label, value]) => [label, value]),
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <div className={`${PANEL} p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-bold">Payout reconciliation</h2>
            <p className="mt-1 mb-0 text-[12px] text-[#78716c]">Payout batches whose cycle ended in the month chosen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-10 rounded-xl border border-line bg-white px-3 text-[13.5px] text-ink" />
            <button type="button" disabled={!data?.rows.length} onClick={exportReport} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-ink disabled:opacity-60">
              Download Excel
            </button>
          </div>
        </div>
        {error && <p role="alert" className="mb-0 text-[13px] text-rose-700">{error}</p>}
        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          {cards.map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border border-line bg-white p-3">
              <span className="block text-[10.5px] font-bold tracking-[.08em] text-[#78716c] uppercase">{label}</span>
              <b className="mt-1 block text-[20px] tabular-nums">{rupee(value)}</b>
              <span className="block text-[11.5px] text-[#78716c]">{sub}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Batch", "Astrologer", "Earned", "TDS", "Net payable", "Status", "UTR", "Paid on"].map((h) => (
                  <th key={h} className={`${TH} text-left`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={`${r.batch}-${r.astrologerId}`}>
                  <td className={`${TD} px-2.5 py-2.5 font-mono text-[11.5px]`}>{r.batch}</td>
                  <td className={`${TD} px-2.5 py-2.5 font-semibold`}>{r.astrologer}</td>
                  <td className={`${TD} px-2.5 py-2.5 tabular-nums`}>{rupee(r.earned)}</td>
                  <td className={`${TD} px-2.5 py-2.5 tabular-nums`}>{rupee(r.tds)}</td>
                  <td className={`${TD} px-2.5 py-2.5 font-bold tabular-nums`}>{rupee(r.net)}</td>
                  <td className={`${TD} px-2.5 py-2.5`}>{STATE[r.state] ?? r.state}</td>
                  <td className={`${TD} px-2.5 py-2.5 font-mono text-[11.5px] break-all`}>{r.utr || "—"}</td>
                  <td className={`${TD} px-2.5 py-2.5 whitespace-nowrap`}>{r.paidOn || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.rows.length && <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No payout batches for this month.</p>}
      </div>
    </div>
  );
}
