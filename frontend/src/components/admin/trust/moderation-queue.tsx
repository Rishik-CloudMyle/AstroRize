"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { api } from "@/lib/api/client";
import type { TrustData } from "@/lib/admin/types";

export default function ModerationQueue({ data }: { data: TrustData }) {
  const { say } = useAdmin();
  const { run, busy } = useAction();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // The moderator's own words, per review, when "Other (write your own)" is chosen.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const other = data.otherReason;
  // Kept reviews leave the API's queue; the card stays on screen with its "KEPT" chip until reload.
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [shown] = useState(() => data.queue);
  const queue = [
    ...data.queue,
    ...shown.filter((m) => kept[m.id] && !data.queue.some((q) => q.id === m.id)),
  ];

  // From the prototype's hideReview / undoReview / keepReview; a reason code is mandatory.
  const remove = (id: string) => {
    const reason = reasons[id];
    if (!reason) {
      say("Choose a reason code first — every removal needs one.");
      return;
    }
    const own = reason === other.code;
    const note = (notes[id] ?? "").trim();
    if (own && note.length < other.min) {
      setNoteErrors((e) => ({ ...e, [id]: `Write your reason in at least ${other.min} characters.` }));
      document.getElementById(`note-${id}`)?.focus();
      return;
    }
    void run(
      () => api.post(`/admin/reviews/${id}/remove`, own ? { reason, note } : { reason }),
      own
        ? `Soft-hidden with your reason. Undo available for ${data.undoWindow}.`
        : `Soft-hidden with reason ${reason.split(" ")[0]}. Undo available for ${data.undoWindow}.`,
    );
  };
  const undo = (id: string) => {
    void run(() => api.post(`/admin/reviews/${id}/restore`), "Removal undone — the review is back in the queue. The undo is itself audited.");
  };
  const keep = async (id: string) => {
    const res = await run(
      () => api.post(`/admin/reviews/${id}/keep`),
      "Kept. The rule flag is cleared and the decision is audited.",
    );
    if (res) setKept((k) => ({ ...k, [id]: true }));
  };

  if (queue.length === 0) {
    return (
      <p className="m-0 rounded-[14px] border border-dashed border-line px-4 py-5 text-center text-[13px] text-[#78716c]">
        Nothing to moderate — no review is flagged right now.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {queue.map((m) => {
        const isHidden = m.status === "SOFT_HIDDEN";
        const isKept = kept[m.id] === true;
        const undoLeft = m.hiddenUndoLeft ?? data.undoWindow;
        return (
          <div
            key={m.id}
            className="rounded-[14px] border border-line px-[17px] py-[15px]"
            style={{ background: isHidden ? "#f7f4ee" : "#fffdf8" }}
          >
            <div className="flex flex-wrap items-center gap-[9px]">
              <span className="text-[12px] tracking-[1px] text-[#f5b301]" aria-label={`${m.stars.split("★").length - 1} stars`}>
                {m.stars}
              </span>
              <span
                className="inline-flex h-[21px] items-center rounded-full px-[9px] text-[10px] font-extrabold"
                style={{
                  background: isKept ? "#ecfdf5" : m.flagBg,
                  color: isKept ? "#047857" : m.flagFg,
                }}
              >
                {isKept ? "KEPT · flag cleared" : m.flag}
              </span>
              <span className="ml-auto text-[11.5px] text-[#78716c]">
                {m.when} · {m.astro}
              </span>
            </div>
            <p className="mt-2 mb-0 text-[13.5px] leading-[1.5] text-[#57534e]">“{m.text}”</p>
            {(isHidden || !isKept) && (
              <div className="mt-3 flex flex-wrap items-center gap-[9px]">
                {isHidden ? (
                  <>
                    <span className="inline-flex h-[34px] items-center rounded-[10px] bg-stone-100 px-[13px] text-[12.5px] font-bold text-[#78716c]">
                      Soft-hidden · undo available for {undoLeft}
                    </span>
                    {m.reason && (
                      <span className="order-last basis-full text-[12px] break-words text-[#57534e]">
                        <b>Reason:</b> {m.reason}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => undo(m.id)}
                      className="h-[34px] rounded-[10px] border-0 bg-ink px-3.5 text-[12.5px] font-bold text-amber-300 disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </>
                ) : (
                  <>
                    <select
                      aria-label="Reason code"
                      value={reasons[m.id] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [m.id]: e.target.value }))}
                      className="h-[34px] rounded-[10px] border border-line bg-white px-[11px] text-[12.5px] font-semibold"
                    >
                      <option value="">Reason code…</option>
                      {data.reasonCodes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value={other.code}>Other (write your own)</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(m.id)}
                      className="h-[34px] rounded-[10px] border border-rose-200 bg-white px-3.5 text-[12.5px] font-bold text-rose-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void keep(m.id)}
                      className="h-[34px] rounded-[10px] border border-line bg-white px-3.5 text-[12.5px] font-bold text-[#57534e] disabled:opacity-50"
                    >
                      Keep
                    </button>
                    {reasons[m.id] === other.code && (
                      <div className="basis-full">
                        <label htmlFor={`note-${m.id}`} className="mb-1 block text-[12px] font-bold text-[#57534e]">
                          Your reason for removing it
                        </label>
                        <textarea
                          id={`note-${m.id}`}
                          value={notes[m.id] ?? ""}
                          maxLength={other.max}
                          rows={2}
                          placeholder="e.g. Shares the astrologer's personal phone number"
                          aria-invalid={noteErrors[m.id] ? true : undefined}
                          aria-describedby={noteErrors[m.id] ? `note-err-${m.id}` : undefined}
                          onChange={(e) => {
                            const value = e.target.value;
                            setNotes((n) => ({ ...n, [m.id]: value }));
                            setNoteErrors((er) => ({ ...er, [m.id]: "" }));
                          }}
                          className="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-amber-500"
                        />
                        <div className="flex items-start justify-between gap-3">
                          <p id={`note-err-${m.id}`} role={noteErrors[m.id] ? "alert" : undefined} className="m-0 text-[12px] font-semibold text-rose-700">
                            {noteErrors[m.id]}
                          </p>
                          <span className="shrink-0 text-[11px] text-[#a8a29e] tabular-nums">
                            {(notes[m.id] ?? "").length}/{other.max}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
