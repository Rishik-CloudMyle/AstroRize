"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rateFor, rupee } from "@/lib/format";
import type { LiveRoom, OfferedMode } from "@/lib/types";
import { useAppUI, type QueueRequest } from "../app-provider";
import { recheckAvailability } from "../astrologer/use-fresh-astrologer";
import Modal from "../ui/modal";
import ModeIcon from "@/components/ui/mode-icon";

/** Minutes of balance a consultation needs before it can start (same rule as every consultation). */
const ELIGIBILITY_MINUTES = 5;

/** A private consultation from a live is by voice or video (paid chat isn't offered anywhere). */
const MODES: { key: OfferedMode; title: string; body: string }[] = [
  { key: "voice", title: "Voice Call", body: "Talk privately — only you hear them." },
  { key: "video", title: "Video Call", body: "Face to face, in a private call of its own." },
];

const MODE_NAME: Record<OfferedMode, string> = { voice: "voice call", video: "video call" };

/**
 * Live room: join the consult queue for a private voice or video consultation (chat and Instant
 * Call aren't offered from a live). The room keeps seeing the astrologer's video; the conversation is
 * only with this customer, who is never shown to the room. The rate shown for the chosen mode is
 * the rate they pay if accepted.
 */
export default function LiveQueueModal({ request, onClose }: { request: QueueRequest; onClose: () => void }) {
  const { toast } = useAppUI();
  const host = request.astrologer;
  const [mode, setMode] = useState<OfferedMode | null>(null);
  // The rate shown for each mode — the same rates as a direct consultation. A rate the server
  // corrected (it changed since the page loaded) replaces the one shown for that mode.
  const [rates, setRates] = useState<Record<OfferedMode, number>>(() => ({
    voice: rateFor(host.price, "voice"),
    video: rateFor(host.price, "video"),
  }));
  const quoted = mode ? rates[mode] : 0;
  const [changedFrom, setChangedFrom] = useState<{ mode: OfferedMode; rate: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [short, setShort] = useState(false);

  function choose(m: OfferedMode) {
    setMode(m);
    setError("");
    setShort(false);
  }

  async function join() {
    if (busy || !mode) return;
    setBusy(true);
    setError("");
    setShort(false);
    try {
      const { room } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(request.roomId)}/queue`, {
        mode: mode.toUpperCase(),
        quotedRate: quoted,
      });
      request.onJoined?.(room);
      onClose();
      toast(`You're #${room.queue.position} in the queue for a private ${MODE_NAME[mode]}. We'll ask you to join when it's your turn.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "rate_changed" && typeof e.details.rate === "number") {
        const to = e.details.rate;
        setChangedFrom({ mode, rate: quoted });
        setRates((r) => ({ ...r, [mode]: to }));
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
        banner and no sound. Your voice and video are never shown to the room.
      </p>

      <div role="radiogroup" aria-label="How would you like to consult?" className="mt-4 flex flex-col gap-2">
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(m.key)}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-2 text-left transition-colors ${
                on ? "border-amber-500 bg-amber-50" : "border-line bg-white hover:border-amber-300"
              }`}
            >
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <ModeIcon mode={m.key} size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-bold text-ink">{m.title}</b>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-stone-500">{m.body}</span>
              </span>
              <b className="shrink-0 text-[15px] tabular-nums text-plum">{rupee(rates[m.key])}/min</b>
            </button>
          );
        })}
      </div>

      {mode && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          {changedFrom !== null && changedFrom.mode === mode && (
            <p role="alert" className="mb-1.5 text-[12.5px] font-semibold text-amber-900">
              The rate changed from {rupee(changedFrom.rate)} to {rupee(quoted)}/min. Join at the new rate?
            </p>
          )}
          <p className="text-[12px] leading-[1.45] text-stone-600">
            You need {rupee(quoted * ELIGIBILITY_MINUTES)} (five minutes at {rupee(quoted)}/min) in your wallet. Billing starts only
            when you join the call, and you pay for the minutes you&apos;re connected.
          </p>
        </div>
      )}

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
          disabled={busy || !mode}
          onClick={() => void join()}
          className={`h-12 rounded-xl text-[14.5px] font-bold ${busy ? "bg-amber-200 text-amber-900" : !mode ? "bg-stone-200 text-stone-500" : "bg-amber-500 text-ink"}`}
        >
          {busy ? "Joining…" : !mode ? "Choose how to talk" : changedFrom?.mode === mode ? `Join at ${rupee(quoted)}/min` : "Join the queue"}
        </button>
      </div>
    </Modal>
  );
}
