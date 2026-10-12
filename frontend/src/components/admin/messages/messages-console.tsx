"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { ApiError, api } from "@/lib/api/client";
import { ROLE_LABELS } from "@/lib/admin/constants";
import type { InboxConversation, InboxMessage, InboxThread } from "@/lib/admin/types";
import { messageTime } from "@/lib/messages";
import NewMessageDialog from "./new-message-dialog";
import { GroupAvatar, KindTag, MAX_DIRECT_LENGTH, PersonAvatar, announceUnread, peopleTitle, usePoll } from "./parts";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");

const PANE_BOX = "min-h-0 flex-col overflow-hidden rounded-[18px] border border-line bg-paper shadow-[0_10px_26px_rgba(90,62,40,.08)]";
const PANE = `flex ${PANE_BOX}`;

/** Keeps ?c=<id> in the address bar in step with the open conversation, without a server round trip. */
function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The console's Messages: my conversations on the left (search, unread counts, New message),
 * the open conversation on the right. Both refresh every 10 seconds while the tab is visible.
 */
export default function MessagesConsole({
  initialInbox,
  initialThread,
}: {
  initialInbox: InboxConversation[];
  initialThread: InboxThread | null;
}) {
  const { session } = useAdmin();
  const [inbox, setInbox] = useState(initialInbox);
  const [inboxError, setInboxError] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialThread?.id ?? null);
  const [thread, setThread] = useState<InboxThread | null>(initialThread);
  const [threadError, setThreadError] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  // Bumped on every send and every switch, so a refresh that started earlier can't overwrite newer state.
  const version = useRef(0);
  const openRef = useRef(openId);
  useEffect(() => {
    openRef.current = openId;
  }, [openId]);

  const loadInbox = useCallback(async () => {
    try {
      const res = await api.get<{ conversations: InboxConversation[]; unread: number }>("/admin/messages");
      setInbox(res.conversations);
      setInboxError("");
      announceUnread(res.unread);
    } catch (e) {
      setInboxError(errorText(e));
    }
  }, []);

  /** Loads (and so marks read) one conversation. */
  const loadThread = useCallback(async (id: string) => {
    const started = version.current;
    try {
      const res = await api.get<{ conversation: InboxThread }>(`/admin/messages/${encodeURIComponent(id)}`);
      if (started !== version.current || openRef.current !== id) return;
      setThread(res.conversation);
      setThreadError("");
    } catch (e) {
      if (started !== version.current || openRef.current !== id) return;
      setThreadError(errorText(e));
    }
  }, []);

  const refresh = useCallback(async () => {
    const id = openRef.current;
    if (id) await loadThread(id);
    await loadInbox();
  }, [loadInbox, loadThread]);

  usePoll(() => void refresh());

  // The nav badge, as of this page's data (a conversation opened from the address bar is read now).
  useEffect(() => {
    announceUnread(initialInbox.reduce((n, c) => n + (c.id === initialThread?.id ? 0 : c.unread), 0));
  }, [initialInbox, initialThread]);

  const open = (id: string) => {
    if (id === openId && thread?.id === id) return;
    version.current++;
    openRef.current = id;
    setOpenId(id);
    setThread(null);
    setThreadError("");
    syncUrl(id);
    void loadThread(id).then(loadInbox);
  };

  const close = () => {
    version.current++;
    openRef.current = null;
    setOpenId(null);
    setThread(null);
    syncUrl(null);
  };

  const started = (id: string) => {
    setComposing(false);
    version.current++;
    openRef.current = id;
    setOpenId(id);
    setThread(null);
    setQuery("");
    syncUrl(id);
    void loadThread(id).then(loadInbox);
  };

  const q = query.trim().toLowerCase();
  const visible = inbox.filter(
    (c) =>
      !q ||
      c.people.some((p) => p.name.toLowerCase().includes(q) || p.line.toLowerCase().includes(q)) ||
      (c.subject ?? "").toLowerCase().includes(q) ||
      c.preview.toLowerCase().includes(q),
  );

  return (
    <>
      {/* Phones show one pane at a time: the list, or the open conversation (✕ goes back). */}
      <div className="mt-4 grid h-[calc(100dvh-170px)] min-h-[460px] grid-cols-1 gap-4 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] min-[1440px]:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-label="Conversations" className={`${PANE_BOX} ${openId ? "hidden md:flex" : "flex"}`}>
          <div className="flex-none border-b border-line-soft p-3">
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[11px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink"
            >
              <span aria-hidden="true">✎</span> New message
            </button>
            <div className="mt-2.5 flex h-[38px] items-center gap-2 rounded-full border border-line bg-white px-[13px]">
              <span className="text-stone-400" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations by name, subject or message"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {inboxError && (
              <p role="alert" className="m-2 rounded-[10px] bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                {inboxError}
              </p>
            )}
            {inbox.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <b className="text-[14px] text-ink">No conversations yet</b>
                <p className="mx-auto mt-1 max-w-[30ch] text-[12.5px] leading-normal text-[#78716c]">
                  Start one with a colleague, an astrologer or a customer. Replies arrive here.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <p className="px-3 py-4 text-[12.5px] break-words text-[#78716c]">No conversations match “{query.trim()}”.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {visible.map((c) => {
                  const on = c.id === openId;
                  const unread = on ? 0 : c.unread;
                  const title = peopleTitle(c.people);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => open(c.id)}
                        aria-current={on ? "true" : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left ${
                          on ? "border-amber-300 bg-amber-100" : "border-transparent hover:bg-cream"
                        }`}
                      >
                        <GroupAvatar people={c.people} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <b className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-ink" : "text-[#44403c]"}`}>{title}</b>
                            <span className="shrink-0 text-[10.5px] text-[#78716c]">{messageTime(c.lastAt)}</span>
                          </span>
                          <span className="block truncate text-[11px] text-[#78716c]">
                            {c.subject ?? (c.people.length === 1 ? c.people[0].line : `Group · ${c.people.length + 1} people`)}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className={`min-w-0 flex-1 truncate text-[12px] ${unread ? "font-semibold text-ink" : "text-[#78716c]"}`}>
                              {c.lastFromMe ? "You: " : ""}
                              {c.preview}
                            </span>
                            {unread > 0 && (
                              <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-urgent px-[5px] text-[10px] font-extrabold text-white">
                                <span aria-hidden="true">{unread}</span>
                                <span className="sr-only">{unread === 1 ? "1 unread message" : `${unread} unread messages`}</span>
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {openId ? (
          <Conversation
            key={openId}
            id={openId}
            thread={thread}
            error={threadError}
            me={{ id: session.id, name: session.name, initials: session.initials, line: ROLE_LABELS[session.role] }}
            onRetry={() => void loadThread(openId)}
            onClose={close}
            onSent={(message) => {
              version.current++;
              setThread((t) => (t && t.id === openId ? { ...t, messages: [...t.messages, message] } : t));
              setInbox((all) => {
                const hit = all.find((c) => c.id === openId);
                if (!hit) return all;
                const moved = { ...hit, preview: message.text.slice(0, 100), lastAt: message.at, lastFromMe: true, unread: 0 };
                return [moved, ...all.filter((c) => c.id !== openId)];
              });
            }}
          />
        ) : (
          <section className={`${PANE_BOX} hidden items-center justify-center p-8 text-center md:flex`}>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl text-amber-800" aria-hidden="true">
              ✉
            </div>
            <p className="mt-3 max-w-[40ch] text-[13px] leading-normal text-[#78716c]">
              {inbox.length ? "Choose a conversation to read and reply, or start a new one." : "Your conversations will appear here."}
            </p>
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="mt-4 h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-ink"
            >
              New message
            </button>
          </section>
        )}
      </div>

      {composing && <NewMessageDialog onClose={() => setComposing(false)} onStarted={started} />}
    </>
  );
}

function Conversation({
  id,
  thread,
  error,
  me,
  onRetry,
  onClose,
  onSent,
}: {
  id: string;
  thread: InboxThread | null;
  error: string;
  me: { id: string; name: string; initials: string; line: string };
  onRetry: () => void;
  onClose: () => void;
  onSent: (message: InboxMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const lastId = thread?.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !thread?.canSend) return;
    setSending(true);
    setSendError("");
    try {
      const res = await api.post<{ message: { id: string; text: string; at: string } }>(`/admin/messages/${encodeURIComponent(id)}`, { text });
      onSent({ ...res.message, mine: true, author: { ...me, kind: "staff", photo: null } });
      setDraft("");
    } catch (e) {
      setSendError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  if (!thread) {
    return (
      <section className={`${PANE} p-5`} aria-busy={!error}>
        {error ? (
          <div className="m-auto max-w-[40ch] text-center">
            <p role="alert" className="text-[13px] text-[#57534e]">
              {error}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={onRetry} className="h-9 rounded-[10px] border border-line bg-white px-4 text-[12.5px] font-bold">
                Try again
              </button>
              <button type="button" onClick={onClose} className="h-9 rounded-[10px] border border-line bg-white px-4 text-[12.5px] font-bold">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            <div className="h-12 rounded-xl bg-cream" />
            <div className="flex-1 rounded-xl bg-cream/60" />
          </div>
        )}
      </section>
    );
  }

  const group = thread.people.length > 1;
  const title = peopleTitle(thread.people);

  return (
    <section aria-label={`Conversation with ${title}`} className={PANE}>
      <header className="flex flex-none items-center gap-3 border-b border-line-soft px-4 py-3">
        <GroupAvatar people={thread.people} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[15px] font-bold text-ink">{thread.subject ?? title}</h2>
          <p className="m-0 truncate text-[11.5px] text-[#78716c]">
            {thread.subject ? `${title} · ` : ""}
            {group ? `${thread.people.length + 1} people` : thread.people[0]?.line}
            {thread.startedBy ? ` · started by ${thread.startedBy === me.name ? "you" : thread.startedBy}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation"
          className="grid h-8 w-8 flex-none place-items-center rounded-[9px] border-0 bg-cream text-[14px] text-[#57534e]"
        >
          ✕
        </button>
      </header>

      {group && (
        <ul aria-label="People in this conversation" className="flex flex-none flex-wrap gap-1.5 border-b border-line-soft px-4 py-2">
          {thread.people.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pr-2.5 pl-0.5 text-[11.5px]">
              <PersonAvatar person={p} size={20} />
              <b className="text-ink">{p.name}</b>
              <span className="text-[#78716c]">{p.line}</span>
            </li>
          ))}
        </ul>
      )}

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {thread.messages.map((m, i) => {
          const prev = thread.messages[i - 1];
          const showAuthor = !m.mine && (prev?.author.id !== m.author.id || prev?.mine);
          return (
            <div key={m.id} className={`flex max-w-[78%] flex-col ${m.mine ? "self-end items-end" : "self-start items-start"}`}>
              {showAuthor && (
                <span className="mb-1 flex items-center gap-1.5 text-[11.5px]">
                  <PersonAvatar person={m.author} size={20} />
                  <b className="text-ink">{m.author.name}</b>
                  <KindTag kind={m.author.kind} />
                </span>
              )}
              <div
                className={`border px-3.5 py-[9px] text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-ink ${
                  m.mine ? "rounded-[14px_14px_4px_14px] border-amber-200 bg-amber-100" : "rounded-[14px_14px_14px_4px] border-line bg-white"
                }`}
              >
                {m.text}
                <span className="mt-0.5 block text-right text-[10.5px] text-[#78716c]">{messageTime(m.at, true)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {thread.canSend ? (
        <form
          className="flex-none border-t border-line-soft px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {sendError && (
            <p role="alert" className="mb-2 text-[12px] text-rose-700">
              {sendError}
            </p>
          )}
          <div className="flex items-end gap-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter starts a new line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={MAX_DIRECT_LENGTH}
              placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
              aria-label={`Message ${title}`}
              className="max-h-[160px] min-h-[46px] min-w-0 flex-1 resize-y rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="h-[46px] shrink-0 rounded-xl border-0 bg-amber-500 px-[22px] text-[13px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {draft.length > MAX_DIRECT_LENGTH - 200 && (
            <p className="mt-1 text-right text-[11px] text-[#78716c]">
              {draft.length.toLocaleString("en-IN")} / {MAX_DIRECT_LENGTH.toLocaleString("en-IN")}
            </p>
          )}
        </form>
      ) : (
        <p className="m-0 flex-none border-t border-line-soft bg-cream/60 px-4 py-3 text-[12.5px] text-[#57534e]">{thread.notice}</p>
      )}
    </section>
  );
}
