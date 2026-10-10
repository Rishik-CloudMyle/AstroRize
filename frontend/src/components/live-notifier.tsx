"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";

/** What is happening right now (GET /api/stats/now). Every figure is counted from real records. */
export interface LiveNow {
  /** Astrologers online: available, in a session or live. */
  online: number;
  available: number;
  inSession: number;
  liveRooms: number;
  consultationsToday: number;
  /** Rooms live right now, newest first. */
  live: { id: string; name: string; topic: string; startedAt: string }[];
  /** Newest first, from the last few hours. */
  events: { text: string; at: string; href: string | null }[];
  at: string;
}

/** How often the site re-reads what's live. */
const POLL_MS = 30_000;
/** A "just went live" notice hides itself after this long (it can be closed sooner). */
const NOTICE_MS = 30_000;

// One shared snapshot for the whole site: <LiveNotifier /> (mounted once in the site chrome)
// polls, and the header's live dot and the home page's Live now band read it.
let snapshot: LiveNow | null = null;
const listeners = new Set<() => void>();

function publish(next: LiveNow) {
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The latest live-now figures, or null until the first answer arrives. */
export function useLiveNow(): LiveNow | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}

interface Notice {
  key: string;
  roomId: string;
  name: string;
  topic: string;
}

/**
 * Keeps the live-now figures current and tells the visitor when an astrologer goes live while
 * they are on the site: "<Name> just went live · <topic> · Watch". Rooms already live when the
 * page opened don't trigger it, and each live session is announced once.
 */
export default function LiveNotifier() {
  const pathname = usePathname();
  const [notices, setNotices] = useState<Notice[]>([]);
  const known = useRef<Set<string> | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((key: string) => {
    setNotices((list) => list.filter((n) => n.key !== key));
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const allTimers = timers.current;
    const poll = async () => {
      if (document.hidden) return;
      let now: LiveNow;
      try {
        now = (await api.get<{ now: LiveNow }>("/stats/now")).now;
      } catch {
        return; // Try again at the next poll; nothing on the page depends on it.
      }
      if (cancelled) return;
      publish(now);
      // A live session is its room plus its start time, so going live again later is news again.
      const current = new Map(now.live.map((r) => [`${r.id}@${r.startedAt}`, r]));
      if (known.current) {
        const watching = window.location.pathname === "/live" ? new URLSearchParams(window.location.search).get("room") : null;
        const fresh: Notice[] = [];
        for (const [key, r] of current) {
          if (known.current.has(key)) continue;
          known.current.add(key);
          if (r.id !== watching) fresh.push({ key, roomId: r.id, name: r.name, topic: r.topic });
        }
        for (const n of fresh) allTimers.set(n.key, setTimeout(() => dismiss(n.key), NOTICE_MS));
        // Newest first; at most two at once. Rooms that ended in the meantime drop out.
        setNotices((list) => [...fresh, ...list.filter((n) => current.has(n.key))].slice(0, 2));
      } else {
        // First answer: whatever is live already isn't news.
        known.current = new Set(current.keys());
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      for (const t of allTimers.values()) clearTimeout(t);
      allTimers.clear();
    };
  }, [dismiss]);

  // Opening the room (from the notice or otherwise) closes its notice.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (pathname === "/live" && notices.length) setNotices([]);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-[76px] z-[350] flex flex-col gap-2.5 sm:left-auto sm:right-6 sm:w-[380px]"
    >
      {notices.map((n) => (
        <div
          key={n.key}
          className="az-toast pointer-events-auto flex items-start gap-3 rounded-[16px] bg-ink px-4 py-3.5 text-line shadow-[0_16px_40px_rgba(11,31,51,.3)]"
        >
          <span aria-hidden="true" className="az-live-dot mt-[7px] inline-block size-2 shrink-0 rounded-full bg-urgent" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-normal">
              <b className="font-bold text-white">{n.name}</b> just went live
              <span className="text-stone-400"> · </span>
              <span className="break-words">{n.topic}</span>
            </p>
            <Link
              href={`/live?room=${encodeURIComponent(n.roomId)}`}
              onClick={() => dismiss(n.key)}
              className="mt-2 inline-flex h-8 items-center rounded-full bg-urgent px-4 text-[12.5px] font-bold text-white hover:text-white hover:no-underline"
            >
              Watch
            </Link>
          </div>
          <button
            type="button"
            onClick={() => dismiss(n.key)}
            aria-label={`Dismiss: ${n.name} just went live`}
            className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-white/10 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
