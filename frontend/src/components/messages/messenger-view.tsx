"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { homeFor } from "@/lib/auth";
import { byNameMatch } from "@/lib/format";
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
import { AppTopbar } from "../mobile/page-title";
import { ATTACH_LIMITS, AttachButton, AttachmentChip, MessageMedia, uploadFile, useAttachment } from "./message-media";
import { reportContactAttempt } from "@/lib/contact-attempt";
import { contactBlockedNotice, findContactDetails } from "@/lib/contact-filter";

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

// The signed-out / wrong-account notes: a desktop card, and the app's plain card below 1024px.
const NOTE_CARD =
  "mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:px-4 max-lg:py-7 max-lg:shadow-app-card";
const NOTE_ICON = "mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl max-lg:size-12 max-lg:bg-app-tint-2 max-lg:text-xl";
const NOTE_TITLE = "mt-4 font-display text-[28px] font-semibold text-ink max-lg:mt-2.5 max-lg:font-sans max-lg:text-[16px] max-lg:font-bold max-lg:text-app-ink";
const NOTE_BODY = "mx-auto mt-2 text-sm leading-normal text-stone-600 max-lg:mt-1 max-lg:text-[13px] max-lg:text-app-ink-2";
const NOTE_CTA =
  "max-lg:mt-4 max-lg:h-app-hit max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:px-5 max-lg:text-app-on-primary max-lg:shadow-none";

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
    return <div className="h-[420px] rounded-[22px] border border-line bg-paper max-lg:h-[220px] max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface" aria-busy="true" />;
  }

  if (!session.loggedIn) {
    return (
      <div className={NOTE_CARD}>
        <div className={NOTE_ICON} aria-hidden="true">
          🔒
        </div>
        <h2 className={NOTE_TITLE}>Log in to see your messages</h2>
        <p className={`${NOTE_BODY} max-w-[40ch]`}>Your conversations with astrologers are private to your account.</p>
        <button type="button" onClick={() => openLogin()} className={`az-cta mt-6 h-12 rounded-full px-8 text-[15px] font-bold ${NOTE_CTA}`}>
          Log in
        </button>
      </div>
    );
  }

  if (session.role !== "customer") {
    return (
      <div className={NOTE_CARD}>
        <div className={NOTE_ICON} aria-hidden="true">
          👋
        </div>
        <h2 className={NOTE_TITLE}>Messages here are for customer accounts</h2>
        <p className={`${NOTE_BODY} max-w-[42ch]`}>
          You&apos;re signed in as {session.role === "astrologer" ? "an astrologer account" : "an AstroRize staff account"}.{" "}
          {session.role === "astrologer"
            ? "Your conversations with customers are in the Messages section of your portal."
            : "Your tools are in the admin console."}
        </p>
        <Link
          href={session.role === "astrologer" ? "/portal/messages" : homeFor(session.role)}
          className={`az-cta mt-6 inline-flex h-12 items-center rounded-full px-8 text-[15px] font-bold hover:text-cta-ink hover:no-underline ${NOTE_CTA}`}
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
  const matching = byNameMatch(list?.filter((c) => !q || c.astrologer.name.toLowerCase().includes(q)) ?? [], q, (c) => c.astrologer.name);
  const matchingSupport = support.filter((c) => !q || "astrorize support".includes(q) || (c.subject ?? "").toLowerCase().includes(q));
  const known = new Set(list?.map((c) => c.astrologer.slug));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section
        aria-label="Conversations"
        className={`min-w-0 self-start rounded-[22px] border border-line bg-paper p-3 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0 ${open ? "hidden lg:block" : ""}`}
      >
        <div className="mb-3 flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 focus-within:border-amber-400 max-lg:h-9 max-lg:border-app-line max-lg:bg-app-surface max-lg:px-3 max-lg:focus-within:border-app-selected max-lg:focus-within:shadow-[0_0_0_3px_rgba(245,158,11,.18)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-stone-400 max-lg:text-app-ink-3" aria-hidden="true">
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
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none max-lg:text-[14px] max-lg:text-app-ink max-lg:placeholder:text-app-ink-3"
          />
        </div>

        {list === null && !listError && (
          <div aria-busy="true" className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[66px] rounded-2xl bg-cream max-lg:rounded-app-card max-lg:bg-app-surface" />
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
          <div className="px-3 py-6 text-center max-lg:rounded-app-card max-lg:border max-lg:border-app-line max-lg:bg-app-surface max-lg:py-7">
            <b className="text-[15px] text-ink max-lg:text-[14px] max-lg:text-app-ink">No messages yet</b>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-normal text-stone-600 max-lg:mt-1 max-lg:text-app-ink-2">
              Search for an astrologer above to start a free conversation, or browse the directory.
            </p>
            <Link
              href="/astrologers"
              className="az-cta mt-4 inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-bold hover:text-cta-ink hover:no-underline max-lg:mt-3 max-lg:h-9 max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-[13px] max-lg:text-app-on-primary max-lg:shadow-none"
            >
              Find an astrologer
            </Link>
          </div>
        )}
        {list && (matchingSupport.length > 0 || matching.length > 0) && (
          <>
            {q && <h2 className="mb-1.5 px-2 text-[11px] font-bold tracking-[.1em] text-stone-500 uppercase max-lg:px-0.5 max-lg:text-app-ink-3">Your conversations</h2>}
            <ul className="flex flex-col gap-1.5 max-lg:gap-2">
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
                      } max-lg:gap-2.5 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:py-3 max-lg:shadow-app-card`}
                    >
                      <SupportBadge size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <b className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-ink" : "text-plum"} max-lg:text-app-ink`}>{c.title}</b>
                          <span className="shrink-0 text-[11px] text-stone-500">{messageTime(c.lastAt)}</span>
                        </span>
                        {c.subject && <span className="block truncate text-[11.5px] text-stone-500">{c.subject}</span>}
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "font-semibold text-ink max-lg:text-app-ink" : "text-stone-500 max-lg:text-app-ink-3"} max-lg:text-[12px]`}>
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
                      } max-lg:gap-2.5 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:py-3 max-lg:shadow-app-card`}
                    >
                      <Photo a={c.astrologer} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <b className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-ink" : "text-plum"} max-lg:text-app-ink`}>{c.astrologer.name}</b>
                          {c.lastAt && <span className="shrink-0 text-[11px] text-stone-500">{messageTime(c.lastAt)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "font-semibold text-ink max-lg:text-app-ink" : "text-stone-500 max-lg:text-app-ink-3"} max-lg:text-[12px]`}>
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

/** Round "A" mark for conversations with the AstroRize team. */
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

  // Searches a moment after typing stops; an answer for an older search is ignored.
  useEffect(() => {
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
  }, [query]);

  if (error?.q === query) {
    return (
      <p role="alert" className="px-2 py-3 text-[13px] text-stone-600">
        {error.text}
      </p>
    );
  }
  const loading = found?.q !== query;
  const fresh = found?.astrologers.filter((a) => !known.has(a.slug)) ?? [];
  // Everyone who matches is already in the list above.
  if (!loading && fresh.length === 0 && hasMatches) return null;

  return (
    <div className="mt-3" aria-busy={loading}>
      <h2 className="mb-1.5 px-2 text-[11px] font-bold tracking-[.1em] text-stone-500 uppercase max-lg:px-0.5 max-lg:text-app-ink-3">Start a conversation</h2>
      {loading && !found ? (
        <div className="h-[66px] rounded-2xl bg-cream max-lg:rounded-app-card max-lg:bg-app-surface" />
      ) : fresh.length === 0 ? (
        <p role="status" className="px-2 py-2 text-[13px] break-words text-stone-500">
          {(found?.astrologers.length ?? 0) > 0
            ? "You already have a conversation with everyone who matches."
            : `No astrologers match “${query}”.`}
        </p>
      ) : (
        <ul className={`flex flex-col gap-1.5 max-lg:gap-2 ${loading ? "opacity-60" : ""}`}>
          {fresh.map((a) => {
            const p = PRESENCE[a.presence];
            return (
              <li key={a.id}>
                <Link
                  href={`/messages/${a.slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 hover:bg-cream hover:no-underline max-lg:gap-2.5 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:py-3 max-lg:shadow-app-card"
                >
                  <Photo a={a} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <b className="min-w-0 flex-1 truncate text-[14px] text-plum max-lg:text-app-ink">{a.name}</b>
                      <span className={`shrink-0 rounded-full border px-2 py-px text-[10.5px] font-bold ${p.cls}`}>{p.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-3">{a.skills.join(" · ") || "Astrologer"}</span>
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
  const [progress, setProgress] = useState<number | null>(null);
  const attach = useAttachment();
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

  // Whether the reader is at the newest message. It stays true while photos and videos above load
  // and grow (growth doesn't scroll), and turns false only when the reader scrolls up themselves.
  const pinned = useRef(true);

  // Keep the newest message in view, and remember it was seen (clears the unread dot).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinned.current = true;
    if (conversationId && last) onSeen(conversationId, last.at);
  }, [conversationId, last, onSeen]);

  // A photo or video has its size now: keep the newest message in view if the reader was at it.
  const keepAtBottom = useCallback(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, []);

  const onThreadScroll = useCallback(() => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  async function send() {
    const text = draft.trim();
    const file = attach.file;
    if ((!text && !file) || sending || attach.preparing || !detail?.canMessage) return;
    // Free chat: no personal details at all. Said here at once (nothing is sent); the API checks too.
    const contact = text ? findContactDetails(text, "FREE") : [];
    if (contact.length) {
      setSendError(contactBlockedNotice(contact, "FREE"));
      reportContactAttempt("messages", slug, text);
      return;
    }
    setSending(true);
    setSendError("");
    attach.setError("");
    version.current++;
    try {
      // The API holds back contact details and answers with the notice instead (a caption too).
      type Sent = { conversationId: string; blocked: boolean; message: MessengerMessage };
      let res: Sent;
      if (file) {
        setProgress(0);
        res = await uploadFile<Sent>(`/api/messages/${encodeURIComponent(slug)}/attachment`, file, text, setProgress);
        attach.clear();
      } else {
        res = await api.post<Sent>(`/messages/${encodeURIComponent(slug)}`, { text });
      }
      version.current++;
      setDetail((d) =>
        d
          ? { ...d, conversation: { id: res.conversationId, messages: [...(d.conversation?.messages ?? []), res.message] } }
          : d,
      );
      setDraft("");
      onChange();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : errorText(e));
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  if (!detail) {
    return (
      <section className={`flex min-h-[420px] flex-col rounded-[22px] border border-line bg-paper p-5 max-lg:p-0 ${THREAD_SCREEN}`}>
        <ThreadBar title="Astrologer Messenger" />
        {loadError ? (
          <div className="m-auto max-w-[40ch] text-center max-lg:px-4">
            <p role="alert" className="text-sm text-stone-600">
              {loadError}
            </p>
            <Link href="/messages" className="mt-3 inline-block text-sm font-bold text-amber-700">
              Back to messages
            </Link>
          </div>
        ) : (
          <div aria-busy="true" className="mt-4 h-full flex-1 rounded-2xl bg-cream max-lg:m-4 max-lg:rounded-app-card max-lg:bg-app-surface" />
        )}
      </section>
    );
  }

  const a = detail.astrologer;
  const given = givenName(a.name);

  return (
    <section
      aria-label={`Conversation with ${a.name}`}
      className={`flex h-[calc(100dvh-200px)] min-h-[440px] flex-col rounded-[22px] border border-line bg-paper lg:h-[620px] ${THREAD_SCREEN}`}
    >
      <ThreadBar title="Astrologer Messenger" subtitle={`${a.name} · Free`} />
      <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3 sm:px-5 max-lg:hidden">
        <Link href={`/astrologer/${a.slug}`} className="flex min-w-0 items-center gap-3 hover:no-underline">
          <Photo a={a} size={42} />
          <span className="min-w-0">
            <b className="block truncate text-[15px] text-plum">{a.name}</b>
            <span className="block truncate text-[12px] text-stone-500">Astrologer Messenger · Free</span>
          </span>
        </Link>
      </header>

      <div ref={scroller} onScroll={onThreadScroll} className={`flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 ${THREAD_SCROLL}`} aria-live="polite">
        <p className="mx-auto max-w-[44ch] rounded-full bg-cream px-3.5 py-1.5 text-center text-[11.5px] leading-normal text-stone-500 max-lg:hidden">
          Direct customer ↔ astrologer message. Not an assistant.
        </p>
        {/* Phone/tablet: who this is with (the way to their profile) and what it is, as in the app. */}
        <div className="mb-1 flex items-center gap-2.5 lg:hidden">
          <Link href={`/astrologer/${a.slug}`} aria-label={`${a.name}'s profile`} className="shrink-0 rounded-full">
            <Image src={a.photo} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
          </Link>
          <p className="m-0 text-[12px] leading-[1.4] text-app-ink-2">Direct customer ↔ astrologer message. Not an assistant.</p>
        </div>
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
                  ? `self-end rounded-[16px_16px_4px_16px] border-amber-200 bg-amber-100 ${BUBBLE_ME}`
                  : `self-start rounded-[16px_16px_16px_4px] border-line bg-white ${BUBBLE_THEM}`
              } ${BUBBLE}`}
            >
              {m.attachment && <MessageMedia attachment={m.attachment} onLoad={keepAtBottom} mine={m.from === "me"} />}
              {m.text}
              <span className="mt-0.5 block text-right text-[10.5px] text-stone-500 max-lg:text-left max-lg:text-[12px] max-lg:text-app-ink-3">{messageTime(m.at, true)}</span>
            </div>
          ),
        )}
      </div>

      {detail.canMessage && (
        <form
          className={`border-t border-line-soft px-3 py-3 sm:px-4 ${COMPOSER}`}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {(sendError || attach.error) && (
            <p role="alert" className="mb-2 text-[12.5px] text-rose-700">
              {attach.error || sendError}
            </p>
          )}
          {attach.file && <AttachmentChip file={attach.file} progress={progress} onRemove={attach.clear} />}
          <div className="flex gap-2 max-lg:items-center">
            <AttachButton
              onPick={(f) => void attach.pick(f)}
              disabled={sending || attach.preparing}
              className="max-lg:size-11! max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink"
            />
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSendError("");
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={attach.file ? "Add a caption (optional)" : "Message"}
              aria-label={attach.file ? "Caption" : `Message ${a.name}`}
              className={`h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[14.5px] text-ink outline-none focus:border-amber-400 ${COMPOSER_INPUT}`}
            />
            <button
              type="submit"
              disabled={sending || attach.preparing || (!draft.trim() && !attach.file)}
              className={`az-cta h-12 shrink-0 rounded-full px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 ${COMPOSER_SEND}`}
            >
              {attach.preparing ? "Preparing…" : sending ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] leading-normal text-stone-500 max-lg:text-app-ink-3">
            {ATTACH_LIMITS} Phone numbers, emails, links, social media handles, UPI IDs and home addresses can&apos;t be shared here.
          </p>
        </form>
      )}
    </section>
  );
}

/** A conversation the AstroRize team started with this customer. Opening it marks it read. */
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
      <section className={`flex min-h-[420px] flex-col rounded-[22px] border border-line bg-paper p-5 max-lg:p-0 ${THREAD_SCREEN}`}>
        <ThreadBar title="Astrologer Messenger" />
        {loadError ? (
          <div className="m-auto max-w-[40ch] text-center max-lg:px-4">
            <p role="alert" className="text-sm text-stone-600">
              {loadError}
            </p>
            <Link href="/messages" className="mt-3 inline-block text-sm font-bold text-amber-700">
              Back to messages
            </Link>
          </div>
        ) : (
          <div aria-busy="true" className="mt-4 h-full flex-1 rounded-2xl bg-cream max-lg:m-4 max-lg:rounded-app-card max-lg:bg-app-surface" />
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={`Conversation with ${detail.title}`}
      className={`flex h-[calc(100dvh-200px)] min-h-[440px] flex-col rounded-[22px] border border-line bg-paper lg:h-[620px] ${THREAD_SCREEN}`}
    >
      <ThreadBar title={detail.title} subtitle={detail.subject ?? "A message from the AstroRize team"} />
      <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3 sm:px-5 max-lg:hidden">
        <SupportBadge size={42} />
        <span className="min-w-0">
          <b className="block truncate text-[15px] text-plum">{detail.title}</b>
          <span className="block truncate text-[12px] text-stone-500">{detail.subject ?? "A message from the AstroRize team"}</span>
        </span>
      </header>

      <div ref={scroller} className={`flex flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 ${THREAD_SCROLL}`} aria-live="polite">
        <p className="mx-auto max-w-[44ch] rounded-full bg-cream px-3.5 py-1.5 text-center text-[11.5px] leading-normal text-stone-500 max-lg:mx-0 max-lg:max-w-none max-lg:rounded-none max-lg:bg-transparent max-lg:p-0 max-lg:text-left max-lg:text-[12px] max-lg:text-app-ink-2">
          You&apos;re talking with the AstroRize team. We will never ask for your password or OTP.
        </p>
        {detail.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] border px-3.5 py-[9px] text-[14px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[70%] ${
              m.from === "me"
                ? `self-end rounded-[16px_16px_4px_16px] border-amber-200 bg-amber-100 ${BUBBLE_ME}`
                : `self-start rounded-[16px_16px_16px_4px] border-line bg-white ${BUBBLE_THEM}`
            } ${BUBBLE}`}
          >
            {m.author && <span className="mb-0.5 block text-[11.5px] font-bold text-plum max-lg:text-app-accent">{m.author}</span>}
            {m.text}
            <span className="mt-0.5 block text-right text-[10.5px] text-stone-500 max-lg:text-left max-lg:text-[12px] max-lg:text-app-ink-3">{messageTime(m.at, true)}</span>
          </div>
        ))}
      </div>

      <form
        className={`border-t border-line-soft px-3 py-3 sm:px-4 ${COMPOSER}`}
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
        <div className="flex gap-2 max-lg:items-center">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_SUPPORT_MESSAGE_LENGTH}
            placeholder="Reply"
            aria-label="Reply to AstroRize support"
            className={`h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[14.5px] text-ink outline-none focus:border-amber-400 ${COMPOSER_INPUT}`}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className={`az-cta h-12 shrink-0 rounded-full px-6 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${COMPOSER_SEND}`}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---- Phone/tablet (< 1024px): a conversation is a full screen of its own, as in the app ----
