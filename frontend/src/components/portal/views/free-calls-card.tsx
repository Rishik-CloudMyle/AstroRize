"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { FreeCalls } from "@/lib/portal/types";
import { useErrorToast, useToast } from "../portal-provider";
import { M_INPUT, M_LABEL, M_PRIMARY, Panel } from "../ui";

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
 * Free calls (welcome campaign) on the dashboard: switch them on or off and choose how many to
 * take per day or per week, within AstroRize's maximum. One free call at a time.
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
            Customers use their weekly free minutes on free calls of {lengthsLabel(f.lengths)} (Chat or Voice) with astrologers who take part.
            You take one free call at a time; AstroRize pays you monthly for the free minutes you give.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={f.optedIn}
          aria-label="Take free calls"
          onClick={() => void send({ enabled: !f.optedIn }, f.optedIn ? "Free calls switched off." : "Free calls switched on.")}
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
        <span id="fc-cap" className={`mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
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
            className={`h-11 w-[90px] rounded-xl border border-line bg-white px-3 text-[14px] text-ink tabular-nums outline-none focus:border-amber-500 ${M_INPUT} max-lg:h-11 max-lg:w-[76px] max-lg:px-3`}
          />
          <div className="flex h-11 overflow-hidden rounded-xl border border-line bg-white max-lg:gap-1.5 max-lg:overflow-visible max-lg:border-0 max-lg:bg-transparent" role="radiogroup" aria-label="Per">
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
                className={`px-3.5 text-[13px] font-bold max-lg:rounded-app-chip max-lg:border max-lg:font-semibold ${
                  period === p
                    ? "bg-ink text-white max-lg:border-app-primary max-lg:bg-app-primary max-lg:text-app-on-primary"
                    : "text-stone-600 max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink"
                }`}
              >
                per {p === "DAY" ? "day" : "week"}
              </button>
            ))}
          </div>
          <button type="submit" disabled={busy || !dirty} className={`h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-50 ${M_PRIMARY} max-lg:w-full`}>
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
