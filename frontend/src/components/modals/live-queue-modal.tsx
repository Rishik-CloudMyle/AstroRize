"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import type { LiveRoom } from "@/lib/types";
import { useAppUI, type QueueRequest } from "../app-provider";
import { recheckAvailability } from "../astrologer/use-fresh-astrologer";
import Modal from "../ui/modal";

/** Minutes of balance a consultation needs before it can start (same rule as every consultation). */
const ELIGIBILITY_MINUTES = 5;

/**
 * Live room: join the consult queue. Consultations from a live are always private: the room keeps
 * seeing the astrologer's video, only this customer hears them, and the customer is never shown.
 * The rate shown here is the rate they pay if accepted.
 */
export default function LiveQueueModal({ request, onClose }: { request: QueueRequest; onClose: () => void }) {
  const { toast } = useAppUI();
  const host = request.astrologer;
  const [quoted, setQuoted] = useState(host.price);
  const [changedFrom, setChangedFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [short, setShort] = useState(false);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError("");
    setShort(false);
    try {
      const { room } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(request.roomId)}/queue`, { quotedRate: quoted });
      request.onJoined?.(room);
      onClose();
      toast(`You're #${room.queue.position} in the queue for a private consultation. We'll ask you to join when it's your turn.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "rate_changed" && typeof e.details.rate === "number") {
        setChangedFrom(quoted);
        setQuoted(e.details.rate);
        recheckAvailability();
      } else {
        setShort(e instanceof ApiError && e.code === "insufficient_balance");
        setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
      }
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="queue-title" maxWidth={460}>
      <div className="mt-1.5 text-[11px] font-extrabold uppercase tracking-[.1em] text-amber-700">🔒 Private consultation</div>
      <h2 id="queue-title" className="mb-0.5 mt-1 font-display text-[27px] font-semibold leading-tight text-ink">
        Consult {host.name}
      </h2>
      <p className="mt-1.5 text-[13px] leading-normal text-stone-600">
        One-to-one, during the live. Everyone keeps seeing the astrologer&apos;s video with a “private consultation in progress”
        banner, but only you hear them. Your voice and video are never shown to the room.
      </p>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-stone-600">Rate</span>
          <b className="text-[20px] tabular-nums text-ink">{rupee(quoted)}/min</b>
        </div>
        {changedFrom !== null && (
          <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-amber-900">
            The rate changed from {rupee(changedFrom)} to {rupee(quoted)}/min. Join at the new rate?
          </p>
        )}
        <p className="mt-1.5 text-[12px] leading-[1.45] text-stone-600">
          You need {rupee(quoted * ELIGIBILITY_MINUTES)} (five minutes) in your wallet. Billing starts only when you join the call, and
          you pay for the minutes you&apos;re connected.
        </p>
      </div>

      <p className="mt-3 text-xs leading-[1.45] text-stone-500">
        Only the astrologer sees your profile (name, photo, age and birth details) to prepare for your consult.{" "}
        <Link href="/wallet#profile" onClick={onClose} className="font-semibold text-amber-700">
          Edit your profile
        </Link>
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
          {error}{" "}
          {short && (
            <Link href="/wallet" onClick={onClose} className="font-bold text-amber-700 underline">
              Add money
            </Link>
          )}
        </p>
      )}

      <div className="mt-[18px] grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onClose} className="h-12 rounded-xl border border-line bg-white text-[14.5px] font-bold text-ink">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void join()}
          className={`h-12 rounded-xl text-[14.5px] font-bold ${busy ? "bg-amber-200 text-amber-900" : "bg-amber-500 text-ink"}`}
        >
          {busy ? "Joining…" : changedFrom !== null ? `Join at ${rupee(quoted)}/min` : "Join the queue"}
        </button>
      </div>
    </Modal>
  );
}
