"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { sessionActions } from "@/lib/session-store";

/** Asks first, then signs out (clears the session and its cookie) and returns to the public website. */
export default function LogoutButton({ className, children = "Log out" }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={className}>
        {children}
      </button>
      {asking && typeof document !== "undefined" && createPortal(
        <div data-logout-dialog className="fixed inset-0 z-[500] grid place-items-center bg-black/55 px-5" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="logout-title" className="w-full max-w-[340px] rounded-2xl bg-white p-5 text-left text-ink shadow-2xl">
            <h2 id="logout-title" className="m-0 text-[17px] font-bold">Log out of Astrorize?</h2>
            <p className="mt-1.5 mb-0 text-[13px] leading-snug text-stone-600">You will need to log in again to continue.</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button type="button" autoFocus onClick={() => setAsking(false)} disabled={busy} className="h-11 rounded-xl border border-stone-300 bg-white text-[14px] font-bold text-ink">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await sessionActions.logOut();
                  router.push("/");
                  router.refresh();
                }}
                className="h-11 rounded-xl bg-rose-600 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {busy ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
