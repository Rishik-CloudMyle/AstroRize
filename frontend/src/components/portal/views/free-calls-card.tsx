"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { FreeCalls } from "@/lib/portal/types";
import { useErrorToast, useToast } from "../portal-provider";
import { Panel } from "../ui";

/** "5, 10 or 30 min" */
function lengthsLabel(minutes: number[]): string {
  if (minutes.length <= 1) return `${minutes[0] ?? 0} min`;
  return `${minutes.slice(0, -1).join(", ")} or ${minutes[minutes.length - 1]} min`;
}

/** "Mon 27 Oct" in IST. */
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Free calls (welcome campaign) on the dashboard: the astrologer only switches them on or off
 * (user decision, Nov 2026). Lengths and how many free calls each astrologer takes per day and per
 * week are set by AstroRize for everyone, shown here read-only. One free call at a time.
 */
export default function FreeCallsCard({ freeCalls: f }: { freeCalls: FreeCalls }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);
  const periodWord = f.period === "week" ? "this week" : "today";

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch<{ freeCalls: FreeCalls }>("/portal/free-calls", { enabled: !f.optedIn });
      toast(f.optedIn ? "Free calls switched off." : "Free calls switched on. You're marked “Free call” while you're available.");
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  const rules = [
    { label: "Free call lengths", value: f.lengths.length ? lengthsLabel(f.lengths) : "None right now" },
    { label: "Free calls you take", value: `Up to ${f.perDay} a day · ${f.perWeek} a week` },
    { label: "Customer free minutes", value: `${f.weeklyMinutes} min a week${f.joiningBonusMinutes > 0 ? ` + ${f.joiningBonusMinutes} min on joining` : ""}` },
  ];

  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 mb-1 text-base font-bold">Free calls</h2>
          <p className="m-0 text-[12.5px] leading-[1.5] text-stone-500">
            Customers use their free minutes on Chat or Voice calls with astrologers who take part. You take one free call at a time;
            AstroRize pays you monthly for the free minutes you give.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={f.optedIn}
          aria-label="Take free calls"
          onClick={() => void toggle()}
          disabled={busy}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${f.optedIn ? "bg-emerald-600 max-lg:bg-app-primary" : "bg-stone-300"}`}
        >
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${f.optedIn ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {!f.campaignOn ? (
        <p className="mt-3 mb-0 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
          AstroRize has paused free calls for now, so none start anywhere at the moment.
        </p>
      ) : f.optedIn ? (
        <div className="mt-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3.5 py-3 max-lg:rounded-app-btn max-lg:p-3">
          <b className="block text-[15px] text-emerald-900 tabular-nums">
            {f.remaining} of {f.limit} left {periodWord}
          </b>
          <span className="text-[12px] text-emerald-900/75">
            {f.usedToday} taken today · {f.usedThisWeek} this week · counts again from {dayLabel(f.resetsAt)}
          </span>
        </div>
      ) : (
        <p className="mt-3 mb-0 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] text-stone-600">
          You aren&apos;t taking free calls. Switch them on to be marked “Free call” for customers.
        </p>
      )}

      <dl className="mt-3.5 mb-0 grid gap-1.5 text-[12.5px]">
        {rules.map((r) => (
          <div key={r.label} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-line-soft pb-1.5 last:border-0 last:pb-0">
            <dt className="text-stone-500">{r.label}</dt>
            <dd className="m-0 font-semibold text-ink tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 mb-0 text-[11.5px] leading-[1.5] text-stone-500">Set by AstroRize for every astrologer (days and Monday–Sunday weeks in IST).</p>
    </Panel>
  );
}
