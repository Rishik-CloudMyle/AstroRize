"use client";

import { useSyncExternalStore } from "react";

// True at the desktop breakpoint (Tailwind `lg`, >= 1024px). For client-only screens that render
// one tree for desktop and a different (app-look) tree for phones and tablets, so the two never
// both mount (no duplicate requests or element ids). The server snapshot is `true` (desktop), so
// only use it below a point that already waits for the browser (e.g. after `useHydrated()`).

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
