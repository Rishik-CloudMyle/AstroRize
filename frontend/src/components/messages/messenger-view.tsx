"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { homeFor } from "@/lib/auth";
import {
  MAX_MESSAGE_LENGTH,
  MAX_SUPPORT_MESSAGE_LENGTH,
  MESSAGE_POLL_MS,
  givenName,
  messageTime,
  type AstrologerMatch,
  type ConversationDetail,
  type ConversationSummary,
  type MessengerAstrologer,
  type MessengerMessage,
  type SupportDetail,
  type SupportMessage,
  type SupportSummary,
} from "@/lib/messages";
import { useHydrated, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

// Which message this device last saw in each conversation: clears the unread dot at once, before the
// server's count (GET /messages → unread, saved when a conversation is opened) catches up.
const SEEN_KEY = "astrorize:messages-seen";
type Seen = Record<string, string>;

function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Seen;
  } catch {
    return {};
  }
}

function writeSeen(seen: Seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Private mode or storage blocked: the dot just won't be remembered.
  }
}

/** Runs `tick` every 10 s while the tab is visible, and again when it comes back into view. */
function usePoll(tick: () => void) {
  const ref = useRef(tick);
  useEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    const run = () => document.visibilityState === "visible" && ref.current();
    const id = setInterval(run, MESSAGE_POLL_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
}

function Photo({ a, size }: { a: MessengerAstrologer; size: number }) {
  return (
    <Image
      src={a.photo}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border-2 border-gold object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Astrologer Messenger for signed-in customers: the conversation list and, with `slug`, one
 * conversation. On a phone the list and the conversation are separate screens.
 */
export default function MessengerView({ slug, supportId }: { slug?: string; supportId?: string }) {
  const hydrated = useHydrated();
  const session = useSession();
  const { openLogin } = useAppUI();

  if (!hydrated || !session.ready) {
    return <div className="h-[420px] rounded-[22px] border border-line bg-paper" aria-busy="true" />;
  }

  if (!session.loggedIn) {
    return (
      <div className="mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          🔒
        </div>
        <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">Log in to see your messages</h2>
        <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-normal text-stone-600">
          Your conversations with astrologers are private to your account.
        </p>
        <button type="button" onClick={() => openLogin()} className="az-cta mt-6 h-12 rounded-full px-8 text-[15px] font-bold">
          Log in
        </button>
      </div>
    );
  }

  if (session.role !== "customer") {
    return (
      <div className="mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          👋
        </div>
        <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">Messages here are for customer accounts</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-normal text-stone-600">
          You&apos;re signed in as {session.role === "astrologer" ? "an astrologer account" : "an Astrorize staff account"}.{" "}
          {session.role === "astrologer"
            ? "Your conversations with customers are in the Messages section of your portal."
            : "Your tools are in the admin console."}
        </p>
        <Link
          href={session.role === "astrologer" ? "/portal/messages" : homeFor(session.role)}
          className="az-cta mt-6 inline-flex h-12 items-center rounded-full px-8 text-[15px] font-bold hover:text-cta-ink hover:no-underline"
        >
          {session.role === "astrologer" ? "Open portal messages" : "Open the admin console"}
        </Link>
      </div>
    );
  }

  return <SignedInMessenger slug={slug} supportId={supportId} />;
}

function SignedInMessenger({ slug, supportId }: { slug?: string; supportId?: string }) {
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [support, setSupport] = useState<SupportSummary[]>([]);
  const [listError, setListError] = useState("");
  const [query, setQuery] = useState("");
  // Mounted only after hydration, so the browser's storage can be read straight away.
  const [seen, setSeen] = useState<Seen>(readSeen);
  const open = slug ?? supportId;

  const loadList = useCallback(() => {
    api
      .get<{ conversations: ConversationSummary[]; support?: SupportSummary[] }>("/messages")
      .then((res) => {
        setList(res.conversations);
        setSupport(res.support ?? []);
        setListError("");
      })
      .catch((e) => setListError(errorText(e)));
  }, []);

  useEffect(loadList, [loadList]);
  usePoll(loadList);

  const markSeen = useCallback((id: string, at: string) => {
    setSeen((s) => {
      if (s[id] && s[id] >= at) return s;
      const next = { ...readSeen(), ...s, [id]: at };
      writeSeen(next);
      return next;
    });
  }, []);

  const q = query.trim().toLowerCase();
  const matching = list?.filter((c) => !q || c.astrologer.name.toLowerCase().includes(q)) ?? [];
  const matchingSupport = support.filter((c) => !q || "astrorize support".includes(q) || (c.subject ?? "").toLowerCase().includes(q));
  const known = new Set(list?.map((c) => c.astrologer.slug));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section
        aria-label="Conversations"
        className={`min-w-0 self-start rounded-[22px] border border-line bg-paper p-3 ${open ? "hidden lg:block" : ""}`}
      >
        <div className="mb-3 flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 focus-within:border-amber-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-400" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={60}
            placeholder="Search astrologers"
            aria-label="Search astrologers by name"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none"
          />
        </div>

        {list === null && !listError && (
          <div aria-busy="true" className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[66px] rounded-2xl bg-cream" />
            ))}
          </div>
        )}
        {listError && list === null && (
          <div className="p-3">
            <p role="alert" className="text-[13.5px] text-stone-600">
              {listError}
            </p>
            <button type="button" onClick={loadList} className="mt-3 h-10 rounded-xl border border-line bg-white px-4 text-sm font-bold">
              Try again
            </button>
          </div>
        )}
        {list && !q && list.length === 0 && support.length === 0 && (
          <div className="px-3 py-6 text-center">
            <b className="text-[15px] text-ink">No messages yet</b>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-normal text-stone-600">
              Search for an astrologer above to start a free conversation, or browse the directory.
            </p>
            <Link
              href="/astrologers"
              className="az-cta mt-4 inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-bold hover:text-cta-ink hover:no-underline"
            >
              Find an astrologer
            </Link>
          </div>
        )}
        {list && (matchingSupport.length > 0 || matching.length > 0) && (
          <>
            {q && <h2 className="mb-1.5 px-2 text-[11px] font-bold tracking-[.1em] text-stone-500 uppercase">Your conversations</h2>}
            <ul className="flex flex-col gap-1.5">
              {matchingSupport.map((c) => {
                const on = c.id === supportId;
                const unread = !on && c.unread > 0;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages/support/${c.id}`}
                      aria-current={on ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 hover:no-underline ${
                        on ? "border-amber-300 bg-amber-100" : "border-transparent hover:bg-cream"
                      }`}
                    >
                      <SupportBadge size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <b className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-ink" : "text-plum"}`}>{c.title}</b>
                          <span className="shrink-0 text-[11px] text-stone-500">{messageTime(c.lastAt)}</span>
                        </span>
                        {c.subject && <span className="block truncate text-[11.5px] text-stone-500">{c.subject}</span>}
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "font-semibold text-ink" : "text-stone-500"}`}>
                            {c.lastFromMe ? "You: " : ""}
                            {c.preview}
                          </span>
                          {unread && <span className="size-2.5 shrink-0 rounded-full bg-urgent" role="img" aria-label="New message" />}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {matching.map((c) => {
                const on = c.astrologer.slug === slug;
                // The server's count (saved, so it holds on every device); what this tab just saw clears it at once.
                const unread = !on && c.unread > 0 && !(c.lastAt && seen[c.id] && seen[c.id] >= c.lastAt);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages/${c.astrologer.slug}`}
                      aria-current={on ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 hover:no-underline ${
                        on ? "border-amber-300 bg-amber-100" : "border-transparent hover:bg-cream"
                      }`}
                    >
                      <Photo a={c.astrologer} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <b className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-ink" : "text-plum"}`}>{c.astrologer.name}</b>
                          {c.lastAt && <span className="shrink-0 text-[11px] text-stone-500">{messageTime(c.lastAt)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "font-semibold text-ink" : "text-stone-500"}`}>
                            {c.preview ? `${c.lastFrom === "me" ? "You: " : ""}${c.preview}` : "No messages yet"}
                          </span>
                          {unread && <span className="size-2.5 shrink-0 rounded-full bg-urgent" role="img" aria-label="New message" />}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {list && q && <StartConversation query={query.trim()} known={known} hasMatches={matching.length + matchingSupport.length > 0} />}
      </section>

      {slug ? (
        <Conversation key={slug} slug={slug} onChange={loadList} onSeen={markSeen} />
      ) : supportId ? (
        <SupportConversation key={supportId} id={supportId} onChange={loadList} />
      ) : (
        <section className="hidden min-h-[420px] place-items-center rounded-[22px] border border-line bg-paper p-8 text-center lg:grid">
          <div>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
              ✉
            </div>
            <p className="mt-3 text-sm text-stone-600">
              {list && list.length + support.length > 0
                ? "Choose a conversation to read and reply, or search for an astrologer to message."
                : "Search for an astrologer to start a free conversation."}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

/** Round "A" mark for conversations with the Astrorize team. */
function SupportBadge({ size }: { size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-2 border-gold bg-ink font-display font-semibold text-amber-300"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      A
    </span>
  );
}

const PRESENCE: Record<AstrologerMatch["presence"], { label: string; cls: string }> = {
  on: { label: "Online", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  busy: { label: "Busy", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  live: { label: "Live", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  off: { label: "Offline", cls: "bg-stone-100 text-stone-600 border-stone-200" },
};

/** Astrologers matching the search that the customer hasn't messaged yet. */
function StartConversation({ query, known, hasMatches }: { query: string; known: Set<string>; hasMatches: boolean }) {
  const [found, setFound] = useState<{ q: string; astrologers: AstrologerMatch[] } | null>(null);
  const [error, setError] = useState<{ q: string; text: string } | null>(null);
  const short = query.length < 2;

  // Searches a moment after typing stops; an answer for an older search is ignored.
  useEffect(() => {
    if (short) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ astrologers: AstrologerMatch[] }>(`/messages/search/astrologers?q=${encodeURIComponent(query)}`)
        .then((res) => !cancelled && setFound({ q: query, astrologers: res.astrologers }))
        .catch((e) => !cancelled && setError({ q: query, text: errorText(e) }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, short]);

  if (short) {
    return hasMatches ? null : <p className="px-2 py-3 text-[13px] text-stone-500">Type at least two letters to find an astrologer.</p>;
  }
  if (error?.q === query) {
    return (
      <p role="alert" className="px-2 py-3 text-[13px] text-stone-600">
        {error.text}
      </p>
    );
  }
  const loading = found?.q !== query;
  const fresh = found?.astrologers.filter((a) => !known.has(a.slug)) ?? [];

  return (
    <div className="mt-3" aria-busy={loading}>
      <h2 className="mb-1.5 px-2 text-[11px] font-bold tracking-[.1em] text-stone-500 uppercase">Start a conversation</h2>
      {loading && !found ? (
        <div className="h-[66px] rounded-2xl bg-cream" />
      ) : fresh.length === 0 ? (
        <p role="status" className="px-2 py-2 text-[13px] break-words text-stone-500">
          {(found?.astrologers.length ?? 0) > 0
            ? "You already have a conversation with everyone who matches."
            : `No astrologers match “${query}”.`}
        </p>
      ) : (
        <ul className={`flex flex-col gap-1.5 ${loading ? "opacity-60" : ""}`}>
          {fresh.map((a) => {
            const p = PRESENCE[a.presence];
            return (
              <li key={a.id}>
                <Link
                  href={`/messages/${a.slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 hover:bg-cream hover:no-underline"
                >
                  <Photo a={a} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <b className="min-w-0 flex-1 truncate text-[14px] text-plum">{a.name}</b>
                      <span className={`shrink-0 rounded-full border px-2 py-px text-[10.5px] font-bold ${p.cls}`}>{p.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-stone-500">{a.skills.join(" · ") || "Astrologer"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Conversation({
  slug,
  onChange,
  onSeen,
}: {
  slug: string;
  /** Something was sent: the list should refresh. */
  onChange: () => void;
  onSeen: (conversationId: string, at: string) => void;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  // Bumped on every send, so a refresh that started before it can't wipe the new message.
  const version = useRef(0);

  // No astrologer at this address: stop asking.
  const gone = useRef(false);

  const load = useCallback(() => {
    if (gone.current) return;
    const started = version.current;
    api
      .get<ConversationDetail>(`/messages/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (started !== version.current) return;
        setDetail(res);
        setLoadError("");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) gone.current = true;
        setLoadError(errorText(e));
      });
  }, [slug]);

  useEffect(load, [load]);
  usePoll(load);

  const messages = detail?.conversation?.messages ?? [];
  const last = messages.at(-1);
  const conversationId = detail?.conversation?.id;

  // Keep the newest message in view, and remember it was seen (clears the unread dot).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (conversationId && last) onSeen(conversationId, last.at);
  }, [conversationId, last, onSeen]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || !detail?.canMessage) return;
    setSending(true);
    setSendError("");
    version.current++;
    try {
      // The API holds back contact details and answers with the notice instead.
      const res = await api.post<{ conversationId: string; blocked: boolean; message: MessengerMessage }>(
        `/messages/${encodeURIComponent(slug)}`,
        { text },
      );
      version.current++;
      setDetail((d) =>
        d
          ? { ...d, conversation: { id: res.conversationId, messages: [...(d.conversation?.messages ?? []), res.message] } }
          : d,
      );
      setDraft("");
      onChange();
    } catch (e) {
      setSendError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  if (!detail) {
    return (
      <section className="flex min-h-[420px] flex-col rounded-[22px] border border-line bg-paper p-5">
        <BackLink />
        {loadError ? (
          <div className="m-auto max-w-[40ch] text-center">
            <p role="alert" className="text-sm text-stone-600">
              {loadError}
            </p>
            <Link href="/messages" className="mt-3 inline-block text-sm font-bold text-amber-700">
              Back to messages
            </Link>
          </div>
        ) : (
          <div aria-busy="true" className="mt-4 h-full flex-1 rounded-2xl bg-cream" />
        )}
      </section>
    );
  }

  const a = detail.astrologer;
  const given = givenName(a.name);

  return (
    <section
      aria-label={`Conversation with ${a.name}`}
      className="flex h-[calc(100dvh-200px)] min-h-[440px] flex-col rounded-[22px] border border-line bg-paper lg:h-[620px]"
    >
      <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3 sm:px-5">
        <BackLink />
        <Link href={`/astrologer/${a.slug}`} className="flex min-w-0 items-center gap-3 hover:no-underline">
          <Photo a={a} size={42} />
          <span className="min-w-0">
            <b className="block truncate text-[15px] text-plum">{a.name}</b>
            <span className="block truncate text-[12px] text-stone-500">Astrologer Messenger · Free · text only</span>
          </span>
        </Link>
      </header>

      <div ref={scroller} className="flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-live="polite">
        <p className="mx-auto max-w-[44ch] rounded-full bg-cream px-3.5 py-1.5 text-center text-[11.5px] leading-normal text-stone-500">
          Direct customer ↔ astrologer message. Not an assistant.
        </p>
        {messages.length === 0 &&
          (detail.canMessage ? (
            <p className="mx-auto mt-6 max-w-[40ch] text-center text-[13.5px] leading-normal text-stone-600">
              This is a free direct message with {given} — write when you are ready.
            </p>
          ) : (
            <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-line bg-white p-5 text-center">
              <b className="text-[15px] text-ink">You can&apos;t message {given} right now</b>
              <p className="mt-1.5 text-[13px] leading-normal text-stone-600">{detail.notice}</p>
              <Link
                href="/astrologers"
                className="az-cta mt-4 inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-bold hover:text-cta-ink hover:no-underline"
              >
                Find another astrologer
              </Link>
            </div>
          ))}
        {messages.map((m) =>
          m.from === "blocked" ? (
            <div key={m.id} className="flex items-start gap-2.5 rounded-[14px] border border-rose-200 bg-rose-50 px-[15px] py-[13px]">
              <span className="text-rose-700" aria-hidden="true">
                ✕
              </span>
              <div className="text-[12.5px] leading-[1.5] text-rose-900">
                <b>Message not sent.</b> {m.text}
              </div>
            </div>
          ) : (
            <div
              key={m.id}
              className={`max-w-[85%] border px-3.5 py-[9px] text-[14px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[70%] ${
                m.from === "me"
                  ? "self-end rounded-[16px_16px_4px_16px] border-amber-200 bg-amber-100"
                  : "self-start rounded-[16px_16px_16px_4px] border-line bg-white"
              }`}
            >
              {m.text}
              <span className="mt-0.5 block text-right text-[10.5px] text-stone-500">{messageTime(m.at, true)}</span>
            </div>
          ),
        )}
      </div>

      {detail.canMessage && (
        <form
          className="border-t border-line-soft px-3 py-3 sm:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {sendError && (
            <p role="alert" className="mb-2 text-[12.5px] text-rose-700">
              {sendError}
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Message"
              aria-label={`Message ${a.name}`}
              className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[14.5px] text-ink outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="az-cta h-12 shrink-0 rounded-full px-6 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-stone-500">Text only. Phone numbers, emails and other contact details are not delivered.</p>
        </form>
      )}
    </section>
  );
}

/** A conversation the Astrorize team started with this customer. Opening it marks it read. */
function SupportConversation({ id, onChange }: { id: string; onChange: () => void }) {
  const [detail, setDetail] = useState<SupportDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  // Bumped on every send, so a refresh that started before it can't wipe the new message.
  const version = useRef(0);
  const gone = useRef(false);
  const listUpdated = useRef(false);

  const load = useCallback(() => {
    if (gone.current) return;
    const started = version.current;
    api
      .get<{ conversation: SupportDetail }>(`/messages/support/${encodeURIComponent(id)}`)
      .then((res) => {
        if (started !== version.current) return;
        setDetail(res.conversation);
        setLoadError("");
        // Now read: let the list drop its unread dot.
        if (!listUpdated.current) {
          listUpdated.current = true;
          onChange();
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) gone.current = true;
        setLoadError(errorText(e));
      });
  }, [id, onChange]);

  useEffect(load, [load]);
  usePoll(load);

  const lastId = detail?.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || !detail) return;
    setSending(true);
    setSendError("");
    version.current++;
    try {
      const res = await api.post<{ message: { id: string; text: string; at: string } }>(`/messages/support/${encodeURIComponent(id)}`, { text });
      version.current++;
      const mine: SupportMessage = { ...res.message, from: "me", author: null };
      setDetail((d) => (d ? { ...d, messages: [...d.messages, mine] } : d));
      setDraft("");
      onChange();
    } catch (e) {
      setSendError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  if (!detail) {
    return (
      <section className="flex min-h-[420px] flex-col rounded-[22px] border border-line bg-paper p-5">
        <BackLink />
        {loadError ? (
          <div className="m-auto max-w-[40ch] text-center">
            <p role="alert" className="text-sm text-stone-600">
              {loadError}
            </p>
            <Link href="/messages" className="mt-3 inline-block text-sm font-bold text-amber-700">
              Back to messages
            </Link>
          </div>
        ) : (
          <div aria-busy="true" className="mt-4 h-full flex-1 rounded-2xl bg-cream" />
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={`Conversation with ${detail.title}`}
      className="flex h-[calc(100dvh-200px)] min-h-[440px] flex-col rounded-[22px] border border-line bg-paper lg:h-[620px]"
    >
      <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3 sm:px-5">
        <BackLink />
        <SupportBadge size={42} />
        <span className="min-w-0">
          <b className="block truncate text-[15px] text-plum">{detail.title}</b>
          <span className="block truncate text-[12px] text-stone-500">{detail.subject ?? "A message from the Astrorize team"}</span>
        </span>
      </header>

      <div ref={scroller} className="flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-live="polite">
        <p className="mx-auto max-w-[44ch] rounded-full bg-cream px-3.5 py-1.5 text-center text-[11.5px] leading-normal text-stone-500">
          You&apos;re talking with the Astrorize team. We will never ask for your password or OTP.
        </p>
        {detail.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] border px-3.5 py-[9px] text-[14px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[70%] ${
              m.from === "me"
                ? "self-end rounded-[16px_16px_4px_16px] border-amber-200 bg-amber-100"
                : "self-start rounded-[16px_16px_16px_4px] border-line bg-white"
            }`}
          >
            {m.author && <span className="mb-0.5 block text-[11.5px] font-bold text-plum">{m.author}</span>}
            {m.text}
            <span className="mt-0.5 block text-right text-[10.5px] text-stone-500">{messageTime(m.at, true)}</span>
          </div>
        ))}
      </div>

      <form
        className="border-t border-line-soft px-3 py-3 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {sendError && (
          <p role="alert" className="mb-2 text-[12.5px] text-rose-700">
            {sendError}
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
            placeholder="Reply"
            aria-label="Reply to Astrorize support"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[14.5px] text-ink outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="az-cta h-12 shrink-0 rounded-full px-6 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/messages"
      aria-label="Back to all messages"
      className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-white text-ink hover:no-underline lg:hidden"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  );
}
