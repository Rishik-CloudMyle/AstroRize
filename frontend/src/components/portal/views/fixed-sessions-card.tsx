"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useErrorToast, useToast } from "../portal-provider";
import { Panel } from "../ui";

export default function FixedSessionsCard({ enabled: initialEnabled, locked = false }: { enabled: boolean; locked?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  // Instant mode switches Fixed Sessions off; the lock lifts when it is turned off.
  const shown = enabled && !locked;
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !enabled;
    try {
      await api.patch<{ fixedSessionsEnabled: boolean }>("/portal/fixed-sessions", { enabled: next });
      setEnabled(next);
      toast(next ? "Fixed Sessions enabled on your profile." : "Fixed Sessions disabled on your profile.");
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
          <div className="flex items-center gap-2 mb-1">
            <span className="grid size-6 place-items-center rounded-full bg-amber-500/20 text-amber-800 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
              </svg>
            </span>
            <h2 className="m-0 text-base font-bold">Fixed Sessions</h2>
          </div>
          <p className="m-0 text-[12.5px] leading-[1.5] text-stone-500">
            Customers can book prepaid 5–60 minute packages at package rates. The session ends automatically when the time expires, and you earn your standard share.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={shown}
          aria-label="Offer Fixed Sessions"
          onClick={() => void toggle()}
          disabled={busy || locked}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            shown ? "bg-amber-600 max-lg:bg-app-primary" : "bg-stone-300"
          }`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${
              shown ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {locked ? (
        <p className="mt-3 mb-0 rounded-xl bg-blue-50 px-3 py-2.5 text-[12.5px] text-blue-900">Off while Instant mode is on. Turn Instant mode off to use Fixed Sessions again.</p>
      ) : enabled ? (
        <div className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50/80 px-3.5 py-3 max-lg:rounded-app-btn max-lg:p-3">
          <b className="block text-[13.5px] text-amber-950">Active on your profile</b>
          <span className="text-[12px] text-amber-900/80">
            Customers can select 5, 10, 15, 30, 45, or 60 min fixed calls from your profile and directory.
          </span>
        </div>
      ) : (
        <p className="mt-3 mb-0 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] text-stone-600">
          Fixed Sessions are disabled for you. Customers can only consult via standard per-minute billing.
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-1.5 text-[11px] text-stone-500">
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium">5m</span>
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium">10m</span>
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium">15m</span>
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium">30m</span>
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium">45m</span>
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium">60m</span>
      </div>
    </Panel>
  );
}
