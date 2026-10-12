"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { BlockedAction, Chip, PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { WalletRefund, WalletRefunds } from "@/lib/admin/refunds";

// "Wallet refunds" on the Finance page: money owed back to customers who deleted their account
// (service balance → original payment method). Finance pays each one and records the reference.
// ⚠ Manual until the Razorpay keys exist; then the gateway refunds automatically and only
// failures need attention here.

const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

const STATUS: Record<WalletRefund["status"], [string, string, string]> = {
  PENDING: ["#fffbeb", "#b45309", "Pending"],
  PAID: ["#ecfdf5", "#047857", "Paid"],
  FAILED: ["#fff1f2", "#be123c", "Failed"],
};

const HEADS: [string, "left" | "right"][] = [
  ["Refund", "left"],
  ["Customer", "left"],
  ["Amount", "right"],
  ["Requested", "left"],
  ["Method", "left"],
  ["Status", "left"],
  ["", "right"],
];

type Pending = { refund: WalletRefund; kind: "paid" | "failed" };

export default function WalletRefundsPanel({ data }: { data: WalletRefunds }) {
  const { session } = useAdmin();
  const canProcess = session.capabilities.includes("wallet.refund.process");
  const [open, setOpen] = useState<Pending | null>(null);
  const pendingCount = data.refunds.filter((r) => r.status === "PENDING").length;

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] font-bold">Wallet refunds</h2>
          <span className="mt-1 block text-[12px] text-[#78716c]">
            Service balance refunded to the original payment method when a customer deletes their account. Pay each one,
            then record the reference. Audited.
          </span>
        </div>
        <span className="text-[12.5px] font-bold text-[#b45309] tabular-nums">
          {pendingCount ? `${pendingCount} pending · ${rupee(data.pendingTotal)}` : "Nothing pending"}
        </span>
      </div>

      {data.refunds.length === 0 ? (
        <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">
          No wallet refunds yet. They appear here when a customer with a paid balance deletes their account.
        </p>
      ) : (
        // Wide table: scrolls inside the card on narrow windows, never the page.
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
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
              {data.refunds.map((r) => {
                const [bg, fg, label] = STATUS[r.status];
                return (
                  <tr key={r.ref} className="align-top">
                    <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] whitespace-nowrap text-[#57534e]`}>{r.ref}</td>
                    <td className={`${TD} min-w-[190px] px-2.5 py-[11px] text-[#57534e]`}>
                      {r.customer}
                      <span className="block text-[11.5px] text-[#a8a29e]">{r.reason}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right font-bold whitespace-nowrap text-ink tabular-nums`}>{rupee(r.amount)}</td>
                    <td className={`${TD} px-2.5 py-[11px] whitespace-nowrap text-[#57534e] tabular-nums`}>{when(r.requestedAt)}</td>
                    <td className={`${TD} max-w-[240px] px-2.5 py-[11px] break-words text-[#57534e]`}>{r.method}</td>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <Chip bg={bg} fg={fg}>
                        {label}
                      </Chip>
                      {r.status !== "PENDING" && (
                        <span className="mt-1 block max-w-[220px] text-[11.5px] leading-snug break-words text-[#78716c]">
                          {r.status === "PAID" ? `Ref ${r.providerRef}` : r.note}
                          {r.processedBy && ` · ${r.processedBy}`}
                          {r.processedAt && ` · ${when(r.processedAt)}`}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap`}>
                      {r.status === "PAID" ? null : !canProcess ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">Finance processes refunds</BlockedAction>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOpen({ refund: r, kind: "paid" })}
                            className="h-[30px] rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink"
                          >
                            Mark as paid
                          </button>
                          {r.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => setOpen({ refund: r, kind: "failed" })}
                              className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-rose-700"
                            >
                              Mark as failed
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <ProcessDialog pending={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ProcessDialog({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const { run, busy } = useAction();
  const { refund: r, kind } = pending;
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const paid = kind === "paid";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (paid && v.length < 4) return setError("Enter the payment or bank reference (at least 4 characters).");
    if (!paid && v.length < 5) return setError("Say why it failed (at least 5 characters).");
    const done = await run(
      () => api.post(`/admin/refunds/${r.ref}/${kind}`, paid ? { providerRef: v } : { note: v }),
      paid ? `${r.ref} marked as paid · ${rupee(r.amount)} · reference ${v}. Audited.` : `${r.ref} marked as failed. Audited.`,
    );
    if (done) onClose();
  }

  return (
    <AdminDialog
      title={paid ? `Mark ${r.ref} as paid` : `Mark ${r.ref} as failed`}
      subtitle={`${rupee(r.amount)} · ${r.customer}`}
      onClose={onClose}
      width={480}
    >
      <form onSubmit={submit} noValidate>
        <p className="mt-0 mb-3 text-[13px] leading-normal text-[#57534e]">
          {paid
            ? `Pay ${rupee(r.amount)} to: ${r.method}. Then enter the gateway refund id or bank UTR so the customer's refund can be traced.`
            : "Note why the refund couldn't be paid and what happens next (for example, the card was closed — asking the customer for bank details)."}
        </p>
        <label htmlFor="refund-value" className="mb-1.5 block text-[12px] font-bold text-[#57534e]">
          {paid ? "Payment or bank reference" : "Why it failed"}
        </label>
        {paid ? (
          <input
            id="refund-value"
            value={value}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="e.g. rfnd_Q8x2… or UTR 4421…"
            className="h-11 w-full rounded-[10px] border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-amber-500"
          />
        ) : (
          <textarea
            id="refund-value"
            value={value}
            maxLength={500}
            rows={3}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500"
          />
        )}
        {error && (
          <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`h-10 rounded-[10px] border-0 px-4 text-[13px] font-bold disabled:opacity-60 ${paid ? "bg-amber-500 text-ink" : "bg-rose-700 text-white"}`}
          >
            {paid ? "Mark as paid" : "Mark as failed"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
