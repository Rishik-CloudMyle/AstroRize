"use client";

import { useRouter } from "next/navigation";
import { rupee } from "@/lib/portal/format";
import type { Earnings, StatementRow } from "@/lib/portal/types";
import { useToast } from "../portal-provider";
import { APP_CARD, M_SECONDARY, PageHeader, Panel, Th, tdClass } from "../ui";

/** Your amount for one statement row (worked out by the API, fixed when the line was written). */
function amountFor(row: StatementRow): { label: string; color: string } {
  if (row.kind === "welcome") {
    // A free call recorded before Astrorize paid for free minutes: ₹0.
    return { label: row.amount > 0 ? rupee(row.amount) : "₹0 · free call", color: "#78716c" };
  }
  if (row.kind === "adjustment") return { label: row.amount ? rupee(row.amount) : "—", color: "#be123c" };
  // A customer was refunded after a complaint: your share of the refund comes off this period.
  if (row.kind === "refund_adjustment") return { label: signed(row.amount), color: "#be123c" };
  if (row.fundedBy === "PLATFORM") return { label: rupee(row.amount), color: "#047857" };
  if (row.kind === "emergency") return { label: rupee(row.amount), color: "#c2410c" };
  return { label: rupee(row.amount), color: "#1c1917" };
}

/** "Paid by Astrorize" on free-call compensation, "Before split" on lines recorded before revenue sharing. */
function Tags({ row }: { row: StatementRow }) {
  return (
    <>
      {row.fundedBy === "PLATFORM" && (
        <span className="ml-0.5 inline-flex h-[20px] items-center rounded-full bg-emerald-50 px-2 align-middle text-[11px] font-bold whitespace-nowrap text-emerald-700">
          Paid by Astrorize
        </span>
      )}
      {row.legacy && row.kind !== "adjustment" && (
        <span className="ml-0.5 inline-flex h-[20px] items-center rounded-full bg-stone-100 px-2 align-middle text-[11px] font-bold whitespace-nowrap text-stone-500">
          Before split
        </span>
      )}
    </>
  );
}

/** "−₹25" for a negative amount (refund adjustments), "₹25" otherwise. */
const signed = (n: number) => (n < 0 ? `−${rupee(Math.abs(n))}` : rupee(n));

