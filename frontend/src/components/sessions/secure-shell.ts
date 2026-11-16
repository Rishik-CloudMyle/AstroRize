"use client";

import { useSyncExternalStore } from "react";

// A hook for a FUTURE native wrapper (Android with FLAG_SECURE, iOS with its screen-capture checks).
// A website, an installed web app (PWA) and a Trusted Web Activity cannot block screenshots or
// screen recorders themselves; only a native shell can. When one wraps the site it sets
//   window.AstroRizeNative = { secure: true }
// before the page loads (e.g. through an injected script / JS bridge) to say "the operating system
// is blocking screen capture for this window". Nothing in the website sets it, so on the web this is
// always false and the page says plainly that it can only deter, not block.

declare global {
  interface Window {
    AstroRizeNative?: { secure?: boolean };
  }
}

export function isSecureShell(): boolean {
  return typeof window !== "undefined" && window.AstroRizeNative?.secure === true;
}

const subscribe = () => () => {};

/** The same flag as state (false while rendering on the server, then read from the browser). */
export function useSecureShell(): boolean {
  return useSyncExternalStore(subscribe, isSecureShell, () => false);
}
