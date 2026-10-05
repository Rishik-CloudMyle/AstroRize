"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/admin/types";

type Lane = "all" | "break-glass";

const LANES: readonly (readonly [Lane, string])[] = [
  ["all", "All events"],
  ["break-glass", "Break-glass lane"],
];

const HEADS = ["Timestamp (IST)", "Actor", "Action", "Object", "Before → after", "Correlation"];

export default function AuditView({ entries }: { entries: AuditEntry[] }) {
  const { say } = useAdmin();
  const [lane, setLane] = useState<Lane>("all");
  // Rows for the lane, filtered by the API (GET /admin/audit?lane=…); "all" uses the server-rendered rows.
  const [laneRows, setLaneRows] = useState<{ lane: Lane; rows: AuditEntry[] } | null>(null);
  const rows = lane === "all" ? entries : laneRows?.lane === lane ? laneRows.rows : [];

  const pickLane = async (next: Lane) => {
    setLane(next);
    if (next === "all") return;
    try {
      const res = await api.get<{ entries: AuditEntry[] }>(`/admin/audit?lane=${next}`);
      setLaneRows({ lane: next, rows: res.entries });
    } catch {
      say("Couldn't load this lane. Please try again.");
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
                onClick={() => void pickLane(k)}
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
      </div>
    </div>
  );
}
