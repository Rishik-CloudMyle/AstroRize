"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api/client";
import { byNameMatch } from "@/lib/format";
import { MAX_MESSAGE_LENGTH, MAX_SUPPORT_MESSAGE_LENGTH, MESSAGE_POLL_MS, messageTime } from "@/lib/messages";
import type { ChatMessage, CustomerThread, TeamMessage, Thread, ThreadCustomerDetail } from "@/lib/portal/types";
import { useErrorToast, usePortalState, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";
import { IconBack, IconSearch } from "../../mobile/icons";
import { HideTabBar } from "../../mobile/tab-bar";
import { Avatar, PersonProfileDialog } from "./live-queue-people";
import { ATTACH_LIMITS, AttachButton, AttachmentChip, MessageMedia, uploadFile, useAttachment } from "../../messages/message-media";
import { reportContactAttempt } from "@/lib/contact-attempt";
import { contactBlockedNotice, findContactDetails } from "@/lib/contact-filter";

/** The customer's real name; only older conversations not linked to an account show the alias. */
const customerName = (t: CustomerThread) => t.customer?.name ?? `Customer ${t.alias}`;
const nameOf = (t: Thread) => (t.kind === "team" ? t.title : customerName(t));
const initialsOf = (t: CustomerThread) => t.customer?.initials ?? t.alias.replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
/** Something the astrologer hasn't opened yet (a customer's or the team's new messages). */
const needsAttention = (t: Thread) => t.unread > 0;

/** Round "A" mark for conversations with the AstroRize team. */
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

// Phones/tablets (< 1024px): a conversation is a full-screen screen (the customer messenger's look).
const THREAD_SCREEN =
  "max-lg:fixed max-lg:inset-0 max-lg:z-[95] max-lg:gap-0 max-lg:rounded-none max-lg:border-0 max-lg:bg-app-bg max-lg:p-0! max-lg:shadow-none! max-lg:transform-none! max-lg:[backdrop-filter:none]";
const BUBBLE = "max-lg:max-w-[82%] max-lg:rounded-[14px] max-lg:px-3 max-lg:py-2.5";
const BUBBLE_ME = "max-lg:border-transparent max-lg:bg-app-tint-2";
const BUBBLE_THEM = "max-lg:border-app-line max-lg:bg-app-surface";
const COMPOSER =
  "max-lg:border-t max-lg:border-app-line max-lg:bg-app-elev max-lg:px-4 max-lg:pt-2 max-lg:pb-[calc(12px+env(safe-area-inset-bottom))]";

const PHONE_QUERY = "(max-width: 1023px)";
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** True below 1024px, where the list and a conversation are separate screens. */
const usePhoneLayout = () =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );

