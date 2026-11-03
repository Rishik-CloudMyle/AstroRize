"use client";

import { useEffect, useState } from "react";
import { api } from "./api/client";
import { useSession } from "./session-store";

// Free replacement calls ("make-good"): after a complaint AstroRize may offer the customer free
// minutes with the same astrologer instead of a refund. The astrologer's profile and consult sheet
// show it, and a consultation started with it is free for those minutes (the API's rule).

export interface MakeGoodCredit {
  id: string;
  astrologerId: string;
  astrologerSlug: string | null;
  astrologerName: string;
  /** Free minutes */
  minutes: number;
  /** The session the complaint was about, e.g. "SES-88214" */
  sessionRef: string;
  /** "5 Nov 2026": the last day it can be booked */
  validUntil: string;
  /** A consultation using it is open right now */
  inUse: boolean;
}

/** Fired when the customer's replacement calls change (one was used, or turned out to be gone). */
const CHANGED = "astrorize:makegood-changed";
export const makeGoodChanged = () => {
  window.dispatchEvent(new Event(CHANGED));
};

/**
 * The signed-in customer's free replacement call with this astrologer that can be used now (the one
 * expiring soonest), or null — visitors, other roles, none offered. Re-read whenever it changes.
 */
export function useMakeGood(astrologerId: string): MakeGoodCredit | null {
  const session = useSession();
  const who = session.ready && session.loggedIn && session.role === "customer" ? session.email || session.phone || session.user.name : "";
  const [state, setState] = useState<{ who: string; credits: MakeGoodCredit[] }>({ who: "", credits: [] });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGED, bump);
    return () => window.removeEventListener(CHANGED, bump);
  }, []);

  useEffect(() => {
    if (!who) return;
    let cancelled = false;
    api
      .get<{ credits: MakeGoodCredit[] }>("/me/makegood")
      .then((r) => !cancelled && setState({ who, credits: r.credits }))
      .catch(() => {
        // Nothing shown; the API still applies a replacement call only when it is really there.
      });
    return () => {
      cancelled = true;
    };
  }, [who, version]);

  if (!who || state.who !== who) return null;
  return state.credits.find((c) => c.astrologerId === astrologerId && !c.inUse) ?? null;
}
