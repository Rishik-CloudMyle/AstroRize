"use client";

// A credit to the customer's wallet from a ticket — any ticket, with or without a session (e.g. a
// recharge that never arrived, a goodwill gesture). The team holding the ticket proposes it (amount,
// the balance it goes to, the reason the customer sees); a second person approves it before any
// money moves — Finance, not the proposer, or a Super Admin (who may approve their own, audited).
// On approval the API credits the wallet with its ledger line and resolves the ticket.

import { useId, useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import ReasonDialog from "@/components/admin/reason-dialog";
import { BlockedAction } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { CreditBucket, SupportCase } from "@/lib/admin/types";

const BUCKETS: { key: CreditBucket; label: string; hint: string }[] = [
  { key: "SERVICE", label: "Service balance", hint: "Real money — e.g. a recharge that didn't arrive or a wrong charge. Refundable like a recharge." },
  { key: "PROMO", label: "Promotional balance", hint: "Goodwill credit — spendable on consultations, not refundable." },
];

/** Asks for the amount, the balance and the reason, then proposes the credit. */
export function CreditDialog({ file, onClose, onDone }: { file: SupportCase; onClose: () => void; onDone: () => Promise<void> }) {
  const { session } = useAdmin();
  const { run, busy } = useAction();
  const id = useId();
  const wc = file.walletCredit;
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState<CreditBucket>(wc.defaultBucket);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState(!!wc.payment);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = Number(amount);
    if (!/^\d+$/.test(amount) || n < 1) return setError("Enter the amount in whole rupees (at least ₹1).");
    if (n > wc.max) return setError(`A wallet credit can be at most ₹${wc.max.toLocaleString("en-IN")} on one ticket.`);
    if (reason.trim().length < 5) return setError("Write the reason the customer will see (at least 5 characters).");
    setError("");
    const res = await run(
      () => api.post(`/admin/support/${encodeURIComponent(file.id)}/credit/propose`, { amount: n, bucket, reason: reason.trim(), linkPayment: link && !!wc.payment }),
      `Wallet credit of ₹${n.toLocaleString("en-IN")} proposed. Nothing moves until a second person approves it.`,
    );
    if (res) {
      onClose();
      await onDone();
    }
  }

  return (
    <AdminDialog title={`Credit the customer's wallet · ${file.id}`} subtitle={file.subject} onClose={onClose} width={520}>
      <form onSubmit={submit} noValidate>
        <p className="mt-0 mb-3 text-[13px] leading-normal text-[#57534e]">
          {session.role === "super"
            ? "Finance or a Super Admin approves it before any money moves — you may approve it yourself (recorded as self-approved)."
            : "Someone other than you (Finance or a Super Admin) approves it before any money moves."}{" "}
          The astrologer&rsquo;s earnings don&rsquo;t change.
        </p>
        <label htmlFor={`${id}-amount`} className="mb-1.5 block text-[12px] font-bold text-[#57534e]">
          Amount
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-ink">₹</span>
          <input
            id={`${id}-amount`}
            inputMode="numeric"
            value={amount}
            autoFocus
            aria-invalid={error && !amount ? true : undefined}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 6));
              setError("");
            }}
            className="h-11 w-[140px] rounded-[10px] border border-line bg-white px-3 text-[15px] font-bold text-ink tabular-nums outline-none focus:border-amber-500"
          />
          <span className="text-[12px] text-[#78716c]">₹1–₹{wc.max.toLocaleString("en-IN")}</span>
        </div>

        <fieldset className="m-0 mt-4 border-0 p-0">
          <legend className="mb-1.5 text-[12px] font-bold text-[#57534e]">Goes to</legend>
          <div className="flex flex-col gap-2">
            {BUCKETS.map((b) => (
              <label
                key={b.key}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 ${bucket === b.key ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}
              >
                <input type="radio" name={`${id}-bucket`} className="mt-1" checked={bucket === b.key} onChange={() => setBucket(b.key)} />
                <span className="min-w-0">
                  <b className="block text-[13.5px] text-ink">
                    {b.label}
                    {b.key === wc.defaultBucket ? <span className="font-normal text-[#78716c]"> · usual for this issue</span> : null}
                  </b>
                  <span className="block text-[12px] text-[#78716c]">{b.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {wc.payment && (
          <label className="mt-3 flex items-start gap-2 text-[12.5px] text-[#57534e]">
            <input type="checkbox" className="mt-0.5" checked={link} onChange={(e) => setLink(e.target.checked)} />
            <span>
              It&rsquo;s for the recharge on this ticket <b className="text-ink">({wc.payment})</b>
            </span>
          </label>
        )}

        <label htmlFor={`${id}-reason`} className="mt-4 mb-1.5 block text-[12px] font-bold text-[#57534e]">
          Reason — the customer sees this
        </label>
        <textarea
          id={`${id}-reason`}
          value={reason}
          maxLength={300}
          rows={3}
          placeholder="e.g. Your ₹500 recharge on 3 Nov was charged but didn't reach your wallet."
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
          className="w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500"
        />
        <span className="block text-right text-[11px] text-[#a8a29e] tabular-nums">{reason.length}/300</span>

        {error && (
          <p role="alert" className="mt-1 mb-0 text-[12.5px] font-semibold text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-10 rounded-[10px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60">
            {busy ? "Working…" : "Propose credit"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

/** The credit proposed or given on this ticket, with Approve / Decline for whoever may decide it. */
export function WalletCreditCard({ file, onDone }: { file: SupportCase; onDone: () => Promise<void> }) {
  const { session } = useAdmin();
  const { run, busy } = useAction();
  const [declining, setDeclining] = useState(false);
  const p = file.walletCredit.proposed;
  if (file.remedy !== "WALLET_CREDIT" || !p) return null;
  const given = p.given;
  // Same person, not same short name; older proposals without a recorded id fall back to the name.
  const mine = file.proposedById ? file.proposedById === session.id : !!file.proposedBy && file.proposedBy === session.actor;
  const selfBlocked = mine && session.role !== "super";
  const base = `/admin/support/${encodeURIComponent(file.id)}`;

  const approve = async () => {
    if (await run(() => api.post(`${base}/credit/approve`), `${p.amount} credited to the customer's ${p.bucketLabel}. The ticket is resolved and the customer has been told.`)) await onDone();
  };
  const decline = async (reason: string) => {
    const res = await run(() => api.post(`${base}/refund/decline`, { reason }), "Wallet credit declined. No money moved; the ticket is back with its team.");
    if (res) await onDone();
    return !!res;
  };

  return (
    <div className="mt-[18px] rounded-2xl border border-amber-200 bg-amber-50 p-[18px]">
      <h3 className="mt-0 mb-1 text-[15px] font-bold">{given ? "Wallet credit given" : "Wallet credit — waiting for a second approver"}</h3>
      <div className="mt-2 flex flex-col gap-[7px] text-[13.5px] text-[#57534e]">
        <div className="flex items-center justify-between gap-3 border-b border-[#f3e9d8] py-[5px]">
          <span>Amount</span>
          <b className="text-ink tabular-nums">{p.amount}</b>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[#f3e9d8] py-[5px]">
          <span>Goes to</span>
          <b className="text-ink">{p.bucketLabel}</b>
        </div>
        {p.linkedPayment && file.walletCredit.payment && (
          <div className="flex items-center justify-between gap-3 border-b border-[#f3e9d8] py-[5px]">
            <span>For</span>
            <b className="text-right text-ink">{file.walletCredit.payment}</b>
          </div>
        )}
        <div className="py-[5px]">
          <span className="block">Reason the customer sees</span>
          <span className="mt-0.5 block break-words whitespace-pre-wrap text-ink">{p.reason}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {given ? (
          <span className="inline-flex min-h-[42px] items-center rounded-[11px] border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-2 text-[13px] font-bold text-[#047857]">
            ✓ {p.amount} credited{p.txnRef ? ` · ledger ${p.txnRef}` : ""}
          </span>
        ) : !file.can.approve ? (
          <BlockedAction className="min-h-[42px] px-4 py-2 text-[12.5px]">Finance or a Super Admin approves it</BlockedAction>
        ) : selfBlocked ? (
          <BlockedAction className="min-h-[42px] px-4 py-2 text-[12.5px]">You proposed this — another person approves</BlockedAction>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void approve()}
              className="h-[42px] rounded-[11px] border-0 bg-emerald-700 px-[18px] text-[13px] font-bold text-white disabled:opacity-60"
            >
              Approve — credit {p.amount}
              {mine ? " (your own — self-approval is audited)" : ""}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeclining(true)}
              className="h-[42px] rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-rose-700 disabled:opacity-60"
            >
              Decline credit
            </button>
          </>
        )}
      </div>
      {file.proposedBy && (
        <p className="mt-2 mb-0 text-[11.5px] text-[#78716c]">
          Proposed by {file.proposedBy}
          {given && file.approvedBy ? ` · approved by ${file.approvedBy}` : ""}
          {given && file.outcome?.on ? ` · ${file.outcome.on}` : ""}
        </p>
      )}
      {declining && (
        <ReasonDialog
          title={`Decline the wallet credit on ${file.id}`}
          subtitle={file.subject}
          intro="Nothing is credited. The ticket goes back to the team it is with, with your reason in the audit log."
          confirm="Decline credit"
          danger
          onClose={() => setDeclining(false)}
          onSubmit={decline}
        />
      )}
    </div>
  );
}