export default function MessagesView({ threads: initialThreads }: { threads: Thread[] }) {
  const toast = useToast();
  const showError = useErrorToast();
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = usePortalState<string | null>("thread", null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  // Why the typed message can't go to a customer (contact details in free chat), or "".
  const [contactError, setContactError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const attach = useAttachment();
  const [profileOf, setProfileOf] = useState<string | null>(null);
  // Phones/tablets (< 1024px): the list, or one conversation full screen (desktop shows both).
  const [mobileOpen, setMobileOpen] = useState(false);
  const phone = usePhoneLayout();
  // What's actually on screen: on a phone nothing is until a conversation is opened.
  const showing = !phone || mobileOpen;
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
  const unreadId = showing && thread && thread.unread > 0 ? thread.id : null;
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
  }, [thread?.id, lastId, mobileOpen]);

  // A photo has its size now: keep the newest message in view if the reader was already near it.
  const keepAtBottom = useCallback(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 400) el.scrollTop = el.scrollHeight;
  }, []);

  const select = (id: string) => {
    if (id !== selectedId && !busy) {
      // A chosen photo or video belongs to the conversation it was picked in.
      attach.clear();
      attach.setError("");
    }
    setSelectedId(id);
    setContactError("");
    // Below 1024px the conversation opens full screen over the list.
    setMobileOpen(true);
  };

  const send = async () => {
    const text = draft.trim();
    const file = thread?.kind === "customer" ? attach.file : null;
    if ((!text && !file) || !thread || busy || attach.preparing) return;
    if (thread.kind === "customer" && text) {
      // Free chat with a customer: no personal details at all. Said here at once; the API checks too.
      const contact = findContactDetails(text, "FREE");
      if (contact.length) {
        reportContactAttempt("messages", thread.id, text);
        return setContactError(contactBlockedNotice(contact, "FREE"));
      }
    }
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
        toast("Sent to the AstroRize team.");
        return;
      }
      // The API holds back contact details and answers with the notice instead (a caption too).
      type Sent = { blocked: boolean; message: ChatMessage };
      let res: Sent;
      if (file) {
        attach.setError("");
        setProgress(0);
        res = await uploadFile<Sent>(`/api/portal/messages/${encodeURIComponent(thread.id)}/attachment`, file, text, setProgress);
        attach.clear();
      } else {
        res = await api.post<Sent>(`/portal/messages/${thread.id}`, { text });
      }
      version.current++;
      setThreads((all) =>
        all.map((t) =>
          t.id === thread.id && t.kind === "customer"
            ? {
                ...t,
                messages: [...t.messages, res.message],
                ...(res.blocked
                  ? {}
                  : { preview: (text || (file?.kind === "video" ? "🎬 Video" : "📷 Photo")).slice(0, 80), lastAt: res.message.at, awaitingReply: false, unread: 0 }),
              }
            : t,
        ),
      );
      setDraft("");
      router.refresh();
      toast(res.blocked ? "Message blocked — contact details can't be shared in free chat." : "Sent.");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
      setProgress(null);
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
        <PageHeader title="Messages" subtitle="Text, photos and short videos. Contact details are never delivered." />
        <Panel className="mt-5 p-5 max-lg:mt-3.5">
          <b className="text-[15px]">No messages yet</b>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-stone-500">
            Customers can message you here, and so can the AstroRize team. New messages appear on their own.
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
          <span className="block truncate text-[11.5px] text-stone-500">{thread.subject ?? "A message from the AstroRize team"}</span>
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
      <PageHeader title="Messages" subtitle="Text, photos and short videos. Contact details are never delivered." />
      <HideTabBar when={mobileOpen} />
      <div className="mt-5 grid items-stretch gap-4 min-[900px]:min-h-[480px] min-[900px]:grid-cols-[280px_minmax(0,1fr)] max-lg:mt-3.5 max-lg:block">
        <Panel className="min-w-0 p-3.5" mobile="plain">
          <div className="flex h-[38px] items-center gap-2 rounded-full border border-line bg-white px-[13px] max-lg:h-11 max-lg:border-app-line max-lg:bg-app-surface max-lg:px-3 max-lg:text-app-ink-3 max-lg:focus-within:border-app-selected">
            <span className="text-stone-400 max-lg:hidden" aria-hidden="true">
              ⌕
            </span>
            <IconSearch className="size-4 shrink-0 lg:hidden" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or message"
              aria-label="Search conversations"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none max-lg:text-[16px]"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1.5 max-lg:gap-2">
            {visible.map((t) => {
              const on = t.id === thread.id;
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 max-lg:min-h-[64px] max-lg:gap-3 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:p-3 max-lg:shadow-app-card ${
                    on ? "border-amber-300 bg-amber-100" : "border-line bg-white"
                  }`}
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
                      <b className="min-w-0 flex-1 truncate text-[13px] text-ink max-lg:text-[14px]">{nameOf(t)}</b>
                      {t.lastAt && <span className="shrink-0 text-[10.5px] text-stone-500 max-lg:text-[11.5px] max-lg:text-app-ink-3">{messageTime(t.lastAt)}</span>}
                    </span>
                    {t.kind === "team" && t.subject && <span className="block truncate text-[11px] text-stone-500">{t.subject}</span>}
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-3">
                        {t.kind === "team" && t.lastFromMe ? "You: " : ""}
                        {t.preview || "No messages yet"}
                      </span>
                      {needsAttention(t) && (!on || !showing) && (
                        <span
                          className="size-2 shrink-0 rounded-full bg-urgent"
                          role="img"
                          aria-label={t.kind === "team" ? "New message from the AstroRize team" : "New message from the customer"}
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

        <Panel
          mobile="none"
          className={`relative flex min-w-0 flex-col p-4 sm:p-5 ${THREAD_SCREEN} ${mobileOpen ? "" : "max-lg:hidden"}`}
        >
          <div
            ref={threadPanel}
            className="flex scroll-mt-20 items-center gap-2.5 border-b border-line-soft pb-3.5 max-lg:gap-2 max-lg:border-app-line max-lg:bg-app-elev max-lg:py-2 max-lg:pr-4 max-lg:pl-2"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Back to all messages"
              className="grid size-app-hit shrink-0 place-items-center rounded-[10px] text-app-ink focus-visible:outline-2 focus-visible:outline-app-selected lg:hidden [&>svg]:size-6"
            >
              <IconBack />
            </button>
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
                className="ml-auto h-[34px] shrink-0 rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-stone-600 max-lg:h-9 max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-transparent max-lg:text-[13px] max-lg:text-app-ink"
              >
                Report
              </button>
            )}
          </div>
          <div
            ref={list}
            className="flex max-h-[60vh] flex-1 flex-col gap-2.5 overflow-y-auto py-4 min-[900px]:max-h-[520px] max-lg:max-h-none! max-lg:min-h-0 max-lg:px-4 max-lg:overscroll-contain"
            aria-live="polite"
          >
            {thread.kind === "team" && (
              <p className="mx-auto max-w-[46ch] rounded-full bg-cream px-3.5 py-1.5 text-center text-[11.5px] leading-normal text-stone-500">
                A conversation with the AstroRize team. Customers can&apos;t see it.
              </p>
            )}
            {thread.kind === "team"
              ? thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] border px-3.5 py-[9px] text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[66%] ${BUBBLE} ${
                      m.from === "me"
                        ? `self-end rounded-[14px_14px_4px_14px] border-amber-200 bg-amber-100 ${BUBBLE_ME}`
                        : `self-start rounded-[14px_14px_14px_4px] border-line bg-white ${BUBBLE_THEM}`
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
                      className={`max-w-[85%] border px-3.5 py-[9px] text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-ink sm:max-w-[66%] ${BUBBLE} ${
                        m.from === "me"
                          ? `self-end rounded-[14px_14px_4px_14px] border-amber-200 bg-amber-100 ${BUBBLE_ME}`
                          : `self-start rounded-[14px_14px_14px_4px] border-line bg-white ${BUBBLE_THEM}`
                      }`}
                    >
                      {m.attachment && <MessageMedia attachment={m.attachment} onLoad={keepAtBottom} mine={m.from === "me"} />}
                      {m.text}
                      <span className="mt-0.5 block text-right text-[10.5px] text-stone-500">{messageTime(m.at, true)}</span>
                    </div>
                  ),
                )}
          </div>
          <form
            className={COMPOSER}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {thread.kind === "customer" && (attach.error || contactError) && (
              <p role="alert" className="mb-2 text-[12.5px] font-semibold text-rose-700">
                {attach.error || contactError}
              </p>
            )}
            {thread.kind === "customer" && attach.file && <AttachmentChip file={attach.file} progress={progress} onRemove={attach.clear} />}
            <div className="flex gap-2.5 max-lg:items-center max-lg:gap-2">
              {thread.kind === "customer" && (
                <AttachButton
                  onPick={(f) => void attach.pick(f)}
                  disabled={busy || attach.preparing}
                  size={46}
                  className="max-lg:size-11! max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink"
                />
              )}
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setContactError("");
                }}
                maxLength={thread.kind === "team" ? MAX_SUPPORT_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH}
                placeholder={thread.kind === "team" ? "Reply to the AstroRize team…" : attach.file ? "Add a caption (optional)" : "Type a message…"}
                aria-label={thread.kind === "team" ? "Reply to the AstroRize team" : attach.file ? "Caption" : "Message"}
                className="h-[46px] min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none max-lg:h-11 max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:px-3 max-lg:text-[16px] max-lg:focus:border-app-selected"
              />
              <button
                type="submit"
                disabled={busy || attach.preparing}
                className="h-[46px] shrink-0 rounded-xl bg-amber-500 px-[18px] text-sm font-bold text-ink disabled:opacity-60 sm:px-[22px] max-lg:h-11 max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:px-4! max-lg:text-[15px]"
              >
                {attach.preparing ? "Preparing…" : busy && progress !== null ? "Sending…" : "Send"}
              </button>
            </div>
            {thread.kind === "customer" && (
              <p className="mt-1.5 px-1 text-[11px] leading-normal text-stone-500 max-lg:text-app-ink-3">
                {ATTACH_LIMITS} Phone numbers, emails, links, social media handles, UPI IDs and home addresses can&apos;t be shared here.
              </p>
            )}
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
