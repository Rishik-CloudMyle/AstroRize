"use client";

import { useCallback, useEffect, useState } from "react";
import AdminDialog from "@/components/admin/dialog";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";
import { downloadStatementXlsx, type ExportRow } from "@/lib/earnings-export";

type Range = "daily" | "weekly" | "fortnight" | "monthly";
const RANGES: { key: Range; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "fortnight", label: "15 days" },
  { key: "monthly", label: "Monthly" },
];

interface BatchInfo {
  id: string;
  state: "DRAFT" | "APPROVED" | "RELEASED";
  earned: number;
  transfer: string | null;
  utr: string | null;
  net: number | null;
}
interface Row {
  astrologerId: string;
  name: string;
  sessions: number;
  minutes: number;
  gross: number;
  commission: number;
  earned: number;
  tds: number;
  tdsPct: number;
  tdsNote: string;
  net: number;
  freeCompensation: number;
  unbatchedEarned: number;
  batches: BatchInfo[];
  hold: "paused" | "new" | null;
  account: string | null;
}
interface Totals {
  astrologers: number;
  gross: number;
  commission: number;
  earned: number;
  tds: number;
  net: number;
  freeCompensation: number;
  unbatched: number;
}
interface Data {
  range: Range;
  periods: string[];
  periodIndex: number;
  periodLabel: string;
  running: boolean;
  tdsPct: number;
  totals: Totals;
  rows: Row[];
  can: { prepare: boolean; approve: boolean; release: boolean };
  me: string;
}
interface Statement {
  astrologer: string;
  periodLabel: string;
  tdsPct: number;
  rows: (ExportRow & { batchId: string | null; batchState: string | null })[];
  totals: { gross: number; commission: number; earned: number; tds: number; net: number; freeCompensation: number };
}

const inr = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN")}`;
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");
const TRANSFER: Record<string, string> = { PROCESSED: "Paid", PROCESSING: "On its way", QUEUED: "On its way", FAILED: "Transfer failed", REVERSED: "Returned" };
const th = "px-2.5 py-2 text-[10.5px] font-bold tracking-[.08em] uppercase text-[#78716c]";
const td = "border-t border-line-soft px-2.5 py-2.5 align-top";

