"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { rupee } from "@/lib/portal/format";
import type { LiveChatLine, LiveGift } from "@/lib/types";
import { useGiftShow } from "../../live/gift-burst";
import { FeedAvatar } from "../../live/live-feed";
import { Panel } from "../ui";

/** What is happening in the astrologer's room (GET /portal/live/feed). */
export interface LiveFeed {
  chat: LiveChatLine[];
  gifts: LiveGift[];
  viewers: number;
  giftsTotal: number;
  giftsCount: number;
  title: string;
}

/** How often the console re-reads the room's feed while live. */
const FEED_MS = 4000;

/**
 * The room's feed for the live console: chat, joins and gifts, refreshed every few seconds
 * while live, with each new gift shown once over the video.
 */
export function useLiveFeed(live: boolean) {
  const [feed, setFeed] = useState<LiveFeed | null>(null);
  // The console's video is shorter than the customer's: two pills at a time.
  const gifts = useGiftShow(2);
  const offer = gifts.offer;

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const res = await api.get<{ feed: LiveFeed | null }>("/portal/live/feed");
        if (cancelled) return;
        setFeed(res.feed);
        if (res.feed) offer(res.feed.gifts);
      } catch {
        // Try again at the next refresh; the rest of the console keeps working.
      }
    };
    void refresh();
    const id = setInterval(refresh, FEED_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live, offer]);

  return { feed: live ? feed : null, gifts: gifts.shown };
}

/** Gifts received in this live: the total and the latest few. */
export function LiveGiftsPanel({ feed }: { feed: LiveFeed | null }) {
  const recent = feed?.gifts.slice(0, 5) ?? [];
  return (
    <Panel className="p-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold">Gifts this live</h2>
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
