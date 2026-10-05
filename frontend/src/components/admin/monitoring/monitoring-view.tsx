"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { MonitorItem, MonitoringData } from "@/lib/admin/types";

const OBSERVER_ACTIONS = ["Audit note", "Report", "Escalate", "Leave"] as const;

const clock = (secs: number) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

export default function MonitoringView({ data }: { data: MonitoringData }) {
  const { say } = useAdmin();
  const { run } = useAction();
  const router = useRouter();
  const lease = data.myLease;
  const leaseName = lease ? (data.queue.find((m) => m.id === lease.targetId)?.astro ?? lease.targetId) : "";
  // Break-glass request with its written justification; the next join uses it.
  const [glass, setGlass] = useState<string | null>(null);
  // Seconds left on the lease, counted down locally from what the API reported.
  const [tick, setTick] = useState({ id: lease?.id ?? null, left: lease?.secondsLeft ?? 0 });
  if ((lease?.id ?? null) !== tick.id) setTick({ id: lease?.id ?? null, left: lease?.secondsLeft ?? 0 });
  const remaining = lease ? tick.left : 0;

  useEffect(() => {
    if (!lease) return;
    const id = setInterval(() => setTick((t) => ({ ...t, left: Math.max(0, t.left - 1) })), 1000);
    return () => clearInterval(id);
  }, [lease]);

  // When the lease runs out the API frees the seat; re-read the page to show it.
  useEffect(() => {
    if (lease && remaining === 0) {
      say("Observer lease expired — capacity freed. Join again to keep watching.");
      router.refresh();
    }
  }, [lease, remaining, say, router]);

  const used = data.capacity.used;

  // ── handlers from the prototype (joinObserver / leaveObserver / observerAct / requestGlass), via the API ──
  const join = async (m: MonitorItem) => {
    // Private lives are refused by the API too ("Denied — this is a private consultation…").
    const res = await run(
      () => api.post(`/admin/monitoring/${m.id}/join`, glass ? { breakGlass: true, justification: glass } : {}),
      glass
        ? `Joined ${m.astro} under break-glass · heightened audit, alerts sent to Super Admin and Legal.`
        : `Joined ${m.astro} as observer · watch-only, lease 10:00, heartbeat started.`,
    );
    if (res && glass) setGlass(null);
  };
  const leave = () => {
    if (!lease) return;
    void run(
      () => api.post(`/admin/monitoring/leases/${lease.id}/release`),
      "Lease released immediately — capacity freed.",
    );
  };
  const observerAct = (label: (typeof OBSERVER_ACTIONS)[number]) => {
    if (label === "Leave") {
      leave();
      return;
    }
    if (!lease) return;
    void run(
      () => api.post(`/admin/monitoring/${lease.targetId}/flag`, { label }),
      `${label} recorded against the live session and the astrologer's compliance profile.`,
      false,
    );
  };
  const requestGlass = () => {
    if (glass) {
      setGlass(null);
      say("Break-glass request withdrawn. The alert trail is retained.");
      return;
    }
    const why = window.prompt("Break-glass needs a written justification (at least 10 characters):");
    if (why === null) return;
    if (why.trim().length < 10) {
      say("Break-glass access needs a written justification of at least 10 characters.");
      return;
    }
    setGlass(why.trim());
    say(
      "Break-glass requested — justification recorded. Your next join alerts Super Admin and Legal and enters the heightened-audit lane.",
    );
  };

  return (
    <>
      <div className="az-panel mt-[18px] flex flex-wrap items-center gap-3 rounded-2xl border border-line px-[18px] py-3.5">
        <b className="text-[13px]">Observer capacity</b>
        <span className="h-[9px] min-w-[140px] flex-1 overflow-hidden rounded-full bg-[#eee7db]">
          <span
            className="block h-full rounded-full bg-amber-500"
            style={{ width: `${(used / data.capacity.total) * 100}%` }}
          />
        </span>
        <span className="text-[13px] font-bold tabular-nums">
          {used} / {data.capacity.total} leases
        </span>
        <span className="text-[12px] text-[#78716c]">At capacity, new joins wait in line instead of failing.</span>
      </div>

      <div className={`${PANEL} relative mt-4 p-[18px]`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">Monitoring queue</h2>
        <div className="flex flex-col gap-2">
          {data.queue.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[104px_minmax(0,1fr)_auto_auto] items-center gap-3.5 rounded-[14px] border px-3.5 py-3"
              style={{ background: m.bg, borderColor: m.border }}
            >
              <span
                className="inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[10px] font-extrabold tracking-[.06em]"
                style={{ background: m.bandBg, color: m.bandFg }}
              >
                {m.band}
              </span>
              <div className="min-w-0">
                <b className="block text-[13.5px] text-ink">{m.astro}</b>
                <span className="mt-px block text-[11.5px] text-[#78716c]">{m.reason}</span>
              </div>
              <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: m.ageFg }}>
                {m.age}
              </span>
              {m.denied ? (
                <button
                  type="button"
                  onClick={() => void join(m)}
                  className="inline-flex h-[34px] cursor-not-allowed items-center rounded-[10px] border border-rose-200 bg-rose-50 px-3.5 text-[12px] font-bold whitespace-nowrap text-rose-700"
                >
                  Private — denied
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void join(m)}
                  className="h-[34px] rounded-[10px] border-0 bg-amber-500 px-3.5 text-[12.5px] font-bold whitespace-nowrap text-ink"
                >
                  Join as observer
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-4">
        <div className="az-dark relative rounded-[18px] p-5 text-line">
          {lease ? (
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-blue-700 px-2.5 text-[10.5px] font-extrabold text-white">
                  🛡 OBSERVING · WATCH ONLY
                </span>
                <span className="text-[12.5px] text-muted">{leaseName} · public live</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <div className="text-[11px] font-bold text-[#78716c]">Lease expires in</div>
                  <b className="text-[22px] text-amber-300 tabular-nums">{clock(remaining)}</b>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-[#78716c]">Heartbeat</div>
                  <b className="text-[22px] text-green-400">OK</b>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {OBSERVER_ACTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => observerAct(label)}
                    className="h-[38px] rounded-[11px] border border-white/[.18] bg-white/[.07] px-[15px] text-[12.5px] font-bold text-line"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3.5 mb-0 text-[11.5px] leading-[1.5] text-[#78716c]">
                Observers are watch-only. There are no microphone or camera controls, so you can never be seen or heard
                in the live.
              </p>
            </div>
          ) : (
            <div>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/[.08] px-2.5 text-[10.5px] font-extrabold text-muted">
                ◌ NOT OBSERVING
              </span>
              <p className="mt-3.5 mb-0 max-w-[52ch] text-[13px] leading-[1.55] text-muted">
                Join a public live from the queue above to open a watch-only lease. Private consultations are always
                denied, and no lease is held until you join.
              </p>
            </div>
          )}
        </div>

        <div className={`${PANEL} relative p-5`}>
          <h2 className="mt-0 mb-3.5 text-[16px] font-bold">Risk distribution</h2>
          <div className="flex flex-col gap-2">
            {data.risk.map((r) => (
              <div key={r.label} className="flex items-center gap-[11px]">
                <span className="w-[104px] flex-[0_0_104px] text-[12.5px] font-bold" style={{ color: r.fg }}>
                  {r.label}
                </span>
                <span className="h-3.5 flex-1 overflow-hidden rounded-[5px] bg-[#eee7db]">
                  <span className="block h-full" style={{ width: r.pct, background: r.fill }} />
                </span>
                <span className="w-11 text-right text-[12.5px] font-bold text-[#57534e] tabular-nums">{r.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3.5 rounded-xl border border-dashed border-stone-300 bg-stone-100 px-3.5 py-3 text-[11.5px] leading-[1.5] text-[#78716c]">
            Unknown and Insufficient Data sit below the rule, separated from High and Critical. They are not risk
            findings and must never be counted as such.
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[18px] border-2 border-dashed border-rose-700 bg-rose-50 p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-rose-700 px-[11px] text-[11px] font-extrabold tracking-[.06em] text-white">
            ⚠ BREAK-GLASS
          </span>
          <b className="text-[15px] text-rose-700">Emergency access outside normal eligibility</b>
        </div>
        <p className="mt-2 mb-0 max-w-[76ch] text-[13px] leading-[1.55] text-rose-900">
          Requires written justification, emits alerts to Super Admin and Legal, and moves the session into the
          heightened-audit lane. Use it only in a genuine emergency — never as a way around a failed eligibility check.
        </p>
        <button
          type="button"
          onClick={requestGlass}
          aria-pressed={glass !== null}
          className="mt-3.5 h-[42px] rounded-[11px] border border-rose-700 bg-white px-[18px] text-[13px] font-bold text-rose-700"
        >
          {glass ? "Withdraw break-glass request" : "Request break-glass access"}
        </button>
      </div>
    </>
  );
}
