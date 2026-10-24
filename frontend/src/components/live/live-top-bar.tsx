"use client";

// The top of the app's full-screen live room (below 1024px; hidden at ≥ 1024px): back to the Live
// list, the host (photo, name, verified tick), LIVE NOW · watching, the session's topic, and on the
// right the room's own buttons (share, room info…).

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAppUI } from "../app-provider";
import { VerifiedTick } from "../astrologer/parts";
import { IconBack } from "../mobile/icons";

/** The round translucent buttons over the video. */
export const LIVE_ICON_BUTTON =
  "relative grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/10 text-[#f8f4ec] hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-amber-300 [&>svg]:size-5";

export function LiveTopBar({
  name,
  photo,
  viewers,
  topic,
  ended = false,
  actions,
}: {
  name: string;
  photo: string;
  viewers: number;
  topic?: string | null;
  ended?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="relative z-[3] flex items-center gap-2 px-3 pt-[max(6px,env(safe-area-inset-top))] pb-2.5 text-[#f8f4ec] lg:hidden">
      <Link href="/live" aria-label="Back to Live" className={LIVE_ICON_BUTTON}>
        <IconBack />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`relative size-9 shrink-0 overflow-hidden rounded-full ${ended ? "grayscale-[.4]" : "shadow-[0_0_0_2px_rgba(245,158,11,.55)]"}`}
        >
          <Image src={photo} alt="" fill sizes="72px" className="object-cover" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <b className="min-w-0 truncate text-[13px] leading-[1.15]">{name}</b>
            <VerifiedTick size={15} />
          </div>
          <div className="flex flex-wrap items-center gap-x-1 text-[11px] text-[#d6d3d1]">
            <span className={`inline-flex items-center gap-[5px] text-[10px] font-bold tracking-[.08em] ${ended ? "text-[#d6d3d1]" : "text-[#fde68a]"}`}>
              <i className={`block size-1.5 rounded-full ${ended ? "bg-[#a8a29e]" : "bg-[#f59e0b] motion-safe:animate-[azPulseDot_2.4s_ease-in-out_infinite]"}`} />
              {ended ? "ENDED" : "LIVE NOW"}
            </span>
            {!ended && <span className="tabular-nums">· {viewers.toLocaleString("en-IN")} watching</span>}
          </div>
          {topic && <div className="mt-0.5 truncate text-[10px] text-[#a8a29e]">{topic}</div>}
        </div>
      </div>
      {actions}
    </div>
  );
}

/** Share the room: the phone's share sheet where there is one, otherwise copy the link. */
export function LiveShareButton({ title }: { title: string }) {
  const { toast } = useAppUI();
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast("Couldn't share the link. Copy it from the address bar.");
    }
  }
  return (
    <button type="button" onClick={() => void share()} aria-label="Share this live" className={LIVE_ICON_BUTTON}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
      </svg>
    </button>
  );
}