// (over the site's header; the tab bar is already hidden on /messages/…).
const THREAD_SCREEN =
  "max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:h-auto max-lg:min-h-0 max-lg:rounded-none max-lg:border-0 max-lg:bg-app-bg max-lg:pt-[env(safe-area-inset-top)]";
const THREAD_SCROLL = "max-lg:gap-2 max-lg:pt-2 max-lg:sm:px-4";
const BUBBLE = "max-lg:max-w-[82%] max-lg:rounded-[14px] max-lg:px-3 max-lg:py-2.5";
const BUBBLE_ME = "max-lg:border-transparent max-lg:bg-app-tint-2";
const BUBBLE_THEM = "max-lg:border-app-line max-lg:bg-app-surface";
const COMPOSER =
  "max-lg:border-app-line max-lg:bg-app-elev max-lg:px-4 max-lg:pt-2 max-lg:pb-[calc(12px+env(safe-area-inset-bottom))] max-lg:sm:px-4";
const COMPOSER_INPUT =
  "max-lg:h-11 max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:px-3 max-lg:text-[14px] max-lg:text-app-ink max-lg:focus:border-app-selected";
const COMPOSER_SEND =
  "max-lg:h-11 max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:px-4 max-lg:text-[15px] max-lg:text-app-on-primary max-lg:shadow-none max-lg:sm:px-4";

/** The app's title bar over a conversation: back to all messages, the title and who it's with. */
function ThreadBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="shrink-0 lg:hidden">
      <AppTopbar title={title} subtitle={subtitle} backHref="/messages" backLabel="Back to all messages" />
    </div>
  );
}
