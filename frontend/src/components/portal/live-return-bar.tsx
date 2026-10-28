"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveClock, useLiveSnapshot } from "./views/use-live-broadcast";

/**
 * "You're LIVE · 03:12 · 128 watching · Return to live", on every portal page except the Live
 * console while the astrologer is live: the broadcast keeps going while they work elsewhere
 * (lib/media/live-broadcast.ts), and this is the way back to it. Desktop: at the top of the page;
 * phones/tablets: above the tab bar (raised above the "Return to call" bar when that shows too).
 */
export default function LiveReturnBar({ placement, raised = false }: { placement: "top" | "bottom"; raised?: boolean }) {
  const pathname = usePathname();
  const snap = useLiveSnapshot();
  const clock = useLiveClock(snap?.feed?.startedAt);
  if (!snap || pathname.startsWith("/portal/live")) return null;
  const feed = snap.feed;
  const viewers = feed?.viewers ?? 0;
  const note =
    snap.link === "reconnecting"
      ? "reconnecting…"
      : snap.link === "failed" || snap.answerFailed
        ? "video problem — open the console"
        : snap.answer?.available && !snap.local
          ? "camera off — open the console"
          : feed?.private?.status === "active"
            ? "private call · live audio muted"
            : null;

  return (
    <div
      role="status"
      aria-label="Your live"
      className={
        placement === "top"
          ? "sticky top-3 z-[45] mb-3 flex items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-4 text-paper shadow-[0_10px_30px_rgba(11,31,51,.22)] max-lg:hidden"
          : `fixed right-3 left-3 z-[141] flex items-center gap-3 rounded-app-card bg-ink py-2 pr-2 pl-3 text-paper shadow-[0_16px_40px_rgba(11,31,51,.3)] lg:hidden ${
              raised ? "bottom-[calc(72px+var(--app-tabbar-space))]" : "bottom-[calc(12px+var(--app-tabbar-space))]"
            }`
      }
    >
      <span className="inline-flex h-[24px] shrink-0 items-center gap-1.5 rounded-full bg-urgent px-2.5 text-[11px] font-extrabold tracking-[.04em] text-white">
        <span className="az-live-dot size-1.5 rounded-full bg-white" aria-hidden="true" />
        LIVE
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <b className="max-[420px]:sr-only">You&apos;re live</b>
        <span className="text-stone-300 tabular-nums">
          <span className="max-[420px]:hidden"> · </span>
          {clock ?? "—"} · {viewers} watching
        </span>
        {note && <span className="text-amber-200"> · {note}</span>}
      </span>
      <Link
        href="/portal/live"
        className="flex h-9 shrink-0 items-center rounded-full bg-amber-400 px-4 text-[13px] font-bold text-ink hover:text-ink hover:no-underline max-lg:h-10"
      >
        Return to live
      </Link>
    </div>
  );
}
