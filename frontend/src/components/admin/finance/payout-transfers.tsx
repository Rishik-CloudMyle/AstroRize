"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { downloadSheet, downloadTextFile } from "@/lib/payout-files";

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
  automatic: boolean;
  paidAt: string | null;
  markedBy: string | null;
}
interface AccountRow {
  astrologerId: string;
  name: string;
  account: { kind: "BANK" | "UPI"; holderName: string; ifsc: string | null; accountMasked: string | null; upiMasked: string | null; panMasked: string; isTest: boolean } | null;
}
interface Data {
  provider: { id: string; label: string; automatic: boolean; mode: "manual" | "mock" | "test" | "live" };
  transfers: Transfer[];
  accounts: AccountRow[];
}
interface BankFile {
  ref: string;
  fileName: string;
  content: string;
  count: number;
  total: number;
  skipped: { astrologer: string; reason: string }[];
}
interface SheetRow {
  batch: string;
  cycle: string;
  astrologer: string;
  beneficiary: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  earned: number;
  tds: number;
  amount: number;
  state: State;
  reference: string;
  utr: string;
  paidOn: string;
}
type Action = "PAID" | "FAILED" | "RETURNED";

const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const STATE: Record<State, [string, string]> = {
  QUEUED: ["Awaiting transfer", "bg-amber-100 text-amber-900"],
  PROCESSING: ["In bank file", "bg-blue-50 text-blue-800"],
  PROCESSED: ["Paid", "bg-emerald-50 text-emerald-800"],
  FAILED: ["Failed", "bg-rose-50 text-rose-800"],
  REVERSED: ["Returned", "bg-rose-50 text-rose-800"],
};
const PANEL = "rounded-[20px] border border-line bg-paper p-5 shadow-xs";
const TH = "border-b border-line px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[.06em] text-[#78716c]";
const TD = "border-b border-line-soft px-2.5 py-[10px] align-top";
const SMALL = "h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-ink disabled:opacity-60";
const MAIN = "h-10 rounded-xl border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60";
const FIELD = "h-10 w-full rounded-xl border border-line bg-white px-3 text-[14px] text-ink";

const MODE_TEXT = {
  manual: "Pay from the company bank account: download the HDFC file, upload it in net banking, then record each result here with the bank reference (UTR). A payout goes into one file only, and a paid one can't be paid again.",
  mock: "RazorpayX isn't connected yet, so no real money moves: transfers are pretend and settle a few seconds after release.",
  test: "Transfers go to RazorpayX's test environment: realistic results, no real money.",
  live: "Transfers move real money from the RazorpayX account.",
} as const;

