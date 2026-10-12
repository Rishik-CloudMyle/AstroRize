"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Astrologer, ConsultMode, LiveRoom } from "@/lib/types";
import {
  consultationActions,
  lockLabel,
  rememberMinimised,
  useConsultationState,
  wasMinimised,
  type ConsultationView,
} from "@/lib/consultation-store";
import { REACTIVATED_EVENT, useSession } from "@/lib/session-store";
import LoginModal, { type LoginOptions } from "./modals/login-modal";
import InstantCallModal from "./modals/instant-call-modal";
import ConsultModeModal from "./modals/consult-mode-modal";
import ConsultJourney from "./consult/consult-journey";
import { staffConsultNote } from "./consult/consult-gate";

export interface ConsultRequest {
  astrologer: Astrologer;
  /** Pre-select chat or voice when the customer clicked that button. */
  mode?: ConsultMode;
  /** Re-open a consultation that is already under way (waiting, connecting or in session). */
  resume?: ConsultationView;
}

interface AppUI {
  toast: (message: string) => void;
  openLogin: (options?: LoginOptions) => void;
  openInstantCall: (astrologer: Astrologer) => void;
  /** Live room: choose private or public, then join that room's consult queue. */
  openConsultModes: (request: QueueRequest) => void;
  startConsult: (request: ConsultRequest) => void;
  /** Back to the open consultation (from the header pill or a frozen consult button). */
  resumeConsult: () => void;
}

export interface QueueRequest {
  roomId: string;
  /** Called with the room's fresh state once the customer is in the queue. */
  onJoined?: (room: LiveRoom) => void;
}

const AppContext = createContext<AppUI | null>(null);

/** Opens modals, the consult journey and toasts from any client component. */
export function useAppUI(): AppUI {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppUI must be used inside <AppProvider>");
  return ctx;
}

type Overlay =
  | { kind: "login"; options: LoginOptions }
  | { kind: "instant"; astrologer: Astrologer }
  | { kind: "modes"; request: QueueRequest }
  | null;

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const { checked, open } = useConsultationState();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [consult, setConsult] = useState<ConsultRequest | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside the stable callbacks below without re-creating them on every poll.
  const openRef = useRef(open);
  const sessionRef = useRef(session);
  useEffect(() => {
    openRef.current = open;
    sessionRef.current = session;
  });

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4200);
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const closeConsult = useCallback(() => setConsult(null), []);

  // Only customers consult; follow their open consultation while they are signed in.
  const isCustomer = session.ready && session.loggedIn && session.role === "customer";
  useEffect(() => {
    consultationActions.track(isCustomer);
  }, [isCustomer]);

  // Signing in again re-activates a paused account: say so, wherever they signed in.
  useEffect(() => {
    const onReactivated = () => toast("Welcome back — your account is active again.");
    window.addEventListener(REACTIVATED_EVENT, onReactivated);
    return () => window.removeEventListener(REACTIVATED_EVENT, onReactivated);
  }, [toast]);

  // Reloaded mid-wait or mid-session: take the customer straight back to it, once per page load.
  const [autoResumed, setAutoResumed] = useState(false);
  if (checked && !autoResumed) {
    setAutoResumed(true);
    if (open && !wasMinimised(open.id)) setConsult((current) => current ?? { astrologer: open.astrologer, resume: open });
  }

  const ui = useMemo<AppUI>(() => {
    const resumeConsult = () => {
      const current = openRef.current;
      setOverlay(null);
      rememberMinimised(null);
      if (current) setConsult({ astrologer: current.astrologer, resume: current });
    };
    /**
     * True (and the person is told why) when they can't start a consultation: signed in as an
     * astrologer or staff (consultations are for customer accounts), or another one is still open.
     */
    const blocked = () => {
      const s = sessionRef.current;
      if (s.loggedIn && s.role !== "customer") {
        toast(staffConsultNote(s.role));
        return true;
      }
      const current = openRef.current;
      if (!current) return false;
      toast(`${lockLabel(current)}. End or cancel it before starting another.`);
      return true;
    };
    return {
      toast,
      openLogin: (options = {}) => setOverlay({ kind: "login", options }),
      openInstantCall: (astrologer) => {
        if (!blocked()) setOverlay({ kind: "instant", astrologer });
      },
      openConsultModes: (request) => {
        if (!blocked()) setOverlay({ kind: "modes", request });
      },
      startConsult: (request) => {
        if (blocked()) return;
        setOverlay(null);
        setConsult(request);
      },
      resumeConsult,
    };
  }, [toast]);

  /** Instant Call placed: go straight to the waiting screen, which turns into the session when accepted. */
  const onInstantPlaced = useCallback((view: ConsultationView) => {
    consultationActions.apply(view);
    setOverlay(null);
    setConsult({ astrologer: view.astrologer, resume: view });
  }, []);

  return (
    <AppContext.Provider value={ui}>
      {children}

      {overlay?.kind === "login" && <LoginModal onClose={closeOverlay} options={overlay.options} />}
      {overlay?.kind === "instant" && (
        <InstantCallModal astrologer={overlay.astrologer} onClose={closeOverlay} onPlaced={onInstantPlaced} />
      )}
      {overlay?.kind === "modes" && <ConsultModeModal request={overlay.request} onClose={closeOverlay} />}
      {consult && (
        <ConsultJourney
          key={consult.resume?.id ?? `${consult.astrologer.id}-${consult.mode ?? ""}`}
          astrologer={consult.astrologer}
          initialMode={consult.mode ?? null}
          resume={consult.resume ?? null}
          onClose={closeConsult}
        />
      )}

      {toastMessage && (
        <div
          role="status"
          className="az-toast fixed bottom-7 left-1/2 z-[400] flex w-[calc(100%-32px)] max-w-[620px] -translate-x-1/2 items-start gap-[11px] rounded-[14px] bg-ink px-[18px] py-3.5 text-line shadow-[0_16px_40px_rgba(11,31,51,.3)]"
        >
          <span className="text-sm text-amber-300">✓</span>
          <span className="text-[13.5px] leading-normal">{toastMessage}</span>
        </div>
      )}
    </AppContext.Provider>
  );
}
