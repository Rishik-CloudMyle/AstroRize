"use client";

import Image from "next/image";
import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { BlockedAction, Chip, EYEBROW, PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { PriceChange, PriceRequests } from "@/lib/admin/price-changes";
import { PRICE_STATUS, rupee } from "@/lib/admin/price-status";

// "Price requests" on the Astrologer lifecycle page: astrologers' price increases waiting for a
// decision (decreases go live at once and only show in the history). Approving re-checks the
// increase against the price in force now; rejecting needs a reason the astrologer sees.

/** "₹20 → ₹25" with the difference. */
function Move({ from, to }: { from: number; to: number }) {
  const diff = to - from;
  return (
    <span className="tabular-nums">
      {rupee(from)} → <b className="text-ink">{rupee(to)}</b>
      <span className={`ml-1.5 text-[11.5px] font-bold ${diff > 0 ? "text-amber-700" : "text-emerald-700"}`}>
        {diff > 0 ? "+" : "−"}
        {rupee(Math.abs(diff))}
      </span>
    </span>
  );
}

export function StatusPill({ status }: { status: PriceChange["status"] }) {
  const s = PRICE_STATUS[status] ?? PRICE_STATUS.WITHDRAWN;
  return (
    <Chip bg={s.bg} fg={s.fg}>
      {s.label}
    </Chip>
  );
}

/** One line of history: "22 Oct 2026 · ₹18 → ₹20 · Approved by K. Prasad". */
export function HistoryLine({ c }: { c: PriceChange }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-soft py-1.5 text-[12.5px] text-[#57534e] last:border-b-0">
      <span className="whitespace-nowrap text-[#78716c] tabular-nums">{c.requestedOn}</span>
      <Move from={c.from} to={c.to} />
      <StatusPill status={c.status} />
      {c.decidedBy && c.status !== "APPLIED" && (
        <span className="text-[11.5px] text-[#78716c]">
          {c.status === "WITHDRAWN" ? "by the astrologer" : `by ${c.decidedBy}`}
          {c.decidedOn && c.decidedOn !== c.requestedOn ? ` · ${c.decidedOn}` : ""}
        </span>
      )}
      {c.reason && <span className="w-full text-[11.5px] break-words text-[#78716c]">“{c.reason}”</span>}
    </li>
  );
}

/**
 * Approve / Reject for one waiting increase, with a confirm (approve) or reason (reject) dialog.
 * Shown as a dashed note to staff who can see requests but not decide them.
 */
export function DecideButtons({
  change,
  name,
  current,
  problem,
  onDone,
}: {
  change: PriceChange;
  name: string;
  current: number;
  problem: string | null;
  onDone?: () => void;
}) {
  const { session } = useAdmin();
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  if (!session.capabilities.includes("price.approve")) {
    return <BlockedAction className="h-9 px-3 text-[12px]">A Super Admin decides price increases</BlockedAction>;
  }
  return (
    <>
      <span className="inline-flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen("approve")}
          disabled={!!problem}
          title={problem ?? undefined}
          className="h-9 rounded-[10px] border-0 bg-amber-500 px-3.5 text-[12.5px] font-bold text-ink disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setOpen("reject")}
          className="h-9 rounded-[10px] border border-line bg-white px-3.5 text-[12.5px] font-bold text-rose-700"
        >
          Reject
        </button>
      </span>
      {open && (
        <DecideDialog
          kind={open}
          change={change}
          name={name}
          current={current}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            onDone?.();
          }}
        />
      )}
    </>
  );
}

