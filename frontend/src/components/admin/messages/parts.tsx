"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { MessagePerson, PersonKind } from "@/lib/admin/types";

/** How often the inbox, an open conversation and the nav badge check for new messages. */
export const INBOX_POLL_MS = 10_000;
export const MAX_DIRECT_LENGTH = 2000;
/** Fired with the new unread total whenever the messages page learns it, so the nav badge updates at once. */
export const UNREAD_EVENT = "astrorize:admin-unread";

export function announceUnread(total: number) {
  window.dispatchEvent(new CustomEvent<number>(UNREAD_EVENT, { detail: total }));
}

/** Runs `tick` every `ms` while the tab is visible, and again when it comes back into view. */
export function usePoll(tick: () => void, ms = INBOX_POLL_MS) {
  const ref = useRef(tick);
  useEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    const run = () => document.visibilityState === "visible" && ref.current();
    const id = setInterval(run, ms);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ms]);
}

export const KIND_LABEL: Record<PersonKind, string> = { staff: "Staff", astrologer: "Astrologer", customer: "Customer" };

const KIND_TONE: Record<PersonKind, { bg: string; fg: string }> = {
  staff: { bg: "#fef3c7", fg: "#92400e" },
  astrologer: { bg: "#ede9fe", fg: "#5b21b6" },
  customer: { bg: "#e0f2fe", fg: "#075985" },
};

/** Small coloured tag: Staff / Astrologer / Customer. */
export function KindTag({ kind }: { kind: PersonKind }) {
  const t = KIND_TONE[kind];
  return (
    <span
      className="inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] text-[10px] font-extrabold tracking-[.02em]"
      style={{ background: t.bg, color: t.fg }}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export function PersonAvatar({ person, size = 36 }: { person: Pick<MessagePerson, "kind" | "initials" | "photo">; size?: number }) {
  const t = KIND_TONE[person.kind];
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.34, background: t.bg, color: t.fg }}
    >
      {person.photo ? <Image src={person.photo} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" /> : person.initials}
    </span>
  );
}

/** Two overlapping avatars for a group, one for a single person. */
export function GroupAvatar({ people, size = 38 }: { people: MessagePerson[]; size?: number }) {
  if (people.length <= 1) return people[0] ? <PersonAvatar person={people[0]} size={size} /> : null;
  const small = Math.round(size * 0.64);
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span className="absolute top-0 left-0">
        <PersonAvatar person={people[0]} size={small} />
      </span>
      <span className="absolute right-0 bottom-0 rounded-full ring-2 ring-paper">
        <PersonAvatar person={people[1]} size={small} />
      </span>
    </span>
  );
}

/** "Neha Gupta", "Neha Gupta and Priya Nair", "Neha Gupta, Priya Nair and 2 others". */
export function peopleTitle(people: MessagePerson[]): string {
  const names = people.map((p) => p.name);
  if (names.length === 0) return "Only you";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length === 3 ? "" : "s"}`;
}
