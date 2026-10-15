"use client";

import { useRouter } from "next/navigation";
import { rupee } from "@/lib/portal/format";
import type { Earnings, StatementRow } from "@/lib/portal/types";
import { useToast } from "../portal-provider";
import { PageHeader, Panel, Th, tdClass } from "../ui";

/** How one statement row's gross (worked out by the API from your rates) is shown. */
function grossFor(row: StatementRow): { label: string; color: string } {
  switch (row.kind) {
    case "welcome":
      // A customer's welcome free call: the free minutes earn nothing.
      return { label: row.amount > 0 ? rupee(row.amount) : "₹0 · free call", color: "#78716c" };
    case "adjustment":
      return { label: row.amount ? rupee(row.amount) : "—", color: "#be123c" };
    case "emergency":
      return { label: rupee(row.amount), color: "#c2410c" };
    default:
      return { label: rupee(row.amount), color: "#1c1917" };
  }
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Saves the statement on screen as a CSV file. */
function downloadCsv(data: Earnings) {
  const rows = [
    ["Date", "Session", "Mode", "Minutes", "Gifts (INR)", "Your gross (INR)"],
    ...data.statement.map((r) => [r.date, r.session, r.mode, r.minutes, r.gifts, r.amount]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `astrorize-statement-${data.periods[data.periodIndex].replace(/[^0-9A-Za-z]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EarningsView({ data }: { data: Earnings }) {
  const router = useRouter();
  const toast = useToast();
  const period = data.periods[data.periodIndex] ?? data.periods[0];

  const kpis = [
    { label: "Gross", value: rupee(data.gross), color: "#1c1917" },
    { label: "Gifts", value: rupee(data.gifts), color: "#1c1917" },
    { label: "TDS", value: "−" + rupee(Math.round(data.gross * data.tdsRate)), color: "#be123c" },
    { label: "Next payout", value: data.nextPayout, color: "#1c1917" },
  ];

  return (
    <div>
      <PageHeader title="Earnings" subtitle={data.periodLabel}>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => {
              const i = data.periods.indexOf(e.target.value);
              router.push(i > 0 ? `/portal/earnings?period=${i}` : "/portal/earnings");
            }}
            aria-label="Statement period"
            className="h-[42px] min-w-0 rounded-xl border border-line bg-white px-3.5 text-[13.5px] font-semibold text-ink"
          >
            {data.periods.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              downloadCsv(data);
              toast(`Your statement for ${period} has been downloaded.`);
            }}
            className="h-[42px] shrink-0 rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold"
          >
            Download CSV
          </button>
        </div>
      </PageHeader>

      {data.payoutPaused && (
        <div className="relative mt-[18px] flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-[18px] py-3.5">
          <span className="text-base text-rose-700">⏸</span>
          <div className="flex-1">
            <b className="block text-sm text-rose-700">Payouts paused until your new bank account is verified</b>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-rose-900">
              Verification usually completes in 2 working days. Earnings continue to accrue and will be released in the next
              cycle after verification.
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {kpis.map((k) => (
          <div key={k.label} className="az-panel rounded-[18px] border border-line px-[18px] py-4">
            <div className="text-[11px] font-bold tracking-[.08em] text-stone-500 uppercase">{k.label}</div>
            <b className="mt-[5px] block text-[22px] font-bold tabular-nums sm:text-[26px]" style={{ color: k.color }}>
              {k.value}
            </b>
          </div>
        ))}
      </div>

      <Panel className="relative mt-4 p-5">
        <h2 className="m-0 mb-3.5 text-[17px] font-bold">Statement</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Session</Th>
                <Th>Mode</Th>
                <Th align="right">Minutes</Th>
                <Th align="right">Gifts</Th>
                <Th align="right">Your gross</Th>
              </tr>
            </thead>
            <tbody>
              {data.statement.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${tdClass} text-stone-500`}>
                    No sessions in this period yet.
                  </td>
                </tr>
              )}
              {data.statement.map((r, i) => {
                const g = grossFor(r);
                return (
                  <tr key={`${r.session}-${i}`}>
                    <td className={`${tdClass} text-stone-600`}>{r.date}</td>
                    <td className={`${tdClass} text-stone-600 tabular-nums`}>{r.session}</td>
                    <td className={`${tdClass} text-stone-600`}>{r.mode}</td>
                    <td className={`${tdClass} text-right text-stone-600 tabular-nums`}>{r.minutes === 0 ? "—" : r.minutes}</td>
                    <td className={`${tdClass} text-right text-stone-600 tabular-nums`}>
                      {r.kind === "adjustment" ? "—" : rupee(r.gifts)}
                    </td>
                    <td className={`${tdClass} text-right font-bold tabular-nums`} style={{ color: g.color }}>
                      {g.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] text-stone-500">This statement shows your share only.</p>
      </Panel>
    </div>
  );
}
