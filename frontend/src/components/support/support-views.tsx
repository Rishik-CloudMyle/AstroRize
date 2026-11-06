"use client";

// Help & support (/support): the customer raises an issue and follows it as a conversation with the
// AstroRize team. Every issue lands with our Support team, who may pass it to another team (Finance,
// Compliance, Marketing or the Admin team); the customer sees which team has it, replies while it is open and
// gets an in-app notification on every reply or status change. Staff-only notes never reach this page
// (the API leaves them out). Billing issues raised from the wallet are listed here too.

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { readResponse } from "@/lib/api/errors";
import { compressImage } from "@/lib/image-compress";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import AppButton from "../mobile/button";
import EmptyState from "../mobile/empty-state";
import { SkeletonRows } from "../mobile/skeleton";

type Tone = "now" | "wait" | "done" | "fail";
interface Status {
  label: string;
  tone: Tone;
  body: string;
}

interface IssueSummary {
  id: string;
  subject: string;
  category: string | null;
  related: string | null;
  raisedOn: string;
  open: boolean;
  status: Status;
  unread: boolean;
}

interface TimelineItem {
  id: string;
  kind: "customer" | "reply" | "note" | "event";
  who: string;
  text: string;
  attachmentUrl: string | null;
  at: string;
  when: string;
}

interface Issue {
  id: string;
  subject: string;
  category: string | null;
  related: string | null;
  raisedOn: string;
  open: boolean;
  status: Status;
  timeline: TimelineItem[];
  maxMessage: number;
}

interface Options {
  windowDays: number;
  categories: { key: string; label: string }[];
  sessions: { ref: string; label: string; charged: boolean; untilLabel: string; blocked: string | null }[];
  payments: { id: string; label: string; blocked: string | null }[];
}

