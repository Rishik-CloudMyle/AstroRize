"use client";

import { useEffect, useState } from "react";
import { lockLabel, useConsultationState, useOpenConsultation, type ConsultationView } from "@/lib/consultation-store";
import { clock } from "@/lib/format";
import { useAppUI } from "../app-provider";

// While a customer has a consultation open, every other way to consult is frozen. These
// pieces show that clearly and always offer a way back to it.

/** Tooltip / label on a frozen consult button. */
export const FROZEN_HINT = "Consultation in progress — end or cancel it to start another";

/** Seconds the astrologer has left to accept, ticking between polls (null when not counting down). */
function useAcceptCountdown(): number | null {
  const { open, receivedAt } = useConsultationState();
  const [now, setNow] = useState(() => Date.now());
  const counting = open?.status === "requested" && open.secondsToAccept !== null;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);
  if (!counting || open?.secondsToAccept == null) return null;
  return Math.max(0, open.secondsToAccept - Math.floor(Math.max(0, now - receivedAt) / 1000));
}

/** Slim strip under the site header: "Consultation with … in progress · Return". */
export function ConsultInProgressBar() {
  const open = useOpenConsultation();
  const { resumeConsult } = useAppUI();
  const left = useAcceptCountdown();
  if (!open) return null;
  const waiting = open.status === "requested";
  return (
    <div className="border-t border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-[1240px] items-center gap-2.5 px-4 py-2 sm:px-6">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full ${waiting ? "animate-pulse bg-amber-500" : "bg-green-600"}`}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-amber-900">{lockLabel(open)}</span>
        {waiting && left !== null && (
          <span className="shrink-0 text-[13px] font-bold text-amber-900 tabular-nums" aria-label="Time left to accept">
            {clock(left)}
          </span>
        )}
        <button
          type="button"
          onClick={resumeConsult}
          className="h-8 shrink-0 rounded-full bg-ink px-3.5 text-[12.5px] font-bold text-paper"
        >
          Return ›
        </button>
      </div>
    </div>
  );
}

/** In a consult card: why the buttons are frozen, and the way back. */
export function ConsultFrozenNote({ open, astrologerId }: { open: ConsultationView; astrologerId?: string }) {
  const { resumeConsult } = useAppUI();
  const here = open.astrologer.id === astrologerId;
  return (
    <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-3">
      <b className="block text-[13px] text-amber-900">
        {open.status === "requested"
          ? here
            ? "Your Instant Call is waiting to be accepted"
            : `You're waiting for ${open.astrologer.name}`
          : here
            ? "You're in a consultation with this astrologer"
            : `You're in a consultation with ${open.astrologer.name}`}
      </b>
      <span className="mt-0.5 block text-[12px] leading-normal text-amber-900/80">
        Other ways to consult are paused until you end or cancel it.
      </span>
      <button type="button" onClick={resumeConsult} className="mt-2 text-[12.5px] font-bold text-amber-800 underline">
        Return to it ›
      </button>
    </div>
  );
}
