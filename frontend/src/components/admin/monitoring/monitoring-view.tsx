"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";
import type { MonitorLive, MonitoringData } from "@/lib/admin/types";
import ObserverPanel, { sinceLabel } from "./observer-panel";

/** How often the list of lives and private sessions is re-read. */
const REFRESH_MS = 10_000;

const PRIORITY: Record<"review" | "new" | "none", { label: string; chipBg: string; chipFg: string; bg: string; border: string }> = {
  review: { label: "Needs review", chipBg: "#be123c", chipFg: "#fff", bg: "#fff1f2", border: "#fecdd3" },
  new: { label: "New astrologer", chipBg: "#f59e0b", chipFg: "#1c1917", bg: "#fffbeb", border: "#fde68a" },
  none: { label: "Public live", chipBg: "#e7e5e4", chipFg: "#44403c", bg: "#fffdf8", border: "#e7e0d6" },
};

const TILE = "az-panel min-w-0 rounded-[14px] border border-line px-[15px] py-[13px]";

/** "16:42:05" in IST. */
const istClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });

export default function MonitoringView({ data: initial }: { data: MonitoringData }) {
  const { say, session } = useAdmin();
  const canJoin = session.capabilities.includes("live.observer.join");
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [stale, setStale] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  // The lease this admin is observing with (the panel stays to show "ended" after the API drops it).
  const [observing, setObserving] = useState<{ id: string; astrologer: string } | null>(
    initial.myLease ? { id: initial.myLease.id, astrologer: initial.myLease.astrologer } : null,
  );
  // Break-glass request with its written justification; the next join uses it.
  const [glass, setGlass] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { monitoring } = await api.get<{ monitoring: MonitoringData }>("/admin/monitoring");
      setData(monitoring);
      setStale(false);
      // A lease opened elsewhere (another tab) shows here too.
      if (monitoring.myLease) {
        const lease = monitoring.myLease;
        setObserving((o) => o ?? { id: lease.id, astrologer: lease.astrologer });
      }
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void reload();
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [reload]);

  const join = async (m: MonitorLive) => {
    if (joining) return;
    setJoining(m.id);
    try {
      const { lease } = await api.post<{ lease: { id: string; astrologer: string } }>(
        `/admin/monitoring/${encodeURIComponent(m.id)}/join`,
        glass ? { breakGlass: true, justification: glass } : {},
      );
      say(
        glass
          ? `Observing ${m.astrologer} under break-glass · recorded in the audit log's break-glass lane.`
          : `Observing ${m.astrologer} · watch-only, 10-minute lease.`,
      );
      if (glass) setGlass(null);
      setObserving({ id: lease.id, astrologer: lease.astrologer });
    } catch (e) {
      say(e instanceof ApiError ? e.message : "Couldn't join. Please try again.");
    } finally {
      setJoining(null);
      void reload();
    }
  };

  const requestGlass = () => {
    if (glass) {
      setGlass(null);
      say("Break-glass request withdrawn.");
      return;
    }
    const why = window.prompt("Break-glass needs a written justification (at least 10 characters):");
    if (why === null) return;
    if (why.trim().length < 10) {
      say("Break-glass access needs a written justification of at least 10 characters.");
      return;
    }
    setGlass(why.trim());
    say("Break-glass armed — your next join is allowed past a full observer capacity and is audited as break-glass.");
  };

  const { used, total } = data.capacity;
  const full = used >= total;

  return (
    <>
      <div className="mt-[18px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-mauve">
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-[#fff1e8] px-2.5 text-[10.5px] font-extrabold tracking-[.06em] text-rose-700 uppercase">
          <span className="az-live-dot inline-block h-1.5 w-1.5 rounded-full bg-rose-700" />
          Live
        </span>
        <span aria-live="off">
          Updated <time dateTime={data.generatedAt}>{istClock(data.generatedAt)} IST</time> · refreshes every 10 s
        </span>
        {stale && <span className="text-rose-700">Couldn&apos;t refresh — retrying.</span>}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Public lives now" value={data.summary.lives} color="#c2410c" />
        <Tile label="Private consultations" value={data.summary.privates} color="#57534e" />
        <Tile label="Need review" value={data.summary.review} color="#be123c" />
        <Tile label="New astrologers live" value={data.summary.newAstrologers} color="#b45309" />
      </div>
      <p className="mt-2 mb-0 text-[11.5px] leading-[1.5] text-[#78716c]">
        Counted from what is happening right now. &ldquo;Need review&rdquo; = a live flagged by a monitor or with
        contact details posted in its chat this session; &ldquo;New astrologer&rdquo; = approved in the last 30 days.
      </p>

      <div className="az-panel mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line px-[18px] py-3.5">
        <b className="text-[13px]">Observer seats</b>
        <span className="h-[9px] min-w-[120px] flex-1 overflow-hidden rounded-full bg-[#eee7db]">
          <span
            className={`block h-full rounded-full ${full ? "bg-rose-600" : "bg-amber-500"}`}
            style={{ width: `${Math.min(100, (used / total) * 100)}%` }}
          />
        </span>
        <span className="text-[13px] font-bold tabular-nums">
          {used} / {total} in use
        </span>
        <span className="w-full text-[12px] text-[#78716c] sm:w-auto">
          {full
            ? "All seats are taken — joins are refused until someone leaves (break-glass excepted)."
            : "Each observer holds a seat for up to 10 minutes; leaving frees it at once."}
        </span>
      </div>

      {observing && (
        <ObserverPanel
          key={observing.id}
          leaseId={observing.id}
          astrologer={observing.astrologer}
          flagReasons={data.flagReasons}
          onClose={() => {
            setObserving(null);
            void reload();
          }}
          onChanged={reload}
        />
      )}

      <div className={`${PANEL} relative mt-4 p-[18px]`}>
        <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5">
          <h2 className="m-0 text-[16px] font-bold">Public lives</h2>
          <span className="text-[12px] text-[#78716c]">Observable, watch-only</span>
        </div>
        {data.lives.length ? (
          <div className="flex flex-col gap-2">
            {data.lives.map((m) => {
              const p = PRIORITY[m.priority ?? "none"];
              const mine = data.myLease?.roomId === m.id;
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[14px] border px-3.5 py-3"
                  style={{ background: p.bg, borderColor: p.border }}
                >
                  <span className="relative size-10 flex-none overflow-hidden rounded-full bg-cream">
                    <Image src={m.photo} alt="" fill sizes="80px" className="object-cover" />
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[13.5px] text-ink">{m.astrologer}</b>
                      <span
                        className="inline-flex h-[20px] items-center rounded-full px-2 text-[10px] font-extrabold tracking-[.04em] uppercase"
                        style={{ background: p.chipBg, color: p.chipFg }}
                      >
                        {p.label}
                      </span>
                    </div>
                    <span className="mt-px block text-[12.5px] break-words text-[#57534e]">{m.topic}</span>
                    {m.signals.length ? (
                      <ul className="m-0 mt-1 list-none p-0">
                        {m.signals.map((s) => (
                          <li key={s} className="text-[11.5px] font-semibold break-words text-[#9f1239]">
                            • {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="mt-0.5 block text-[11.5px] text-[#78716c]">No signals this session</span>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-0.5 text-[12px] font-semibold whitespace-nowrap text-[#57534e] sm:items-end">
                    <span>Live {sinceLabel(m.startedAt, now)}</span>
                    <span>
                      👁 {m.viewers} watching · {m.waiting} in queue
                    </span>
                  </div>
                  {mine ? (
                    <span className="inline-flex h-[34px] items-center rounded-[10px] bg-blue-700 px-3.5 text-[12.5px] font-bold whitespace-nowrap text-white">
                      🛡 You&apos;re observing
                    </span>
                  ) : canJoin ? (
                    <button
                      type="button"
                      disabled={joining !== null}
                      onClick={() => void join(m)}
                      className={`h-[34px] rounded-[10px] border-0 px-3.5 text-[12.5px] font-bold whitespace-nowrap disabled:opacity-60 ${glass ? "bg-rose-700 text-white" : "bg-amber-500 text-ink"}`}
                    >
                      {joining === m.id ? "Joining…" : glass ? "Join (break-glass)" : "Join as observer"}
                    </button>
                  ) : (
                    <span className="inline-flex h-[34px] items-center rounded-[10px] border border-dashed border-stone-300 bg-stone-100 px-3.5 text-[12px] font-bold text-muted">
                      Observing isn&apos;t in your role
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-stone-300 bg-stone-50 px-4 py-7 text-center">
            <b className="block text-[14px] text-ink">No one is live right now</b>
            <span className="mt-1 block text-[12.5px] text-[#78716c]">
              Sessions appear here the moment an astrologer goes live.
            </span>
          </div>
        )}
      </div>

      <div className={`${PANEL} relative mt-4 p-[18px]`}>
        <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5">
          <h2 className="m-0 text-[16px] font-bold">Private consultations in progress</h2>
          <span className="text-[12px] text-[#78716c]">For awareness only — never observable</span>
        </div>
        {data.privates.length ? (
          <div className="flex flex-col gap-2">
            {data.privates.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[14px] border border-line bg-cream px-3.5 py-3"
              >
                <span className="inline-flex h-[20px] items-center rounded-full bg-stone-500 px-2 text-[10px] font-extrabold tracking-[.04em] text-white uppercase">
                  Private
                </span>
                <div className="min-w-[180px] flex-1">
                  <b className="block text-[13.5px] text-ink">{c.astrologer}</b>
                  <span className="block text-[12px] text-[#57534e]">
                    {c.mode}
                    {c.fromLive ? " · from a live queue" : ""} · <span className="font-mono">{c.id}</span>
                  </span>
                </div>
                <span className="text-[12px] font-semibold whitespace-nowrap text-[#57534e]">
                  In progress {sinceLabel(c.startedAt, now)}
                </span>
                <span className="inline-flex h-[34px] items-center rounded-[10px] border border-rose-200 bg-rose-50 px-3.5 text-[12px] font-bold whitespace-nowrap text-rose-700">
                  Private — denied
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[12.5px] text-[#78716c]">No private consultations in progress.</p>
        )}
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-[#78716c]">
          A private consultation is one-to-one between a customer and an astrologer. No one else can join it — break-glass
          included — and the customer is never identified here.
        </p>
      </div>

      {canJoin && (
        <div className="mt-4 rounded-[18px] border-2 border-dashed border-rose-700 bg-rose-50 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-rose-700 px-[11px] text-[11px] font-extrabold tracking-[.06em] text-white">
              ⚠ BREAK-GLASS
            </span>
            <b className="text-[15px] text-rose-700">Emergency access when every observer seat is taken</b>
          </div>
          <p className="mt-2 mb-0 max-w-[76ch] text-[13px] leading-[1.55] text-rose-900">
            Lets you observe a public live even when observer capacity is full. It needs a written justification, and
            the join is recorded in the break-glass lane of the audit log with your reason. It never opens a private
            consultation. Use it only in a genuine emergency.
          </p>
          {/* Only meaningful when capacity is full: with a free seat, an ordinary join works. */}
          <button
            type="button"
            onClick={requestGlass}
            aria-pressed={glass !== null}
            disabled={!full && !glass}
            className="mt-3.5 h-[42px] rounded-[11px] border border-rose-700 bg-white px-[18px] text-[13px] font-bold text-rose-700 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
          >
            {glass ? "Withdraw break-glass request" : "Request break-glass access"}
          </button>
          {!full && !glass && (
            <p className="mt-2 mb-0 text-[12px] text-rose-900">
              Not needed now: {total - used} of {total} observer seats are free, so a normal join works.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={TILE}>
      <div className="text-[10px] font-extrabold tracking-[.09em] text-mauve uppercase">{label}</div>
      <b className="mt-[3px] block text-[26px] leading-[1.1] font-bold tabular-nums" style={{ color }}>
        {value}
      </b>
    </div>
  );
}