const TONE: Record<Tone, string> = {
  now: "bg-amber-50 text-amber-800 max-lg:bg-app-tint max-lg:text-app-active",
  wait: "bg-orange-50 text-orange-700 max-lg:bg-[#fff7ed] max-lg:text-app-urgent",
  done: "bg-emerald-50 text-emerald-700 max-lg:bg-app-success-bg max-lg:text-app-success",
  fail: "bg-stone-100 text-stone-600 max-lg:bg-app-bg max-lg:text-app-ink-2",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] leading-tight font-bold ${TONE[status.tone]}`}>
      {status.label}
    </span>
  );
}

const CARD =
  "rounded-[22px] border border-line bg-paper p-4 sm:p-[22px] max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:p-4 max-lg:shadow-app-card";
const INPUT =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-amber-500 max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink max-lg:focus:border-app-selected";
const LABEL = "mb-1.5 block text-[13px] font-bold text-ink max-lg:text-app-ink";
const PRIMARY =
  "h-11 rounded-xl bg-amber-500 px-5 text-[15px] font-bold text-ink disabled:opacity-60 max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-app-on-primary";

/** Signed-in customers only; everyone else gets a short explanation. */
function useCustomerGate(): React.ReactNode | null {
  const session = useSession();
  const { openLogin } = useAppUI();
  if (!session.ready) return <SkeletonRows count={3} />;
  if (!session.loggedIn) {
    return (
      <div className={`${CARD} mx-auto max-w-[520px] text-center`}>
        <h2 className="m-0 text-[19px] font-bold text-ink max-lg:text-[16px] max-lg:text-app-ink">Log in to get help</h2>
        <p className="mt-2 mb-4 text-[13.5px] text-stone-600 max-lg:text-app-ink-2">
          Your issues and our replies are private to your account. Log in to raise an issue or follow one you raised.
        </p>
        <button type="button" onClick={() => openLogin()} className={PRIMARY}>
          Log in
        </button>
      </div>
    );
  }
  if (session.role !== "customer") {
    return (
      <div className={`${CARD} mx-auto max-w-[520px] text-center text-[13.5px] text-stone-600 max-lg:text-app-ink-2`}>
        Help & support here is for customer accounts. {session.role === "astrologer" ? "Astrologers can report a problem from their portal." : "Staff work issues in the admin console."}
      </div>
    );
  }
  return null;
}

// ── My issues ──

export function MyIssues() {
  const gate = useCustomerGate();
  const [issues, setIssues] = useState<IssueSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (gate) return;
    let cancelled = false;
    api
      .get<{ issues: IssueSummary[] }>("/support/issues")
      .then((r) => !cancelled && setIssues(r.issues))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [gate]);

  if (gate) return gate;
  const open = issues?.filter((i) => i.open) ?? [];
  const closed = issues?.filter((i) => !i.open) ?? [];

  return (
    <div className="flex flex-col gap-[18px] max-lg:gap-[22px]">
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0 flex-1 basis-[240px]">
          <h2 className="m-0 text-[17px] font-bold text-ink max-lg:text-[15px] max-lg:text-app-ink">Need help with something?</h2>
          <p className="mt-1 mb-0 text-[13px] text-stone-500 max-lg:text-[12.5px] max-lg:text-app-ink-2">
            A payment or refund, your wallet, a consultation, an astrologer, your account or the app — tell us and our team will reply here.
          </p>
        </div>
        <Link
          href="/support/new"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 px-5 text-[15px] font-bold text-ink hover:text-ink hover:no-underline max-lg:w-full max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-app-on-primary"
        >
          Raise an issue
        </Link>
      </div>

      <section aria-labelledby="my-issues">
        <h2 id="my-issues" className="mb-3 text-[17px] font-bold text-ink max-lg:mb-2 max-lg:text-[15px] max-lg:text-app-ink">
          My issues
        </h2>
        {error ? (
          <p role="alert" className="m-0 text-[13px] font-semibold text-rose-700">
            Couldn&rsquo;t load your issues. Check your connection and reload the page.
          </p>
        ) : issues === null ? (
          <SkeletonRows count={3} />
        ) : issues.length === 0 ? (
          <div className={CARD}>
            <EmptyState title="No issues yet" body="Anything you raise here — and billing issues raised from your wallet — will be listed with where it stands." />
          </div>
        ) : (
          <div className="flex flex-col gap-[18px]">
            {open.length > 0 && <IssueList title="Open" issues={open} />}
            {closed.length > 0 && <IssueList title="Resolved & closed" issues={closed} />}
          </div>
        )}
      </section>
    </div>
  );
}

function IssueList({ title, issues }: { title: string; issues: IssueSummary[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-extrabold tracking-[.1em] text-stone-500 uppercase max-lg:text-app-ink-3">
        {title} · {issues.length}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 max-lg:gap-2">
        {issues.map((i) => (
          <li key={i.id}>
            <Link
              href={`/support/${i.id}`}
              className="block rounded-2xl border border-line-warm bg-card px-4 py-3 text-ink hover:border-amber-300 hover:text-ink hover:no-underline max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[12px] text-stone-500 max-lg:text-app-ink-3">
                  {i.id}
                  {i.unread && (
                    <span className="ml-2 inline-flex h-[18px] items-center rounded-full bg-urgent px-1.5 font-sans text-[10px] font-extrabold text-white">
                      New reply
                    </span>
                  )}
                </span>
                <StatusChip status={i.status} />
              </div>
              <b className="mt-1 block text-[14px] break-words text-ink max-lg:text-[13.5px] max-lg:text-app-ink">{i.subject}</b>
              <span className="mt-0.5 block text-[12.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-2">
                {[i.category ?? (i.related?.startsWith("Session") ? "Billing issue" : null), i.related, `raised ${i.raisedOn}`].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Raise an issue ──

const SUBJECT_MAX = 120;
const DESCRIPTION_MAX = 2000;
/** What the API accepts after compression. */
const SHOT_MAX = 5 * 1024 * 1024;
/** Largest picture that may be chosen: it is compressed in the browser before it is sent. */
const SHOT_PICK_MAX = 25 * 1024 * 1024;
/** Screenshots are shrunk to this many pixels on the long side (WebP) before upload. */
const SHOT_MAX_SIDE = 1600;
const SHOT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Compresses a screenshot and sends it to an issue (the raw image as the body). */
async function uploadScreenshot(issueId: string, file: File) {
  let blob: Blob;
  try {
    blob = await compressImage(file, { maxSide: SHOT_MAX_SIDE });
  } catch (e) {
    throw new ApiError(0, "bad_file", e instanceof Error ? e.message : "That screenshot couldn't be prepared.");
  }
  if (blob.size > SHOT_MAX) throw new ApiError(0, "too_large", "That screenshot is too large to send. Screenshots can be up to 5 MB.");
  const res = await fetch(`/api/support/issues/${encodeURIComponent(issueId)}/attachment`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": blob.type || file.type, accept: "application/json" },
    body: blob,
  });
  return readResponse<{ message: { id: string } }>(res);
}

function checkShot(file: File): string | null {
  if (!SHOT_TYPES.includes(file.type)) return "Screenshots can be JPEG, PNG or WebP pictures.";
  if (file.size > SHOT_PICK_MAX) return "That picture is too large. Choose one under 25 MB.";
  return null;
}

export function RaiseIssueForm() {
  const gate = useCustomerGate();
  const formId = useId();
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  // "" = nothing; "s:SES-…" a session; "p:<id>" a recharge.
  const [related, setRelated] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; shotFailed: string | null } | null>(null);

  useEffect(() => {
    if (gate) return;
    let cancelled = false;
    api
      .get<Options>("/support/issues/options")
      .then((r) => !cancelled && setOptions(r))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [gate]);

  if (gate) return gate;
  if (loadError) {
    return (
      <p role="alert" className="m-0 text-[13px] font-semibold text-rose-700">
        Couldn&rsquo;t load the form. Check your connection and reload the page.
      </p>
    );
  }
  if (!options) return <SkeletonRows count={4} />;

  if (done) {
    return (
      <div className={`${CARD} mx-auto max-w-[560px] text-center`}>
        <div aria-hidden="true" className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-emerald-50 text-[22px] text-emerald-700 max-lg:bg-app-success-bg max-lg:text-app-success">
          ✓
        </div>
        <h2 className="m-0 text-[19px] font-bold text-ink max-lg:text-[16px] max-lg:text-app-ink">Issue raised</h2>
        <p className="mt-2 mb-0 text-[13.5px] leading-normal text-stone-600 max-lg:text-app-ink-2">
          Your ticket number is <b className="text-ink max-lg:text-app-ink">{done.id}</b>. Our Support team will look into it and reply on the issue — you&rsquo;ll get a
          notification when they do.
        </p>
        {done.shotFailed && (
          <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
            Your screenshot wasn&rsquo;t attached ({done.shotFailed}) — you can add it from the issue.
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <AppButton href={`/support/${done.id}`} className="lg:h-11 lg:rounded-xl lg:bg-amber-500 lg:text-ink">
            Open the issue
          </AppButton>
          <AppButton href="/support" variant="secondary" className="lg:h-11 lg:rounded-xl">
            Back to Help & support
          </AppButton>
        </div>
      </div>
    );
  }

  const session = related.startsWith("s:") ? options.sessions.find((s) => s.ref === related.slice(2)) : null;

  async function submit() {
    if (busy) return;
    if (!category) return setError("Choose what the issue is about.");
    if (subject.trim().length < 5) return setError("Give your issue a short title (at least 5 characters).");
    if (description.trim().length < 10) return setError("Tell us what happened in a few words (at least 10 characters).");
    if (category === "PAYMENT_REFUND" && session && !session.charged) return setError("Nothing was charged for that session, so there is nothing to refund. Choose another, or another category.");
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ issue: { id: string } }>("/support/issues", {
        category,
        subject: subject.trim(),
        description: description.trim(),
        sessionRef: related.startsWith("s:") ? related.slice(2) : null,
        paymentId: related.startsWith("p:") ? related.slice(2) : null,
      });
      let shotFailed: string | null = null;
      if (shot) {
        try {
          await uploadScreenshot(res.issue.id, shot);
        } catch (e) {
          shotFailed = e instanceof ApiError ? e.message : "the upload didn't finish";
        }
      }
      setDone({ id: res.issue.id, shotFailed });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = (cls: boolean) =>
    cls
      ? "border-amber-500 bg-amber-50 text-amber-800 max-lg:border-app-selected max-lg:bg-app-tint max-lg:text-app-active"
      : "border-line bg-white text-stone-600 max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink-2";

  return (
    <form
      noValidate
      className={`${CARD} mx-auto max-w-[720px]`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className={LABEL}>What is it about?</legend>
        <div className="flex flex-wrap gap-2">
          {options.categories.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={c.key === category}
              onClick={() => {
                setCategory(c.key);
                setError("");
              }}
              className={`min-h-9 rounded-full border px-3.5 text-[13px] font-bold ${chosen(c.key === category)}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor={`${formId}-related`} className={`${LABEL} mt-5`}>
        Is it about a recent session or recharge? <span className="font-normal text-stone-500 max-lg:text-app-ink-3">(optional)</span>
      </label>
      <select
        id={`${formId}-related`}
        value={related}
        onChange={(e) => {
          setRelated(e.target.value);
          setError("");
        }}
        className={`${INPUT} h-11 py-0`}
      >
        <option value="">No — it&rsquo;s a general question</option>
        {options.sessions.length > 0 && (
          <optgroup label={`Sessions in the last ${options.windowDays} days`}>
            {options.sessions.map((s) => (
              <option key={s.ref} value={`s:${s.ref}`} disabled={!!s.blocked}>
                {s.ref} · {s.label}
                {s.blocked ? ` — ${s.blocked}` : ""}
              </option>
            ))}
          </optgroup>
        )}
        {options.payments.length > 0 && (
          <optgroup label="Recent recharges">
            {options.payments.map((p) => (
              <option key={p.id} value={`p:${p.id}`} disabled={!!p.blocked}>
                {p.label}
                {p.blocked ? ` — ${p.blocked}` : ""}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="mt-1.5 mb-0 text-[12px] text-stone-500 max-lg:text-app-ink-3">
        {session
          ? `Issues about ${session.ref} can be raised until ${session.untilLabel}. A refund is reviewed — it is not automatic.`
          : `Sessions can be chosen for ${options.windowDays} days after they end. Once an issue about a session is reviewed and closed, it can't be raised again.`}
      </p>

      <label htmlFor={`${formId}-subject`} className={`${LABEL} mt-5`}>
        Title
      </label>
      <input
        id={`${formId}-subject`}
        value={subject}
        maxLength={SUBJECT_MAX}
        onChange={(e) => {
          setSubject(e.target.value);
          setError("");
        }}
        placeholder="e.g. Charged twice for one recharge"
        className={`${INPUT} h-11 py-0`}
      />

      <label htmlFor={`${formId}-description`} className={`${LABEL} mt-5`}>
        What happened
      </label>
      <textarea
        id={`${formId}-description`}
        value={description}
        maxLength={DESCRIPTION_MAX}
        rows={6}
        onChange={(e) => {
          setDescription(e.target.value);
          setError("");
        }}
        placeholder="Tell us what happened and what you'd like us to do. Don't include OTPs, passwords or card numbers."
        className={`${INPUT} resize-y`}
      />
      <div className="mt-1 text-right text-[11px] text-stone-400 tabular-nums max-lg:text-app-ink-3">
        {description.length}/{DESCRIPTION_MAX}
      </div>

      <ScreenshotPicker file={shot} onChange={setShot} onError={setError} className="mt-3" />

      <p role={error ? "alert" : undefined} className="mt-3 mb-0 min-h-[1em] text-[12.5px] font-semibold text-rose-700">
        {error}
      </p>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href="/support" className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-[14px] font-bold text-stone-600 hover:no-underline max-lg:text-app-accent">
          Cancel
        </Link>
        <button type="submit" disabled={busy} className={PRIMARY}>
          {busy ? "Sending…" : "Raise issue"}
        </button>
      </div>
    </form>
  );
}

function ScreenshotPicker({
  file,
  onChange,
  onError,
  className = "",
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  onError: (msg: string) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <input
        ref={input}
        type="file"
        accept={SHOT_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!f) return;
          const why = checkShot(f);
          if (why) return onError(why);
          onError("");
          onChange(f);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="min-h-9 rounded-xl border border-line bg-white px-3.5 text-[13px] font-bold text-ink max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink"
      >
        {file ? "Change screenshot" : "Attach a screenshot"}
      </button>
      {file ? (
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-stone-600 max-lg:text-app-ink-2">
          <span className="max-w-[200px] truncate">{file.name}</span>
          <button type="button" onClick={() => onChange(null)} className="min-h-9 px-1 font-bold text-rose-700" aria-label="Remove the screenshot">
            Remove
          </button>
        </span>
      ) : (
        <span className="text-[12px] text-stone-500 max-lg:text-app-ink-3">Optional · JPEG, PNG or WebP</span>
      )}
    </div>
  );
}

// ── One issue ──

export function IssueThread({ id }: { id: string }) {
  const gate = useCustomerGate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);
  const replyId = useId();

  const load = async () => {
    try {
      const r = await api.get<{ issue: Issue }>(`/support/issues/${encodeURIComponent(id)}`);
      setIssue(r.issue);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "notfound" : "We couldn't load this issue. Check your connection and reload the page.");
    }
  };

  useEffect(() => {
    if (gate) return;
    let cancelled = false;
    api
      .get<{ issue: Issue }>(`/support/issues/${encodeURIComponent(id)}`)
      .then((r) => !cancelled && setIssue(r.issue))
      .catch((e) => !cancelled && setError(e instanceof ApiError && e.status === 404 ? "notfound" : "We couldn't load this issue. Check your connection and reload the page."));
    return () => {
      cancelled = true;
    };
  }, [gate, id]);

  if (gate) return gate;
  if (error === "notfound") {
    return (
      <div className={CARD}>
        <EmptyState
          title="Issue not found"
          body="We couldn't find this issue on your account."
          action={
            <AppButton href="/support" variant="secondary" className="lg:rounded-xl">
              Back to Help & support
            </AppButton>
          }
        />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="m-0 text-[13px] font-semibold text-rose-700">
        {error}
      </p>
    );
  }
  if (!issue) return <SkeletonRows count={4} />;

  async function send() {
    if (busy) return;
    const body = text.trim();
    if (!body && !shot) return setSendError("Write your reply, or attach a screenshot.");
    setBusy(true);
    setSendError("");
    try {
      if (shot) await uploadScreenshot(id, shot);
      if (body) await api.post(`/support/issues/${encodeURIComponent(id)}/messages`, { text: body });
      setText("");
      setShot(null);
      await load();
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "Couldn't send it. Check your connection and try again.");
      // A screenshot that went through stays in the thread; don't send it twice.
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px] max-lg:gap-3">
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[12.5px] text-stone-500 max-lg:text-app-ink-3">Ticket {issue.id}</span>
          <StatusChip status={issue.status} />
        </div>
        <h2 className="mt-1.5 mb-0 text-[19px] leading-snug font-bold break-words text-ink max-lg:text-[16px] max-lg:text-app-ink">{issue.subject}</h2>
        <p className="mt-1 mb-0 text-[12.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-2">
          {[issue.category ?? (issue.related ? "Billing issue" : null), issue.related, `raised ${issue.raisedOn}`].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2.5 mb-0 rounded-xl bg-cream px-3 py-2 text-[13px] text-stone-600 max-lg:rounded-app-btn max-lg:bg-app-bg max-lg:text-[12.5px] max-lg:text-app-ink-2">
          {issue.status.body}
        </p>
      </div>

      <ol aria-label="Conversation" className="m-0 flex list-none flex-col gap-2.5 p-0">
        {issue.timeline.map((m) =>
          m.kind === "event" ? (
            <li key={m.id} className="text-center text-[12px] text-stone-500 max-lg:text-app-ink-3">
              <span className="inline-block rounded-full bg-cream px-3 py-1 max-lg:bg-app-tint">
                {m.text} · {m.when}
              </span>
            </li>
          ) : (
            <li key={m.id} className={`flex ${m.kind === "customer" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[min(560px,88%)] rounded-2xl px-3.5 py-2.5 ${
                  m.kind === "customer"
                    ? "rounded-br-md bg-amber-100 max-lg:bg-app-tint-2"
                    : "rounded-bl-md border border-line bg-white max-lg:border-app-line max-lg:bg-app-surface"
                }`}
              >
                <div className="mb-0.5 text-[11.5px] font-bold text-stone-500 max-lg:text-app-ink-3">
                  {m.who} · {m.when}
                </div>
                {m.attachmentUrl && (
                  <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="mb-1.5 block">
                    {/* Private screenshot served by the API to this customer only; next/image can't proxy it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.attachmentUrl} alt="Screenshot you attached" className="block h-auto max-h-[260px] w-auto max-w-[min(420px,62vw)] rounded-lg border border-line object-contain" />
                  </a>
                )}
                <p className="m-0 text-[14px] leading-normal break-words whitespace-pre-wrap text-ink max-lg:text-[13.5px] max-lg:text-app-ink">{m.text}</p>
              </div>
            </li>
          ),
        )}
      </ol>

      {issue.open ? (
        <form
          noValidate
          className={CARD}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={replyId} className={LABEL}>
            {issue.status.tone === "wait" ? "Reply to our team" : "Add a reply"}
          </label>
          <textarea
            id={replyId}
            value={text}
            maxLength={issue.maxMessage}
            rows={3}
            onChange={(e) => {
              setText(e.target.value);
              setSendError("");
            }}
            placeholder="Write a message to our team"
            className={`${INPUT} resize-y`}
          />
          <ScreenshotPicker file={shot} onChange={setShot} onError={setSendError} className="mt-2" />
          <p role={sendError ? "alert" : undefined} className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
            {sendError}
          </p>
          <div className="mt-2 flex justify-end">
            <button type="submit" disabled={busy} className={`${PRIMARY} max-lg:w-full`}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      ) : (
        <p className="m-0 rounded-2xl bg-cream px-4 py-3 text-center text-[13px] text-stone-600 max-lg:rounded-app-card max-lg:bg-app-surface max-lg:text-app-ink-2">
          This issue is {issue.status.tone === "fail" ? "closed" : "resolved"} and can&rsquo;t take new replies.{" "}
          <Link href="/support/new" className="font-bold text-amber-700 max-lg:text-app-accent">
            Raise a new issue
          </Link>{" "}
          if you still need help.
        </p>
      )}
    </div>
  );
}
