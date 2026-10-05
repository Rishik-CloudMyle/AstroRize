"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { ChatMessage, Thread } from "@/lib/portal/types";
import { useErrorToast, usePortalState, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";

function initials(alias: string): string {
  return alias.replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
}

export default function MessagesView({ threads: initialThreads }: { threads: Thread[] }) {
  const toast = useToast();
  const showError = useErrorToast();
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = usePortalState<string | null>("thread", null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const thread = threads.find((t) => t.id === selectedId) ?? threads[0];
  const q = query.trim().toLowerCase();
  const visible = threads.filter((t) => !q || t.alias.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q));

  const send = async () => {
    const text = draft.trim();
    if (!text || !thread || busy) return;
    setBusy(true);
    try {
      // The API holds back contact details and answers with the notice instead.
      const res = await api.post<{ blocked: boolean; message: ChatMessage }>(`/portal/messages/${thread.id}`, { text });
      setThreads((all) =>
        all.map((t) =>
          t.id === thread.id
            ? { ...t, messages: [...t.messages, res.message], preview: res.blocked ? t.preview : text.slice(0, 40) }
            : t,
        ),
      );
      setDraft("");
      router.refresh();
      toast(res.blocked ? "Message blocked — contact details cannot be shared through Astrorize." : "Sent.");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    if (!thread || busy) return;
    setBusy(true);
    try {
      const { caseRef } = await api.post<{ caseRef: string }>("/portal/reports", {
        subject: `Customer ${thread.alias} reported from messages`,
      });
      toast(`Reported. Case reference ${caseRef} created.`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!thread) {
    return (
      <div>
        <PageHeader title="Messages" subtitle="Text only — files and attachments cannot be sent." />
        <Panel className="mt-5 p-5">
          <b className="text-[15px]">No messages yet</b>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-stone-500">Conversations with customers appear here.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Messages" subtitle="Text only — files and attachments cannot be sent." />
      <div className="mt-5 grid items-stretch gap-4 min-[900px]:min-h-[480px] min-[900px]:grid-cols-[260px_minmax(0,1fr)]">
        <Panel className="p-3.5">
          <div className="flex h-[38px] items-center gap-2 rounded-full border border-line bg-white px-[13px]">
            <span className="text-stone-400" aria-hidden="true">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search threads"
              aria-label="Search threads"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {visible.map((t) => {
              const on = t.id === thread.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  aria-current={on ? "true" : undefined}
                  className={`w-full rounded-xl border px-3 py-[11px] text-left ${
                    on ? "border-amber-300 bg-amber-100" : "border-line bg-white"
                  }`}
                >
                  <b className="block text-[13px] text-ink tabular-nums">{t.alias}</b>
                  <span className="mt-0.5 block truncate text-[11.5px] text-stone-500">{t.preview}</span>
                </button>
              );
            })}
            {visible.length === 0 && <p className="px-1 py-2 text-[12.5px] text-stone-500">No threads match “{query}”.</p>}
          </div>
        </Panel>

        <Panel className="relative flex flex-col p-4 sm:p-5">
          <div className="flex items-center gap-2.5 border-b border-line-soft pb-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-extrabold text-amber-800">
              {initials(thread.alias)}
            </span>
            <div className="min-w-0">
              <b className="text-[14.5px]">{thread.alias}</b>
              <div className="text-[11.5px] text-stone-500">Alias · customer details are kept private</div>
            </div>
            <button
              type="button"
              onClick={report}
              disabled={busy}
              className="ml-auto h-[34px] shrink-0 rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-stone-600"
            >
              Report
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 py-4" aria-live="polite">
            {thread.messages.map((m, i) =>
              m.from === "blocked" ? (
                <div key={i} className="flex items-start gap-2.5 rounded-[14px] border border-rose-200 bg-rose-50 px-[15px] py-[13px]">
                  <span className="text-rose-700">✕</span>
                  <div className="text-[12.5px] leading-[1.5] text-rose-900">
                    <b>Message blocked.</b> {m.text}
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  className={`max-w-[85%] border px-3.5 py-[11px] text-[13.5px] leading-[1.5] text-ink sm:max-w-[66%] ${
                    m.from === "me"
                      ? "self-end rounded-[14px_14px_4px_14px] border-amber-200 bg-amber-100"
                      : "self-start rounded-[14px_14px_14px_4px] border-line bg-white"
                  }`}
                >
                  {m.text}
                </div>
              ),
            )}
          </div>
          <form
            className="flex gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message… (text only)"
              aria-label="Message"
              className="h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none"
            />
            <button type="submit" disabled={busy} className="h-[46px] rounded-xl bg-amber-500 px-[22px] text-sm font-bold text-ink">
              Send
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
