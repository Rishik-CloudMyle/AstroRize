"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { LiveRoom } from "@/lib/types";
import { useAppUI, type QueueRequest } from "../app-provider";
import Modal from "../ui/modal";

const MODES = [
  {
    key: "private",
    title: "Private consultation",
    body: "One-to-one. Viewers see the astrologer's video and a “private consultation in progress” banner. Your audio and video are never shown.",
  },
  {
    key: "public",
    title: "Public — on stage",
    body: "You appear on camera in front of everyone in the room. Offered only because this astrologer has enabled it.",
  },
] as const;

/**
 * Live room: choose Private or Public before joining the consult queue.
 * Nothing is selected by default, and Public needs an explicit on-camera consent.
 */
export default function ConsultModeModal({ request, onClose }: { request: QueueRequest; onClose: () => void }) {
  const { toast } = useAppUI();
  const [mode, setMode] = useState<"private" | "public" | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = (mode === "private" || (mode === "public" && consent)) && !busy;

  async function join() {
    if (!ready || !mode) return;
    setBusy(true);
    setError("");
    try {
      const { room } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(request.roomId)}/queue`, {
        mode: mode === "public" ? "PUBLIC" : "PRIVATE",
        consent: mode === "public" && consent,
      });
      request.onJoined?.(room);
      onClose();
      toast(
        mode === "public"
          ? `You're #${room.queue.position} in the queue for a public, on-stage consultation. We'll alert you when it's your turn.`
          : `You're #${room.queue.position} in the queue for a private consultation. We'll alert you when it's your turn.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="modes-title" maxWidth={460}>
      <h2 id="modes-title" className="mb-0.5 mt-1.5 font-display text-[27px] font-semibold text-ink">
        How do you want to consult?
      </h2>
      <p className="text-[13px] text-stone-500">Nothing is selected by default. Pick one to continue.</p>

      <div role="radiogroup" aria-label="Consultation mode" className="mt-[18px] flex flex-col gap-2.5">
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <div
              key={m.key}
              className={`rounded-2xl border-2 p-4 ${on ? "border-amber-500 bg-amber-50" : "border-line bg-white"}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(m.key)}
                className="flex w-full items-start gap-[13px] text-left"
              >
                <span
                  className={`mt-0.5 size-5 shrink-0 rounded-full border-2 ${on ? "border-amber-500 bg-amber-500" : "border-stone-300 bg-white"}`}
                />
                <span className="min-w-0">
                  <b className="block text-[15px] font-bold text-ink">{m.title}</b>
                  <span className="mt-[3px] block text-[12.5px] leading-normal text-stone-600">{m.body}</span>
                </span>
              </button>
              {m.key === "public" && on && (
                <label className="ml-[33px] mt-2.5 flex cursor-pointer items-start gap-[9px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 size-[18px] shrink-0 accent-amber-500"
                  />
                  <span className="text-xs leading-[1.45] text-amber-900">
                    I consent to appearing on camera in front of all viewers in this public room.
                  </span>
                </label>
              )}
            </div>
          );
        })}
      </div>

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
          disabled={!ready}
          onClick={() => void join()}
          className={`h-12 rounded-xl text-[14.5px] font-bold ${ready ? "bg-amber-500 text-ink" : "bg-amber-200 text-amber-900"}`}
        >
          Join the queue
        </button>
      </div>
    </Modal>
  );
}
