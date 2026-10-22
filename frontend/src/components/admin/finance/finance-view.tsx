"use client";

import { useAction, useAdmin } from "@/components/admin/admin-provider";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { BATCH_SORTS, sortRows } from "@/lib/admin/sort";
import type { BatchKind, FinanceData, PayoutBatch, PrepareCandidate } from "@/lib/admin/types";

const HEADS: [string, "left" | "right"][] = [
  ["Batch", "left"],
  ["Astrologers", "left"],
  ["Gross", "right"],
  ["TDS", "right"],
  ["State", "left"],
  ["", "right"],
];

const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");

const KIND_LABEL: Record<BatchKind, string> = { EARNINGS: "Earnings", FREE_CALLS: "Free-call compensation" };
const KIND_COLOURS: Record<BatchKind, [string, string]> = { EARNINGS: ["#fffbeb", "#92400e"], FREE_CALLS: ["#ecfdf5", "#047857"] };

function KindChip({ kind }: { kind: BatchKind }) {
  const [bg, fg] = KIND_COLOURS[kind];
  return (
    <span className="inline-flex h-[20px] items-center rounded-full px-2 text-[10.5px] font-bold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

/** The cycle without the kind prefix the chip already shows. */
const cycleText = (b: PayoutBatch) => b.cycle.replace(/^(Earnings|Free-call compensation) · /, "");

export default function FinanceView({ data }: { data: FinanceData }) {
  const { session, say } = useAdmin();
  const { run, busy } = useAction();
  const [sort, setSort] = useUrlSort(BATCH_SORTS);
  const batches = sortRows(data.batches, BATCH_SORTS, sort);
  const actor = session.actor;
  const denoms = data.enabledDenominations;
  const floor = data.floorMode;
  const canApprove = session.capabilities.includes("payout.approve");
  const canRelease = session.capabilities.includes("payout.release");
  const canConfigure = session.capabilities.includes("config.write");

  // From the prototype's batchAct: approve, then release by a different actor.
  // The API enforces both the capability and approver ≠ releaser.
  const batchAct = (b: PayoutBatch) => {
    const id = b.id;
    if (b.state === "DRAFT") {
      void run(() => api.post(`/admin/payouts/${id}/approve`), `${id} approved by ${actor}. A different person releases it. Audited.`);
      return;
    }
    if (b.state === "APPROVED") {
      // ⚠ RazorpayX isn't connected yet: releasing records the decision, the transfer is made outside.
      void run(
        () => api.post(`/admin/payouts/${id}/release`),
        `${id} released by ${actor}. RazorpayX isn't connected yet, so make the transfer and keep its reference.`,
      );
      return;
    }
    say(
      b.releasedByName
        ? `${id} · approved by ${b.approvedByName ?? "—"} · released by ${b.releasedByName}${b.releasedAt ? ` on ${b.releasedAt}` : ""}.`
        : `${id} was released before releases were recorded here.`,
    );
  };

  const prepare = (c: PrepareCandidate) => {
    if (busy) return;
    void run(
      () => api.post<{ already: boolean; batch: { id: string; gross: string; astrologers: number; lines: number } }>("/admin/payouts/prepare", { kind: c.kind, cycleId: c.id }),
      (r) =>
        r.already
          ? `${r.batch.id} was already prepared.`
          : `${r.batch.id} prepared: ${r.batch.lines} lines · ${r.batch.astrologers} astrologers · ${r.batch.gross}. Audited — now approve it.`,
    );
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
            <span className="mt-1 block text-[12px] text-[#78716c]">
              Earnings are paid half-monthly (1–15, 16–end); free-call compensation in its own batch. TDS {data.tdsPct}% on what each
              astrologer is owed.
            </span>
          </div>
          <SortSelect options={BATCH_SORTS} value={sort} onChange={setSort} />
        </div>

        {/* Closed cycles with something to pay and no batch yet; otherwise when the next can be prepared. */}
        {data.toPrepare.length === 0 && (
          <p className="mt-3.5 mb-0 rounded-[14px] border border-dashed border-line bg-white px-3.5 py-3 text-[12.5px] leading-[1.5] text-[#57534e]">
            <b className="text-ink">Nothing to prepare right now.</b> Every closed cycle is either batched already or had no
            earnings under revenue sharing to pay.{" "}
            {data.running
              .map((c) => `${KIND_LABEL[c.kind]} for ${c.label} can be prepared after ${c.closes}`)
              .join("; ")}
            .
          </p>
        )}
        {data.toPrepare.length > 0 && (
          <div className="mt-3.5 rounded-[14px] border border-dashed border-amber-300 bg-[#fffbeb] p-3.5">
            <b className="block text-[13px] text-ink">Ready to prepare</b>
            <ul className="m-0 mt-2 list-none space-y-2 p-0">
              {data.toPrepare.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11.5px] text-[#57534e]">{c.id}</span>
                      <KindChip kind={c.kind} />
                      <span className="text-[12.5px] font-bold text-ink">{c.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[#78716c]">
                      {c.lines} {c.lines === 1 ? "line" : "lines"}
                      {c.carriedOver > 0 && ` (${c.carriedOver} carried over)`} · {c.astrologers}{" "}
                      {c.astrologers === 1 ? "astrologer" : "astrologers"} · owed {c.grossLabel} · TDS {c.tdsLabel}
                      {c.heldPaused + c.heldNew > 0 &&
                        ` · held back: ${[c.heldPaused ? `${c.heldPaused} paused` : "", c.heldNew ? `${c.heldNew} new-astrologer hold` : ""].filter(Boolean).join(", ")}`}
                    </span>
                  </span>
                  {canApprove ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => prepare(c)}
                      className="h-[30px] shrink-0 rounded-[9px] border-0 bg-amber-500 px-3 text-[12px] font-bold text-ink disabled:opacity-60"
                    >
                      Prepare batch
                    </button>
                  ) : (
                    <span className="inline-flex h-[30px] items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 px-3 text-[11.5px] font-bold text-muted">
                      Finance prepares batches
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Scrolls inside the card on narrow windows, never the page. */}
        <div className="mt-3.5 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
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
                // What this person can't do here, and why (the API refuses it too).
                const blocked =
                  st === "DRAFT" && !canApprove
                    ? "Finance approves batches"
                    : st === "APPROVED" && !canRelease
                      ? "A Super Admin releases"
                      : sameActor
                        ? "Release — you approved this"
                        : null;
                const [bg, fg] =
                  st === "RELEASED" ? ["#ecfdf5", "#047857"] : st === "APPROVED" ? ["#eff6ff", "#1d4ed8"] : ["#f7f4ee", "#57534e"];
                const action = st === "DRAFT" ? "Approve" : st === "APPROVED" ? "Release" : "Details";
                return (
                  <tr key={p.id}>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-mono text-[11.5px] text-[#57534e]">{p.id}</span>
                        <KindChip kind={p.kind} />
                      </span>
                      <span className="mt-0.5 block text-[11.5px] whitespace-nowrap text-[#78716c]">{cycleText(p)}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{p.astrologers}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right font-bold whitespace-nowrap text-ink tabular-nums`}>{p.gross}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap text-rose-700 tabular-nums`}>{p.tds}</td>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <span
                        className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                        style={{ background: bg, color: fg }}
                      >
                        {st}
                      </span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-right whitespace-nowrap`}>
                      {blocked ? (
                        <span
                          className="inline-flex h-[30px] items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 px-3 text-[11.5px] font-bold text-muted"
                          title={sameActor ? "Approver and releaser must be different people" : undefined}
                        >
                          {blocked}
                        </span>
                      ) : st === "RELEASED" ? (
                        <button
                          type="button"
                          onClick={() => batchAct(p)}
                          className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-ink"
                        >
                          {action}
                        </button>
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
        </div>
        {batches.length === 0 && (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No payout batches yet.</p>
        )}
        <p className="mt-3 mb-0 text-[11.5px] text-[#78716c]">
          Gross is what astrologers are owed before TDS — their share of what customers paid, or Astrorize&apos;s free-call
          compensation. A batch takes every unbatched line up to the end of its cycle; paused astrologers and new astrologers
          still in their payout hold are left for a later batch.
        </p>
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
                  disabled={!canConfigure}
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
                  disabled={!canConfigure}
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
            Campaigns aren&apos;t applied to customer recharges yet, so the floor and this mode aren&apos;t enforced on anything
            today.
          </p>
        </div>
      </div>
    </>
  );
}
