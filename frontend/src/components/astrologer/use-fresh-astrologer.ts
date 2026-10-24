"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { Astrologer } from "@/lib/types";

// Pages are server-rendered with the astrologer as they were at that moment. While the page
// stays open, re-read them so the consult buttons follow the astrologer going online,
// offline, live or into a consultation — without a reload.

const POLL_MS = 20_000;
const RECHECK_EVENT = "astrorize:recheck-availability";

/** Ask every open page to re-read availability now (e.g. the API just refused a consult). */
export function recheckAvailability() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RECHECK_EVENT));
}

/**
 * The astrologer, kept current: checked on open, every 20 s while visible, and on focus.
 * `enabled: false` keeps the server's copy without checking (a layout hidden at this width).
 */
export function useFreshAstrologer(initial: Astrologer, enabled = true): Astrologer {
  const [state, setState] = useState({ from: initial, value: initial });
  // New server data (another profile, or a refresh) replaces what we had.
  if (state.from !== initial) setState({ from: initial, value: initial });
  const slug = initial.slug;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;
    const check = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const { astrologer } = await api.get<{ astrologer: Astrologer }>(`/astrologers/${encodeURIComponent(slug)}`);
        if (!cancelled) setState((s) => (s.value.slug === astrologer.slug ? { ...s, value: astrologer } : s));
      } catch (e) {
        // No longer listed: nobody can consult them. Other errors keep what we knew; the next check retries.
        if (!cancelled && e instanceof ApiError && e.status === 404) {
          setState((s) => ({ ...s, value: { ...s.value, availability: "off" } }));
        }
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    void check();
    const id = setInterval(check, POLL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(RECHECK_EVENT, onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(RECHECK_EVENT, onVisible);
    };
  }, [slug, enabled]);

  return state.value;
}
