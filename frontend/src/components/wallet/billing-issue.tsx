"use client";

// Billing issues (app prototype APP-DSP-001 / 002 / 003): from a consultation line in the wallet,
// the customer raises an issue about that session — what it is about and what happened. It goes to
// Support, who may propose a refund (to the wallet) or a free replacement call; a second person
// approves it. Nothing is refunded automatically. The customer's requests and where each stands
// are listed in the wallet (desktop: under Transactions; phones: on the Transactions screen).
// An issue can be raised only within the window after the session ended (the API says how many
// days and until when, per session), and never again once one was reviewed and rejected.

import Link from "next/link";
import { useEffect, useId, useReducer, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import Modal, { CloseButton } from "../ui/modal";

export interface SupportRequest {
  id: string;
  sessionRef: string;
  subject: string;
  astrologer: string;
  mode: string;
  billed: number;
  raisedOn: string;
  status: { label: string; tone: "now" | "done" | "fail"; body: string };
}

const CATEGORIES = ["Session quality", "Charged incorrectly", "Duplicate charge", "Wallet"] as const;
const NOTE_MIN = 10;
const NOTE_MAX = 500;

interface SupportRequestsData {
  requests: SupportRequest[];
  /** Days after a session ends that an issue can be raised. */
  windowDays: number;
  /** Sessions an issue can still be raised about, with the deadline. */
  raisable: { ref: string; until: string; untilLabel: string }[];
  /** Recent sessions whose dispute was reviewed and rejected (closed for good). */
  closed: string[];
  /** Recent sessions already settled with a refund or free replacement call. */
  settled: string[];
}

// One list for the page, shared by every piece that shows it (re-read whenever one mounts).
let cache: SupportRequestsData | null = null;
const listeners = new Set<() => void>();
async function load() {
  try {
    cache = await api.get<SupportRequestsData>("/support/requests");
  } catch {
    cache = cache ?? { requests: [], windowDays: 0, raisable: [], closed: [], settled: [] };
  }
  listeners.forEach((l) => l());
}

function useSupportData() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    void load();
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return cache;
}

export function useSupportRequests() {
  return useSupportData()?.requests ?? null;
}

/** Whether a wallet line can have an issue raised about it: a consultation that was charged. */
export const canRaiseIssue = (t: { type: string; amount: number }) => t.type === "Consultation" && t.amount < 0;

const TONE: Record<SupportRequest["status"]["tone"], string> = {
  now: "bg-amber-50 text-amber-800 max-lg:bg-app-tint max-lg:text-app-active",
  done: "bg-emerald-50 text-emerald-700 max-lg:bg-app-success-bg max-lg:text-app-success",
  fail: "bg-rose-50 text-rose-700 max-lg:bg-app-error-bg max-lg:text-app-error",
};

function StatusChip({ status }: { status: SupportRequest["status"] }) {
  return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold ${TONE[status.tone]}`}>{status.label}</span>;
}

/**
 * The action for one consultation line: "Raise a billing issue", or — when a request for that
 * session is open — where it stands. `compact` = a small text link (the desktop table).
 */
export function BillingIssueAction({ txRef, compact = false }: { txRef: string; compact?: boolean }) {
  const data = useSupportData();
  const [open, setOpen] = useState(false);
  // The newest request about this session (the list is newest first).
  const mine = data?.requests.find((r) => r.sessionRef === txRef);
  const slot = data?.raisable.find((r) => r.ref === txRef);
  // The dialog stays up after sending (its "Request submitted" view) even though the line now has a request.
  const dialog = open && <RaiseIssueDialog txRef={txRef} until={slot?.untilLabel ?? null} onClose={() => setOpen(false)} />;
  if (data === null) return null;
  // A request exists (under review, settled, or reviewed and closed): say where it stands.
  if (mine) {
    const status = compact ? (
      <span className="mt-0.5 block text-[11.5px] font-semibold text-stone-500">
        Issue {mine.id} · {mine.status.tone === "now" ? "under review" : mine.status.label.toLowerCase()}
      </span>
    ) : (
      <div className="mt-3 rounded-[14px] border border-line bg-cream px-3.5 py-3 text-[13px] max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/support/${mine.id}`} className="font-bold text-ink underline decoration-amber-300 underline-offset-2 max-lg:text-app-ink">
            Issue {mine.id}
          </Link>
          <StatusChip status={mine.status} />
        </div>
        <p className="mt-1 mb-0 text-[12.5px] text-stone-500 max-lg:text-app-ink-2">{mine.status.body}</p>
      </div>
    );
    return (
      <>
        {status}
        {dialog}
      </>
    );
  }
  // No request yet, and it can't be raised any more: reviewed and closed on another ticket, or too late.
  // (windowDays 0 = the list couldn't be read: offer the action and let the API decide.)
  if (!slot && data.windowDays > 0) {
    const [why, short] = data.closed.includes(txRef)
      ? ["This issue was reviewed and closed.", "Issue reviewed and closed"]
      : data.settled.includes(txRef)
        ? ["This session's billing issue was already settled.", "Issue settled"]
        : [
            `Billing issues can be raised within ${data.windowDays} ${data.windowDays === 1 ? "day" : "days"} after a session ends — the time for this session has passed.`,
            "Issue window closed",
          ];
    return compact ? (
      <span className="mt-0.5 block text-[11.5px] text-stone-400">{short}</span>
    ) : (
      <p className="mt-3 mb-0 rounded-[14px] bg-cream px-3.5 py-3 text-[12.5px] text-stone-500 max-lg:rounded-app-card max-lg:bg-app-surface max-lg:text-app-ink-2">
        {why}
      </p>
    );
  }
  return (
    <>
      {compact ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-0.5 block text-[11.5px] font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800"
          >
            Raise a billing issue
          </button>
          {slot && <span className="block text-[11px] text-stone-400">until {slot.untilLabel}</span>}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 h-11 w-full rounded-xl border border-line bg-paper text-[15px] font-bold text-ink max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-transparent max-lg:text-app-ink"
          >
            Raise a billing issue
          </button>
          {slot && <p className="mt-1.5 mb-0 text-center text-[12px] text-stone-500 max-lg:text-app-ink-2">You can raise one until {slot.untilLabel}</p>}
        </>
      )}
      {dialog}
    </>
  );
}

