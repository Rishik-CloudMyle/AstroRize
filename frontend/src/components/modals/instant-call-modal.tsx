"use client";

import { useState } from "react";
import type { Astrologer } from "@/lib/types";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { consultationActions, type ConsultationView } from "@/lib/consultation-store";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import { recheckAvailability } from "../astrologer/use-fresh-astrologer";
import { multiplierLabel } from "../consult/consult-sheet";
import Modal from "../ui/modal";

/**
 * Instant Call confirmation. Shows the selected astrologer's real Instant Call
 * rate and multiplier (the prototype hard-coded ₹84 / ₹28 for everyone). Confirming
 * places the request; the customer then waits on the consult screen for the astrologer
 * to accept and goes straight into the session.
 */
export default function InstantCallModal({
  astrologer,
  onClose,
  onPlaced,
}: {
  astrologer: Astrologer;
  onClose: () => void;
  onPlaced: (consultation: ConsultationView) => void;
}) {
  const { toast, openLogin, resumeConsult } = useAppUI();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The rate the customer agreed to: the one shown, or the new one after a price change.
  const [quoted, setQuoted] = useState(astrologer.instant);
  const [changedFrom, setChangedFrom] = useState<number | null>(null);
  const rate = `${rupee(quoted)}/min`;

  async function confirm() {
    if (busy) return;
    if (!session.loggedIn) {
      openLogin({ notice: `Log in to place an Instant Call to ${astrologer.name}.` });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ consultation: ConsultationView }>("/instant-calls", { astrologerId: astrologer.id, quotedRate: quoted });
      onPlaced(res.consultation);
    } catch (e) {
      if (e instanceof ApiError && e.code === "consultation_in_progress") {
        // Another tab started one: take the customer back to it instead.
        await consultationActions.refresh();
        toast(e.message);
        resumeConsult();
        return;
      }
      if (e instanceof ApiError && e.code === "rate_changed" && typeof e.details.rate === "number") {
        // The price changed since this was shown: nothing was placed; confirm the new rate first.
        setChangedFrom(quoted);
        setQuoted(e.details.rate);
        recheckAvailability();
        setBusy(false);
        return;
      }
      // The astrologer just went offline, live or into another consultation: the page behind re-checks.
      if (e instanceof ApiError && e.status === 409) recheckAvailability();
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="instant-title" maxWidth={420}>
      <div className="inline-flex h-[26px] items-center gap-[7px] rounded-full bg-blue-50 px-[11px] text-[11.5px] font-extrabold text-blue-700">
        ⚡ Instant Call
      </div>
      <h2 id="instant-title" className="mt-3 font-display text-[27px] font-semibold text-ink">
        Confirm the rate before we dial
      </h2>
      <div className="mt-4 rounded-2xl border border-line bg-white p-[18px]">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-[34px] font-bold tabular-nums text-ink">{rupee(quoted)}</span>
          <span className="text-sm font-semibold text-stone-600">/min</span>
          <span className="ml-auto inline-flex h-[26px] items-center rounded-full bg-orange-100 px-[11px] text-xs font-extrabold text-orange-700">
            {multiplierLabel(astrologer)}
          </span>
        </div>
        <div className="mt-2 text-[13px] text-stone-600">
          {changedFrom === null && <>Standard rate {rupee(astrologer.price)}/min. </>}
          {astrologer.name} is asked straight away and has 3 minutes to
          accept — you go into the call as soon as they do.
        </div>
      </div>
      <div className="mt-3.5 text-[12.5px] leading-normal text-stone-500">
        If the astrologer declines or doesn&apos;t answer in time you are not charged and nothing is reserved. Billing
        starts only once the call connects; the first 60 seconds are free.
      </div>
      {changedFrom !== null && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-900">
          The rate changed from {rupee(changedFrom)} to {rupee(quoted)}/min — continue at {rupee(quoted)}? Nothing has been placed yet.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-[18px] grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-xl border border-line bg-white text-[14.5px] font-bold text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="h-12 rounded-xl bg-urgent px-2 text-[14.5px] font-bold text-white disabled:opacity-70"
        >
          {busy ? "Placing the call…" : `Confirm ${rate}`}
        </button>
      </div>
    </Modal>
  );
}