/** Every payout to an astrologer: the bank file, recording what the bank did, retries and the details on file. */
export default function PayoutTransfers() {
  const { session, say } = useAdmin();
  const canRecord = session.capabilities.includes("payout.approve");
  const canRetry = session.capabilities.includes("payout.release");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<State | "ALL">("ALL");
  const [dialog, setDialog] = useState<{ t: Transfer; action: Action } | null>(null);
  const [utr, setUtr] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

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

  // While an automatic provider has transfers on their way, look again every few seconds.
  const moving = !!data?.provider.automatic && data.transfers.some((t) => t.state === "QUEUED" || t.state === "PROCESSING");
  useEffect(() => {
    if (!moving) return;
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [moving, load]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      await load();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const bankFile = (ref?: string) => {
    if (!ref && !window.confirm("Make a bank file for every payout awaiting transfer? They move to “In bank file” and won't be put in another file.")) return;
    if (ref && !window.confirm(`Download ${ref} again? Upload it only if the bank has not already processed it.`)) return;
    void act(async () => {
      const f = await api.post<BankFile>("/admin/payouts/bank-file", ref ? { ref } : {});
      downloadTextFile(f.fileName, f.content);
      say(`${f.fileName}: ${f.count} transfers · ${rupee(f.total)}`);
      if (f.skipped.length) window.alert(`Not in the file:\n${f.skipped.map((s) => `• ${s.astrologer}: ${s.reason}`).join("\n")}`);
    });
  };

  const sheet = () =>
    void act(async () => {
      const { rows } = await api.post<{ rows: SheetRow[] }>("/admin/payouts/sheet");
      await downloadSheet(
        `astrorize-payouts-${today()}.xlsx`,
        "Payouts",
        ["Batch", "Cycle", "Astrologer", "Beneficiary name", "Account number", "IFSC", "UPI id", "Earned (₹)", "TDS (₹)", "Final payable (₹)", "Status", "Our reference", "UTR", "Payment date"],
        rows.map((r) => [r.batch, r.cycle, r.astrologer, r.beneficiary, r.accountNumber, r.ifsc, r.upiId, r.earned, r.tds, r.amount, STATE[r.state][0], r.reference, r.utr, r.paidOn]),
      );
    });

  const retry = (t: Transfer) => {
    if (!window.confirm(`Retry ${rupee(t.amount)} to ${t.astrologer}? ${t.automatic ? "This sends a new transfer." : "It goes back to “Awaiting transfer”. Check the bank statement first so it isn't paid twice."}`)) return;
    void act(async () => {
      await api.post(`/admin/payouts/transfers/${t.id}/retry`);
      say(`Retrying ${rupee(t.amount)} to ${t.astrologer}`);
    });
  };

  const openDialog = (t: Transfer, action: Action) => {
    setDialog({ t, action });
    setUtr("");
    setPaidOn(today());
    setReason("");
    setFormError("");
  };

  const record = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/payouts/transfers/${dialog.t.id}/record`, dialog.action === "PAID" ? { status: "PAID", utr, paidOn } : { status: dialog.action, reason });
      say(`${dialog.t.astrologer}: recorded as ${dialog.action.toLowerCase()}. Audited.`);
      setDialog(null);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="py-8 text-center text-[13px] text-[#78716c]">{error || "Loading the transfers…"}</p>;
  const count = (s: State) => data.transfers.filter((t) => t.state === s).length;
  const missing = data.accounts.filter((a) => !a.account).length;
  const manual = !data.provider.automatic;
  const shown = data.transfers.filter((t) => filter === "ALL" || t.state === filter);

  return (
    <div className="mt-4 space-y-4">
      <div className={PANEL}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[16px] font-bold">Payout transfers · {data.provider.label}</h2>
          {canRecord && (
            <div className="flex flex-wrap gap-2">
              {manual && (
                <button type="button" disabled={busy || !count("QUEUED")} onClick={() => bankFile()} className={MAIN}>
                  Download HDFC bank file
                </button>
              )}
              <button type="button" disabled={busy || !data.transfers.length} onClick={sheet} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-ink disabled:opacity-60">
                Download Excel sheet
              </button>
            </div>
          )}
        </div>
        <p className="mt-2 mb-0 text-[12.5px] leading-[1.55] text-[#57534e]">{MODE_TEXT[data.provider.mode]}</p>
        <div role="group" aria-label="Show payouts" className="mt-3 flex flex-wrap gap-2">
          {(["ALL", "QUEUED", "PROCESSING", "PROCESSED", "FAILED", "REVERSED"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`h-8 rounded-full border px-3 text-[12px] font-bold ${filter === s ? "border-amber-500 bg-amber-500 text-ink" : "border-line bg-white text-ink"}`}>
              {s === "ALL" ? `All ${data.transfers.length}` : `${STATE[s][0]} ${count(s)}`}
            </button>
          ))}
          {missing > 0 && <span className="inline-flex h-8 items-center rounded-full bg-amber-50 px-3 text-[12px] font-bold text-amber-900">{missing} astrologer{missing === 1 ? "" : "s"} without payout details</span>}
        </div>

        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Batch", "Astrologer", "Paid to", "Amount", "Status", "Reference", "Actions"].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const [text, tone] = STATE[t.state];
                const open = t.state === "QUEUED" || t.state === "PROCESSING";
                return (
                  <tr key={t.id}>
                    <td className={TD}>
                      <span className="font-mono text-[11.5px] text-[#57534e]">{t.batchId}</span>
                      <span className="block text-[11.5px] text-[#78716c]">{t.cycle}</span>
                    </td>
                    <td className={`${TD} font-semibold`}>{t.astrologer}</td>
                    <td className={`${TD} whitespace-nowrap text-[#57534e]`}>{t.method}</td>
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>
                      <b>{rupee(t.amount)}</b>
                      <span className="block text-[11.5px] text-[#78716c]">
                        {rupee(t.gross)} − TDS {rupee(t.tds)}
                      </span>
                    </td>
                    <td className={TD}>
                      <span className={`inline-flex min-h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold whitespace-nowrap ${tone}`}>{text}</span>
                      {t.attempts > 1 && <span className="ml-1.5 text-[11px] text-[#78716c]">attempt {t.attempts}</span>}
                      {t.reason && <span className="mt-1 block max-w-[260px] text-[11.5px] leading-[1.45] text-rose-700">{t.reason}</span>}
                    </td>
                    <td className={`${TD} max-w-[220px] text-[11.5px] break-all text-[#57534e]`}>
                      {t.utr ? `UTR ${t.utr}` : (t.reference ?? "—")}
                      {t.paidAt && (
                        <span className="block text-[#78716c]">
                          {day(t.paidAt)}
                          {t.markedBy ? ` · ${t.markedBy}` : ""}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1.5">
                        {!t.automatic && canRecord && open && (
                          <>
                            <button type="button" disabled={busy} onClick={() => openDialog(t, "PAID")} className="h-[30px] rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink">
                              Mark paid
                            </button>
                            <button type="button" disabled={busy} onClick={() => openDialog(t, "FAILED")} className={SMALL}>
                              Failed
                            </button>
                          </>
                        )}
                        {!t.automatic && canRecord && t.state === "PROCESSING" && t.reference && (
                          <button type="button" disabled={busy} onClick={() => bankFile(t.reference!)} className={SMALL}>
                            File again
                          </button>
                        )}
                        {!t.automatic && canRecord && t.state === "PROCESSED" && (
                          <button type="button" disabled={busy} onClick={() => openDialog(t, "RETURNED")} className={SMALL}>
                            Returned by bank
                          </button>
                        )}
                        {(t.state === "FAILED" || t.state === "REVERSED") &&
                          (canRetry ? (
                            <button type="button" disabled={busy} onClick={() => retry(t)} className="h-[30px] rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink disabled:opacity-60">
                              Retry
                            </button>
                          ) : (
                            <span className="text-[11.5px] text-[#78716c]">A Super Admin retries</span>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">{data.transfers.length ? "Nothing with this status." : "No payouts yet. They are made when a batch is finalised (Finance → Payouts)."}</p>}
      </div>

      {dialog && (
        <AdminDialog
          title={dialog.action === "PAID" ? "Record payment" : dialog.action === "FAILED" ? "Transfer failed" : "Returned by the bank"}
          subtitle={`${dialog.t.astrologer} · ${rupee(dialog.t.amount)} · ${dialog.t.batchId}`}
          onClose={() => setDialog(null)}
          width={460}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(null)} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-ink">
                Cancel
              </button>
              <button type="button" disabled={busy || (dialog.action === "PAID" ? utr.trim().length < 6 || !paidOn : reason.trim().length < 3)} onClick={() => void record()} className={MAIN}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
          {dialog.action === "PAID" ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-[12.5px] font-bold">
                Bank reference (UTR)
                <input value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" className={FIELD} />
              </label>
              <label className="grid gap-1 text-[12.5px] font-bold">
                Payment date
                <input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} className={FIELD} />
              </label>
              <p className="m-0 text-[12.5px] text-[#57534e]">Once saved, this payout is complete: it can&apos;t be paid, exported or edited again.</p>
            </div>
          ) : (
            <label className="grid gap-1 text-[12.5px] font-bold">
              What happened
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={FIELD} />
            </label>
          )}
          {formError && (
            <p role="alert" className="mb-0 text-[13px] font-semibold text-rose-700">
              {formError}
            </p>
          )}
        </AdminDialog>
      )}

      <div className={PANEL}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">Payout details on file</h2>
        <p className="mt-0 mb-3 text-[12px] text-[#78716c]">Account numbers and PAN are stored encrypted and shown masked; full account numbers appear only in the downloaded files (each download is audited). Astrologers add or change theirs under Earnings → Payout details.</p>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-2.5 p-0">
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
                <div className="mt-1 text-[12px] text-[#78716c]">No details yet — they can&apos;t be paid until they add them.</div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
