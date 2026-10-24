"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";

// The bell for signed-in customers (website header) and astrologers (portal): their own in-app
// notifications (offers, free replacement calls, account changes). Checked when the page opens,
// every minute while the tab is visible, when the tab comes back, and each time the panel opens.

const POLL_MS = 60_000;

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

/** The prototype app's bell (part-a-mobile-app icons.bell). */
function BellIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
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

/**
 * variant: "default" — the desktop header's round 38px bell;
 *          "app" — the phone/tablet app header's 44px white square bell (prototype .icon-btn);
 *          "row" — a full-width list row ("Notifications", unread count, chevron) for the Profile hub.
 */
export default function NotificationBell({
  align = "right",
  variant = "default",
}: {
  align?: "left" | "right";
  variant?: "default" | "app" | "row";
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<Feed>("/notifications")
      .then((f) => {
        setFeed(f);
        setFailed(false);
        setNow(Date.now());
      })
      .catch((e: unknown) => {
        // Signed out meanwhile: the bell disappears; anything else is retried on the next check.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setFeed(null);
        setFailed(true);
      });
  }, []);

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

  // Escape or a click outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const markRead = (n: Notice) => {
    if (n.read) return;
    setFeed((f) => f && { unread: Math.max(0, f.unread - 1), notifications: f.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
    api.post(`/notifications/${n.id}/read`).catch(() => load());
  };

  const markAll = () => {
    setFeed((f) => f && { unread: 0, notifications: f.notifications.map((x) => ({ ...x, read: true })) });
    api.post("/notifications/read-all").catch(() => load());
  };

  const choose = (n: Notice) => {
    markRead(n);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) load();
  };

  const unread = feed?.unread ?? 0;
  const list = feed?.notifications ?? [];

  return (
    <div ref={wrap} className="relative">
      {variant === "row" ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="flex min-h-app-hit w-full items-center gap-3 rounded-app-card border border-app-line bg-app-surface p-3 text-left text-[13.333px] text-app-ink shadow-app-card"
        >
          <span className="min-w-0 flex-1">Notifications</span>
          {unread > 0 && (
            <span aria-hidden="true" className="grid h-5 min-w-5 place-items-center rounded-full bg-app-urgent px-1.5 text-[10.5px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          <span aria-hidden="true" className="text-app-ink-3">
            ›
          </span>
        </button>
      ) : variant === "app" ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid size-app-hit place-items-center rounded-app-btn bg-app-surface text-app-ink"
        >
          <BellIcon size={22} />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-app-urgent px-1 text-[10px] leading-none font-bold text-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid size-[38px] place-items-center rounded-full border border-line bg-white text-stone-600 hover:bg-amber-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-paper bg-urgent px-1 text-[9.5px] leading-none font-extrabold text-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={
            variant === "default"
              ? `fixed inset-x-3 top-[66px] z-[60] flex max-h-[min(72dvh,540px)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_48px_rgba(90,62,40,.22)] sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:w-[380px] ${
                  align === "right" ? "sm:right-0" : "sm:left-0"
                }`
              : // App look: a floating card under the app header on phones, beside the control on wider screens.
                `fixed inset-x-3 top-[calc(64px+env(safe-area-inset-top))] z-[60] flex max-h-[min(70dvh,540px)] flex-col overflow-hidden rounded-app-card border border-app-line bg-app-elev shadow-app-float sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:right-0 sm:w-[380px]`
          }
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
                <div className="text-2xl" aria-hidden="true">
                  ✦
                </div>
                <b className="mt-1 block text-sm text-ink">You&apos;re all caught up</b>
                <span className="mt-1 block text-[12.5px] text-stone-500">Offers, replacement calls and account updates will appear here.</span>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => choose(n)}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-amber-50 ${n.read ? "" : "bg-amber-50/60"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-[6px] size-2 flex-[0_0_8px] rounded-full ${n.read ? "bg-transparent" : "bg-urgent"}`}
                      />
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
        </div>
      )}
    </div>
  );
}
