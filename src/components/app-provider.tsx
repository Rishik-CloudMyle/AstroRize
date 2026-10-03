"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Astrologer, ConsultMode } from "@/lib/types";
import LoginModal from "./modals/login-modal";
import InstantCallModal from "./modals/instant-call-modal";
import ConsultModeModal from "./modals/consult-mode-modal";
import ConsultJourney from "./consult/consult-journey";

export interface ConsultRequest {
  astrologerId: string;
  /** Pre-select chat or voice when the customer clicked that button. */
  mode?: ConsultMode;
}

interface AppUI {
  toast: (message: string) => void;
  openLogin: () => void;
  openInstantCall: (astrologerId: string) => void;
  openConsultModes: () => void;
  startConsult: (request: ConsultRequest) => void;
}

const AppContext = createContext<AppUI | null>(null);

/** Opens modals, the consult journey and toasts from any client component. */
export function useAppUI(): AppUI {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppUI must be used inside <AppProvider>");
  return ctx;
}

type Overlay =
  | { kind: "login" }
  | { kind: "instant"; astrologerId: string }
  | { kind: "modes" }
  | null;

export default function AppProvider({
  astrologers,
  children,
}: {
  astrologers: Astrologer[];
  children: React.ReactNode;
}) {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [consult, setConsult] = useState<ConsultRequest | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4200);
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);
  const closeConsult = useCallback(() => setConsult(null), []);

  const ui = useMemo<AppUI>(
    () => ({
      toast,
      openLogin: () => setOverlay({ kind: "login" }),
      openInstantCall: (astrologerId) => setOverlay({ kind: "instant", astrologerId }),
      openConsultModes: () => setOverlay({ kind: "modes" }),
      startConsult: (request) => {
        setOverlay(null);
        setConsult(request);
      },
    }),
    [toast],
  );

  const instantAstrologer =
    overlay?.kind === "instant" ? astrologers.find((a) => a.id === overlay.astrologerId) : undefined;
  const consultAstrologer = consult ? astrologers.find((a) => a.id === consult.astrologerId) : undefined;

  return (
    <AppContext.Provider value={ui}>
      {children}

      {overlay?.kind === "login" && <LoginModal onClose={closeOverlay} />}
      {instantAstrologer && <InstantCallModal astrologer={instantAstrologer} onClose={closeOverlay} />}
      {overlay?.kind === "modes" && <ConsultModeModal onClose={closeOverlay} />}
      {consult && consultAstrologer && (
        <ConsultJourney
          key={`${consult.astrologerId}-${consult.mode ?? ""}`}
          astrologer={consultAstrologer}
          initialMode={consult.mode ?? null}
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
