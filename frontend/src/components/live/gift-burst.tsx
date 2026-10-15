"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveGift } from "@/lib/types";
import { FeedAvatar } from "./live-feed";

/** How long one gift pill stays (sliding in included) before it slides out. */
const HOLD_MS = 2600;
/** How long sliding out takes. */
const OUT_MS = 450;
/** Pills shown at once by default (newest lowest); more wait their turn, up to MAX_WAITING. */
const MAX_SHOWN = 3;
const MAX_WAITING = 6;
/** A short pause between pills arriving together, so each one is seen arriving. */
const STAGGER_MS = 350;
/** One pill's height and the gap above it (the stack moves up by this much per pill). */
const PILL_H = 42;
const PILL_GAP = 6;

export interface ShownGift {
  gift: LiveGift;
  leaving: boolean;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * Which gifts are showing over the video. Each gift shows once per page; what was already sent
 * when the page started watching isn't replayed. Up to three show at once; each slides out on
 * its own after a couple of seconds, and the ones waiting take their place.
 */
class GiftQueue {
  private seen: Set<string> | null = null;
  private waiting: LiveGift[] = [];
  private shown: ShownGift[] = [];
  private nextAt = 0;
  private pump: Timer | null = null;
  private timers = new Set<Timer>();

  constructor(
    private publish: (shown: ShownGift[]) => void,
    private maxShown: number,
  ) {}

  /** Each refresh's recent gifts (newest first): queues the ones this page hasn't seen. */
  offer(gifts: LiveGift[]) {
    if (!this.seen) {
      this.seen = new Set(gifts.map((g) => g.id));
      return;
    }
    const seen = this.seen;
    const fresh = gifts.filter((g) => !seen.has(g.id)).reverse(); // oldest first
    for (const g of fresh) seen.add(g.id);
    this.enqueue(fresh);
  }

  /** A gift this page just sent: shown straight away (and never again from a refresh). */
  play(gift: LiveGift) {
    if (!this.seen) this.seen = new Set();
    if (this.seen.has(gift.id)) return;
    this.seen.add(gift.id);
    this.enqueue([gift]);
  }

  dispose() {
    if (this.pump) clearTimeout(this.pump);
    this.pump = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private enqueue(gifts: LiveGift[]) {
    if (!gifts.length) return;
    this.waiting = [...this.waiting, ...gifts].slice(-MAX_WAITING);
    this.schedule();
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private schedule() {
    if (this.pump || !this.waiting.length) return;
    // A slot frees when a pill has gone; launch() is tried again then.
    if (this.shown.filter((s) => !s.leaving).length >= this.maxShown) return;
    this.pump = setTimeout(() => {
      this.pump = null;
      this.launch();
    }, Math.max(0, this.nextAt - Date.now()));
  }

  private set(shown: ShownGift[]) {
    this.shown = shown;
    this.publish(shown);
  }

  private launch() {
    if (this.shown.filter((s) => !s.leaving).length >= this.maxShown) return;
    const gift = this.waiting.shift();
    if (!gift) return;
    this.set([...this.shown, { gift, leaving: false }]);
    this.nextAt = Date.now() + STAGGER_MS;
    this.later(() => {
      this.set(this.shown.map((s) => (s.gift === gift ? { ...s, leaving: true } : s)));
      this.schedule();
    }, HOLD_MS);
    this.later(() => {
      this.set(this.shown.filter((s) => s.gift !== gift));
      this.schedule();
    }, HOLD_MS + OUT_MS);
    this.schedule();
  }
}

/**
 * The gifts to show over the video: `shown` for <GiftStack>, `offer` each refresh's gifts, `play`
 * one just sent. `maxShown`: how many pills fit over this video at once.
 */
export function useGiftShow(maxShown = MAX_SHOWN) {
  const [shown, setShown] = useState<ShownGift[]>([]);
  const queue = useRef<GiftQueue | null>(null);
  // Gifts offered before the queue exists (the first render's effects) wait here.
  const early = useRef<{ offer: LiveGift[][]; play: LiveGift[] }>({ offer: [], play: [] });

  useEffect(() => {
    const q = new GiftQueue(setShown, maxShown);
    queue.current = q;
    for (const g of early.current.offer) q.offer(g);
    for (const g of early.current.play) q.play(g);
    early.current = { offer: [], play: [] };
    return () => {
      q.dispose();
      queue.current = null;
    };
  }, [maxShown]);

  const offer = useCallback((gifts: LiveGift[]) => {
    if (queue.current) queue.current.offer(gifts);
    else early.current.offer.push(gifts);
  }, []);
  const play = useCallback((gift: LiveGift) => {
    if (queue.current) queue.current.play(gift);
    else early.current.play.push(gift);
  }, []);

  return { shown, offer, play };
}

/** Where a sparkle flies to from the gift (x, y in px). */
const SPARKLES: [number, number][] = [
  [-14, -16],
  [15, -13],
  [17, 9],
  [-12, 12],
];

/**
 * Gifts over the lower part of the video: a small glass pill sliding in from the left —
 * "<avatar> Kavya sent Lotus" with the gift popping in a soft glow — that slides out after a
 * couple of seconds. Newer pills arrive below and push older ones up. Decorative: the room's
 * feed or chat list announces gifts for screen readers.
 */
export function GiftStack({ gifts, className = "" }: { gifts: ShownGift[]; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none relative w-[min(80%,290px)] shrink-0 ${className}`} style={{ height: PILL_H }}>
      {gifts.map(({ gift, leaving }, i) => {
        const fromNewest = gifts.length - 1 - i; // 0 = newest, at the bottom
        return (
          <div
            key={gift.id}
            className="absolute bottom-0 left-0 max-w-full transition-[transform,opacity] duration-300 ease-out"
            style={{
              transform: `translate3d(0, ${-fromNewest * (PILL_H + PILL_GAP)}px, 0)`,
              opacity: fromNewest === 0 ? 1 : fromNewest === 1 ? 0.85 : 0.62,
            }}
          >
            <div
              className={`flex max-w-full items-center gap-2 rounded-full border border-amber-200/30 bg-[linear-gradient(90deg,rgba(120,53,15,.82),rgba(28,25,23,.5))] py-[3px] pl-[3px] pr-1.5 text-[#f8f4ec] shadow-[0_6px_18px_rgba(0,0,0,.28),0_0_16px_rgba(251,191,36,.22)] backdrop-blur-md ${
                leaving ? "az-pill-out" : "az-pill-in"
              }`}
              style={{ height: PILL_H }}
            >
              <FeedAvatar photo={gift.photo} initials={gift.initials} size={34} />
              <span className="min-w-0 flex-1 leading-[1.2]">
                <b className="block truncate text-[12.5px] font-bold text-amber-200">{gift.who}</b>
                <span className="block truncate text-[11.5px] text-white/85">sent {gift.name}</span>
              </span>
              <span className="relative grid size-[34px] shrink-0 place-items-center">
                <span className="az-gift-glow absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(252,211,77,.7),rgba(245,158,11,.15)_60%,transparent_72%)]" />
                {SPARKLES.map(([x, y]) => (
                  <span
                    key={`${x},${y}`}
                    className="az-sparkle absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-1.5 rounded-full bg-amber-100 shadow-[0_0_6px_rgba(253,230,138,.9)]"
                    style={{ "--az-sx": `${x}px`, "--az-sy": `${y}px` } as React.CSSProperties}
                  />
                ))}
                <span className="az-gift-pop relative text-[22px] leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,.35)]">{gift.icon}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
