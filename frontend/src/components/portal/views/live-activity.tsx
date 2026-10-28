"use client";

import { useEffect } from "react";
import { rupee } from "@/lib/portal/format";
import type { LiveFeed } from "@/lib/media/live-broadcast";
import { useGiftShow } from "../../live/gift-burst";
import { FeedAvatar } from "../../live/live-feed";
import { Panel } from "../ui";
import { useLiveSnapshot } from "./use-live-broadcast";

export type { LiveFeed } from "@/lib/media/live-broadcast";

/**
 * The room's feed for the live console: chat, joins and gifts, as the live broadcast session
 * (lib/media/live-broadcast.ts) follows it every few seconds while live, with each new gift shown
 * once over the video.
 */
export function useLiveFeed(live: boolean) {
  const snap = useLiveSnapshot();
  const feed = live ? (snap?.feed ?? null) : null;
  // The console's video is shorter than the customer's: two pills at a time.
  const gifts = useGiftShow(2);
  const offer = gifts.offer;
  useEffect(() => {
    if (feed) offer(feed.gifts);
  }, [feed, offer]);

  return { feed, feedAt: snap?.feedAt ?? 0, gifts: gifts.shown };
}

/** Gifts received in this live: the total and the latest few. */
export function LiveGiftsPanel({ feed }: { feed: LiveFeed | null }) {
  const recent = feed?.gifts.slice(0, 5) ?? [];
  return (
    <Panel className="p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold max-lg:text-[16px]">Gifts this live</h2>
        <span className="text-xs text-stone-500">{feed ? `${feed.giftsCount} received` : "—"}</span>
      </div>
      <b className="mt-1.5 block text-[22px] tabular-nums">{rupee(feed?.giftsTotal ?? 0)}</b>
      {recent.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-stone-500">No gifts yet. Gifts viewers send appear here and over your video.</p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2" aria-label="Latest gifts">
          {recent.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-[12.5px]">
              <FeedAvatar photo={g.photo} initials={g.initials} size={24} />
              <span className="min-w-0 flex-1 truncate">
                <b>{g.who}</b> sent {g.icon} {g.name}
              </span>
              <b className="tabular-nums">{rupee(g.price)}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2.5 text-[11.5px] leading-[1.45] text-stone-500">Gifts are added to your earnings statement.</p>
    </Panel>
  );
}