function DecideDialog({
  kind,
  change: c,
  name,
  current,
  onClose,
  onDone,
}: {
  kind: "approve" | "reject";
  change: PriceChange;
  name: string;
  current: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, busy } = useAction();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const approve = kind === "approve";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const why = reason.trim();
    if (!approve && why.length < 3) return setError("Give the astrologer a short reason (they see it in their portal).");
    const res = await run(
      () => api.post(`/admin/lifecycle/price-requests/${encodeURIComponent(c.id)}/${kind}`, approve ? {} : { reason: why }),
      approve
        ? `${name}'s price is now ${rupee(c.to)}/min for new consultations. Audited.`
        : `${name}'s increase to ${rupee(c.to)}/min rejected. They'll see your reason. Audited.`,
    );
    // On a conflict (already decided, price moved) the toast explains; the list refreshes either way.
    if (res) onDone();
    else onClose();
  }

  return (
    <AdminDialog
      title={approve ? `Approve ${rupee(c.to)}/min for ${name}?` : `Reject ${name}'s increase?`}
      subtitle={`Requested ${c.requestedOn} · ${rupee(current)} → ${rupee(c.to)} per minute (${c.channel === "chat" ? "chat" : "calls"})`}
      onClose={onClose}
      width={480}
    >
      <form onSubmit={submit} noValidate>
        {approve ? (
          <p className="mt-0 mb-3 text-[13px] leading-normal text-[#57534e]">
            {c.channel === "chat"
              ? `Customers pay ${rupee(c.to)}/min for chat from now on.`
              : `Customers pay ${rupee(c.to)}/min for voice from now on (video and Instant Call follow, and chat too unless it has its own price).`}{" "}
            Consultations already running keep their
            rate. {name} can&apos;t change their price again until the cooldown ends.
          </p>
        ) : (
          <>
            <p className="mt-0 mb-3 text-[13px] leading-normal text-[#57534e]">
              The price stays at {rupee(current)}/min. {name} sees your reason on their dashboard and can ask again.
            </p>
            <label htmlFor="price-reject-reason" className="mb-1.5 block text-[12px] font-bold text-[#57534e]">
              Reason for the astrologer
            </label>
            <textarea
              id="price-reject-reason"
              value={reason}
              maxLength={300}
              rows={3}
              onChange={(e) => {
                setReason(e.target.value);
                setError("");
              }}
              placeholder="e.g. Please build up a few more reviews at your current price first."
              aria-invalid={!!error}
              className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500"
            />
            {error && (
              <p role="alert" className="mt-1.5 mb-0 text-[12.5px] font-semibold text-rose-700">
                {error}
              </p>
            )}
          </>
        )}
        <div className="mt-4 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`h-10 rounded-[11px] border-0 px-4 text-[13px] font-bold disabled:opacity-60 ${approve ? "bg-amber-500 text-ink" : "bg-rose-700 text-white"}`}
          >
            {busy ? "Saving…" : approve ? "Approve price" : "Reject increase"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

export default function PriceRequestsView({ data }: { data: PriceRequests }) {
  return (
    <>
      <div className={`${PANEL} mt-[18px] p-[18px]`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[16px] font-bold">Waiting for a decision</h2>
            <span className="mt-1 block text-[12px] text-[#78716c]">
              Astrologers set their own chat &amp; voice price. Increases (at most {rupee(data.maxIncrease)} at a time) wait here; customers keep
              paying the current price until you approve. Decreases go live at once.
            </span>
          </div>
          <span className="text-[12.5px] font-bold text-[#b45309] tabular-nums" aria-live="polite">
            {data.pending.length ? `${data.pending.length} waiting` : "Nothing waiting"}
          </span>
        </div>

        {data.pending.length === 0 ? (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No price increases waiting. New requests appear here.</p>
        ) : (
          <ul className="m-0 mt-3.5 grid list-none gap-3 p-0">
            {data.pending.map((p) => (
              <li key={p.id} className="rounded-[14px] border border-line bg-white p-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <Image src={p.astrologer.photo} alt="" width={44} height={44} className="h-11 w-11 flex-[0_0_44px] rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] text-ink">{p.astrologer.name}</b>
                    <span className="block text-[12px] text-[#78716c]">
                      Requested {p.requestedOn} · waiting {p.waiting}
                      {p.lastChangedOn ? ` · last changed ${p.lastChangedOn}` : ""}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={EYEBROW}>{p.channel === "chat" ? "Chat" : "Calls (voice)"} /min</div>
                    <div className="text-[15px] text-[#57534e]">
                      <Move from={p.astrologer.price} to={p.to} />
                    </div>
                  </div>
                </div>
                {p.from !== p.astrologer.price && (
                  <p className="mt-2 mb-0 text-[12px] text-[#78716c]">Asked when the price was {rupee(p.from)}/min.</p>
                )}
                {p.problem && (
                  <p role="note" className="mt-2.5 mb-0 rounded-[10px] bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-800">
                    {p.problem}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-[260px]">
                    <div className={EYEBROW}>Recent changes</div>
                    {p.history.length ? (
                      <ul className="m-0 mt-1 list-none p-0">
                        {p.history.map((h) => (
                          <HistoryLine key={h.id} c={h} />
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 mb-0 text-[12.5px] text-[#78716c]">No earlier requests.</p>
                    )}
                  </div>
                  <DecideButtons change={p} name={p.astrologer.name} current={p.astrologer.price} problem={p.problem} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${PANEL} mt-4 p-[18px]`}>
        <h2 className="m-0 text-[16px] font-bold">Last 30 days</h2>
        <span className="mt-1 block text-[12px] text-[#78716c]">Every price change and request decided, newest first.</span>
        {data.recent.length === 0 ? (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No price changes in the last 30 days.</p>
        ) : (
          <div className="mt-3.5 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {(
                    [
                      ["Astrologer", "left"],
                      ["Change /min", "left"],
                      ["Status", "left"],
                      ["Requested", "left"],
                      ["Decided", "left"],
                    ] as const
                  ).map(([label, align]) => (
                    <th key={label} className={TH} style={{ textAlign: align }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className={`${TD} px-2.5 py-[10px] font-bold text-ink`}>{c.astrologer.name}</td>
                    <td className={`${TD} px-2.5 py-[10px] whitespace-nowrap text-[#57534e]`}>
                      <Move from={c.from} to={c.to} />
                    </td>
                    <td className={`${TD} px-2.5 py-[10px]`}>
                      <StatusPill status={c.status} />
                      {c.reason && <span className="mt-1 block max-w-[260px] text-[11.5px] break-words text-[#78716c]">“{c.reason}”</span>}
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] whitespace-nowrap text-[#57534e]`}>{c.requestedOn}</td>
                    <td className={`${TD} px-2.5 py-[10px] text-[#57534e]`}>
                      {c.status === "APPLIED"
                        ? "Live at once (decrease)"
                        : c.status === "WITHDRAWN"
                          ? `Withdrawn by the astrologer · ${c.decidedOn}`
                          : `${c.decidedBy ?? "—"} · ${c.decidedOn ?? "—"}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
