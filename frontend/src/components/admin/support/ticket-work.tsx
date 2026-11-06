"use client";

// Working a customer issue on the Support page: what the customer raised, the conversation and every
// audited step (internal notes included — staff only), and the composer: reply to the customer, add
// an internal note, forward to another team (or back to Support), or resolve / close with a message.
// The buttons follow `SupportCase.can`, which the API computes with the same rules it enforces.

import { useId, useRef, useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import { EYEBROW } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { SupportCase, TicketTimelineItem } from "@/lib/admin/types";

type Mode = "reply" | "note" | "forward" | "resolve";

const KIND_STYLE: Record<TicketTimelineItem["kind"], { box: string; tag: string | null }> = {
  customer: { box: "border-[#e7e0d6] bg-white", tag: "Customer" },
  reply: { box: "border-amber-200 bg-amber-50", tag: "Reply · customer sees this" },
  note: { box: "border-dashed border-[#a8a29e] bg-[#f5f5f4]", tag: "Internal note · staff only" },
  event: { box: "", tag: null },
};

export function IssueSummary({ file }: { file: SupportCase }) {
  if (!file.description && !file.customer && !file.payment && !file.category) return null;
  return (
    <div className="mt-[18px] rounded-2xl border border-line bg-cream p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-[#57534e]">
        {file.customer && (
          <span>
            <span className={EYEBROW}>Customer</span>
            <b className="block text-[13.5px] text-ink">
              {file.customer.name}
              {file.customer.alias !== file.customer.name && <span className="font-normal text-[#78716c]"> · {file.customer.alias}</span>}
            </b>
          </span>
        )}
        {file.category && (
          <span>
            <span className={EYEBROW}>Category</span>
            <b className="block text-[13.5px] text-ink">{file.category}</b>
          </span>
        )}
        {file.payment && (
          <span className="min-w-0">
            <span className={EYEBROW}>Recharge</span>
            <b className="block text-[13.5px] text-ink">{file.payment.label}</b>
            {file.payment.detail && <span className="block break-all text-[11.5px] text-[#78716c]">{file.payment.detail}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

export function TicketTimeline({ items }: { items: TicketTimelineItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-[18px]">
      <div className="mb-[9px] text-[11px] font-bold tracking-[.08em] text-[#78716c] uppercase">Conversation & timeline</div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((m) =>
          m.kind === "event" ? (
            <li key={m.id} className="flex gap-2 px-1 text-[12px] text-[#78716c]">
              <span aria-hidden="true">•</span>
              <span className="min-w-0 break-words">
                <b className="text-[#57534e]">{m.who}</b> · {m.text} · {m.when}
              </span>
            </li>
          ) : (
            <li key={m.id} className={`rounded-xl border px-3.5 py-2.5 ${KIND_STYLE[m.kind].box}`}>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[#78716c]">
                <b className="text-[#57534e]">{m.who}</b>
                <span>{m.when}</span>
                {KIND_STYLE[m.kind].tag && (
                  <span className={`ml-auto rounded-full px-2 py-px text-[10px] font-extrabold ${m.kind === "note" ? "bg-ink text-amber-300" : "bg-white text-[#57534e]"}`}>
                    {KIND_STYLE[m.kind].tag}
                  </span>
                )}
              </div>
              {m.attachmentUrl && (
                <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mb-1.5 block">
                  {/* Private screenshot served by the API to staff who can see this ticket; next/image can't proxy it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.attachmentUrl} alt="Screenshot the customer attached" className="max-h-[220px] max-w-full rounded-lg border border-line object-contain" />
                </a>
              )}
              <p className="m-0 text-[13.5px] leading-normal break-words whitespace-pre-wrap text-ink">{m.text}</p>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

/**
 * The Actions area. Shows only what this person may do (the API computes `can` with the rules it
 * enforces); renders nothing when they can do nothing. Money: `onCredit` (propose a wallet credit)
 * and `onRefund` (propose a refund of the session's charge) are passed only when allowed; a
 * department without money rights is told to forward to Finance.
 */
export function TicketComposer({
  file,
  session,
  onDone,
  onCredit,
  onRefund,
}: {
  file: SupportCase;
  session: string;
  onDone: () => Promise<void>;
  onCredit?: () => void;
  onRefund?: () => void;
}) {
  const { run, busy } = useAction();
  const id = useId();
  const can = file.can;
  const modes: { key: Mode; label: string }[] = [
    ...(can.reply ? [{ key: "reply" as const, label: "Reply to customer" }] : []),
    ...(can.note ? [{ key: "note" as const, label: "Internal note" }] : []),
    ...(can.forwardTo.length ? [{ key: "forward" as const, label: "Forward" }] : []),
    ...(can.resolve ? [{ key: "resolve" as const, label: "Resolve / close" }] : []),
  ];
  const [mode, setMode] = useState<Mode>(modes[0]?.key ?? "note");
  const [text, setText] = useState("");
  const [wait, setWait] = useState(false);
  const [team, setTeam] = useState(file.suggestedTeam?.key ?? can.forwardTo[0]?.key ?? "");
  const [outcome, setOutcome] = useState<"RESOLVED" | "CLOSED">("RESOLVED");
  const [error, setError] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  if (!modes.length) return null;
  const current = modes.some((m) => m.key === mode) ? mode : modes[0]!.key;
  const teamName = can.forwardTo.find((t) => t.key === team)?.label ?? "";
  const finance = can.forwardTo.find((t) => t.key === "finance");
  // A remedy waiting for its second approver: resolving comes back once it is decided.
  const pending = can.act && file.refundState === "PROPOSED";
  const pendingWhat = file.remedy === "WALLET_CREDIT" ? "wallet credit" : file.remedy === "MAKE_GOOD" ? "free replacement call" : "refund";
  const forwardTo = (key: string) => {
    setMode("forward");
    setTeam(key);
    setError("");
    textRef.current?.focus();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (body.length < 2) return setError(current === "forward" ? "Write a note for the team saying why." : "Write the message first.");
    if (current === "forward" && !team) return setError("Choose a team.");
    setError("");
    const base = `/admin/support/${encodeURIComponent(file.id)}`;
    const res =
      current === "reply"
        ? await run(() => api.post(`${base}/reply`, { text: body, waitForCustomer: wait }), wait ? "Reply sent. The issue now shows “Waiting for you” to the customer." : "Reply sent to the customer.")
        : current === "note"
          ? await run(() => api.post(`${base}/note`, { text: body }), "Internal note added (staff only).")
          : current === "forward"
            ? await run(() => api.post(`${base}/forward`, { team, note: body }), `${file.id} forwarded to ${teamName}. It's in their queue now.`)
            : await run(
                () => api.post(`${base}/resolve`, { outcome, message: body }),
                outcome === "RESOLVED" ? `${file.id} resolved. The customer has your message.` : `${file.id} closed. The customer has your message.`,
              );
    if (res) {
      setText("");
      setWait(false);
      await onDone();
    }
  }

  const placeholder = {
    reply: "Write to the customer. They see it from the team, never your name.",
    note: "Only staff see this note.",
    forward: `Why it goes to ${teamName || "this team"} — what they need to do (staff only).`,
    resolve: "Tell the customer how it was sorted out (they see this).",
  }[current];

  return (
    <form onSubmit={submit} noValidate className="mt-[18px] rounded-2xl border border-line bg-white p-4">
      <h3 className="mt-0 mb-2.5 text-[13px] font-bold tracking-[.06em] text-[#57534e] uppercase">Actions</h3>
      {can.act && (onCredit || onRefund || !can.money || pending) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-cream px-3.5 py-2.5">
          <span className="text-[12px] font-bold text-[#57534e]">Money</span>
          {onCredit && (
            <button type="button" onClick={onCredit} className="h-9 rounded-[10px] bg-amber-500 px-3.5 text-[12.5px] font-bold text-ink">
              Credit customer&rsquo;s wallet
            </button>
          )}
          {onRefund && (
            <button type="button" onClick={onRefund} className="h-9 rounded-[10px] border border-amber-300 bg-white px-3.5 text-[12.5px] font-bold text-amber-900">
              Refund session {session}
            </button>
          )}
          {(onCredit || onRefund) && <span className="text-[11.5px] text-[#78716c]">A second person approves before any money moves.</span>}
          {pending && (
            <span className="min-w-0 flex-1 text-[12.5px] text-[#57534e]">
              A {pendingWhat} is waiting for its second approver. Resolve / close comes back once it&rsquo;s approved or declined.
            </span>
          )}
          {!can.money && !pending && (
            <>
              <span className="min-w-0 flex-1 text-[12.5px] text-[#57534e]">
                Money actions: forward to Finance team. Your department can&rsquo;t credit or refund, but can reply, forward and resolve.
              </span>
              {/* Not twice: the suggested-team banner below may already offer it. */}
              {finance && !(current === "forward" && team === finance.key) && file.suggestedTeam?.key !== finance.key && (
                <button type="button" onClick={() => forwardTo(finance.key)} className="h-9 rounded-[10px] bg-ink px-3.5 text-[12.5px] font-bold text-amber-300">
                  Forward to {finance.label}
                </button>
              )}
            </>
          )}
          {can.money && !pending && !onCredit && !onRefund && file.creditBlocked && (
            <span className="min-w-0 flex-1 text-[12.5px] text-[#57534e]">{file.creditBlocked}.</span>
          )}
        </div>
      )}
      {file.suggestedTeam && !(current === "forward" && team === file.suggestedTeam.key) && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-[12.5px] text-amber-900">
            {file.category} issues usually go to <b>{file.suggestedTeam.label}</b>.
          </span>
          <button
            type="button"
            onClick={() => forwardTo(file.suggestedTeam!.key)}
            className="h-9 rounded-[10px] bg-ink px-3.5 text-[12.5px] font-bold text-amber-300"
          >
            Forward to {file.suggestedTeam.label}
          </button>
        </div>
      )}
      <div role="tablist" aria-label="Work this ticket" className="mb-3 flex flex-wrap gap-1 rounded-xl bg-cream p-1">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={current === m.key}
            onClick={() => {
              setMode(m.key);
              setError("");
            }}
            className={`h-9 flex-1 rounded-[9px] px-3 text-[12.5px] font-bold whitespace-nowrap ${current === m.key ? "bg-white text-ink shadow-[0_1px_3px_rgba(28,25,23,.12)]" : "text-[#78716c]"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {current === "forward" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-team`} className="text-[12.5px] font-bold text-[#57534e]">
            Forward to
          </label>
          <select
            id={`${id}-team`}
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] font-semibold text-ink"
          >
            {can.forwardTo.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
                {t.key === file.suggestedTeam?.key ? " (suggested)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {current === "resolve" && (
        <fieldset className="m-0 mb-3 flex flex-wrap gap-4 border-0 p-0 text-[13px] text-ink">
          <legend className="sr-only">Outcome</legend>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name={`${id}-outcome`} checked={outcome === "RESOLVED"} onChange={() => setOutcome("RESOLVED")} />
            Resolved — sorted out
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name={`${id}-outcome`} checked={outcome === "CLOSED"} onChange={() => setOutcome("CLOSED")} />
            Closed — no further action
          </label>
        </fieldset>
      )}
      <label htmlFor={`${id}-text`} className="sr-only">
        {modes.find((m) => m.key === current)?.label}
      </label>
      <textarea
        ref={textRef}
        id={`${id}-text`}
        value={text}
        maxLength={current === "forward" ? 1000 : 2000}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
        className="w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500"
      />
      {current === "reply" && (
        <label className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-[#57534e]">
          <input type="checkbox" checked={wait} onChange={(e) => setWait(e.target.checked)} />
          I&rsquo;m asking the customer something — show &ldquo;Waiting for you&rdquo; until they answer
        </label>
      )}
      {current === "resolve" && session !== "—" && (
        <p className="mt-1.5 mb-0 text-[12px] text-[#78716c]">
          This issue is about session {session}: once closed without a refund or free call, no new issue can be raised about that session.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 mb-0 text-[12.5px] font-semibold text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="submit"
          disabled={busy}
          className={`h-[42px] rounded-[11px] border-0 px-[18px] text-[13px] font-bold disabled:opacity-60 ${current === "note" ? "bg-ink text-amber-300" : "bg-amber-500 text-ink"}`}
        >
          {current === "reply" ? "Send reply" : current === "note" ? "Add note" : current === "forward" ? `Forward to ${teamName}` : outcome === "RESOLVED" ? "Resolve issue" : "Close issue"}
        </button>
      </div>
    </form>
  );
}
