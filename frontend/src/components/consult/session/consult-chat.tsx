"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";

// The written conversation inside a consultation, for either side: the whole window in a Chat
// session, a drawer during Voice and Video. Polled; contact details never reach the other side
// (the sender sees why instead).

const POLL_MS = 2500;

export interface ConsultLine {
  id: string;
  /** me · astrologer · customer · blocked (only the sender sees it) · system */
  from: "me" | "astrologer" | "customer" | "blocked" | "system";
  text: string;
  at: string;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** Keeps the conversation current while the window is open, and counts what arrived unseen. */
export function useConsultChat(base: string, active: boolean, visible: boolean) {
  const [lines, setLines] = useState<ConsultLine[]>([]);
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unread, setUnread] = useState(0);
  const lastAt = useRef<string | null>(null);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  });

  const seen = useRef(new Set<string>());
  // Only polls move the cursor: a message just sent may be newer than one the other side sent
  // a moment earlier that hasn't been fetched yet.
  const merge = useCallback((incoming: ConsultLine[], fromPoll: boolean) => {
    if (fromPoll && incoming.length) lastAt.current = incoming[incoming.length - 1].at;
    const fresh = incoming.filter((l) => !seen.current.has(l.id));
    if (!fresh.length) return;
    fresh.forEach((l) => seen.current.add(l.id));
    if (!visibleRef.current) {
      const theirs = fresh.filter((l) => l.from === "astrologer" || l.from === "customer").length;
      if (theirs) setUnread((n) => n + theirs);
    }
    setLines((prev) => [...prev, ...fresh].sort((a, b) => a.at.localeCompare(b.at)));
  }, []);

  const poll = useCallback(async () => {
    try {
      const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      const res = await api.get<{ messages: ConsultLine[]; open: boolean }>(`${base}/messages${q}`);
      merge(res.messages, true);
      setOpen(res.open);
      setLoaded(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [base, merge]);

  useEffect(() => {
    if (!active) return;
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [active, poll]);

  // Opening the conversation marks everything in it as seen.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setUnread(0);
  }

  /** Sends; resolves to an error message to show, or "" when it went (or was blocked, shown inline). */
  const send = useCallback(
    async (text: string): Promise<string> => {
      try {
        const res = await api.post<{ blocked: boolean; message: ConsultLine }>(`${base}/messages`, { text });
        merge([res.message], false);
        return "";
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setOpen(false);
        return e instanceof ApiError ? e.message : "Couldn't send. Check your connection and try again.";
      }
    },
    [base, merge],
  );

  return { lines, open, loaded, failed, unread, send };
}

export type ConsultChatState = ReturnType<typeof useConsultChat>;

export function ConsultChat({
  chat,
  peerName,
  dense = false,
  disabledNote,
  appLook = false,
}: {
  chat: ConsultChatState;
  peerName: string;
  /** The drawer beside a call (smaller type) rather than the whole Chat window. */
  dense?: boolean;
  /** Why sending is off, when the session isn't in progress. */
  disabledNote?: string;
  /** Below 1024px, the customer app's light chat (see SessionWindow). */
  appLook?: boolean;
}) {
  /** Classes that apply only with the app look (they are all max-lg: ones). */
  const L = (cls: string) => (appLook ? cls : "");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const count = chat.lines.length;

  // Follow the newest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  async function submit() {
    const text = draft.trim();
    if (!text || sending || !chat.open) return;
    setSending(true);
    setError("");
    const problem = await chat.send(text);
    setSending(false);
    if (problem) setError(problem);
    else setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto ${dense ? "px-3 py-3" : "px-4 py-4 sm:px-6"} ${L("max-lg:px-4 max-lg:pt-2.5 max-lg:sm:px-4")}`} aria-live="polite" aria-label="Messages">
        {appLook && !dense && <p className="mb-2 text-[12px] text-app-ink-2 lg:hidden">Never share your number, OTP, or payment details.</p>}
        {!chat.loaded && !chat.failed && <p className={`py-6 text-center text-[13px] text-stone-400 ${L("max-lg:text-app-ink-3")}`}>Loading messages…</p>}
        {chat.failed && !chat.loaded && (
          <p className={`py-6 text-center text-[13px] text-rose-300 ${L("max-lg:text-app-error")}`}>Couldn&apos;t load messages. Retrying…</p>
        )}
        {chat.loaded && count === 0 && (
          <p className={`mx-auto max-w-[34ch] py-8 text-center text-[13px] leading-[1.55] text-stone-400 ${L("max-lg:text-app-ink-2")}`}>
            {chat.open ? `Say hello to ${peerName}. Messages stay on AstroRize — phone numbers and other contact details can't be shared.` : "No messages in this consultation."}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {chat.lines.map((l) => {
            if (l.from === "blocked" || l.from === "system") {
              return (
                <li key={l.id} role={l.from === "blocked" ? "alert" : undefined} className={`mx-auto max-w-[44ch] rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-center text-[12.5px] leading-normal text-amber-200 ${L("max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:text-app-active")}`}>
                  {l.from === "blocked" && <b className="block text-[12px] uppercase tracking-[.06em]">Not sent</b>}
                  {l.text}
                </li>
              );
            }
            const mine = l.from === "me";
            return (
              <li key={l.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${dense ? "text-[13.5px]" : "text-[14.5px]"} leading-[1.45] ${
                    mine ? "rounded-br-md bg-amber-400 text-ink" : "rounded-bl-md bg-white/10 text-paper"
                  } ${L(
                    `max-lg:rounded-[14px] max-lg:px-3 max-lg:py-2.5 max-lg:text-[14px] max-lg:text-app-ink ${mine ? "max-lg:bg-app-tint-2" : "max-lg:border max-lg:border-app-line max-lg:bg-app-surface"}`,
                  )}`}
                >
                  <span className="sr-only">{mine ? "You" : peerName}: </span>
                  <span className="whitespace-pre-wrap break-words">{l.text}</span>
                  <span className={`mt-0.5 block text-right text-[10.5px] ${mine ? "text-ink/60" : "text-stone-400"} ${L("max-lg:text-left max-lg:text-[12px] max-lg:text-app-ink-3")}`}>
                    {timeOf(l.at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={`border-t border-white/10 ${dense ? "p-2.5" : "p-3 sm:px-6"} ${L(
          `max-lg:border-app-line max-lg:bg-app-elev max-lg:px-4 max-lg:pt-2 max-lg:sm:px-4 ${dense ? "max-lg:pb-[max(12px,env(safe-area-inset-bottom))]" : "max-lg:pb-[max(16px,env(safe-area-inset-bottom))]"}`,
        )}`}
      >
        {error && (
          <p role="alert" className={`mb-2 text-[12.5px] font-semibold text-rose-300 ${L("max-lg:text-app-error")}`}>
            {error}
          </p>
        )}
        {chat.open ? (
          <div className={`flex items-end gap-2 ${L("max-lg:items-center")}`}>
            <label className="sr-only" htmlFor={`consult-msg-${dense ? "d" : "f"}`}>
              Message {peerName}
            </label>
            <textarea
              id={`consult-msg-${dense ? "d" : "f"}`}
              rows={1}
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={`Message ${peerName}`}
              className={`max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-[14.5px] text-paper outline-none placeholder:text-stone-500 focus:border-amber-300 ${L(
                "max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:px-3 max-lg:text-[14px] max-lg:text-app-ink max-lg:placeholder:text-app-ink-3 max-lg:focus:border-app-selected",
              )}`}
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className={`h-11 shrink-0 rounded-xl bg-amber-400 px-4 text-[14px] font-bold text-ink disabled:opacity-50 ${L("max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-[15px]")}`}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        ) : (
          <p className={`py-1 text-center text-[12.5px] text-stone-400 ${L("max-lg:text-app-ink-3")}`}>{disabledNote ?? "This consultation has ended — messages can no longer be sent."}</p>
        )}
      </form>
    </div>
  );
}
