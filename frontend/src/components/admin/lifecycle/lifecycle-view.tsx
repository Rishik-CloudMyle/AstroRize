"use client";

import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { PANEL, TD, TH, TH_SM } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { APPLICATION_DEFAULT_SORT, APPLICATION_SORTS, sortRows } from "@/lib/admin/sort";
import type { Application, LifecycleData } from "@/lib/admin/types";
import { ApplicationDialog } from "./profile-dialogs";
import { stateTone } from "./stages";

export default function LifecycleView({ data, initialApp }: { data: LifecycleData; initialApp?: string }) {
  const { run } = useAction();
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useUrlSort(APPLICATION_SORTS, APPLICATION_DEFAULT_SORT);
  const [openApp, setOpenApp] = useState<string | null>(
    data.applications.some((a) => a.id === initialApp) ? (initialApp as string) : null,
  );
  const nego = data.negotiation;
  const round = nego?.round ?? 0;
  const max = nego?.maxRounds ?? 0;

  const rows = sortRows(data.applications, APPLICATION_SORTS, sort).filter(
    (a) => filter === "All" || a.state === filter || (filter === "Under review" && a.state === "Docs pending"),
  );

  /** Applicant actions quote the record version; the API refuses if someone changed it meanwhile. */
  const applicantAct = (app: Pick<Application, "id" | "version">, action: string, done: string, reason?: string) =>
    run(() => api.post(`/admin/applicants/${app.id}/${action}`, { version: app.version, reason }), done);

  // ── handlers from the prototype (setHrFilter / openAppDetail / appAction / counterOffer …) ──
  const pickFilter = (label: string) => {
    setFilter(label);
    setOpenApp(null);
  };
  // The application opens in a popup (details, negotiation, history and the applicant actions).
  const open = (id: string) => setOpenApp(id);
  const counterOffer = () => {
    if (!nego) return;
    const next = round + 1;
    void applicantAct(
      { id: nego.appId, version: nego.version },
      "counter",
      next >= max
        ? `Counter-offer sent · round ${max} of ${max}. This was the final round — accept or reject next.`
        : `Counter-offer sent · round ${next} of ${max}. Notes audited.`,
    );
  };
  const acceptRates = async () => {
    if (!nego) return;
    await applicantAct({ id: nego.appId, version: nego.version }, "accept-rates", "Rates accepted — the application moves to the Pricing stage.");
  };

  const left = Math.max(0, max - round);
  const capReached = round >= max;

  return (
    <>
      <div className="mt-[18px] flex flex-wrap gap-2">
        {data.filters.map((f) => {
          const on = filter === f.label;
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={on}
              onClick={() => pickFilter(f.label)}
              className="h-[34px] rounded-full border px-3.5 text-[12.5px] font-bold"
              style={{
                borderColor: on ? "#1c1917" : "#e7e0d6",
                background: on ? "#1c1917" : "#fff",
                color: on ? "#fcd34d" : "#57534e",
              }}
            >
              {f.label} <b className="opacity-60">{f.count}</b>
            </button>
          );
        })}
      </div>

      <div className={`${PANEL} relative mt-3.5 p-[18px]`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <span className="pb-3 text-[12px] font-semibold text-[#78716c]" aria-live="polite">
            Showing {rows.length} of {data.applications.length}
          </span>
          <SortSelect options={APPLICATION_SORTS} value={sort} onChange={setSort} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {[
                  ["ID", "left"],
                  ["Applicant", "left"],
                  ["Primary skill", "left"],
                  ["State", "left"],
                  ["Age", "right"],
                  ["", "right"],
                ].map(([label, align], i) => (
                  <th key={i} className={TH} style={{ textAlign: align as "left" | "right" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const [bg, fg] = stateTone(a.state);
                return (
                  <tr key={a.id} style={{ background: a.breach ? "#fff1f2" : "transparent" }}>
                    <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] text-[#57534e]`}>{a.id}</td>
                    <td className={`${TD} px-2.5 py-[11px] font-bold text-ink`}>
                      {/* The name opens the application too (on a phone "Open" is off to the right). */}
                      <button
                        type="button"
                        onClick={() => open(a.id)}
                        aria-haspopup="dialog"
                        className="border-0 bg-transparent p-0 text-left font-bold text-ink hover:underline"
                      >
                        {a.name}
                      </button>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{a.skill}</td>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <span
                        className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                        style={{ background: bg, color: fg }}
                      >
                        {a.state}
                      </span>
                    </td>
                    <td
                      className={`${TD} px-2.5 py-[11px] text-right tabular-nums`}
                      style={{ fontWeight: a.breach ? 800 : 500, color: a.breach ? "#be123c" : "#78716c" }}
                    >
                      {a.age}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right`}>
                      <button
                        type="button"
                        onClick={() => open(a.id)}
                        aria-haspopup="dialog"
                        aria-label={`Open application ${a.id}, ${a.name}`}
                        className="border-0 bg-transparent p-0 text-[12.5px] font-bold text-amber-700"
                      >
                        Open ›
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">
            {data.applications.length === 0 ? "No applications yet." : "No applications in this stage."}
          </p>
        )}
      </div>

      {openApp && <ApplicationDialog key={openApp} id={openApp} onClose={() => setOpenApp(null)} />}

      {nego && (
        <div className={`${PANEL} relative mt-4 max-w-[640px] p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">
            Negotiation · {nego.appId} {nego.applicant}
          </h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Round {round} of {max}. {left} counter-offer
            {left === 1 ? "" : "s"} remaining.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH_SM} text-left`}>Modality</th>
                  <th className={`${TH_SM} text-right`}>Requested</th>
                  <th className={`${TH_SM} text-right`}>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {nego.rows.map((n) => (
                  <tr key={n.mode}>
                    <td className={`${TD} p-2.5 font-semibold text-[#57534e]`}>{n.mode}</td>
                    <td className={`${TD} p-2.5 text-right text-[#78716c] tabular-nums`}>{n.requested}</td>
                    <td className={`${TD} p-2.5 text-right font-bold text-amber-700 tabular-nums`}>{n.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-[9px]">
            {capReached ? (
              <span className="inline-flex h-10 items-center rounded-[11px] border border-dashed border-stone-300 bg-stone-100 px-4 text-[13px] font-bold text-[#78716c]">
                Counter-offer — round cap reached
              </span>
            ) : (
              <button
                type="button"
                onClick={counterOffer}
                className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold"
              >
                Counter-offer
              </button>
            )}
            <button
              type="button"
              onClick={() => void acceptRates()}
              className="h-10 rounded-[11px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink"
            >
              Accept &amp; send to pricing
            </button>
          </div>
        </div>
      )}
    </>
  );
}
