"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import ReasonDialog from "@/components/admin/reason-dialog";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { BlockedAction, EYEBROW, PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { sortRows, TICKET_SORTS } from "@/lib/admin/sort";
import type { SupportCase, SupportData, Ticket } from "@/lib/admin/types";
import AmountDialog from "./amount-dialog";

type RefundStage = "none" | "proposed" | "initiated" | "rejected";
type Tab = "open" | "resolved";

/** The remedy on a queue row: "Refund proposed", "Free call given" … */
function chipOf(t: Ticket): string {
  if (t.resolution === "MAKE_GOOD") return "Free call given";
  if (t.resolution === "REFUND") return "Refunded";
  return t.refundState === "PROPOSED" ? "Proposed" : `Refund ${t.refundState.toLowerCase()}`;
}

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
  const { run, busy } = useAction();
  const [sort, setSort] = useUrlSort(TICKET_SORTS);
  const sorted = sortRows(data.tickets, TICKET_SORTS, sort);
  const openTickets = sorted.filter((t) => t.open);
  const resolvedTickets = sorted.filter((t) => !t.open);
  const [ticketId, setTicketId] = useState(initialTicket);
  // Open tickets are the queue; resolved ones (refunded, free call given, rejected) move to their own tab.
  const [tab, setTab] = useState<Tab>(() => (data.tickets.find((t) => t.id === initialTicket)?.open === false ? "resolved" : "open"));
  const tickets = tab === "open" ? openTickets : resolvedTickets;
  // The selected ticket's case file (GET /admin/support/:id): metering, evidence, refund.
  const [file, setFile] = useState<SupportCase>(initialCase);
  // The reason dialog open for this ticket: rejecting the dispute, or declining its proposed remedy.
  const [asking, setAsking] = useState<"reject" | "decline" | null>(null);
  // The amount dialog open for this ticket: a refund amount, or the minutes of a free replacement call.
  const [proposing, setProposing] = useState<"refund" | "makegood" | null>(null);

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
  // What is proposed (or was granted) on this ticket: a refund or a free replacement call.
  const makeGood = caseFile?.remedy === "MAKE_GOOD";
  const remedyName = makeGood ? "free replacement call" : "refund";
  const mg = caseFile?.makeGood;

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
  const pickTab = (next: Tab) => {
    setTab(next);
    const list = next === "open" ? openTickets : resolvedTickets;
    // The ticket on screen stays if it belongs to this tab; otherwise the tab's first one opens.
    if (list.length && !list.some((t) => t.id === ticketId)) pick(list[0]!.id);
  };

  // From the prototype's refundPropose / refundApprove / refundReject (maker-checker).
  // The API enforces who may propose and approve, and that they are different people.
  const act = async (call: () => Promise<unknown>, done: string) => {
    if (await run(call, done)) await loadCase(tkt.id);
  };
  const propose = async (amount: number) => {
    const res = await run(
      () => api.post(`/admin/support/${tkt.id}/refund/propose`, { amount }),
      `Refund of ₹${amount.toLocaleString("en-IN")} proposed. Awaiting a second approver before money moves.`,
    );
    if (res) await loadCase(tkt.id);
    return !!res;
  };
  const proposeMakeGood = async (minutes: number) => {
    const res = await run(
      () => api.post(`/admin/support/${tkt.id}/makegood/propose`, { minutes }),
      `Free ${minutes}-minute replacement call proposed. Awaiting a second approver.`,
    );
    if (res) await loadCase(tkt.id);
    return !!res;
  };
  const approve = () =>
    makeGood
      ? act(
          () => api.post<{ validUntil: string }>(`/admin/support/${tkt.id}/makegood/approve`),
          `Approved by ${session.actor}. The customer has been told about their free replacement call.`,
        )
      : act(
          () => api.post<{ billed: string }>(`/admin/support/${tkt.id}/refund/approve`),
          `REFUND_INITIATED by ${session.actor}. ${caseFile?.refund.amount ?? billed} returning to the customer's wallet.`,
        );
  const reject = async (reason: string) => {
    const res = await run(
      () => api.post<{ withdrawn: boolean }>(`/admin/support/${tkt.id}/reject`, { reason }),
      (r) =>
        r.withdrawn
          ? `Rejected with reason. The proposed ${remedyName} was withdrawn, so it can't be approved.`
          : "Rejected with reason. The ticket is resolved.",
    );
    if (res) await loadCase(tkt.id);
    return !!res;
  };
  const closeCovered = async () => {
    const by = caseFile?.coveredBy;
    if (!by) return;
    if (!window.confirm(`Close ${tkt.id}? A ${by.remedy} was already given for session ${tkt.session} on ${by.id}, so nothing more can be given here. The closing is recorded in the audit log.`)) return;
    await act(
      () => api.post(`/admin/support/${tkt.id}/close-covered`),
      `${tkt.id} closed — the ${by.remedy} on ${by.id} covers it. It's listed under Resolved.`,
    );
  };
  const decline = async (reason: string) => {
    const res = await run(
      () => api.post(`/admin/support/${tkt.id}/refund/decline`, { reason }),
      makeGood
        ? "Free replacement call declined. Nothing was given; the ticket is back under investigation."
        : "Refund declined. No money moved; the ticket is back under investigation.",
    );
    if (res) await loadCase(tkt.id);
    return !!res;
  };

  const settled = stage === "initiated" || stage === "rejected";
  const ok = stage === "initiated";
  // Resolved without a remedy here: rejected with a reason, or closed as covered by another ticket's remedy.
  const rejected = stage === "rejected" && (!caseFile?.outcome || caseFile.outcome.label === "Rejected");

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-[18px] md:grid-cols-[300px_minmax(0,1fr)]">
      <div className={`${PANEL} p-3.5`}>
        <SortSelect options={TICKET_SORTS} value={sort} onChange={setSort} className="mb-3 w-full" />
        <div role="tablist" aria-label="Tickets" className="mb-2.5 grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
          {(
            [
              ["open", "Open", openTickets.length],
              ["resolved", "Resolved", resolvedTickets.length],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => pickTab(key)}
              className={`h-9 rounded-[9px] text-[12.5px] font-bold ${tab === key ? "bg-white text-ink shadow-[0_1px_3px_rgba(28,25,23,.12)]" : "text-[#78716c]"}`}
            >
              {label} · {n}
            </button>
          ))}
        </div>
        {tickets.length === 0 && (
          <p className="m-0 rounded-xl border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-[#78716c]">
            {tab === "open" ? "No open tickets — everything has been resolved." : "No resolved tickets yet."}
          </p>
        )}
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
                {t.outcome && (
                  <span className="mt-px block text-[11px] text-[#78716c]">
                    {[t.outcome.on && `Closed ${t.outcome.on}`, t.outcome.by && `by ${t.outcome.by}`].filter(Boolean).join(" ")}
                  </span>
                )}
                <span className="mt-px flex items-center gap-1.5 text-[11px] text-[#78716c]">
                  {t.state}
                  {/* The remedy, unless the ticket state (REFUND_PROPOSED …) or its outcome already says it. */}
                  {t.open && t.refundState !== "NONE" && !t.state.startsWith("REFUND_") && !t.state.startsWith("MAKEGOOD_") && (
                    <span
                      className="inline-flex h-[17px] items-center rounded-full px-1.5 text-[9.5px] font-extrabold"
                      style={
                        t.refundState === "PROPOSED"
                          ? { background: "#eff6ff", color: "#1e40af" }
                          : { background: "#ecfdf5", color: "#047857" }
                      }
                    >
                      {chipOf(t)}
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
            <h3 className="mt-0 mb-1 text-[15px] font-bold">
              {stage === "proposed" || stage === "initiated" ? (makeGood ? "Free replacement call" : "Refund") : "Refund or free replacement call"}
            </h3>
            <p className="mt-0 mb-3 text-[12px] text-amber-800">
              {makeGood
                ? `Instead of money back: free minutes with ${mg?.astrologer ?? "the same astrologer"}. They keep their earnings from the original session and aren't paid for these minutes.`
                : `A refund is capped at the billed amount of ${billed} and returns to the wallet in the same bucket composition it was spent from. The astrologer's share of it is taken back from their next payout${
                    caseFile?.refund.astrologerSharePct != null ? ` (${caseFile.refund.astrologerSharePct}% share)` : ""
                  }.`}
            </p>
            {!makeGood && (
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
                {caseFile?.refund.amount && caseFile.refund.amount !== billed && (
                  <div className="flex items-center justify-between gap-3 py-[5px] text-[13.5px] font-bold text-ink">
                    <span>{stage === "initiated" ? "Refunded (partial)" : "Proposed refund (partial)"}</span>
                    <b className="tabular-nums">{caseFile.refund.amount}</b>
                  </div>
                )}
              </div>
            )}
            {makeGood && mg && (
              <div className="flex flex-col gap-[7px] text-[13.5px] text-[#57534e]">
                <div className="flex items-center justify-between gap-3 border-b border-[#f3e9d8] py-[5px]">
                  <span>Free minutes with {mg.astrologer ?? "the astrologer"}</span>
                  <b className="text-ink tabular-nums">{mg.minutes ?? "—"} min</b>
                </div>
                <div className="flex items-center justify-between gap-3 py-[5px]">
                  <span>{mg.credit ? "Book by" : "Valid for"}</span>
                  <b className="text-ink">{mg.credit ? mg.credit.validUntil : `${mg.validDays} days after approval`}</b>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              {!settled && (
                <button
                  type="button"
                  onClick={() => setAsking("reject")}
                  className="h-[42px] rounded-[11px] border border-amber-200 bg-white px-4 text-[13px] font-bold text-amber-800"
                >
                  Reject with reason
                </button>
              )}
              {stage === "none" && caseFile?.refundBlocked && (
                <BlockedAction className="h-[42px] px-4 text-[12.5px]">{caseFile.refundBlocked}</BlockedAction>
              )}
              {stage === "none" && !caseFile?.refundBlocked && (
                <button
                  type="button"
                  onClick={() => setProposing("refund")}
                  className="h-[42px] rounded-[11px] border-0 bg-amber-500 px-[18px] text-[13px] font-bold text-ink"
                >
                  Propose refund — needs a second approver
                </button>
              )}
              {stage === "none" && caseFile?.makeGoodBlocked && caseFile.makeGoodBlocked !== caseFile.refundBlocked && (
                <BlockedAction className="h-[42px] px-4 text-[12.5px]">{caseFile.makeGoodBlocked}</BlockedAction>
              )}
              {stage === "none" && caseFile && !caseFile.makeGoodBlocked && (
                <button
                  type="button"
                  onClick={() => setProposing("makegood")}
                  className="h-[42px] rounded-[11px] border border-amber-300 bg-white px-[18px] text-[13px] font-bold text-amber-900"
                >
                  Offer a free replacement call instead
                </button>
              )}
              {stage === "none" && caseFile?.coveredBy && session.capabilities.includes("dispute.refund.propose") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeCovered()}
                  className="min-h-[42px] rounded-[11px] border-0 bg-ink px-[18px] py-2 text-[13px] leading-tight font-bold text-amber-300 disabled:opacity-60"
                >
                  Close — {caseFile.coveredBy.remedy} already given on {caseFile.coveredBy.id}
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
                      : makeGood
                        ? "Approve free replacement call"
                        : "Approve refund"}
                </button>
              )}
              {stage === "proposed" && !approveBlocked && (
                <button
                  type="button"
                  onClick={() => setAsking("decline")}
                  className="h-[42px] rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-rose-700"
                >
                  Decline {remedyName}
                </button>
              )}
              {settled && (
                <span
                  className="inline-flex min-h-[42px] items-center rounded-[11px] border px-4 py-2 text-[13px] font-bold"
                  style={{
                    background: rejected ? "#fff1f2" : "#ecfdf5",
                    borderColor: rejected ? "#fecdd3" : "#a7f3d0",
                    color: rejected ? "#be123c" : "#047857",
                  }}
                >
                  {rejected
                    ? "✕ Rejected with reason"
                    : !ok
                      ? `✓ ${caseFile?.outcome?.label ?? "Resolved"}`
                      : makeGood
                      ? `✓ MAKE_GOOD · ${mg?.credit?.minutes ?? mg?.minutes ?? "—"} min free · ${
                          mg?.credit?.used ? "used" : mg?.credit?.status === "EXPIRED" ? "expired unused" : `book by ${mg?.credit?.validUntil ?? "—"}`
                        }`
                      : `✓ REFUND_INITIATED · ${caseFile?.refund.amount ?? billed}`}
                </span>
              )}
            </div>
            {settled && caseFile?.outcome && (caseFile.outcome.on || caseFile.outcome.note) && (
              <p className="mt-3 mb-0 text-[12.5px] text-[#57534e]">
                <b className="text-ink">
                  Closed{caseFile.outcome.on ? ` ${caseFile.outcome.on}` : ""}
                  {caseFile.outcome.by ? ` by ${caseFile.outcome.by}` : ""}
                </b>
                {caseFile.outcome.note ? ` · ${caseFile.outcome.note}` : ""}
              </p>
            )}
            {ok && !makeGood && caseFile?.refund.adjustment && (
              <p className="mt-3 mb-0 text-[12.5px] text-[#57534e]">
                <b className="text-rose-700">Refund adjustment:</b> {caseFile.refund.adjustment}.
              </p>
            )}
            {(stage === "proposed" || ok) && caseFile?.proposedBy && (
              <p className="mt-2 mb-0 text-[11.5px] text-[#78716c]">
                Proposed by {caseFile.proposedBy}
                {ok && caseFile.approvedBy ? ` · approved by ${caseFile.approvedBy}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>
      {asking && (
        <ReasonDialog
          title={asking === "reject" ? `Reject the dispute on ${tkt.id}` : `Decline the ${remedyName} on ${tkt.id}`}
          subtitle={tkt.subject}
          intro={
            asking === "reject"
              ? stage === "proposed"
                ? `The ticket is resolved and the proposed ${makeGood ? "free replacement call" : `refund of ${caseFile?.refund.amount ?? billed}`} is withdrawn. The reason is kept in the audit log.`
                : "The ticket is resolved without a refund. The reason is kept in the audit log."
              : "Nothing is given. The ticket goes back under investigation, with your reason in the audit log."
          }
          confirm={asking === "reject" ? "Reject dispute" : `Decline ${remedyName}`}
          danger
          onClose={() => setAsking(null)}
          onSubmit={asking === "reject" ? reject : decline}
        />
      )}
      {proposing === "refund" && caseFile && (
        <AmountDialog
          title={`Propose a refund on ${tkt.id}`}
          subtitle={`Session ${tkt.session} · billed ${billed}`}
          intro="A second person (Finance or a Super Admin) approves it before any money moves. The full amount is suggested; enter less for a partial refund."
          label="Refund amount"
          unit="₹"
          initial={caseFile.refund.billedValue}
          min={1}
          max={caseFile.refund.billedValue}
          confirm="Propose refund"
          onClose={() => setProposing(null)}
          onSubmit={propose}
        />
      )}
      {proposing === "makegood" && mg && (
        <AmountDialog
          title={`Offer a free replacement call on ${tkt.id}`}
          subtitle={`With ${mg.astrologer ?? "the same astrologer"} · session ${tkt.session}`}
          intro={`Instead of a refund, the customer gets free minutes with the same astrologer, to book within ${mg.validDays} days. The astrologer isn't paid for them. A second person approves it first.`}
          label="Free minutes"
          unit="min"
          initial={mg.suggestedMinutes}
          min={1}
          max={mg.maxMinutes}
          confirm="Propose free call"
          onClose={() => setProposing(null)}
          onSubmit={proposeMakeGood}
        />
      )}
    </div>
  );
}
