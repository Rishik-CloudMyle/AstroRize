"use client";

import { useSyncExternalStore } from "react";
import { api } from "./api/client";
import type { Astrologer, ConsultMode, Settlement } from "./types";

// The signed-in customer's open consultation (waiting for the astrologer, connecting or in
// session), mirrored from GET /api/consultations/active. A customer can have only one at a
// time, so while this is set every consult button on the site is frozen and the header
// offers a way back to it. The API enforces the same rule.

export type ConsultationStatus = "requested" | "connecting" | "active" | "ended" | "rejected" | "timed_out" | "cancelled";

/** GET /api/consultations/active and /api/consultations/:id */
export interface ConsultationView {
  id: string;
  ref: string;
  status: ConsultationStatus;
  kind: "instant" | "standard";
  mode: ConsultMode;
  /** Per-minute rate fixed when it was requested (₹) */
  rate: number;
  /** Balance held for the session (₹); 0 until it connects */
  held: number;
  astrologer: Astrologer;
  requestedAt: string;
  /** Requests ahead of this one in the astrologer's queue */
  ahead: number;
  /** When the astrologer's 3-minute window to accept closes (null until they are asked) */
  acceptBy: string | null;
  secondsToAccept: number | null;
  connectedAt: string | null;
  /** Connected seconds by the server clock */
  elapsedSeconds: number;
  freeSeconds: number;
  maxSeconds: number;
  endReason: string | null;
  settlement: Settlement | null;
}

const OPEN: ConsultationStatus[] = ["requested", "connecting", "active"];
export const isOpen = (c: ConsultationView | null): c is ConsultationView => !!c && OPEN.includes(c.status);

interface State {
  /** False until the first answer for the signed-in customer arrives. */
  checked: boolean;
  open: ConsultationView | null;
  /** When `open` arrived (Date.now()), so countdowns can tick between polls. */
  receivedAt: number;
}

const POLL_MS = 4000;
const EMPTY: State = { checked: false, open: null, receivedAt: 0 };

let state: State = EMPTY;
let tracking = false;
let timer: ReturnType<typeof setInterval> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
  // Poll only while something is open; otherwise one check on load (and on focus) is enough.
  const wantPoll = tracking && !!next.open;
  if (wantPoll && !timer) timer = setInterval(() => void consultationActions.refresh(), POLL_MS);
  if (!wantPoll && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function onFocus() {
  if (!document.hidden) void consultationActions.refresh();
}

export const consultationActions = {
  /** Called when a customer signs in (true) or anyone else is signed in / signed out (false). */
  track(enabled: boolean) {
    if (typeof window === "undefined" || enabled === tracking) return;
    tracking = enabled;
    generation++;
    if (enabled) {
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      void consultationActions.refresh();
    } else {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      setState(EMPTY);
    }
  },

  async refresh() {
    if (!tracking) return state.open;
    const gen = generation;
    try {
      const { consultation } = await api.get<{ consultation: ConsultationView | null }>("/consultations/active");
      // Ignore an answer that arrives after signing out.
      if (gen === generation && tracking) setState({ checked: true, open: isOpen(consultation) ? consultation : null, receivedAt: Date.now() });
    } catch {
      // A missed poll is retried on the next tick; keep showing what we knew.
      if (gen === generation && !state.checked) setState({ ...state, checked: true });
    }
    return state.open;
  },

  /** Record a fresher view straight away (e.g. the consult journey just polled it). */
  apply(c: ConsultationView | null) {
    if (!tracking) return;
    setState({ checked: true, open: isOpen(c) ? c : null, receivedAt: Date.now() });
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => EMPTY;

export function useConsultationState(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The open consultation that freezes every other consult button, or null. */
export function useOpenConsultation(): ConsultationView | null {
  return useConsultationState().open;
}

/** "Waiting for Pt. Raghav Joshi" / "Consultation with Pt. Raghav Joshi" — the short label for frozen buttons and the header. */
export function lockLabel(c: ConsultationView): string {
  return c.status === "requested" ? `Waiting for ${c.astrologer.name} to accept` : `Consultation with ${c.astrologer.name} in progress`;
}

// The customer minimised the consult screen to browse: in this tab, don't pop it back up
// on every page load. (Per-tab convenience only; the header strip always offers the way back.)
const MINIMISED_KEY = "astrorize.consult.minimised";

export function rememberMinimised(id: string | null) {
  try {
    if (id) sessionStorage.setItem(MINIMISED_KEY, id);
    else sessionStorage.removeItem(MINIMISED_KEY);
  } catch {
    // Storage blocked (private mode): the screen simply re-opens on reload.
  }
}

export function wasMinimised(id: string): boolean {
  try {
    return sessionStorage.getItem(MINIMISED_KEY) === id;
  } catch {
    return false;
  }
}