/** "4:30" free time on a compensation line. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Saves the statement on screen as a CSV file. */
function downloadCsv(data: Earnings) {
  const rows = [
    ["Date", "Session", "Mode", "Minutes", "Gross (INR)", "Your share (%)", "Your amount (INR)", "Paid by"],
    ...data.statement.map((r) => [
      r.date,
      r.session,
      r.mode,
      r.minutes,
      r.gross,
      r.sharePct ?? (r.legacy ? "before split" : ""),
      r.amount,
      r.fundedBy === "PLATFORM" ? "Astrorize (free-call compensation)" : "Customer",
    ]),
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
  const tdsPct = Math.round(data.tdsRate * 1000) / 10;
  const free = data.freeCalls;
  const hasLegacy = data.statement.some((r) => r.legacy);
  const hasRefunds = data.statement.some((r) => r.kind === "refund_adjustment");

  const kpis = [
    { label: "Customers paid", value: signed(data.gross), sub: "sessions and gifts", color: "#1c1917" },
    {
      label: "Your earnings",
      value: signed(data.earned),
      sub: data.gifts > 0 ? `incl. ${rupee(data.gifts)} from gifts` : "your share",
      color: "#047857",
    },
    { label: `TDS · ${tdsPct}%`, value: data.tds > 0 ? "−" + rupee(data.tds) : rupee(0), sub: "on your earnings", color: data.tds > 0 ? "#be123c" : "#78716c" },
    { label: "Next payout", value: data.nextPayout, sub: "after this cycle closes", color: "#1c1917" },
  ];

  return (
    <div>
      <PageHeader title="Earnings" subtitle={data.periodLabel}>
        <div className="flex w-full gap-2 min-[560px]:w-auto">
          <select
            value={period}
            onChange={(e) => {
              const i = data.periods.indexOf(e.target.value);
              router.push(i > 0 ? `/portal/earnings?period=${i}` : "/portal/earnings");
            }}
            aria-label="Statement period"
            className="h-[42px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-[13.5px] font-semibold text-ink min-[560px]:flex-none max-lg:h-app-hit max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:text-[16px] max-lg:font-medium"
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
            className={`h-[42px] shrink-0 rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold ${M_SECONDARY} max-lg:h-app-hit`}
          >
            Download CSV
          </button>
        </div>
      </PageHeader>

      {data.payoutPaused && (
        <div className="relative mt-[18px] flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-[18px] py-3.5 max-lg:mt-3.5 max-lg:gap-2.5 max-lg:rounded-app-card max-lg:p-3">
          <span className="text-base text-rose-700">⏸</span>
          <div className="flex-1">
            <b className="block text-sm text-rose-700">Your payouts are paused by Astrorize Finance</b>
            <span className="mt-0.5 block text-[13px] leading-[1.5] break-words text-rose-900">
              {data.payoutPauseReason ? `Reason: ${data.payoutPauseReason}. ` : ""}Your earnings keep accruing and are paid in
              the first payout after the pause ends. Message Astrorize if you have questions.
            </span>
          </div>
        </div>
      )}

      {/* Your share of what customers pay, and when it changes. */}
      <div className="mt-[18px] flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-[18px] py-3.5 max-lg:mt-3.5 max-lg:gap-2.5 max-lg:rounded-app-card max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:p-3">
        <span className="mt-px grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-amber-500 px-1.5 text-[13px] font-extrabold text-ink tabular-nums">
          {data.share.pct}%
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm text-ink">
            {data.share.nextPct !== null && data.share.changesOn
              ? `You keep ${data.share.pct}% until ${data.share.changesOn}, then ${data.share.nextPct}%`
              : `You keep ${data.share.pct}% of what customers pay`}
          </b>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-stone-600">
            Your share applies to consultations and gifts. Each line keeps the share it was earned at.
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] max-lg:mt-3 max-lg:gap-2">
        {kpis.map((k) => (
          <div key={k.label} className={`az-panel min-w-0 rounded-[18px] border border-line px-[18px] py-4 ${APP_CARD} max-lg:p-3`}>
            <div className="text-[11px] font-bold tracking-[.08em] text-stone-500 uppercase max-lg:text-[12px] max-lg:font-normal max-lg:tracking-normal max-lg:text-app-ink-3 max-lg:normal-case">{k.label}</div>
            <b className="mt-[5px] block truncate text-[22px] font-bold tabular-nums sm:text-[26px] max-lg:mt-0.5 max-lg:text-[20px]!" style={{ color: k.color }}>
              {k.value}
            </b>
            <span className="mt-0.5 block text-[12px] text-stone-500 max-lg:text-[11.5px] max-lg:text-app-ink-3">{k.sub}</span>
          </div>
        ))}
      </div>

      <Panel className="relative mt-4 p-5 max-lg:mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[17px] font-bold max-lg:text-[16px]">Free-call compensation</h2>
          <span className="inline-flex h-[24px] items-center rounded-full bg-emerald-50 px-2.5 text-[11.5px] font-bold text-emerald-700">
            Paid by Astrorize · {free.cycle}
          </span>
        </div>
        <p className="mt-1.5 mb-0 text-[13px] leading-[1.55] text-stone-600">
          Customers pay nothing for free-call minutes. Astrorize pays you for them at your session rate × your share, in a
          separate {free.cycle === "weekly" ? "weekly" : "monthly"} payout.
        </p>
        <div className="mt-3.5 grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
          {[
            { label: free.periodLabel, value: `${free.calls} ${free.calls === 1 ? "call" : "calls"}` },
            { label: "Free minutes", value: String(free.minutes) },
            { label: "Your amount", value: rupee(free.amount), color: "#047857" },
            { label: "Paid after", value: free.paidAfter },
          ].map((k) => (
            <div key={k.label} className="min-w-0 rounded-[14px] border border-line-soft bg-white/70 px-3.5 py-3 max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-app-bg max-lg:p-2.5">
              <div className="truncate text-[11px] font-bold tracking-[.08em] text-stone-500 uppercase max-lg:text-[12px] max-lg:font-normal max-lg:tracking-normal max-lg:text-app-ink-3 max-lg:normal-case">{k.label}</div>
              <b className="mt-1 block truncate text-[18px] font-bold tabular-nums max-lg:mt-0 max-lg:text-[16px]" style={{ color: k.color ?? "#1c1917" }}>
                {k.value}
              </b>
            </div>
          ))}
        </div>
        {free.lines.length > 0 ? (
          <ul className="m-0 mt-3 list-none p-0">
            {free.lines.map((l, i) => (
              <li key={`${l.session}-${i}`} className="flex items-center gap-3 border-b border-line-soft py-2.5 text-[13px] last:border-b-0">
                <span className="w-[52px] shrink-0 text-stone-500">{l.date}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{l.mode}</span>
                  <span className="block text-[12px] text-stone-500 tabular-nums">
                    {l.session} · {clock(l.freeSeconds)} free · {l.minutes} min × rate = {rupee(l.gross)} · {l.sharePct}%
                  </span>
                </span>
                <b className="shrink-0 text-emerald-700 tabular-nums">{rupee(l.amount)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 mb-0 text-[13px] text-stone-500">No free calls in {free.periodLabel} yet.</p>
        )}
        {free.tds > 0 && (
          <p className="mt-2 mb-0 text-[11.5px] text-stone-500">
            TDS {tdsPct}% (−{rupee(free.tds)}) is withheld when it is paid.
          </p>
        )}
      </Panel>

      <Panel className="relative mt-4 p-5 max-lg:mt-[22px]" mobile="plain">
        <h2 className="m-0 mb-3.5 text-[17px] font-bold max-lg:mb-2.5 max-lg:text-[16px]">Statement</h2>
        {/* Phones and tablets: one card per line, nothing to scroll sideways. */}
        <ul className="m-0 flex list-none flex-col gap-2 p-0 lg:hidden">
          {data.statement.length === 0 && (
            <li className="rounded-app-card border border-app-line bg-app-surface p-3 text-[13px] text-app-ink-2 shadow-app-card">No sessions in this period yet.</li>
          )}
          {data.statement.map((r, i) => {
            const g = amountFor(r);
            return (
              <li
                key={`${r.session}-${i}`}
                className="flex items-start gap-3 rounded-app-card border border-app-line bg-app-surface p-3 text-[13.333px] shadow-app-card"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-app-ink">
                    {r.mode} <Tags row={r} />
                  </span>
                  <span className="mt-0.5 block text-[12px] text-app-ink-3 tabular-nums">
                    {r.date} · {r.session}
                    {r.minutes > 0 && ` · ${r.minutes} min`}
                    {r.kind !== "adjustment" && r.gross !== 0 && ` · ${signed(r.gross)}`}
                    {r.sharePct !== null && ` × ${r.sharePct}%`}
                  </span>
                </span>
                <b className="shrink-0 tabular-nums" style={{ color: g.color }}>
                  {g.label}
                </b>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Session</Th>
                <Th>Mode</Th>
                <Th align="right">Minutes</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Your %</Th>
                <Th align="right">Your amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.statement.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${tdClass} text-stone-500`}>
                    No sessions in this period yet.
                  </td>
                </tr>
              )}
              {data.statement.map((r, i) => {
                const g = amountFor(r);
                return (
                  <tr key={`${r.session}-${i}`}>
                    <td className={`${tdClass} whitespace-nowrap text-stone-600`}>{r.date}</td>
                    <td className={`${tdClass} text-stone-600 tabular-nums`}>{r.session}</td>
                    <td className={`${tdClass} text-stone-600`}>
                      {r.mode} <Tags row={r} />
                    </td>
                    <td className={`${tdClass} text-right text-stone-600 tabular-nums`}>{r.minutes === 0 ? "—" : r.minutes}</td>
                    <td className={`${tdClass} text-right text-stone-600 tabular-nums`}>
                      {r.kind === "adjustment" || (r.legacy && r.gross === 0) ? "—" : signed(r.gross)}
                    </td>
                    <td className={`${tdClass} text-right text-stone-600 tabular-nums`}>{r.sharePct === null ? "—" : `${r.sharePct}%`}</td>
                    <td className={`${tdClass} text-right font-bold whitespace-nowrap tabular-nums`} style={{ color: g.color }}>
                      {g.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-3">
          Your amount is the gross × your share, rounded down to the rupee. Free-call compensation lines are paid separately by
          Astrorize and aren&apos;t in this period&apos;s totals.
          {hasLegacy && " Lines marked “Before split” were recorded before revenue sharing began and count in full."}
          {hasRefunds &&
            " A refund adjustment takes back your share of a refund Astrorize gave a customer after a complaint; it comes off your next payout (if it is more than that payout, the rest carries to the one after)."}
        </p>
      </Panel>
    </div>
  );
}