function RaiseIssueDialog({ txRef, until, onClose }: { txRef: string; until: string | null; onClose: () => void }) {
  const titleId = useId();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (!category) return setError("Choose what the issue is about.");
    const text = note.trim();
    if (text.length < NOTE_MIN) return setError(`Tell us what happened in a few words (at least ${NOTE_MIN} characters).`);
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ request: { id: string } }>("/support/requests", { ref: txRef, category, note: text });
      setDone(res.request.id);
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidth={460}>
      {done ? (
        <div className="text-center">
          <div aria-hidden="true" className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-emerald-50 text-[22px] text-emerald-700">
            ✓
          </div>
          <h2 id={titleId} className="m-0 text-[19px] font-bold text-ink max-lg:text-app-ink">
            Request submitted
          </h2>
          <p className="mt-2 mb-0 text-[13.5px] leading-[1.5] text-stone-600 max-lg:text-app-ink-2">
            We&rsquo;ve received it as <b>{done}</b>. Our support team will review session {txRef}. A refund is reviewed — it is not
            automatic. You&rsquo;ll see the outcome here, in Help &amp; support and in your notifications.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 h-11 w-full rounded-xl bg-amber-500 text-[15px] font-bold text-ink max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-app-on-primary"
          >
            Done
          </button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 id={titleId} className="m-0 text-[19px] font-bold text-ink max-lg:text-app-ink">
              Raise a billing issue
            </h2>
            <CloseButton onClick={onClose} />
          </div>
          <p className="mt-0 mb-4 text-[13px] text-stone-500 max-lg:text-app-ink-2">
            About session <b className="text-ink max-lg:text-app-ink">{txRef}</b>. Tell us what happened — a refund is reviewed, it is not
            automatic.{until ? ` You can raise it until ${until}.` : ""}
          </p>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-[13px] font-bold text-ink max-lg:text-app-ink">What is it about?</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const on = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCategory(c);
                      setError("");
                    }}
                    className={`h-9 rounded-full border px-3.5 text-[13px] font-bold ${
                      on
                        ? "border-amber-500 bg-amber-50 text-amber-800 max-lg:border-app-primary max-lg:bg-app-tint max-lg:text-app-active"
                        : "border-line bg-white text-stone-600 max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink-2"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label htmlFor={`${titleId}-note`} className="mt-4 mb-1.5 block text-[13px] font-bold text-ink max-lg:text-app-ink">
            What happened
          </label>
          <textarea
            id={`${titleId}-note`}
            value={note}
            maxLength={NOTE_MAX}
            rows={4}
            placeholder="Describe the session or charge. Don’t include OTPs or card numbers."
            onChange={(e) => {
              setNote(e.target.value);
              setError("");
            }}
            className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500 max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink"
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <p role={error ? "alert" : undefined} className="m-0 text-[12.5px] font-semibold text-rose-700">
              {error}
            </p>
            <span className="shrink-0 text-[11px] text-stone-400 tabular-nums">
              {note.length}/{NOTE_MAX}
            </span>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 h-11 w-full rounded-xl bg-amber-500 text-[15px] font-bold text-ink disabled:opacity-60 max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-app-on-primary"
          >
            {busy ? "Sending…" : "Submit request"}
          </button>
        </form>
      )}
    </Modal>
  );
}

/** The customer's billing issues and where each stands (nothing when there are none). */
export function BillingIssues({ className = "" }: { className?: string }) {
  const requests = useSupportRequests();
  if (!requests?.length) return null;
  return (
    <section aria-labelledby="billing-issues" className={className}>
      <h2 id="billing-issues" className="mb-3 text-[17px] font-bold text-ink max-lg:text-[15px] max-lg:text-app-ink">
        Billing issues
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-line-warm bg-card px-4 py-3 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[14px] text-ink max-lg:text-app-ink">
                {r.id} · {r.sessionRef}
              </b>
              <StatusChip status={r.status} />
            </div>
            <p className="mt-1 mb-0 text-[12.5px] text-stone-500 max-lg:text-app-ink-2">
              {r.mode} with {r.astrologer} · billed {rupee(r.billed)} · raised {r.raisedOn}
            </p>
            <p className="mt-1 mb-0 text-[12.5px] break-words text-stone-600 max-lg:text-app-ink-2">{r.status.body}</p>
            <Link
              href={`/support/${r.id}`}
              className="mt-1.5 inline-block text-[12.5px] font-bold text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800 max-lg:text-app-accent"
            >
              Open the conversation
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
