"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";
import type { Astrologer } from "@/lib/types";

/** How often the list re-reads who is available while the page is open. */
const REFRESH_MS = 30_000;

/**
 * The astrologer list, with availability kept current (every 30 s while visible, and on focus).
 * `enabled: false` keeps the server's list without polling (e.g. a block hidden at this width).
 */
export function useCurrentAstrologers(initial: Astrologer[], enabled = true): Astrologer[] {
  const [state, setState] = useState({ from: initial, list: initial });
  if (state.from !== initial) setState({ from: initial, list: initial });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const { astrologers } = await api.get<{ astrologers: Astrologer[] }>("/astrologers");
        if (!cancelled) setState((s) => ({ ...s, list: astrologers }));
      } catch {
        // Keep what we have; the next tick retries.
      }
    };
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const id = setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return state.list;
}

/** True below the desktop breakpoint (1024px) — the app look. False on the server and on desktop. */
export function useBelowDesktop(): boolean {
  return useSyncExternalStore(subscribeBelow, () => window.matchMedia(BELOW_DESKTOP).matches, () => false);
}

const BELOW_DESKTOP = "(max-width: 1023.98px)";

function subscribeBelow(onChange: () => void): () => void {
  const mq = window.matchMedia(BELOW_DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
