"use client";

import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import { Chip, PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { AdminPayment, AdminPayments } from "@/lib/admin/payments";

// "Recharge payments" on the Finance page: the latest wallet recharges with their Razorpay order
// and payment ids, method, status and failure reason, and what has been refunded from each.
// An open or failed Razorpay one can be checked with Razorpay (credits the wallet if it was paid).

const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

const STATUS: Record<AdminPayment["status"], [string, string, string]> = {
  CREATED: ["#eff6ff", "#1d4ed8", "Open"],
  PAID: ["#ecfdf5", "#047857", "Paid"],
  FAILED: ["#fff1f2", "#be123c", "Failed"],
};

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "PAID", label: "Paid" },
  { key: "CREATED", label: "Open" },
  { key: "FAILED", label: "Failed" },
] as const;

const HEADS: [string, "left" | "right"][] = [
  ["Date", "left"],
  ["Customer", "left"],
  ["Paid", "right"],
  ["Status", "left"],
  ["Method", "left"],
  ["Razorpay order / payment", "left"],
  ["Refunded", "right"],
  ["", "right"],
];

export default function RechargePaymentsPanel({ data }: { data: AdminPayments }) {
  const { run, busy } = useAction();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const rows = filter === "ALL" ? data.payments : data.payments.filter((p) => p.status === filter);

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] font-bold">Recharge payments</h2>
          <span className="mt-1 block text-[12px] text-[#78716c]">
            The latest 100 wallet recharges.{" "}
            {data.razorpay.connected
              ? `Razorpay is connected (${data.razorpay.mode === "live" ? "live" : "test mode — no real money"}).`
              : "Razorpay isn't connected: recharges are off."}{" "}
            Recharges marked &quot;mock&quot; were made before Razorpay, in development.
          </span>
        </div>
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`h-[30px] rounded-full border px-3 text-[12px] font-bold ${filter === f.key ? "border-amber-500 bg-amber-50 text-ink" : "border-line bg-white text-[#57534e]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">
          {data.payments.length === 0 ? "No recharges yet." : "No recharges with this status among the latest 100."}
        </p>
      ) : (
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-[13px]">
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
              {rows.map((p) => {
                const [bg, fg, label] = STATUS[p.status];
                const checkable = p.provider === "razorpay" && p.status !== "PAID" && data.razorpay.connected;
                return (
                  <tr key={p.orderId} className="align-top">
                    <td className={`${TD} px-2.5 py-[11px] whitespace-nowrap text-[#57534e] tabular-nums`}>{when(p.paidAt ?? p.createdAt)}</td>
                    <td className={`${TD} min-w-[170px] px-2.5 py-[11px] text-[#57534e]`}>{p.customer}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap tabular-nums`}>
                      <b className="text-ink">{rupee(p.total)}</b>
                      <span className="block text-[11.5px] text-[#a8a29e]">
                        {rupee(p.amount)} + {rupee(p.gst)} GST
                        {p.bonus + p.cashback > 0 && ` · +${rupee(p.bonus + p.cashback)} promo`}
                      </span>
                    </td>
                    <td className={`${TD} min-w-[220px] px-2.5 py-[11px]`}>
                      <Chip bg={bg} fg={fg}>
                        {label}
                      </Chip>
                      {p.failureReason && <span className="mt-1 block max-w-[260px] text-[11.5px] leading-snug break-words text-rose-700">{p.failureReason}</span>}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] whitespace-nowrap text-[#57534e]`}>
                      {p.provider === "razorpay" ? (p.method ? p.method.toUpperCase() : "—") : <span className="text-[#a8a29e]">{p.provider}</span>}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] text-[#57534e]`}>
                      {p.orderId}
                      {p.paymentId && <span className="block text-ink">{p.paymentId}</span>}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap tabular-nums text-[#57534e]`}>{p.refunded ? rupee(p.refunded) : "—"}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap`}>
                      {checkable && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => api.post<{ status: string; reason: string | null }>(`/admin/payments/${p.orderId}/check`),
                              (res) =>
                                res.status === "PAID"
                                  ? `${p.orderId} was paid — the wallet is credited. Audited.`
                                  : res.status === "FAILED"
                                    ? `${p.orderId} failed: ${res.reason ?? "no reason given"}.`
                                    : `${p.orderId} is still open at Razorpay.`,
                            )
                          }
                          className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-ink disabled:opacity-60"
                        >
                          Check with Razorpay
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
