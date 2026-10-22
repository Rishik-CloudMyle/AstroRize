"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import ReasonDialog from "@/components/admin/reason-dialog";
import { BlockedAction, PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { PayoutHolds } from "@/lib/admin/payout-holds";

// "Payout holds" on the Finance page: pause one astrologer's payouts (with a reason the astrologer
// sees in their portal) or resume them. Paused astrologers' lines are left out of every batch
// prepared meanwhile and join the first one after the pause ends. Audited.

export default function PayoutHoldsPanel({ data }: { data: PayoutHolds }) {
  const { session } = useAdmin();
  const { run, busy } = useAction();
  const canHold = session.capabilities.includes("payout.approve");
  const [pick, setPick] = useState("");
  const [pausing, setPausing] = useState<{ id: string; name: string } | null>(null);
  const chosen = data.astrologers.find((a) => a.id === pick) ?? null;

  const resume = (id: string, name: string) => {
    if (busy) return;
    void run(
      () => api.post(`/admin/payouts/holds/${encodeURIComponent(id)}`, { paused: false }),
      `${name}'s payouts resumed. Their held earnings join the next batch prepared. Audited.`,
    );
  };

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] font-bold">Payout holds</h2>
          <span className="mt-1 block text-[12px] text-[#78716c]">
            Pause an astrologer&apos;s payouts, for example while their bank details are checked. Their earnings keep accruing and
            are paid in the first batch prepared after you resume. They see the reason in their portal. Audited.
          </span>
        </div>
        <span className="text-[12.5px] font-bold text-[#b45309] tabular-nums">
          {data.holds.length ? `${data.holds.length} paused` : "Nobody paused"}
        </span>
      </div>

      {data.holds.length > 0 && (
        <ul className="m-0 mt-3.5 list-none space-y-2 p-0">
          {data.holds.map((h) => (
            <li
              key={h.astrologerId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-rose-200 bg-rose-50 px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <b className="block text-[13.5px] text-ink">{h.name}</b>
                <span className="block text-[12px] break-words text-[#57534e]">
                  {h.reason ?? "No reason recorded"}
                  {h.by && ` · paused by ${h.by}`}
                  {h.since && ` on ${h.since}`}
                </span>
              </span>
              {canHold ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => resume(h.astrologerId, h.name)}
                  className="h-[30px] shrink-0 rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-ink disabled:opacity-60"
                >
                  Resume payouts
                </button>
              ) : (
                <BlockedAction className="h-[30px] px-3 text-[11.5px]">Finance resumes payouts</BlockedAction>
              )}
            </li>
          ))}
        </ul>
      )}

      {canHold && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <label className="min-w-0 flex-1 basis-[220px]">
            <span className="sr-only">Astrologer to pause</span>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="h-10 w-full rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink"
            >
              <option value="">Choose an astrologer…</option>
              {data.astrologers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => chosen && setPausing(chosen)}
            className="h-10 shrink-0 rounded-[10px] border-0 bg-rose-700 px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Pause payouts
          </button>
        </div>
      )}

      {pausing && (
        <ReasonDialog
          title={`Pause ${pausing.name}'s payouts`}
          intro="Their earnings keep accruing but are left out of every payout batch until you resume. They see this reason in their portal."
          placeholder="e.g. Bank account details are being verified."
          confirm="Pause payouts"
          danger
          min={5}
          onClose={() => setPausing(null)}
          onSubmit={async (reason) => {
            const ok = await run(
              () => api.post(`/admin/payouts/holds/${encodeURIComponent(pausing.id)}`, { paused: true, reason }),
              `${pausing.name}'s payouts paused. Audited.`,
            );
            if (ok) setPick("");
            return !!ok;
          }}
        />
      )}
    </div>
  );
}
