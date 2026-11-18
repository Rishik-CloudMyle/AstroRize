"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useErrorToast, useToast } from "../portal-provider";
import { Panel } from "../ui";

/** Instant mode: when on, customers can only reach the astrologer by Instant Call. */
export default function InstantModeCard({ enabled: initial }: { enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !enabled;
    try {
      await api.patch<{ instantMode: boolean }>("/portal/instant-mode", { enabled: next });
      setEnabled(next);
      toast(next ? "Instant mode is on — Chat, Voice, Video and Fixed Sessions are off." : "Instant mode is off — your other options are back.");
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 mb-1 text-base font-bold">⚡ Instant mode</h2>
          <p className="m-0 text-[12.5px] leading-[1.5] text-stone-500">
            Turn this on to take Instant Calls only. Chat, Voice, Video and Fixed Sessions are switched off for customers until you turn it off.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Instant mode"
          onClick={() => void toggle()}
          disabled={busy}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-blue-600" : "bg-stone-300"}`}
        >
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      <p className={`mt-3 mb-0 rounded-xl px-3 py-2.5 text-[12.5px] ${enabled ? "bg-blue-50 text-blue-900" : "bg-cream text-stone-600"}`}>
        {enabled ? "On — customers see only Instant Call on your profile." : "Off — customers can use Chat, Voice, Video, Instant Call and Fixed Sessions."}
      </p>
    </Panel>
  );
}
