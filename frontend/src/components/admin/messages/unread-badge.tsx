"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { UNREAD_EVENT, usePoll } from "./parts";

/**
 * The unread count on the console nav's Messages item. Checked when the console opens, every
 * 15 seconds while the tab is visible, and straight away when the messages page reads or
 * receives something.
 */
export default function MessagesUnreadBadge() {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    api
      .get<{ unread: number }>("/admin/messages/unread")
      .then((res) => setCount(res.unread))
      .catch(() => {}); // A missed check is retried on the next tick.
  }, []);

  useEffect(load, [load]);
  usePoll(load, 15_000);

  useEffect(() => {
    const onUnread = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, onUnread);
    return () => window.removeEventListener(UNREAD_EVENT, onUnread);
  }, []);

  if (!count) return null;
  return (
    <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-urgent px-[5px] text-[10px] font-extrabold text-white">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count === 1 ? "1 unread message" : `${count} unread messages`}</span>
    </span>
  );
}
