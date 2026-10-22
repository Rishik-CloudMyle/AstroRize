"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { FreeCalls } from "@/lib/portal/types";
import { useErrorToast, useToast } from "../portal-provider";
import { Panel } from "../ui";

/** "5 min", "30 min", "1 h", "1 h 30 min" */
function lengthLabel(secs: number): string {
  const m = Math.max(1, Math.round(secs / 60));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/** "Mon 27 Oct" in IST. */
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Free calls (welcome campaign) on the dashboard: switch them on or off and choose how many to
 * take per day or per week, within Astrorize's maximum. One free call at a time.
 */
export default function FreeCallsCard({ freeCalls: f }: { freeCalls: FreeCalls }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [period, setPeriod] = useState<"DAY" | "WEEK">(f.period === "week" ? "WEEK" : "DAY");
  const [limit, setLimit] = useState(String(f.limit));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const max = period === "WEEK" ? f.maxPerWeek : f.maxPerDay;
  const dirty = period !== (f.period === "week" ? "WEEK" : "DAY") || limit.trim() !== String(f.limit) || f.isDefault;
  const periodWord = f.period === "week" ? "this week" : "today";

  async function send(body: Record<string, unknown>, done: string) {
    if (busy) return false;
    setBusy(true);
    try {
      await api.patch<{ freeCalls: FreeCalls }>("/portal/free-calls", body);
      toast(done);
      router.refresh();
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit() {
    const n = Number(limit.trim());
    if (!limit.trim() || !Number.isInteger(n) || n < 0) return setProblem("Enter the number of free calls as a whole number.");
    if (n > max) return setProblem(`You can offer at most ${max} free calls per ${period === "WEEK" ? "week" : "day"}.`);
    setProblem(null);
    await send({ limit: n, period }, `You'll take up to ${n} free call${n === 1 ? "" : "s"} per ${period === "WEEK" ? "week" : "day"}.`);
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 mb-1 text-base font-bold">Free calls</h2>
          <p className="m-0 text-[12.5px] leading-[1.5] text-stone-500">
            Customers use their welcome free calls ({lengthLabel(f.freeSeconds)} of Chat or Voice) with astrologers who take part. You take one free
            call at a time.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={f.optedIn}
          aria-label="Take free calls"
          onClick={() => void send({ enabled: !f.optedIn }, f.optedIn ? "Free calls switched off." : "Free calls switched on.")}
          disabled={busy}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${f.optedIn ? "bg-emerald-600" : "bg-stone-300"}`}
        >
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${f.optedIn ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {!f.campaignOn ? (
        <p className="mt-3 mb-0 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
          Astrorize has paused free calls for now, so none start anywhere at the moment.
        </p>
      ) : f.optedIn ? (
        <div className="mt-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <b className="block text-[15px] text-emerald-900 tabular-nums">
            {f.remaining} of {f.limit} left {periodWord}
          </b>
          <span className="text-[12px] text-emerald-900/75">
            {f.used} taken {periodWord} · counts again from {dayLabel(f.resetsAt)}
          </span>
        </div>
      ) : (
        <p className="mt-3 mb-0 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] text-stone-600">You aren&apos;t taking free calls. Switch them on to be marked “Free call”.</p>
      )}

      <form
        noValidate
        className="mt-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void saveLimit();
        }}
      >
        <span id="fc-cap" className="mb-1.5 block text-xs font-semibold text-stone-600">
          How many you take
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="fc-cap">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={limit}
            aria-label="Number of free calls"
            aria-invalid={!!problem}
            onChange={(e) => {
              setLimit(e.target.value);
              setProblem(null);
            }}
            className="h-11 w-[90px] rounded-xl border border-line bg-white px-3 text-[14px] text-ink tabular-nums outline-none focus:border-amber-500"
          />
          <div className="flex h-11 overflow-hidden rounded-xl border border-line bg-white" role="radiogroup" aria-label="Per">
            {(["DAY", "WEEK"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => {
                  setPeriod(p);
                  setProblem(null);
                }}
                className={`px-3.5 text-[13px] font-bold ${period === p ? "bg-ink text-white" : "text-stone-600"}`}
              >
                per {p === "DAY" ? "day" : "week"}
              </button>
            ))}
          </div>
          <button type="submit" disabled={busy || !dirty} className="h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-50">
            Save
          </button>
        </div>
        {problem && (
          <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
            {problem}
          </p>
        )}
        <p className="mt-2 mb-0 text-[11.5px] leading-[1.5] text-stone-500">
          Up to {f.maxPerDay} per day or {f.maxPerWeek} per week (days and Monday–Sunday weeks in IST).
          {f.isDefault ? ` You're on the standard ${f.defaultLimit} per day.` : ""}
        </p>
      </form>
    </Panel>
  );
}
