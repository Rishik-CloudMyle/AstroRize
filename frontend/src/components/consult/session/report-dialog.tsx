"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api/client";

const REASONS = {
  customer: ["Rude or abusive behaviour", "Asked for contact details or payment outside Astrorize", "Wrong or misleading advice", "Poor call or chat quality", "Other"],
  astrologer: ["Abusive or inappropriate behaviour", "Asked for contact details or personal information", "Spam or time-wasting", "Other"],
};

/** Report this consultation to Astrorize Support. Astrologers can also block the customer. `base` is the session's API path. */
export default function ReportDialog({ base, onClose }: { base: string; onClose: () => void }) {
  const astrologer = base.startsWith("/portal");
  const reasons = REASONS[astrologer ? "astrologer" : "customer"];
  const [reason, setReason] = useState(reasons[0]!);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ref: string; blocked: boolean } | null>(null);

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ caseRef: string; blocked?: boolean }>(`${base}/report`, { reason, details: details.trim() || undefined, ...(astrologer ? { block } : {}) });
      setDone({ ref: r.caseRef, blocked: !!r.blocked });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't send your report. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/55 px-5" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full max-w-[400px] rounded-2xl bg-white p-5 text-ink shadow-2xl">
        <h2 id="report-title" className="m-0 text-[17px] font-bold">{done ? "Report sent" : "Report this consultation"}</h2>
        {done ? (
          <>
            <p className="mt-2 mb-0 text-[13px] leading-snug text-stone-600">
              Thank you. Our team will look into it (reference {done.ref}).{done.blocked ? " This customer can no longer start a consultation with you." : ""}
            </p>
            <button type="button" onClick={onClose} className="mt-4 h-11 w-full rounded-xl bg-ink text-[14px] font-bold text-white">Close</button>
          </>
        ) : (
          <>
            <label className="mt-3 block text-[12.5px] font-bold text-stone-700">
              What happened?
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-[14px] font-normal">
                {reasons.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-[12.5px] font-bold text-stone-700">
              More detail (optional)
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-[14px] font-normal" />
            </label>
            {astrologer && (
              <label className="mt-3 flex items-start gap-2 text-[13px] text-stone-700">
                <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-0.5 size-4" />
                <span>Also block this customer — they won&apos;t be able to consult you again.</span>
              </label>
            )}
            {error && <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">{error}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={onClose} className="h-11 rounded-xl border border-stone-300 bg-white text-[14px] font-bold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void send()} className="h-11 rounded-xl bg-rose-600 text-[14px] font-bold text-white disabled:opacity-60">{busy ? "Sending…" : "Send report"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