/** What an astrologer's money for the period is doing: not prepared, drafted, approved, sent or paid. */
function Status({ r }: { r: Row }) {
  const chips: { text: string; tone: "amber" | "blue" | "green" | "red" | "grey" }[] = [];
  if (r.unbatchedEarned > 0) chips.push({ text: `Not prepared · ${inr(r.unbatchedEarned)}`, tone: "amber" });
  for (const b of r.batches) {
    if (b.state === "DRAFT") chips.push({ text: `Prepared, awaiting approval · ${b.id}`, tone: "grey" });
    else if (b.state === "APPROVED") chips.push({ text: `Approved, awaiting release · ${b.id}`, tone: "blue" });
    else if (b.transfer) {
      const bad = b.transfer === "FAILED" || b.transfer === "REVERSED";
      chips.push({ text: `${TRANSFER[b.transfer] ?? b.transfer}${b.net != null ? ` · ${inr(b.net)}` : ""}${b.utr ? ` · ${b.utr}` : ""}`, tone: bad ? "red" : b.transfer === "PROCESSED" ? "green" : "amber" });
    } else chips.push({ text: `Released · ${b.id}`, tone: "green" });
  }
  if (r.hold) chips.push({ text: r.hold === "paused" ? "Payouts paused by Finance" : "New astrologer: on hold", tone: "red" });
  if (!chips.length) chips.push({ text: "Nothing to pay", tone: "grey" });
  const cls = { amber: "bg-amber-100 text-amber-900", blue: "bg-blue-50 text-blue-800", green: "bg-emerald-50 text-emerald-800", red: "bg-rose-50 text-rose-800", grey: "bg-stone-100 text-stone-700" };
  return (
    <div className="flex flex-col items-start gap-1">
      {chips.map((c, i) => (
        <span key={i} className={`inline-flex min-h-[22px] items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold [overflow-wrap:anywhere] ${cls[c.tone]}`}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

export default function PayoutsView() {
  const [range, setRange] = useState<Range>("fortnight");
  const [period, setPeriod] = useState(0);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState<{ id: string; data: Statement | null; error: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "prepare" | "approve" | "release"; row: Row; batch?: BatchInfo } | null>(null);

  const load = useCallback(() => {
    api
      .get<{ payouts: Data }>(`/admin/astro-payouts?range=${range}&period=${period}&q=${encodeURIComponent(q)}`)
      .then((r) => {
        setData(r.payouts);
        setError("");
      })
      .catch((e) => setError(errorText(e)));
  }, [range, period, q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const openStatement = (row: Row) => {
    setStatement({ id: row.astrologerId, data: null, error: "" });
    api
      .get<{ statement: Statement }>(`/admin/astro-payouts/${encodeURIComponent(row.astrologerId)}?range=${range}&period=${period}`)
      .then((r) => setStatement({ id: row.astrologerId, data: r.statement, error: "" }))
      .catch((e) => setStatement({ id: row.astrologerId, data: null, error: errorText(e) }));
  };

  const run = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setMsg("");
    try {
      if (confirm.kind === "prepare") {
        await api.post("/admin/astro-payouts/prepare", { astrologerId: confirm.row.astrologerId, range, period });
        setMsg(`Payout prepared for ${confirm.row.name}. It now needs approving, then releasing, by a different person.`);
      } else if (confirm.kind === "approve") {
        await api.post(`/admin/astro-payouts/batches/${encodeURIComponent(confirm.batch!.id)}/approve`);
        setMsg(`Approved for ${confirm.row.name}. A different person releases it.`);
      } else {
        await api.post(`/admin/astro-payouts/batches/${encodeURIComponent(confirm.batch!.id)}/release`);
        setMsg(`Released to ${confirm.row.name}. The transfer is on its way.`);
      }
      setConfirm(null);
      load();
    } catch (e) {
      setConfirm(null);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return error ? <p role="alert" className="mt-4 text-[13px] font-semibold text-rose-700">{error}</p> : <div className="mt-5 h-64 rounded-2xl bg-cream" aria-busy="true" />;
  }
  const t = data.totals;
  const cards = [
    { label: "Gross (before GST)", value: inr(t.gross), sub: `${t.astrologers} astrologers`, color: "#1c1917" },
    { label: "Platform commission", value: inr(t.commission), sub: "AstroRize's share", color: "#78716c" },
    { label: "Astrologers' earnings", value: inr(t.earned), sub: "their share of gross", color: "#047857" },
    { label: `TDS · ${data.tdsPct}%`, value: inr(t.tds), sub: "withheld when paid", color: "#be123c" },
    { label: "Net payable", value: inr(t.net), sub: "after TDS", color: "#1c1917" },
    { label: "Not prepared yet", value: inr(t.unbatched), sub: "earnings still to batch", color: "#b45309" },
  ];

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Range">
        {RANGES.map((r) => (
          <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => { setRange(r.key); setPeriod(0); }} className={`h-10 rounded-full border px-4 text-[13px] font-bold ${range === r.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}>
            {r.label}
          </button>
        ))}
        <select aria-label="Period" value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="h-10 rounded-xl border border-line bg-white px-3 text-[13px] font-semibold">
          {data.periods.map((p, i) => (
            <option key={p} value={i}>{i === 0 ? `${p} (running)` : p}</option>
          ))}
        </select>
        <input aria-label="Search astrologers" placeholder="Search astrologer" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 min-w-[180px] flex-1 rounded-xl border border-line bg-white px-3 text-[13px] sm:max-w-[260px]" />
      </div>

      {data.running && (
        <p className="mt-3 mb-0 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          This period is still running, so figures can change. Prepare a payout once the period has ended, so nothing earned later is missed.
        </p>
      )}
      {msg && <p role="status" className="mt-3 mb-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-800">{msg}</p>}
      {error && <p role="alert" className="mt-3 mb-0 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-800">{error}</p>}

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {cards.map((c) => (
          <div key={c.label} className="az-panel rounded-2xl border border-line px-4 py-3.5">
            <div className="text-[10.5px] font-bold tracking-[.08em] text-[#78716c] uppercase">{c.label}</div>
            <b className="mt-1 block text-[22px] tabular-nums" style={{ color: c.color }}>{c.value}</b>
            <span className="text-[11px] font-semibold text-[#78716c]">{c.sub}</span>
          </div>
        ))}
      </div>

      <section className={`${PANEL} mt-4 p-4`} aria-label="Astrologers">
        {data.rows.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13px] text-[#78716c]">No earnings in {data.periodLabel}{q ? ` for “${q}”` : ""}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className={th}>Astrologer</th>
                  <th className={`${th} text-right`}>Sessions · min</th>
                  <th className={`${th} text-right`}>Gross</th>
                  <th className={`${th} text-right`}>Commission</th>
                  <th className={`${th} text-right`}>Earnings</th>
                  <th className={`${th} text-right`}>TDS</th>
                  <th className={`${th} text-right`}>Net payable</th>
                  <th className={th}>Payout</th>
                  <th className={th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.astrologerId}>
                    <td className={td}>
                      <b className="block">{r.name}</b>
                      <span className="text-[11.5px] text-[#78716c]">{r.account ?? "No payout details on file"}</span>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{r.sessions} · {r.minutes}</td>
                    <td className={`${td} text-right tabular-nums`}>{inr(r.gross)}</td>
                    <td className={`${td} text-right tabular-nums text-[#78716c]`}>{inr(r.commission)}</td>
                    <td className={`${td} text-right tabular-nums`}>{inr(r.earned)}</td>
                    <td className={`${td} text-right tabular-nums text-rose-700`} title={r.tdsNote}>{inr(r.tds)}<span className="block text-[10.5px] text-[#78716c]">{r.tdsPct}%</span></td>
                    <td className={`${td} text-right font-bold tabular-nums`}>{inr(r.net)}</td>
                    <td className={td}><Status r={r} /></td>
                    <td className={`${td} text-right`}>
                      <div className="flex flex-col items-end gap-1.5">
                        <button type="button" onClick={() => openStatement(r)} className="h-8 rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold">Statement</button>
                        {data.can.prepare && r.unbatchedEarned > 0 && !r.hold && (
                          <button type="button" onClick={() => setConfirm({ kind: "prepare", row: r })} className="h-8 rounded-[9px] bg-amber-500 px-3 text-[12px] font-bold text-ink">Prepare payout</button>
                        )}
                        {r.batches.filter((b) => b.id.startsWith("PA-")).map((b) =>
                          b.state === "DRAFT" && data.can.approve ? (
                            <button key={b.id} type="button" onClick={() => setConfirm({ kind: "approve", row: r, batch: b })} className="h-8 rounded-[9px] bg-blue-600 px-3 text-[12px] font-bold text-white">Approve</button>
                          ) : b.state === "APPROVED" && data.can.release ? (
                            <button key={b.id} type="button" onClick={() => setConfirm({ kind: "release", row: r, batch: b })} className="h-8 rounded-[9px] bg-emerald-600 px-3 text-[12px] font-bold text-white">Release</button>
                          ) : null,
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-[#78716c]">
          Gross is what customers were charged without GST, before the split. Earnings are the astrologer&apos;s share. TDS uses each astrologer&apos;s own rate (set on the TDS page); thresholds are applied when the payout is prepared, and the batch keeps what it worked out.
          Free-call compensation ({inr(t.freeCompensation)} in this period) is paid separately by AstroRize and is not in these totals. Whole 15-day batches are still on the Finance page.
        </p>
      </section>

      {confirm && (
        <AdminDialog
          title={confirm.kind === "prepare" ? "Prepare payout" : confirm.kind === "approve" ? "Approve payout" : "Release payout"}
          subtitle={`${confirm.row.name} · ${data.periodLabel}`}
          onClose={() => setConfirm(null)}
          width={480}
          footer={
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setConfirm(null)} className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void run()} className="h-10 rounded-[11px] bg-amber-500 px-5 text-[13px] font-bold text-ink disabled:opacity-60">
                {busy ? "Working…" : confirm.kind === "prepare" ? "Prepare" : confirm.kind === "approve" ? "Approve" : "Release and send"}
              </button>
            </div>
          }
        >
          <dl className="m-0 grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
            <dt className="text-[#78716c]">Gross (customers paid)</dt>
            <dd className="m-0 tabular-nums">{inr(confirm.row.gross)}</dd>
            <dt className="text-[#78716c]">Earnings</dt>
            <dd className="m-0 tabular-nums">{inr(confirm.batch ? confirm.batch.earned : confirm.row.unbatchedEarned)}</dd>
            <dt className="text-[#78716c]">TDS · {data.tdsPct}%</dt>
            <dd className="m-0 tabular-nums">{inr(Math.round(((confirm.batch ? confirm.batch.earned : confirm.row.unbatchedEarned) * data.tdsPct) / 100))}</dd>
            <dt className="font-bold">Net to send</dt>
            <dd className="m-0 font-bold tabular-nums">{inr((confirm.batch ? confirm.batch.earned : confirm.row.unbatchedEarned) - Math.round(((confirm.batch ? confirm.batch.earned : confirm.row.unbatchedEarned) * data.tdsPct) / 100))}</dd>
            <dt className="text-[#78716c]">Payout to</dt>
            <dd className="m-0">{confirm.row.account ?? "No payout details on file: the transfer will fail until they add them."}</dd>
          </dl>
          <p className="mt-3 mb-0 text-[12.5px] text-[#57534e]">
            {confirm.kind === "prepare"
              ? "This collects their unpaid earnings for the period into one payout. Nothing is sent yet."
              : confirm.kind === "approve"
                ? "After you approve, a different person must release it (a Super Admin can release their own approval, and it is recorded)."
                : "This sends the money now through RazorpayX. It can't be undone from here."}
          </p>
        </AdminDialog>
      )}

      {statement && (
        <AdminDialog
          title={`Statement · ${data.rows.find((r) => r.astrologerId === statement.id)?.name ?? ""}`}
          subtitle={`${data.periodLabel} · ${RANGES.find((r) => r.key === range)?.label}`}
          onClose={() => setStatement(null)}
          width={980}
          footer={
            statement.data && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const s = statement.data!;
                    void downloadStatementXlsx({
                      astrologer: s.astrologer,
                      periodLabel: s.periodLabel,
                      rangeLabel: RANGES.find((r) => r.key === range)?.label ?? "",
                      tdsPct: s.tdsPct,
                      withStatus: true,
                      rows: s.rows.map((r) => ({ ...r, payoutStatus: r.batchState ? `${r.batchState === "RELEASED" ? "Released" : r.batchState === "APPROVED" ? "Approved" : "Prepared"} (${r.batchId})` : null })),
                    });
                  }}
                  className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold"
                >
                  Download Excel
                </button>
              </div>
            )
          }
        >
          {statement.error ? (
            <p role="alert" className="m-0 text-[13px] font-semibold text-rose-700">{statement.error}</p>
          ) : !statement.data ? (
            <p className="m-0 text-[13px] text-[#78716c]">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                {[
                  ["Gross", statement.data.totals.gross],
                  ["Commission", statement.data.totals.commission],
                  ["Earnings", statement.data.totals.earned],
                  [`TDS ${statement.data.tdsPct}%`, statement.data.totals.tds],
                  ["Net payable", statement.data.totals.net],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-xl border border-line-soft bg-white px-3 py-2.5">
                    <div className="text-[10.5px] font-bold tracking-[.06em] text-[#78716c] uppercase">{l}</div>
                    <b className="text-[17px] tabular-nums">{inr(Number(v))}</b>
                  </div>
                ))}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="text-left">
                      {["Date", "Session", "Mode", "Min", "Gross", "Share", "Earnings", "Paid by", "Payout"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {statement.data.rows.length === 0 && (
                      <tr><td colSpan={9} className={`${td} text-[#78716c]`}>No earnings in this period.</td></tr>
                    )}
                    {statement.data.rows.map((r, i) => (
                      <tr key={`${r.session}-${i}`}>
                        <td className={`${td} whitespace-nowrap`}>{r.date}<span className="block text-[11px] text-[#78716c]">{r.time}</span></td>
                        <td className={`${td} tabular-nums`}>{r.session}</td>
                        <td className={td}>{r.mode}</td>
                        <td className={`${td} tabular-nums`}>{r.minutes || "—"}</td>
                        <td className={`${td} tabular-nums`}>{inr(r.gross)}</td>
                        <td className={`${td} tabular-nums`}>{r.sharePct == null ? "—" : `${r.sharePct}%`}</td>
                        <td className={`${td} font-bold tabular-nums`}>{inr(r.amount)}</td>
                        <td className={td}>{r.fundedBy === "PLATFORM" ? "AstroRize" : "Customer"}</td>
                        <td className={`${td} text-[11.5px]`}>{r.batchId ? `${r.batchState === "RELEASED" ? "Released" : r.batchState === "APPROVED" ? "Approved" : "Prepared"} · ${r.batchId}` : "Not prepared"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </AdminDialog>
      )}
    </div>
  );
}
