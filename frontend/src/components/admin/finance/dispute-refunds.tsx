"use client";

import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { BlockedAction, PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { DisputeRefund } from "@/lib/admin/types";

// "Dispute refunds to approve" on the Finance page: Support proposes a refund on a ticket, a second
// person with dispute.refund.approve (Finance or a Super Admin) approves it here. The money goes
// back to the customer's wallet in the buckets it was paid from, capped at what was billed.

const HEADS: [string, "left" | "right"][] = [
  ["Ticket", "left"],
  ["Customer", "left"],
  ["Session", "left"],
  ["Refund", "right"],
  ["Proposed by", "left"],
  ["", "right"],
];

export default function DisputeRefundsPanel({ refunds }: { refunds: DisputeRefund[] }) {
  const { session } = useAdmin();
  const { run } = useAction();
  const canApprove = session.capabilities.includes("dispute.refund.approve");

  const approve = (r: DisputeRefund) =>
    void run(
      () => api.post(`/admin/support/${encodeURIComponent(r.id)}/refund/approve`),
      `${r.amount} refund on ${r.id} approved by ${session.actor}. It's back in the customer's wallet.`,
    );

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] font-bold">Dispute refunds to approve</h2>
          <span className="mt-1 block text-[12px] text-[#78716c]">
            Refunds Support proposed on a ticket. A second person approves; the money returns to the customer&rsquo;s wallet,
            never more than was billed. Audited.
          </span>
        </div>
        <span className="text-[12.5px] font-bold text-[#b45309] tabular-nums">
          {refunds.length ? `${refunds.length} waiting` : "Nothing waiting"}
        </span>
      </div>

      {refunds.length === 0 ? (
        <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No proposed refunds. They appear here when Support proposes one.</p>
      ) : (
        // Scrolls inside the card on narrow windows, never the page.
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
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
              {refunds.map((r) => {
                const mine = r.proposedById ? r.proposedById === session.id : r.proposedBy === session.actor;
                return (
                  <tr key={r.id}>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <span className="block font-mono text-[11.5px] whitespace-nowrap text-[#57534e]">{r.id}</span>
                      <span className="block text-[12px] text-ink">{r.subject}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-ink`}>{r.customer}</td>
                    <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] whitespace-nowrap text-[#57534e]`}>{r.session}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right font-bold whitespace-nowrap text-ink tabular-nums`}>{r.amount}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{r.proposedBy ?? "—"}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap`}>
                      {!canApprove ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">Finance approves refunds</BlockedAction>
                      ) : mine ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">You proposed this</BlockedAction>
                      ) : (
                        <button
                          type="button"
                          onClick={() => approve(r)}
                          className="h-[30px] rounded-[9px] border-0 bg-emerald-700 px-3 text-[12px] font-bold text-white"
                        >
                          Approve refund · MFA
                        </button>
                      )}
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
