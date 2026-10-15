"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LiveChatLine } from "@/lib/types";

/** A viewer's round photo, or their initials when they have none. */
export function FeedAvatar({ photo, initials, size = 22 }: { photo: string | null; initials: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#2a241e] font-bold text-amber-200"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {photo ? (
        // Uploaded photos are served by the API as-is; no resizing needed at this size.
        <Image src={photo} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

/** How long one bubble takes to float up and fade away. */
const BUBBLE_MS = 3800;
/** How far a bubble rises in that time (the overlay is a little taller than this). */
const RISE_PX = 160;
/** Space kept between one bubble and the next as they rise. */
const BUBBLE_GAP_PX = 6;
/** At most this many bubbles in the air at once; at most this many waiting their turn. */
const MAX_FLYING = 5;
const MAX_WAITING = 5;
/** On opening, the room's last few lines float up once so the viewer sees what's going on. */
const SEED_LINES = 3;
/** With reduced motion bubbles don't move, so they only need a short pause between them. */
const STILL_GAP_MS = 300;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Decides when each new feed line floats up. Every line floats exactly once on this page (ids
 * are remembered across refreshes), one after another: the next leaves once the previous one
 * has risen its own height, so bubbles never overlap however many arrive in one refresh.
 */
class BubbleQueue {
  private seen: Set<string> | null = null;
  private waiting: LiveChatLine[] = [];
  private flying: LiveChatLine[] = [];
  /** When the next bubble may leave; Infinity until the last one launched has been measured. */
  private nextAt = 0;
  private lastId: string | null = null;
  private lastAt = 0;
  private pump: Timer | null = null;
  private timers = new Set<Timer>();
  reduced = false;

  constructor(private publish: (lines: LiveChatLine[]) => void) {}

  /** Each refresh's feed (oldest first). Gift lines are left to the gift pill over the video. */
  offer(lines: LiveChatLine[]) {
    const floatable = lines.filter((l) => l.kind !== "gift");
    let fresh: LiveChatLine[];
    if (!this.seen) {
      this.seen = new Set(lines.map((l) => l.id));
      fresh = floatable.slice(-SEED_LINES);
    } else {
      const seen = this.seen;
      fresh = floatable.filter((l) => !seen.has(l.id));
      for (const l of lines) seen.add(l.id);
    }
    if (!fresh.length) return;
    this.waiting = [...this.waiting, ...fresh].slice(-MAX_WAITING);
    this.schedule();
  }

  /** The bubble just launched is on screen: the next may leave once it has risen this high. */
  measured(id: string, height: number) {
    if (id !== this.lastId || this.nextAt !== Infinity) return;
    this.nextAt = this.lastAt + ((height + BUBBLE_GAP_PX) / RISE_PX) * BUBBLE_MS;
    this.schedule();
  }

  dispose() {
    if (this.pump) clearTimeout(this.pump);
    this.pump = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private schedule() {
    if (this.pump || !this.waiting.length || this.nextAt === Infinity) return;
    this.pump = setTimeout(() => {
      this.pump = null;
      this.launch();
    }, Math.max(0, this.nextAt - Date.now()));
  }

  private launch() {
    const line = this.waiting.shift();
    if (!line) return;
    this.flying = [...this.flying, line].slice(-MAX_FLYING);
    this.publish(this.flying);
    this.lastId = line.id;
    this.lastAt = Date.now();
    this.nextAt = this.reduced ? this.lastAt + STILL_GAP_MS : Infinity;
    // If it is never measured, carry on after a moment anyway.
    this.later(() => {
      if (this.lastId === line.id && this.nextAt === Infinity) {
        this.nextAt = 0;
        this.schedule();
      }
    }, 1000);
    // Each bubble goes on its own, whether or not anything new arrives.
    this.later(() => {
      this.flying = this.flying.filter((l) => l !== line);
      this.publish(this.flying);
    }, BUBBLE_MS);
    this.schedule();
  }
}

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True when the visitor asked their system for reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => false);
}

/** One feed line as a bubble: "<name> joined" lighter, messages with the name in gold. */
function FeedBubble({
  line,
  onShown,
  className = "",
  style,
}: {
  line: LiveChatLine;
  onShown: (id: string, height: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { id } = line;
  // Measured once, as it appears, so the next bubble waits until this one has risen clear.
  useLayoutEffect(() => {
    if (ref.current) onShown(id, ref.current.offsetHeight);
  }, [id, onShown]);
  return line.kind === "join" ? (
    <div
      ref={ref}
      style={style}
      className={`flex max-w-full items-center gap-2 rounded-full bg-[rgba(12,10,18,.4)] py-1 pl-1 pr-2.5 text-[11px] text-[#e7e0d6] ${className}`}
    >
      <FeedAvatar photo={line.photo} initials={line.initials} />
      <span className="min-w-0 truncate">
        <b className="font-bold">{line.who}</b> joined
      </span>
    </div>
  ) : (
    <div
      ref={ref}
      style={style}
      className={`flex max-w-full items-start gap-2 rounded-[14px] bg-[rgba(12,10,18,.48)] py-1.5 pl-1.5 pr-2.5 text-[12px] leading-[1.35] text-[#f8f4ec] shadow-[0_4px_14px_rgba(0,0,0,.18)] ${className}`}
    >
      <FeedAvatar photo={line.photo} initials={line.initials} />
      <span className="line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">
        <b className="mr-1 inline-block max-w-[14ch] truncate align-bottom text-[10.5px] font-bold text-amber-200">{line.who}</b>
        {line.text}
      </span>
    </div>
  );
}

/** Lines kept in the screen reader's log of the room (`announce`). */
const LOG_LINES = 30;
const BUBBLE_TIMING = { "--az-rise": `${RISE_PX}px`, "--az-life": `${BUBBLE_MS}ms` } as React.CSSProperties;

/**
 * The room feed over the bottom-left of the live video, like the app: each new message or
 * "<name> joined" floats up from the bottom and fades away on its own, a few in the air at once.
 * `announce` adds the screen reader's log of the room (when no other chat list is shown);
 * otherwise it is decorative and the page's chat list is the readable one.
 */
export function LiveFeedOverlay({
  lines,
  announce = false,
  className = "h-[190px]",
}: {
  lines: LiveChatLine[];
  announce?: boolean;
  /** Includes the overlay's height (190px by default). */
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [flying, setFlying] = useState<LiveChatLine[]>([]);
  const queue = useRef<BubbleQueue | null>(null);

  useEffect(() => {
    const q = new BubbleQueue(setFlying);
    queue.current = q;
    return () => {
      q.dispose();
      queue.current = null;
    };
  }, []);
  useEffect(() => {
    if (queue.current) queue.current.reduced = reduced;
  }, [reduced]);
  useEffect(() => {
    queue.current?.offer(lines);
  }, [lines]);

  const onShown = useCallback((id: string, height: number) => queue.current?.measured(id, height), []);

  return (
    <>
      {announce && (
        <ul role="log" aria-live="polite" aria-label="Room activity" className="sr-only">
          {lines.slice(-LOG_LINES).map((l) => (
            <li key={l.id}>
              {l.who} {l.kind === "join" ? "joined" : l.text}
            </li>
          ))}
        </ul>
      )}
      {/* Rising bubbles are positioned on their own; with reduced motion they simply stack. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none relative w-[min(72%,300px)] shrink-0 overflow-hidden [mask-image:linear-gradient(180deg,transparent,#000_34%)] ${
          reduced ? "flex flex-col items-start justify-end gap-1.5" : ""
        } ${className}`}
      >
        {flying.map((l) => (
          <FeedBubble
            key={l.id}
            line={l}
            onShown={onShown}
            style={BUBBLE_TIMING}
            className={reduced ? "az-bubble" : "az-bubble absolute bottom-0 left-0"}
          />
        ))}
      </div>
    </>
  );
}

// A minute clock for "Live for 12 min". Null during the server render, so the label never
// disagrees between the server's clock and the browser's.
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribeClock, minuteNow, () => null);
}

/** "Live for 12 min", "Live for 1 h 5 min", "Just went live"; null before the clock is known. */
export function liveForLabel(startedAt: string, minute: number | null): string | null {
  if (minute === null) return null;
  const mins = Math.max(0, minute - Math.floor(Date.parse(startedAt) / 60_000));
  if (mins < 1) return "Just went live";
  if (mins < 60) return `Live for ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `Live for ${h} h${m ? ` ${m} min` : ""}`;
}

/** "45 min" or "1 h 30 min" planned. */
export function plannedLabel(durationMins: number | null): string | null {
  if (!durationMins) return null;
  if (durationMins < 60) return `${durationMins} min`;
  const h = Math.floor(durationMins / 60);
  const m = durationMins % 60;
  return `${h} h${m ? ` ${m} min` : ""}`;
}
