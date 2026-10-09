"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { EYEBROW, PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { sortRows, TICKET_SORTS } from "@/lib/admin/sort";
import type { SupportCase, SupportData } from "@/lib/admin/types";

type RefundStage = "none" | "proposed" | "initiated" | "rejected";

function stageOf(c: SupportCase): RefundStage {
  if (c.refundState === "INITIATED") return "initiated";
  if (c.refundState === "PROPOSED") return "proposed";
  return c.state === "RESOLVED" ? "rejected" : "none";
}

export default function SupportView({
  data,
  initialTicket,
  initialCase,
}: {
  data: SupportData;
  initialTicket: string;
  initialCase: SupportCase;
}) {
  const { session, say } = useAdmin();
  const { run } = useAction();
  const [sort, setSort] = useUrlSort(TICKET_SORTS);
  const tickets = sortRows(data.tickets, TICKET_SORTS, sort);
  const [ticketId, setTicketId] = useState(initialTicket);
  // The selected ticket's case file (GET /admin/support/:id): metering, evidence, refund.
  const [file, setFile] = useState<SupportCase>(initialCase);

  const tkt = data.tickets.find((t) => t.id === ticketId) ?? data.tickets[0];
  const caseFile = file.id === tkt.id ? file : null;
  const stage = caseFile ? stageOf(caseFile) : "none";
  // Without dispute.refund.approve (e.g. Support by default) the department may propose but not approve.
  const isSupport = !session.capabilities.includes("dispute.refund.approve");
  // Same person, not same short name; older proposals without a recorded id fall back to the name.
  const isProposer = caseFile?.proposedById
    ? caseFile.proposedById === session.id
    : !!caseFile?.proposedBy && caseFile.proposedBy === session.actor;
  const approveBlocked = isSupport || isProposer;
  const billed = caseFile?.refund.billed ?? "—";

  const loadCase = async (id: string) => {
    try {
      const res = await api.get<{ case: SupportCase }>(`/admin/support/${encodeURIComponent(id)}`);
      setFile(res.case);
    } catch {
      say("Couldn't load this ticket's case file. Please try again.");
    }
  };
  const pick = (id: string) => {
    setTicketId(id);
    if (file.id !== id) void loadCase(id);
  };

  // From the prototype's refundPropose / refundApprove / refundReject (maker-checker).
  // The API enforces who may propose and approve, and that they are different people.
  const act = async (call: () => Promise<unknown>, done: string) => {
    if (await run(call, done)) await loadCase(tkt.id);
  };
  const propose = () =>
    act(
      () => api.post(`/admin/support/${tkt.id}/refund/propose`),
      `Refund of ${billed} proposed. Awaiting a second approver before money moves.`,
    );
  const approve = () =>
    act(
      () => api.post(`/admin/support/${tkt.id}/refund/approve`),
      `REFUND_INITIATED by ${session.actor}. ${billed} returning to the customer's wallet.`,
    );
  const reject = () => {
    const reason = window.prompt("Reason for rejecting this dispute (the customer sees the category):");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      say("Write a reason of at least 3 characters.");
      return;
    }
    void act(
      () => api.post(`/admin/support/${tkt.id}/reject`, { reason: reason.trim() }),
      "Rejected with reason. The customer sees the category and the reopen path.",
    );
  };

  const settled = stage === "initiated" || stage === "rejected";
  const ok = stage === "initiated";

  return (
    <div className="mt-5 grid grid-cols-[300px_minmax(0,1fr)] items-start gap-[18px]">
      <div className={`${PANEL} p-3.5`}>
        <SortSelect options={TICKET_SORTS} value={sort} onChange={setSort} className="mb-3 w-full" />
        <div className={`${EYEBROW} px-1 pb-2`}>Queue · {tickets.length}</div>
        <div className="flex flex-col gap-[5px]">
          {tickets.map((t) => {
            const on = t.id === tkt.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => pick(t.id)}
                className="w-full rounded-xl border px-3 py-[11px] text-left"
                style={{ borderColor: on ? "#fcd34d" : "#e7e0d6", background: on ? "#fef3c7" : "#fff" }}
              >
                <div className="flex items-center gap-[7px]">
                  <span className="font-mono text-[11px] text-[#78716c]">{t.id}</span>
                  <span
                    className="ml-auto inline-flex h-[19px] items-center rounded-full px-[7px] text-[9.5px] font-extrabold"
                    style={{ background: t.slaBg, color: t.slaFg }}
                  >
                    {t.sla}
                  </span>
                </div>
                <b className="mt-1 block text-[12.5px] text-ink">{t.subject}</b>
                <span className="mt-px flex items-center gap-1.5 text-[11px] text-[#78716c]">
                  {t.state}
                  {/* The refund state, unless the ticket state already says it (REFUND_PROPOSED …). */}
                  {t.refundState !== "NONE" && !t.state.startsWith("REFUND_") && (
                    <span
                      className="inline-flex h-[17px] items-center rounded-full px-1.5 text-[9.5px] font-extrabold"
                      style={
                        t.refundState === "PROPOSED"
                          ? { background: "#eff6ff", color: "#1e40af" }
                          : { background: "#ecfdf5", color: "#047857" }
                      }
                    >
                      Refund {t.refundState.toLowerCase()}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        <div className={`${PANEL} relative p-[22px]`}>
          <div className="flex flex-wrap items-start justify-between gap-3.5">
            <div>
              <h2 className="m-0 text-[19px] font-bold">{tkt.subject}</h2>
              <p className="mt-1 mb-0 text-[12.5px] text-[#78716c]">
                {tkt.id} · customer {tkt.alias} · session {tkt.session}
              </p>
            </div>
            <span className="inline-flex h-7 items-center rounded-full bg-amber-50 px-3 text-[12px] font-bold text-amber-800">
              {tkt.state}
            </span>
          </div>

          <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {(caseFile?.metering ?? []).map((m) => (
              <div key={m.label} className="rounded-[14px] bg-cream p-[13px]">
                <div className={EYEBROW}>{m.label}</div>
                <b className="mt-[3px] block text-[19px] text-ink tabular-nums">{m.value}</b>
              </div>
            ))}
          </div>
          <p className="mt-2 mb-0 text-[11.5px] text-[#78716c]">
            Billing figures come straight from the session record and cannot be edited by Support.
          </p>

          <div className="mt-[18px]">
            <div className="mb-[9px] text-[11px] font-bold tracking-[.08em] text-[#78716c] uppercase">
              Evidence — platform records first
            </div>
            <div className="flex flex-col gap-[7px]">
              {(caseFile?.evidence ?? []).map((e) => {
                const platform = e.rank === "PLATFORM";
                return (
                  <div
                    key={e.label}
                    className="flex items-center gap-[11px] rounded-xl border px-[13px] py-[11px]"
                    style={{ background: platform ? "#fffbeb" : "#fff", borderColor: platform ? "#fde68a" : "#e7e0d6" }}
                  >
                    <span
                      className="inline-flex h-[21px] items-center rounded-full px-2 text-[9.5px] font-extrabold tracking-[.05em]"
                      style={{ background: platform ? "#f59e0b" : "#f7f4ee", color: platform ? "#1c1917" : "#78716c" }}
                    >
                      {e.rank}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] text-ink">{e.label}</span>
                    <span className="text-[11.5px] text-[#78716c]">{e.when}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative mt-[18px] rounded-2xl border border-amber-200 bg-amber-50 p-[18px]">
            <h3 className="mt-0 mb-1 text-[15px] font-bold">Proposed refund</h3>
            <p className="mt-0 mb-3 text-[12px] text-amber-800">
              Capped at the billed amount of {billed}. Refund returns to the wallet in the same bucket composition it
              was spent from.
            </p>
            <div className="flex flex-col gap-[7px]">
              {(caseFile?.refund.buckets ?? []).map((b) => (
                <div
                  key={b.label}
                  className="flex items-center justify-between gap-3 border-b py-[5px] text-[13.5px]"
                  style={{
                    color: b.total ? "#1c1917" : "#57534e",
                    fontWeight: b.total ? 700 : 500,
                    borderColor: b.total ? "transparent" : "#f3e9d8",
                  }}
                >
                  <span>{b.label}</span>
                  <b className="tabular-nums">{b.value}</b>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={reject}
                className="h-[42px] rounded-[11px] border border-amber-200 bg-white px-4 text-[13px] font-bold text-amber-800"
              >
                Reject with reason
              </button>
              {stage === "none" && (
                <button
                  type="button"
                  onClick={() => void propose()}
                  className="h-[42px] rounded-[11px] border-0 bg-amber-500 px-[18px] text-[13px] font-bold text-ink"
                >
                  Propose refund — needs a second approver
                </button>
              )}
              {stage === "proposed" && (
                <button
                  type="button"
                  onClick={() => void approve()}
                  aria-disabled={approveBlocked}
                  className="h-[42px] rounded-[11px] border-0 px-[18px] text-[13px] font-bold"
                  style={{
                    background: approveBlocked ? "#f5f5f4" : "#047857",
                    color: approveBlocked ? "#78716c" : "#fff",
                  }}
                >
                  {isSupport
                    ? `Approve — blocked for ${session.role === "support" ? "Support" : "your department"}`
                    : isProposer
                      ? "Approve — blocked, you proposed this"
                      : "Approve refund · MFA"}
                </button>
              )}
              {settled && (
                <span
                  className="inline-flex h-[42px] items-center rounded-[11px] border px-4 text-[13px] font-bold"
                  style={{
                    background: ok ? "#ecfdf5" : "#fff1f2",
                    borderColor: ok ? "#a7f3d0" : "#fecdd3",
                    color: ok ? "#047857" : "#be123c",
                  }}
                >
                  {ok ? `✓ REFUND_INITIATED · ${billed}` : "✕ Rejected with reason"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
