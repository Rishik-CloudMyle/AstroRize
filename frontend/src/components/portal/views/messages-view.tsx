"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api/client";
import { byNameMatch } from "@/lib/format";
import { MAX_MESSAGE_LENGTH, MAX_SUPPORT_MESSAGE_LENGTH, MESSAGE_POLL_MS, messageTime } from "@/lib/messages";
import type { ChatMessage, CustomerThread, TeamMessage, Thread, ThreadCustomerDetail } from "@/lib/portal/types";
import { useErrorToast, usePortalState, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";
import { Avatar, PersonProfileDialog } from "./live-queue-people";

/** The customer's real name; only older conversations not linked to an account show the alias. */
const customerName = (t: CustomerThread) => t.customer?.name ?? `Customer ${t.alias}`;
const nameOf = (t: Thread) => (t.kind === "team" ? t.title : customerName(t));
const initialsOf = (t: CustomerThread) => t.customer?.initials ?? t.alias.replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
/** Something the astrologer hasn't opened yet (a customer's or the team's new messages). */
const needsAttention = (t: Thread) => t.unread > 0;

/** Round "A" mark for conversations with the Astrorize team. */
function TeamAvatar({ size }: { size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-2 border-amber-300 bg-ink font-display font-semibold text-amber-300"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      A
    </span>
  );
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
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const closeProfile = useCallback(() => setProfileOf(null), []);
  const threadPanel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Bumped on every send, so a refresh that started before it can't wipe the new message.
  const version = useRef(0);

  const thread = threads.find((t) => t.id === selectedId) ?? threads[0];
  const q = query.trim().toLowerCase();
  const visible = byNameMatch(
    threads.filter(
      (t) => !q || nameOf(t).toLowerCase().includes(q) || t.preview.toLowerCase().includes(q) || (t.kind === "team" && (t.subject ?? "").toLowerCase().includes(q)),
    ),
    q,
    nameOf,
  );

  // New messages from customers and the team arrive without a reload while the page is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const started = version.current;
      api
        .get<{ threads: Thread[] }>("/portal/messages")
        .then((res) => started === version.current && setThreads(res.threads))
        .catch(() => {}); // A missed refresh is retried on the next tick.
    }, MESSAGE_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // A conversation on screen counts as read: tell the API (it's saved, so it stays read after a
  // restart or on another device), then refresh the nav badge.
  const unreadId = thread && thread.unread > 0 ? thread.id : null;
  const unreadKind = thread?.kind;
  useEffect(() => {
    if (!unreadId) return;
    let cancelled = false;
    const path = unreadKind === "team" ? `/portal/team-messages/${encodeURIComponent(unreadId)}/read` : `/portal/messages/${encodeURIComponent(unreadId)}/read`;
    api
      .post(path)
      .then(() => {
        if (cancelled) return;
        setThreads((all) => all.map((t) => (t.id === unreadId ? { ...t, unread: 0 } : t)));
        router.refresh();
      })
      .catch(() => {}); // Tried again on the next refresh while it is still unread.
    return () => {
      cancelled = true;
    };
  }, [unreadId, unreadKind, router]);

  // Keep the latest message in view.
  const lastId = thread?.messages.at(-1)?.id;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.id, lastId]);

  const select = (id: string) => {
    setSelectedId(id);
    // On a phone the conversation sits below the list: bring it into view.
    if (window.matchMedia("(max-width: 899px)").matches) {
      requestAnimationFrame(() => threadPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !thread || busy) return;
    setBusy(true);
    version.current++;
    try {
      if (thread.kind === "team") {
        const res = await api.post<{ message: { id: string; text: string; at: string } }>(
          `/portal/team-messages/${encodeURIComponent(thread.id)}`,
          { text },
        );
        version.current++;
        const mine: TeamMessage = { ...res.message, from: "me", author: null };
        setThreads((all) =>
          all.map((t) =>
            t.id === thread.id && t.kind === "team"
              ? { ...t, messages: [...t.messages, mine], preview: text.slice(0, 100), lastAt: mine.at, lastFromMe: true, unread: 0 }
              : t,
          ),
        );
        setDraft("");
        router.refresh();
        toast("Sent to the Astrorize team.");
        return;
      }
      // The API holds back contact details and answers with the notice instead.
      const res = await api.post<{ blocked: boolean; message: ChatMessage }>(`/portal/messages/${thread.id}`, { text });
      version.current++;
      setThreads((all) =>
        all.map((t) =>
          t.id === thread.id && t.kind === "customer"
            ? {
                ...t,
                messages: [...t.messages, res.message],
                ...(res.blocked ? {} : { preview: text.slice(0, 80), lastAt: res.message.at, awaitingReply: false, unread: 0 }),
              }
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
    if (!thread || thread.kind !== "customer" || busy) return;
    setBusy(true);
    try {
      const { caseRef } = await api.post<{ caseRef: string }>("/portal/reports", {
        subject: `Customer ${customerName(thread).slice(0, 60)} (${thread.alias}) reported from messages`,
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
          <p className="mt-1 text-[12.5px] leading-[1.5] text-stone-500">
            Customers can message you here, and so can the Astrorize team. New messages appear on their own.
          </p>
        </Panel>
      </div>
    );
  }

  const customer = thread.kind === "customer" ? thread.customer : null;
  const headerPerson =
    thread.kind === "team" ? (
      <>
        <TeamAvatar size={40} />
        <span className="min-w-0 text-left">
          <b className="block truncate text-[14.5px] text-ink">{thread.title}</b>
          <span className="block truncate text-[11.5px] text-stone-500">{thread.subject ?? "A message from the Astrorize team"}</span>
        </span>
      </>
    ) : (
      <>
        <Avatar photoUrl={customer?.photoUrl ?? null} initials={initialsOf(thread)} size={40} />
        <span className="min-w-0 text-left">
          <b className="block truncate text-[14.5px] text-ink">{customerName(thread)}</b>
          <span className="block truncate text-[11.5px] text-stone-500">
            {customer ? [customer.line, "View profile"].filter(Boolean).join(" · ") : "Customer details are kept private"}
          </span>
        </span>
      </>
    );

  return (
    <div>
      <PageHeader title="Messages" subtitle="Text only — files and attachments cannot be sent." />
      <div className="mt-5 grid items-stretch gap-4 min-[900px]:min-h-[480px] min-[900px]:grid-cols-[280px_minmax(0,1fr)]">
        <Panel className="min-w-0 p-3.5">
          <div className="flex h-[38px] items-center gap-2 rounded-full border border-line bg-white px-[13px]">
            <span className="text-stone-400" aria-hidden="true">
              ⌕
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or message"
              aria-label="Search conversations"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {visible.map((t) => {
              const on = t.id === thread.id;
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${on ? "border-amber-300 bg-amber-100" : "border-line bg-white"}`}
                >
                  {t.kind === "team" ? (
                    <TeamAvatar size={38} />
                  ) : t.customer ? (
                    <button
                      type="button"
                      onClick={() => {
                        select(t.id);
                        setProfileOf(t.id);
                      }}
                      aria-label={`View ${customerName(t)}'s profile`}
                      className="shrink-0 rounded-full"
                    >
                      <Avatar photoUrl={t.customer.photoUrl} initials={t.customer.initials} size={38} />
                    </button>
                  ) : (
                    <Avatar photoUrl={null} initials={initialsOf(t)} size={38} />
                  )}
                  <button
                    type="button"
                    onClick={() => select(t.id)}
                    aria-current={on ? "true" : undefined}
                    className="min-w-0 flex-1 py-0.5 text-left"
                  >
                    <span className="flex items-baseline gap-2">
                      <b className="min-w-0 flex-1 truncate text-[13px] text-ink">{nameOf(t)}</b>
                      {t.lastAt && <span className="shrink-0 text-[10.5px] text-stone-500">{messageTime(t.lastAt)}</span>}
                    </span>
                    {t.kind === "team" && t.subject && <span className="block truncate text-[11px] text-stone-500">{t.subject}</span>}
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-stone-500">
                        {t.kind === "team" && t.lastFromMe ? "You: " : ""}
                        {t.preview || "No messages yet"}
                      </span>
                      {needsAttention(t) && !on && (
                        <span
                          className="size-2 shrink-0 rounded-full bg-urgent"
                          role="img"
                          aria-label={t.kind === "team" ? "New message from the Astrorize team" : "New message from the customer"}
                        />
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
            {visible.length === 0 && <p className="px-1 py-2 text-[12.5px] break-words text-stone-500">No conversations match “{query}”.</p>}
          </div>
        </Panel>

        <Panel className="relative flex min-w-0 flex-col p-4 sm:p-5">
          <div ref={threadPanel} className="flex scroll-mt-20 items-center gap-2.5 border-b border-line-soft pb-3.5">
            {customer ? (
              <button
                type="button"
                onClick={() => setProfileOf(thread.id)}
                aria-label={`View ${nameOf(thread)}'s profile`}
                className="flex min-w-0 items-center gap-2.5 rounded-xl"
              >
                {headerPerson}
              </button>
            ) : (
              <div className="flex min-w-0 items-center gap-2.5">{headerPerson}</div>
            )}
            {thread.kind === "customer" && (
              <button
                type="button"
                onClick={report}
                disabled={busy}
                className="ml-auto h-[34px] shrink-0 rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-stone-600"
              >
                Report
              </button>
            )}
          </div>
          <div ref={list} className="flex max-h-[60vh] flex-1 flex-col gap-2.5 overflow-y-auto py-4 min-[900px]:max-h-[520px]" aria-live="polite">
            {thread.kind === "team" && (
              <p className="mx-auto max-w-[46ch] rounded-full bg-cream px-3.5 py-1.5 text-center text-[11.5px] leading-normal text-stone-500">
                A conversation with the Astrorize team. Customers can&apos;t see it.
              </p>
            )}
            {thread.kind === "team"
              ? thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] border px-3.5 py-[9px] text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[66%] ${
                      m.from === "me"
                        ? "self-end rounded-[14px_14px_4px_14px] border-amber-200 bg-amber-100"
                        : "self-start rounded-[14px_14px_14px_4px] border-line bg-white"
                    }`}
                  >
                    {m.author && <span className="mb-0.5 block text-[11px] font-bold text-plum">{m.author}</span>}
                    {m.text}
                    <span className="mt-0.5 block text-right text-[10.5px] text-stone-500">{messageTime(m.at, true)}</span>
                  </div>
                ))
              : thread.messages.map((m) =>
                  m.from === "blocked" ? (
                    <div key={m.id} className="flex items-start gap-2.5 rounded-[14px] border border-rose-200 bg-rose-50 px-[15px] py-[13px]">
                      <span className="text-rose-700">✕</span>
                      <div className="text-[12.5px] leading-[1.5] text-rose-900">
                        <b>Message blocked.</b> {m.text}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className={`max-w-[85%] border px-3.5 py-[9px] text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[66%] ${
                        m.from === "me"
                          ? "self-end rounded-[14px_14px_4px_14px] border-amber-200 bg-amber-100"
                          : "self-start rounded-[14px_14px_14px_4px] border-line bg-white"
                      }`}
                    >
                      {m.text}
                      <span className="mt-0.5 block text-right text-[10.5px] text-stone-500">{messageTime(m.at, true)}</span>
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
              maxLength={thread.kind === "team" ? MAX_SUPPORT_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH}
              placeholder={thread.kind === "team" ? "Reply to the Astrorize team…" : "Type a message… (text only)"}
              aria-label={thread.kind === "team" ? "Reply to the Astrorize team" : "Message"}
              className="h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none"
            />
            <button type="submit" disabled={busy} className="h-[46px] rounded-xl bg-amber-500 px-[22px] text-sm font-bold text-ink">
              Send
            </button>
          </form>
        </Panel>
      </div>

      {/* Rendered on <body> so no panel effect can trap the fixed overlay; centred on every screen size. */}
      {profileOf &&
        createPortal(
          <PersonProfileDialog
            key={profileOf}
            url={`/portal/messages/${encodeURIComponent(profileOf)}/customer`}
            read={(body) => {
              const person = (body as { person: ThreadCustomerDetail }).person;
              const n = person.history.consultations;
              return {
                alias: person.alias,
                profile: person.profile,
                badges: [
                  { label: n === 0 ? "No consultations with you yet" : `${n} consultation${n === 1 ? "" : "s"} with you`, tone: "amber" },
                  ...(person.history.lastConsultation
                    ? [{ label: `Last on ${person.history.lastConsultation}`, tone: "plain" as const }]
                    : []),
                ],
              };
            }}
            note="Shared with you only because this customer is in a conversation with you. Use it to prepare; don't save or share it."
            onClose={closeProfile}
          />,
          document.body,
        )}
    </div>
  );
}
