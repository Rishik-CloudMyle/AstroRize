"use client";

import { useState } from "react";
import { Chip, PANEL, TD, TH } from "@/components/admin/ui";
import type { PriceChange, PriceChangeAstrologer, PriceChangeStatus } from "@/lib/admin/price-changes";
import { PRICE_STATUS, rupee } from "@/lib/admin/price-status";

// "Price changes" on the Finance page (read-only): astrologers' own chat & voice price changes in
// the last 30 days. Decreases go live at once; increases are approved or rejected on the
// Astrologer lifecycle page (price.approve), not here.

type Row = PriceChange & { astrologer: PriceChangeAstrologer };

const FILTERS: { key: "ALL" | PriceChangeStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Waiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "APPLIED", label: "Decreases" },
  { key: "REJECTED", label: "Rejected" },
  { key: "WITHDRAWN", label: "Withdrawn" },
];

const HEADS: [string, "left" | "right"][] = [
  ["Astrologer", "left"],
  ["Old → new /min", "left"],
  ["Type", "left"],
  ["Status", "left"],
  ["Requested", "left"],
  ["Decided", "left"],
];

const chip = (on: boolean) => ({
  borderColor: on ? "#1c1917" : "#e7e0d6",
  background: on ? "#1c1917" : "#fff",
  color: on ? "#fcd34d" : "#57534e",
});

export default function PriceChangesPanel({ changes }: { changes: Row[] }) {
  const [filter, setFilter] = useState<"ALL" | PriceChangeStatus>("ALL");
  const rows = filter === "ALL" ? changes : changes.filter((c) => c.status === filter);
  const count = (k: "ALL" | PriceChangeStatus) => (k === "ALL" ? changes.length : changes.filter((c) => c.status === k).length);

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="min-w-0">
        <h2 className="m-0 text-[16px] font-bold">Price changes</h2>
        <span className="mt-1 block text-[12px] text-[#78716c]">
          Astrologers&apos; own chat &amp; voice prices, last 30 days. Decreases go live at once; increases are approved on the Astrologer lifecycle
          page. New prices apply to consultations requested after the change.
        </span>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="h-[32px] rounded-full border px-3 text-[12px] font-bold"
            style={chip(filter === f.key)}
          >
            {f.label} <b className="opacity-60">{count(f.key)}</b>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">
          {changes.length === 0 ? "No price changes in the last 30 days." : "No price changes with this status."}
        </p>
      ) : (
        // Wide table: scrolls inside the card on narrow windows, never the page.
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr>
                {HEADS.map(([label, align]) => (
                  <th key={label} className={TH} style={{ textAlign: align }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const s = PRICE_STATUS[c.status] ?? PRICE_STATUS.WITHDRAWN;
                const diff = c.to - c.from;
                return (
                  <tr key={c.id} className="align-top">
                    <td className={`${TD} px-2.5 py-[10px] font-bold text-ink`}>
                      {c.astrologer.name}
                      <span className="block font-mono text-[11px] font-normal text-[#78716c]">{c.astrologer.id}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] whitespace-nowrap text-[#57534e] tabular-nums`}>
                      {rupee(c.from)} → <b className="text-ink">{rupee(c.to)}</b>
                      <span className={`ml-1.5 text-[11.5px] font-bold ${diff > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                        {diff > 0 ? "+" : "−"}
                        {rupee(Math.abs(diff))}
                      </span>
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] text-[#57534e]`}>{c.kind === "increase" ? "Increase" : "Decrease"}</td>
                    <td className={`${TD} px-2.5 py-[10px]`}>
                      <Chip bg={s.bg} fg={s.fg}>
                        {s.label}
                      </Chip>
                      {c.reason && <span className="mt-1 block max-w-[240px] text-[11.5px] break-words text-[#78716c]">“{c.reason}”</span>}
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] whitespace-nowrap text-[#57534e]`}>{c.requestedOn}</td>
                    <td className={`${TD} px-2.5 py-[10px] text-[#57534e]`}>
                      {c.status === "PENDING"
                        ? "Waiting for approval"
                        : c.status === "APPLIED"
                          ? `Live at once · ${c.decidedOn ?? c.requestedOn}`
                          : c.status === "WITHDRAWN"
                            ? `Withdrawn by the astrologer · ${c.decidedOn ?? "—"}`
                            : `${c.decidedBy ?? "—"} · ${c.decidedOn ?? "—"}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
