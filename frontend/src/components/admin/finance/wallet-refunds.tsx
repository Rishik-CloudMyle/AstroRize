"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { BlockedAction, Chip, PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { WalletRefund, WalletRefunds } from "@/lib/admin/refunds";

// "Wallet refunds" on the Finance page: money owed back to customers who deleted their account
// (service balance → original payment method). "Refund via Razorpay" sends it back over the
// customer's Razorpay recharges (newest first); Razorpay's answer marks it paid. What Razorpay
// can't cover (balance from recharges made before Razorpay, or a failed refund) Finance pays by
// hand and records the reference.

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
  PROCESSING: ["#eff6ff", "#1d4ed8", "Processing at Razorpay"],
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

type Pending = { refund: WalletRefund; kind: "paid" | "failed" | "razorpay" };

const PART_STATUS: Record<WalletRefund["razorpay"]["parts"][number]["status"], string> = {
  creating: "sending",
  pending: "pending at Razorpay",
  processed: "processed",
  failed: "failed",
};

export default function WalletRefundsPanel({ data }: { data: WalletRefunds }) {
  const { session } = useAdmin();
  const canProcess = session.capabilities.includes("wallet.refund.process");
  const [open, setOpen] = useState<Pending | null>(null);
  const pendingCount = data.refunds.filter((r) => r.status === "PENDING" || r.status === "PROCESSING").length;
  const { run, busy } = useAction();

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[16px] font-bold">Wallet refunds</h2>
          <span className="mt-1 block text-[12px] text-[#78716c]">
            Service balance refunded to the original payment method when a customer deletes their account.{" "}
            {data.razorpayConnected
              ? "Refund through Razorpay to the customer's recharges (newest first); pay anything Razorpay can't cover by hand and record the reference. GST paid on recharges isn't refunded."
              : "Razorpay isn't connected: pay each one by hand, then record the reference."}{" "}
            Audited.
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
                      {r.razorpay.parts.length > 0 && (
                        <ul className="m-0 mt-1.5 max-w-[260px] list-none p-0 text-[11.5px] leading-snug text-[#57534e]">
                          {r.razorpay.parts.map((p, i) => (
                            <li key={i} className="break-words">
                              {rupee(p.amount)} of <span className="font-mono">{p.paymentId}</span> →{" "}
                              <span className="font-mono">{p.refundId ?? "—"}</span> ·{" "}
                              <b className={p.status === "failed" ? "text-rose-700" : p.status === "processed" ? "text-emerald-700" : "text-[#1d4ed8]"}>
                                {PART_STATUS[p.status]}
                              </b>
                              {p.error && <span className="text-rose-700"> ({p.error})</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.status !== "PROCESSING" && (r.status !== "PENDING" || r.note) && (
                        <span className="mt-1 block max-w-[240px] text-[11.5px] leading-snug break-words text-[#78716c]">
                          {r.status === "PAID" ? `Ref ${r.providerRef}` : r.note}
                          {r.status !== "PENDING" && r.processedBy && ` · ${r.processedBy}`}
                          {r.status !== "PENDING" && r.processedAt && ` · ${when(r.processedAt)}`}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap`}>
                      {r.status === "PAID" ? null : !canProcess ? (
                        <BlockedAction className="h-[30px] px-3 text-[11.5px]">Finance processes refunds</BlockedAction>
                      ) : r.status === "PROCESSING" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => api.post<{ status: string }>(`/admin/refunds/${r.ref}/check`),
                              (res) => `${r.ref}: ${res.status === "PROCESSING" ? "still processing at Razorpay" : res.status.toLowerCase()}.`,
                            )
                          }
                          className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-ink disabled:opacity-60"
                        >
                          Check status
                        </button>
                      ) : (
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          {r.razorpay.coverable > 0 && (
                            <button
                              type="button"
                              onClick={() => setOpen({ refund: r, kind: "razorpay" })}
                              className="h-[30px] rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink"
                            >
                              Refund {rupee(r.razorpay.coverable)} via Razorpay
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setOpen({ refund: r, kind: "paid" })}
                            className={`h-[30px] rounded-[9px] px-3 text-[12px] font-bold text-ink ${r.razorpay.coverable > 0 ? "border border-line bg-white" : "border-0 bg-amber-500"}`}
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
      {open && (open.kind === "razorpay" ? <RazorpayDialog refund={open.refund} onClose={() => setOpen(null)} /> : <ProcessDialog pending={open} onClose={() => setOpen(null)} />)}
    </div>
  );
}

/** Confirms a refund through Razorpay: how much goes back that way, and what is left to pay by hand. */
function RazorpayDialog({ refund: r, onClose }: { refund: WalletRefund; onClose: () => void }) {
  const { run, busy } = useAction();
  const byHand = r.razorpay.remaining - r.razorpay.coverable;

  async function submit() {
    const done = await run(
      () => api.post<{ status: string; uncovered: number }>(`/admin/refunds/${r.ref}/razorpay`),
      (res) =>
        `${r.ref}: ${res.status === "PAID" ? "refunded through Razorpay" : res.status === "PROCESSING" ? "sent to Razorpay — processing" : res.status === "FAILED" ? "Razorpay refused the refund — see the note" : "partly refunded through Razorpay"}${
          res.uncovered > 0 ? `; ${rupee(res.uncovered)} left to pay by hand` : ""
        }. Audited.`,
    );
    if (done) onClose();
  }

  return (
    <AdminDialog title={`Refund ${r.ref} via Razorpay`} subtitle={`${rupee(r.amount)} · ${r.customer}`} onClose={onClose} width={500}>
      <p className="mt-0 mb-2.5 text-[13px] leading-normal text-[#57534e]">
        Razorpay refunds <b className="text-ink">{rupee(r.razorpay.coverable)}</b> to the customer&apos;s original payments, newest
        recharge first, to the same card, UPI account, bank or wallet. It usually reaches them in 5–7 working days.
      </p>
      {r.razorpay.processed > 0 && (
        <p className="mt-0 mb-2.5 text-[13px] leading-normal text-[#57534e]">{rupee(r.razorpay.processed)} has already been refunded through Razorpay.</p>
      )}
      {byHand > 0 && (
        <p className="mt-0 mb-2.5 rounded-[10px] bg-[#fffbeb] px-3 py-2 text-[13px] leading-normal text-[#92400e]">
          {rupee(byHand)} isn&apos;t covered by Razorpay payments (balance from recharges made before Razorpay). Pay it by hand afterwards and
          record the reference with &quot;Mark as paid&quot;.
        </p>
      )}
      <p className="mt-0 mb-0 text-[12px] leading-normal text-[#78716c]">Only the wallet balance is refunded; GST paid on recharges isn&apos;t.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-10 rounded-[10px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60"
        >
          {busy ? "Sending to Razorpay…" : `Refund ${rupee(r.razorpay.coverable)}`}
        </button>
      </div>
    </AdminDialog>
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
            ? `Pay ${rupee(r.razorpay.processed > 0 ? r.razorpay.remaining : r.amount)} to: ${r.method}.${r.razorpay.processed > 0 ? ` (${rupee(r.razorpay.processed)} already went back through Razorpay.)` : ""} Then enter the gateway refund id or bank UTR so the customer's refund can be traced.`
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
