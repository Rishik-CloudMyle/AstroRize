"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { AUDIT_SORTS } from "@/lib/admin/sort";
import type { AuditEntry } from "@/lib/admin/types";

type Lane = "all" | "break-glass";

const LANES: readonly (readonly [Lane, string])[] = [
  ["all", "All events"],
  ["break-glass", "Break-glass lane"],
];

const HEADS = ["Timestamp (IST)", "Actor", "Action", "Object", "Before → after", "Correlation"];

export default function AuditView({ entries, initialSort }: { entries: AuditEntry[]; initialSort: string }) {
  const { say } = useAdmin();
  const [lane, setLane] = useState<Lane>("all");
  const [sort, setSort] = useUrlSort(AUDIT_SORTS);
  // The log is capped, so the API filters and sorts it (GET /admin/audit?lane=…&sort=…).
  // All events in the page's own order use the server-rendered rows.
  const [fetched, setFetched] = useState<{ lane: Lane; sort: string; rows: AuditEntry[] } | null>(null);
  const own = lane === "all" && sort === initialSort;
  const ready = own || (fetched?.lane === lane && fetched.sort === sort);
  const rows = own ? entries : ready && fetched ? fetched.rows : [];

  const load = async (nextLane: Lane, nextSort: string) => {
    setLane(nextLane);
    setSort(nextSort);
    if (nextLane === "all" && nextSort === initialSort) return;
    try {
      const res = await api.get<{ entries: AuditEntry[] }>(`/admin/audit?lane=${nextLane}&sort=${nextSort}`);
      setFetched({ lane: nextLane, sort: nextSort, rows: res.entries });
    } catch {
      say("Couldn't load the audit log. Please try again.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-display text-[36px] font-semibold">Audit log</h1>
          <p className="mt-1 mb-0 text-[13px] text-[#78716c]">Immutable. Nothing in this console can edit or delete an entry.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANES.map(([k, label]) => {
            const on = lane === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => void load(k, sort)}
                className="h-[38px] rounded-full border px-[15px] text-[13px] font-bold"
                style={{
                  background: on ? "#1c1917" : "#fff",
                  color: on ? "#fcd34d" : "#57534e",
                  borderColor: on ? "#1c1917" : "#e7e0d6",
                }}
              >
                {label}
              </button>
            );
          })}
          {/* CSV of the full log, served by the API; the export itself is audited. */}
          <a
            href="/api/admin/audit/export"
            download
            onClick={() => say("Export started — the CSV download is recorded in the audit log.")}
            className="inline-flex h-[38px] items-center rounded-full border border-line bg-white px-[15px] text-[13px] font-bold text-ink hover:text-ink hover:no-underline"
          >
            Export
          </a>
        </div>
      </div>

      <div className={`${PANEL} mt-[18px] p-[18px]`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <span className="pb-3 text-[12px] font-semibold text-[#78716c]" aria-live="polite">
            {ready ? `Showing ${rows.length} ${rows.length === 1 ? "entry" : "entries"}` : "Loading…"}
          </span>
          <SortSelect options={AUDIT_SORTS} value={sort} onChange={(next) => void load(lane, next)} />
        </div>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {HEADS.map((h) => (
                <th key={h} className={`${TH} text-left`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.corr + a.ts} style={{ background: a.breakGlass ? "#fff1f2" : "transparent" }}>
                <td className={`${TD} p-2.5 font-mono text-[11px] whitespace-nowrap text-[#78716c]`}>{a.ts}</td>
                <td className={`${TD} p-2.5 font-semibold text-ink`}>{a.actor}</td>
                <td className={`${TD} p-2.5 font-mono text-[11px] text-amber-700`}>{a.action}</td>
                <td className={`${TD} p-2.5 font-mono text-[11px] text-[#57534e]`}>{a.object}</td>
                <td className={`${TD} p-2.5 text-[#57534e]`}>{a.diff}</td>
                <td className={`${TD} p-2.5 font-mono text-[11px] text-[#78716c]`}>{a.corr}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ready && rows.length === 0 && (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No entries in this lane yet.</p>
        )}
      </div>
    </div>
  );
}
