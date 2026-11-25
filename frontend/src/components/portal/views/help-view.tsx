"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { PageHeader, Panel } from "../ui";

interface Topic {
  key: string;
  label: string;
}
interface Issue {
  id: string;
  ref: string;
  topic: string;
  with: string;
  subject: string;
  state: "OPEN" | "WAITING" | "RESOLVED";
  raisedAt: string;
  updatedAt: string;
  unread: boolean;
}
interface Line {
  id: string;
  mine: boolean;
  who: string;
  text: string;
  at: string;
}

const ICON: Record<string, string> = { PAYOUT: "₹", CONSULTATION: "☎", SAFETY: "⚠", TECHNICAL: "⚙", PROFILE: "◍", LIVE: "◎", OTHER: "?" };
const STATE: Record<Issue["state"], [string, string, string]> = {
  OPEN: ["#eff6ff", "#1d4ed8", "With our team"],
  WAITING: ["#fffbeb", "#b45309", "Waiting for you"],
  RESOLVED: ["#ecfdf5", "#047857", "Resolved"],
};
const FIELD = "w-full rounded-xl border border-stone-300 bg-white px-3.5 text-[14px] text-ink";
const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** Help for astrologers: pick what it is about, raise an issue, follow the team's answer as a conversation. */
export default function HelpView() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ topics: Topic[]; issues: Issue[] }>("/portal/help");
      setTopics(r.topics);
      setIssues(r.issues);
    } catch (e) {
      setError(msg(e));
      setIssues([]);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const id = new URLSearchParams(window.location.search).get("issue");
    if (id) void Promise.resolve().then(() => setOpen(id));
  }, [load]);

  async function raise(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSent("");
    if (!topic) return setError("Choose what it is about.");
    setBusy(true);
    try {
      const r = await api.post<{ ref: string }>("/portal/help", { topic, subject, details });
      setSent(`Thank you. Your issue ${r.ref} has reached our team. You will see the answer here.`);
      setTopic("");
      setSubject("");
      setDetails("");
      await load();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Help" subtitle="Something wrong with a payout, a customer, a call or your profile? Tell us here and follow the answer." />

      <Panel>
        <h2 className="m-0 text-[16px] font-bold">What do you need help with?</h2>
        <div role="radiogroup" aria-label="Topic" className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          {topics.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={topic === t.key}
              onClick={() => setTopic(t.key)}
              className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left ${topic === t.key ? "border-amber-600 bg-amber-50" : "border-stone-200 bg-white"}`}
            >
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-stone-100 text-[15px]">{ICON[t.key] ?? "?"}</span>
              <span className="text-[13px] font-bold leading-snug text-ink">{t.label}</span>
            </button>
          ))}
        </div>
        <form onSubmit={raise} className="mt-4 grid gap-3" noValidate>
          <label className="grid gap-1.5 text-[13px] font-bold text-ink">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="One line, e.g. Payout for 1–15 Nov is missing" className={`${FIELD} h-11`} />
          </label>
          <label className="grid gap-1.5 text-[13px] font-bold text-ink">
            What happened?
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={3000} rows={5} className={`${FIELD} py-3`} />
          </label>
          {error && <p role="alert" className="m-0 text-[13px] font-semibold text-red-700">{error}</p>}
          {sent && <p role="status" className="m-0 text-[13px] font-semibold text-emerald-700">{sent}</p>}
          <button type="submit" disabled={busy} className="h-11 w-fit rounded-xl bg-ink px-5 text-[14px] font-bold text-white disabled:opacity-60">
            {busy ? "Sending…" : "Send to our team"}
          </button>
        </form>
      </Panel>

      <h2 className="mt-6 mb-2 text-[16px] font-bold">Your issues</h2>
      {issues === null ? (
        <p className="text-[13px] text-stone-500">Loading…</p>
      ) : issues.length === 0 ? (
        <Panel>
          <p className="m-0 text-[13.5px] text-stone-600">Nothing raised yet. Issues you raise appear here with our team&rsquo;s replies.</p>
        </Panel>
      ) : (
        <div className="grid gap-3">
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueCard({ issue, open, onToggle, onChanged }: { issue: Issue; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bg, fg, label] = STATE[issue.state];

  const read = useCallback(async () => {
    try {
      setLines((await api.get<{ messages: Line[] }>(`/portal/help/${issue.id}`)).messages);
    } catch (e) {
      setError(msg(e));
    }
  }, [issue.id]);
  useEffect(() => {
    if (open) void Promise.resolve().then(read);
  }, [open, read]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/portal/help/${issue.id}/reply`, { text: reply });
      setReply("");
      await read();
      onChanged();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-start justify-between gap-2 text-left">
        <span className="min-w-0">
          <b className="block text-[14.5px] text-ink">
            {issue.subject}
            {issue.unread && <span className="ml-2 rounded-full bg-urgent px-2 py-0.5 text-[10px] font-extrabold text-white">New reply</span>}
          </b>
          <span className="mt-0.5 block text-[12px] text-stone-500">
            {issue.ref} · {issue.topic} · with {issue.with} · updated {issue.updatedAt}
          </span>
        </span>
        <span className="inline-flex h-[24px] items-center rounded-full px-2.5 text-[11.5px] font-bold" style={{ background: bg, color: fg }}>
          {label}
        </span>
      </button>
      {open && (
        <div className="mt-3 border-t border-stone-200 pt-3">
          {!lines ? (
            <p className="text-[13px] text-stone-500">Loading…</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {lines.map((l) => (
                <li key={l.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${l.mine ? "self-end bg-amber-100 text-ink" : "self-start bg-stone-100 text-ink"}`}>
                  <b className="block text-[11.5px] text-stone-600">{l.who} · {l.at}</b>
                  <span className="whitespace-pre-wrap">{l.text}</span>
                </li>
              ))}
            </ul>
          )}
          {issue.state === "RESOLVED" ? (
            <p className="mt-3 mb-0 text-[12.5px] text-stone-500">This issue is resolved. Raise a new one if you still need help.</p>
          ) : (
            <form onSubmit={send} className="mt-3 grid gap-2">
              <label className="sr-only" htmlFor={`reply-${issue.id}`}>Your reply</label>
              <textarea id={`reply-${issue.id}`} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={3000} rows={3} placeholder="Write a reply" className={`${FIELD} py-2.5`} />
              {error && <p role="alert" className="m-0 text-[12.5px] font-semibold text-red-700">{error}</p>}
              <button type="submit" disabled={busy || !reply.trim()} className="h-10 w-fit rounded-xl bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-60">
                {busy ? "Sending…" : "Reply"}
              </button>
            </form>
          )}
        </div>
      )}
    </Panel>
  );
}
