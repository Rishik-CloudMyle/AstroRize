"use client";

import { Fragment, useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import ReasonDialog from "@/components/admin/reason-dialog";
import { BlockedAction, PANEL, TD, TH } from "@/components/admin/ui";
import { RefundSplitView } from "@/components/admin/support/refund-split";
import { api } from "@/lib/api/client";
import type { DisputeRefund } from "@/lib/admin/types";
import { AgeChip, AgeLegend, edgeColor, oldestFirst } from "./age-chip";

// "Dispute refunds to approve" on the Finance page: Support or Finance proposes a refund — or a free
// replacement call with the same astrologer instead — on a ticket, and a second person with
// dispute.refund.approve (Finance or a Super Admin) approves it here. A Super Admin may approve their
// own proposal (audited as self-approved); anyone else needs a different person. A refund goes back to the customer's wallet in the
// buckets it was paid from, capped at what was billed, and the astrologer's share of it is taken back
// from their next payout. A free replacement call gives the customer free minutes; no money moves.

const HEADS: [string, "left" | "right"][] = [
  ["Waiting", "left"],
  ["Ticket", "left"],
  ["Customer", "left"],
  ["Session", "left"],
  ["Refund / remedy", "right"],
  ["Proposed by · with", "left"],
  ["", "right"],
];

export default function DisputeRefundsPanel({ refunds }: { refunds: DisputeRefund[] }) {
  const { session } = useAdmin();
  const { run } = useAction();
  const canApprove = session.capabilities.includes("dispute.refund.approve");
  const isSuper = session.role === "super";
  const [declining, setDeclining] = useState<DisputeRefund | null>(null);

  const approve = (r: DisputeRefund) =>
    void (r.kind === "WALLET_CREDIT"
      ? run(
          () => api.post(`/admin/support/${encodeURIComponent(r.id)}/credit/approve`),
          `${r.amount} wallet credit on ${r.id} approved by ${session.actor}. It's in the customer's wallet and the ticket is resolved.`,
        )
      : r.kind === "MAKE_GOOD"
      ? run(
          () => api.post(`/admin/support/${encodeURIComponent(r.id)}/makegood/approve`),
          `Free replacement call on ${r.id} approved by ${session.actor}. The customer has been told.`,
        )
      : run(
          () => api.post(`/admin/support/${encodeURIComponent(r.id)}/refund/approve`),
          `${r.amount} refund on ${r.id} approved by ${session.actor}. It's back in the customer's wallet.`,
        ));

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] font-bold">Dispute refunds to approve</h2>
          <span className="mt-1 block text-[12px] text-[#78716c]">
            Refunds and wallet credits Support or Finance proposed on a ticket (Support &amp; disputes page). Someone other than the proposer approves —
            or a Super Admin; the money returns to the customer&rsquo;s wallet, never more than was billed, and the astrologer&rsquo;s
            share of it comes off their next payout. A free replacement call with the same astrologer can be offered instead. Audited.
          </span>
        </div>
        <span className="text-[12.5px] font-bold text-[#b45309] tabular-nums">
          {refunds.length ? `${refunds.length} waiting` : "Nothing waiting"}
        </span>
      </div>

      {refunds.length > 0 && <AgeLegend />}

      {refunds.length === 0 ? (
        <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No proposed refunds. They appear here when one is proposed on a ticket.</p>
      ) : (
        // Scrolls inside the card on narrow windows, never the page.
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-[13px]">
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
              {oldestFirst(refunds, (x) => x.proposedAt).map((r) => {
                const mine = r.proposedById ? r.proposedById === session.id : r.proposedBy === session.actor;
                // A Super Admin may decide their own proposal; anyone else needs a second person.
                const blockedMine = mine && !isSuper;
                // Escalated to Admin: only a Super Admin decides it now.
                const withAdmin = r.team === "super" && !isSuper;
                return (
                  <Fragment key={r.id}>
                  <tr>
                    <td className={`${TD} px-2.5 py-[11px] whitespace-nowrap`} style={{ boxShadow: `inset 4px 0 0 ${edgeColor(r.proposedAt)}` }}>
                      <AgeChip at={r.proposedAt} />
                    </td>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <span className="block font-mono text-[11.5px] whitespace-nowrap text-[#57534e]">{r.id}</span>
                      <span className="block text-[12px] text-ink">{r.subject}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-ink`}>{r.customer}</td>
                    <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] whitespace-nowrap text-[#57534e]`}>{r.session}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right font-bold whitespace-nowrap text-ink tabular-nums`}>
                      {r.amount}
                      {r.kind === "MAKE_GOOD" && <span className="block text-[11px] font-semibold text-[#78716c]">instead of a refund</span>}
                      {r.kind === "WALLET_CREDIT" && (
                        <span className="block text-[11px] font-semibold text-[#78716c]">wallet credit · {r.credit?.bucket ?? "—"}</span>
                      )}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>
                      {r.proposedBy ?? "—"}
                      <span className="block text-[11px] text-[#78716c]">With {r.team === "super" ? "Admin" : r.team === "finance" ? "Finance" : r.team === "support" ? "Support" : r.team}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap`}>
                      {!canApprove ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">Finance approves refunds</BlockedAction>
                      ) : withAdmin ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">Escalated to Admin — only Admin decides</BlockedAction>
                      ) : blockedMine ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">You proposed this — another person approves</BlockedAction>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => approve(r)}
                            className="h-[30px] rounded-[9px] border-0 bg-emerald-700 px-3 text-[12px] font-bold text-white"
                          >
                            {r.kind === "MAKE_GOOD" ? "Approve free call" : r.kind === "WALLET_CREDIT" ? "Approve credit" : "Approve refund"}
                            {mine ? " (your own)" : ""}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeclining(r)}
                            className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-rose-700"
                          >
                            Decline
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                  {r.split && (
                    <tr>
                      <td colSpan={6} className="border-b border-line-warm/70 px-2.5 pt-0 pb-3">
                        {/* The table scrolls sideways below 1024px: keep this card in view instead of 720px wide. */}
                        <div className="max-lg:sticky max-lg:left-0 max-lg:w-[calc(100vw-6rem)] max-lg:max-w-full">
                          <RefundSplitView split={r.split} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {declining && (
        <ReasonDialog
          title={`Decline the ${declining.kind === "MAKE_GOOD" ? "free replacement call" : declining.kind === "WALLET_CREDIT" ? "wallet credit" : "refund"} on ${declining.id}`}
          subtitle={`${declining.amount} · proposed by ${declining.proposedBy ?? "Support"}`}
          intro="Nothing is given and no money moves. The ticket goes back to Support, with your reason in the audit log."
          placeholder="e.g. The metering log shows the session ran its full length."
          confirm={declining.kind === "MAKE_GOOD" ? "Decline free call" : declining.kind === "WALLET_CREDIT" ? "Decline credit" : "Decline refund"}
          danger
          onClose={() => setDeclining(null)}
          onSubmit={async (reason) =>
            !!(await run(
              () => api.post(`/admin/support/${encodeURIComponent(declining.id)}/refund/decline`, { reason }),
              `${declining.kind === "MAKE_GOOD" ? "Free replacement call" : declining.kind === "WALLET_CREDIT" ? "Wallet credit" : "Refund"} on ${declining.id} declined. The ticket is back with Support. Audited.`,
            ))
          }
        />
      )}
    </div>
  );
}
