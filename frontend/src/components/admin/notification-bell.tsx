"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api } from "@/lib/api/client";
import { useAdmin } from "./admin-provider";

// The staff bell in the admin console (the desktop rail and the phone top bar): the signed-in staff
// member's own notifications — new customer issues, customer replies, forwards to their team, refunds
// waiting for them to approve and their decisions (backend lib/staff-notifications.ts). One feed is
// shared by both bells; it is read when the console opens, every 30 seconds while the tab is
// visible, when the tab comes back and each time a panel opens. Tapping one opens its ticket.

const POLL_MS = 30_000;

interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  read: boolean;
}

interface Feed {
  unread: number;
  notifications: Notice[];
}

interface StaffFeed {
  feed: Feed | null;
  failed: boolean;
  now: number;
  load: () => void;
  markRead: (n: Notice) => void;
  markAll: () => void;
}

const FeedContext = createContext<StaffFeed | null>(null);

export function StaffNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { refreshNav } = useAdmin();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The newest notification seen so far: a newer one also re-reads the nav badges (same news).
  const newest = useRef<string | null>(null);
  // Only the newest answer counts if two reads overlap.
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = ++seq.current;
    api
      .get<Feed>("/notifications")
      .then((f) => {
        if (mine !== seq.current) return;
        const top = f.notifications[0]?.createdAt ?? null;
        if (newest.current !== null && top !== null && top > newest.current) refreshNav();
        if (top !== null) newest.current = top;
        else newest.current ??= "";
        setFeed(f);
        setFailed(false);
        setNow(Date.now());
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setFeed(null);
        setFailed(true);
      });
  }, [refreshNav]);

  useEffect(load, [load]);
  useEffect(() => {
    const run = () => document.visibilityState === "visible" && load();
    const id = setInterval(run, POLL_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [load]);

  const markRead = useCallback(
    (n: Notice) => {
      if (n.read) return;
      seq.current++; // a read already in flight would bring the old state back
      setFeed((f) => f && { unread: Math.max(0, f.unread - 1), notifications: f.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
      api.post(`/notifications/${encodeURIComponent(n.id)}/read`).catch(() => load());
    },
    [load],
  );

  const markAll = useCallback(() => {
    seq.current++;
    setFeed((f) => f && { unread: 0, notifications: f.notifications.map((x) => ({ ...x, read: true })) });
    api.post("/notifications/read-all").catch(() => load());
  }, [load]);

  const value = useMemo(() => ({ feed, failed, now, load, markRead, markAll }), [feed, failed, now, load, markRead, markAll]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

function useStaffFeed(): StaffFeed {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("StaffNotificationBell must be used inside <StaffNotificationsProvider>");
  return ctx;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
function timeAgo(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** The bell button on the dark rail / top bar, and its panel (beside the rail on desktop, under the top bar on phones). */
export default function StaffNotificationBell() {
  const router = useRouter();
  const { feed, failed, now, load, markRead, markAll } = useStaffFeed();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Escape or a click outside closes the panel (it lives in a portal, outside the button's tree).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen((o) => !o);
  };

  const choose = (n: Notice) => {
    markRead(n);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const unread = feed?.unread ?? 0;
  const list = feed?.notifications ?? [];

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-10 flex-[0_0_40px] place-items-center rounded-xl border border-[#44403c] text-[#f8f4ec] hover:bg-[#292524]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[#0c0b09] bg-urgent px-1 text-[9.5px] leading-none font-extrabold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* The rail and the top bar blur what is behind them, which would trap a fixed panel: it goes to <body>. */}
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-3 top-[66px] z-[60] flex max-h-[min(72dvh,560px)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_48px_rgba(28,25,23,.28)] sm:inset-x-auto sm:right-3 sm:w-[400px] lg:top-3 lg:right-auto lg:left-[262px]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <b className="text-[15px] text-ink">Notifications</b>
              {unread > 0 && (
                <button type="button" onClick={markAll} className="text-[12.5px] font-bold text-amber-800 hover:underline">
                  Mark all as read
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!feed && failed ? (
                <div className="px-4 py-8 text-center text-[13px] text-stone-500">
                  Couldn&apos;t load your notifications.{" "}
                  <button type="button" onClick={load} className="font-bold text-amber-800 hover:underline">
                    Try again
                  </button>
                </div>
              ) : !feed ? (
                <div className="px-4 py-8 text-center text-[13px] text-stone-500">Loading…</div>
              ) : list.length === 0 ? (
                <div className="px-4 py-9 text-center">
                  <b className="block text-sm text-ink">You&apos;re all caught up</b>
                  <span className="mt-1 block text-[12.5px] text-stone-500">New issues, customer replies and tickets forwarded to you will appear here.</span>
                </div>
              ) : (
                <ul className="m-0 list-none divide-y divide-line p-0">
                  {list.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => choose(n)}
                        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-amber-50 ${n.read ? "" : "bg-amber-50/60"}`}
                      >
                        <span aria-hidden="true" className={`mt-[6px] size-2 flex-[0_0_8px] rounded-full ${n.read ? "bg-transparent" : "bg-urgent"}`} />
                        <span className="min-w-0 flex-1">
                          <b className={`block text-[13.5px] leading-snug break-words text-ink ${n.read ? "font-semibold" : "font-bold"}`}>
                            {n.title}
                            {!n.read && <span className="sr-only"> (unread)</span>}
                          </b>
                          <span className="mt-0.5 block text-[12.5px] leading-[1.45] break-words text-stone-600">{n.body}</span>
                          <span className="mt-1 block text-[11.5px] font-semibold text-stone-400">{timeAgo(n.createdAt, now)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
