"use client";

import { useAction, useAdmin } from "@/components/admin/admin-provider";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { BATCH_SORTS, sortRows } from "@/lib/admin/sort";
import type { FinanceData, PayoutBatch } from "@/lib/admin/types";

const HEADS: [string, "left" | "right"][] = [
  ["Batch", "left"],
  ["Astrologers", "left"],
  ["Gross", "right"],
  ["TDS", "right"],
  ["State", "left"],
  ["", "right"],
];

const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function FinanceView({ data }: { data: FinanceData }) {
  const { session, say } = useAdmin();
  const { run } = useAction();
  const [sort, setSort] = useUrlSort(BATCH_SORTS);
  const batches = sortRows(data.batches, BATCH_SORTS, sort);
  const actor = session.actor;
  const denoms = data.enabledDenominations;
  const floor = data.floorMode;

  // From the prototype's batchAct: approve (step-up MFA), then release by a different actor.
  // The API enforces both the capability and approver ≠ releaser.
  const batchAct = (b: PayoutBatch) => {
    const id = b.id;
    if (b.state === "DRAFT") {
      void run(() => api.post(`/admin/payouts/${id}/approve`), `${id} approved by ${actor} · step-up MFA passed.`);
      return;
    }
    if (b.state === "APPROVED") {
      void run(
        () => api.post<{ reference: string }>(`/admin/payouts/${id}/release`),
        (r) => `${id} released by ${actor}. RazorpayX reference ${r.reference} issued.`,
      );
      return;
    }
    say(`${id} · reference RZP${id.slice(-4)}8821 · TDS lines attached.`);
  };

  const toggleDenom = (v: number) => {
    const on = denoms.includes(v);
    void run(
      () => api.patch(`/admin/denominations/${v}`, { enabled: !on }),
      `${rupee(v)} ${on ? "removed from" : "added to"} the customer recharge grid. Audited.`,
    );
  };

  const pickFloor = (key: "reject" | "adjust", label: string) => {
    if (key === floor) return;
    void run(() => api.put("/admin/settings/floor-mode", { mode: key }), `Cashback floor mode set to ${label}. Audited.`);
  };

  return (
    <>
      <div className={`${PANEL} relative mt-4 p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-bold">Payout batches · RazorpayX</h2>
            <span className="mt-1 block text-[12px] text-[#78716c]">{data.cycle}</span>
          </div>
          <SortSelect options={BATCH_SORTS} value={sort} onChange={setSort} />
        </div>
        <table className="mt-3.5 w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {HEADS.map(([label, align], i) => (
                <th key={i} className={TH} style={{ textAlign: align }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.map((p) => {
              const st = p.state;
              // Same person, not same short name: a department can have several people.
              const sameActor = st === "APPROVED" && p.approvedById === session.id;
              const [bg, fg] =
                st === "RELEASED" ? ["#ecfdf5", "#047857"] : st === "APPROVED" ? ["#eff6ff", "#1d4ed8"] : ["#f7f4ee", "#57534e"];
              const action =
                st === "DRAFT"
                  ? "Approve · MFA"
                  : st === "APPROVED"
                    ? sameActor
                      ? "Release — you approved this"
                      : "Release"
                    : "View reference";
              return (
                <tr key={p.id}>
                  <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] text-[#57534e]`}>{p.id}</td>
                  <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{p.astrologers}</td>
                  <td className={`${TD} px-2.5 py-[11px] text-right font-bold text-ink tabular-nums`}>{p.gross}</td>
                  <td className={`${TD} px-2.5 py-[11px] text-right text-rose-700 tabular-nums`}>{p.tds}</td>
                  <td className={`${TD} px-2.5 py-[11px]`}>
                    <span
                      className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                      style={{ background: bg, color: fg }}
                    >
                      {st}
                    </span>
                  </td>
                  <td className={`${TD} px-2.5 py-[11px] text-right`}>
                    {sameActor ? (
                      <span
                        className="inline-flex h-[30px] items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 px-3 text-[11.5px] font-bold text-muted"
                        title="Approver and releaser must be different people"
                      >
                        {action}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => batchAct(p)}
                        className="h-[30px] rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink"
                      >
                        {action}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {batches.length === 0 && (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No payout batches yet.</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Recharge denominations</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Toggling one immediately changes the customer recharge grid. Audited.
          </p>
          <div className="flex flex-wrap gap-[7px]">
            {data.denominations.map((v) => {
              const on = denoms.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDenom(v)}
                  className="h-[34px] rounded-full border px-[13px] text-[12.5px] font-bold tabular-nums"
                  style={{
                    background: on ? "#f59e0b" : "#fff",
                    color: on ? "#1c1917" : "#a8a29e",
                    borderColor: on ? "#f59e0b" : "#e7e0d6",
                  }}
                >
                  {rupee(v)}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${PANEL} relative p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Cashback floor</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Effective price may never fall below {data.floorPct}% of the original.
          </p>
          <div className="flex gap-[9px]">
            {data.floorModes.map((m) => {
              const on = floor === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickFloor(m.key, m.label)}
                  className="flex-1 rounded-[14px] border-2 p-3.5 text-left"
                  style={{ borderColor: on ? "#f59e0b" : "#e7e0d6", background: on ? "#fffbeb" : "#fff" }}
                >
                  <b className="block text-[13.5px] text-ink">{m.label}</b>
                  <em className="mt-[3px] block text-[11.5px] leading-[1.45] text-[#78716c] not-italic">{m.body}</em>
                </button>
              );
            })}
          </div>
          <p className="mt-3 mb-0 text-[11.5px] text-[#78716c]">
            Floor decisions are made by the payments system when a campaign is submitted, not in this console.
          </p>
        </div>
      </div>
    </>
  );
}
