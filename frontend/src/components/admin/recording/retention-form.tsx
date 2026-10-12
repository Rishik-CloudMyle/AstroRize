"use client";

import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import { PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { RecordingData } from "@/lib/admin/types";
import { periodLabel } from "@/lib/admin/view";

/** The periods offered (days). The API accepts any whole number of days within its bounds. */
const PERIODS = [30, 90, 180, 365, 730, 1095, 1460, 1825];

/**
 * How long live-room chat and astrologer–customer messages are kept. A Super Admin changes it;
 * the daily purge on the server then deletes anything older. Everyone else sees it read-only.
 */
export default function RetentionForm({
  retention,
  lastPurge,
}: {
  retention: RecordingData["retention"];
  lastPurge: RecordingData["lastPurge"];
}) {
  const { run, busy } = useAction();
  const [days, setDays] = useState(retention.days);
  const options = [...new Set([...PERIODS, retention.days])]
    .filter((d) => d >= retention.minDays && d <= retention.maxDays)
    .sort((a, b) => a - b);
  const changed = days !== retention.days;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    if (
      days < retention.days &&
      !window.confirm(
        `Shorten retention to ${periodLabel(days)}? Live chat and messages older than ${periodLabel(days)} will be permanently deleted at the next daily purge.`,
      )
    )
      return;
    void run(
      () => api.put("/admin/recording/retention", { days }),
      `Chat and messages are now kept for ${periodLabel(days)}. Audited.`,
    );
  };

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <h2 className="mt-0 mb-1 text-[16px] font-bold">Retention for chat &amp; messages</h2>
      <p className="mt-0 mb-3.5 max-w-[72ch] text-[12.5px] leading-[1.55] text-[#78716c]">
        Live-room chat and astrologer–customer messages older than this are deleted automatically by a daily purge.
        Allowed: {periodLabel(retention.minDays)} to {periodLabel(retention.maxDays)}; the default is{" "}
        {periodLabel(retention.defaultDays)}.
      </p>

      {retention.canEdit ? (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2.5">
          <label className="block">
            <span className="text-[11.5px] font-bold text-[#57534e]">Keep for</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 block h-10 min-w-[180px] rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink"
            >
              {options.map((d) => (
                <option key={d} value={d}>
                  {periodLabel(d)}
                  {d === retention.defaultDays ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!changed || busy}
            className="h-10 rounded-[11px] border-0 bg-amber-500 px-5 text-[13px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {changed && (
            <button
              type="button"
              onClick={() => setDays(retention.days)}
              className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-[#57534e]"
            >
              Cancel
            </button>
          )}
        </form>
      ) : (
        <div className="text-[14px] text-ink">
          Kept for <b>{periodLabel(retention.days)}</b>
          <span className="mt-0.5 block text-[12px] text-[#78716c]">Only a Super Admin can change this.</span>
        </div>
      )}

      <dl className="mt-4 mb-0 grid grid-cols-[minmax(0,1fr)] gap-2.5 text-[12.5px] sm:grid-cols-2">
        <div className="rounded-[12px] border border-line bg-white px-3.5 py-2.5">
          <dt className="text-[10.5px] font-bold tracking-[.08em] text-[#78716c] uppercase">Last changed</dt>
          <dd className="m-0 mt-0.5 text-ink">
            {retention.updatedAt ? `${retention.updatedAt} IST by ${retention.updatedBy ?? "—"}` : "Never — the default applies"}
          </dd>
        </div>
        <div className="rounded-[12px] border border-line bg-white px-3.5 py-2.5">
          <dt className="text-[10.5px] font-bold tracking-[.08em] text-[#78716c] uppercase">Last purge</dt>
          <dd className="m-0 mt-0.5 text-ink">
            {lastPurge ? (
              <>
                {lastPurge.at} IST ·{" "}
                {lastPurge.chatMessages + lastPurge.messages + lastPurge.threads === 0
                  ? "nothing was old enough to delete"
                  : `deleted ${lastPurge.chatMessages} live chat, ${lastPurge.messages} ${lastPurge.messages === 1 ? "message" : "messages"}, ${lastPurge.threads} empty ${lastPurge.threads === 1 ? "conversation" : "conversations"}`}
              </>
            ) : (
              "Not run yet — it runs within a minute of the server starting, then daily"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
