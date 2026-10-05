"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { countdown, rupee } from "@/lib/portal/format";
import type { Consultations, Settlement } from "@/lib/portal/types";
import Modal from "../modal";
import { useAccount, useErrorToast, useToast } from "../portal-provider";
import { PageHeader, Panel, Th, tdClass } from "../ui";

/** How often the page asks the API for new requests, the queue and the live session. */
const POLL_MS = 4000;

const SESSION_CONTROLS = [
  {
    label: "🎤 Mute",
    bg: "rgba(255,255,255,.08)",
    fg: "#e7e0d6",
    border: "rgba(255,255,255,.15)",
    msg: "Microphone muted. The customer is told you have muted.",
  },
  {
    label: "📹 Camera",
    bg: "rgba(255,255,255,.08)",
    fg: "#e7e0d6",
    border: "rgba(255,255,255,.15)",
    msg: "Camera off. Voice continues uninterrupted.",
  },
  {
    label: "⏺ Recording on",
    bg: "rgba(234,88,12,.2)",
    fg: "#fdba74",
    border: "rgba(234,88,12,.4)",
    msg: "Recording is always on for voice sessions — it cannot be switched off mid-session.",
  },
];

const DROP_STEPS = [
  "Metering stops at the moment of the drop",
  "Actual connected time settles against both balances",
  "The session closes — it does not wait to reconnect",
  "To continue, the customer starts a new consultation",
];

function mmss(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function ConsultationsView({ data: initial }: { data: Consultations }) {
  const { astrologer: me } = useAccount();
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  // The last answer from the API and when it arrived; the countdowns tick from there.
  const [snap, setSnap] = useState(() => ({ data: initial, at: Date.now() }));
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const queueSize = useRef(initial.queue.length);
  // Stable, so the dialog keeps focus while the clock ticks underneath it.
  const closeEnd = useCallback(() => setConfirmEnd(false), []);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ consultations: Consultations }>("/portal/consultations");
      setSnap({ data: res.consultations, at: Date.now() });
      setNow(Date.now());
      // Keep the sidebar's request count in step with the queue.
      if (res.consultations.queue.length !== queueSize.current) {
        queueSize.current = res.consultations.queue.length;
        router.refresh();
      }
    } catch {
      // A missed poll is retried on the next tick.
    }
  }, [router]);

  // Poll the API, and tick the countdown / session clock once a second.
  useEffect(() => {
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const data = snap.data;
  const inc = data.incoming;
  const sinceFetch = Math.max(0, Math.floor((now - snap.at) / 1000));
  const remaining = inc ? Math.max(0, inc.remainingSecs - sinceFetch) : 0;
  const expired = inc !== null && remaining <= 0;

  // When the window runs out, ask straight away: the API times the request out
  // (billed ₹0) and offers the next one in the queue.
  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(load, 1000);
    return () => clearTimeout(t);
  }, [expired, load]);

  const statusLabel = expired ? "Timed out — billed ₹0" : `Accept in ${countdown(remaining)}`;
  const pct = inc ? `${(remaining / inc.windowSecs) * 100}%` : "0%";
  const session = data.session;
  const sessionSecs = session ? session.elapsedSeconds + sinceFetch : 0;

  const act = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await run();
      await load();
      router.refresh();
    } catch (e) {
      showError(e);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reject = (id: string) =>
    act(async () => {
      await api.post(`/portal/consultations/${id}/reject`);
      toast("Rejected. The customer sees a “you have not been charged” card — this bills ₹0.");
    });
  const accept = (id: string) =>
    act(async () => {
      await api.post(`/portal/consultations/${id}/accept`);
      toast("Accepted — connecting you to the customer now.");
    });
  const endSession = (id: string) =>
    act(async () => {
      const { settlement } = await api.post<{ settlement: Settlement }>(`/portal/consultations/${id}/end`);
      setConfirmEnd(false);
      toast(
        `Session ended · ${settlement.billedMins} min at ${rupee(settlement.rate)}/min — ${rupee(settlement.total)} billed to the customer.`,
      );
    });

  return (
    <div>
      <PageHeader
        title="Consultations"
        subtitle="Customers appear as aliases. Phone numbers are never revealed — all calls are masked."
      />

      {inc ? (
        <div className="relative mt-5 rounded-[20px] border-2 border-urgent bg-orange-50 p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold tracking-[.06em] text-white">
              {inc.instant ? "⚡ EMERGENCY" : "● NEW REQUEST"}
            </span>
            <b className="text-[17px]">Incoming request · {inc.alias}</b>
            <span
              className="ml-auto inline-flex items-center gap-[7px] text-sm font-extrabold text-orange-700 tabular-nums"
              aria-live="polite"
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-orange-200">
            <span className="block h-full rounded-full bg-urgent transition-[width] duration-1000 ease-linear" style={{ width: pct }} />
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-5">
            <div>
              <div className="text-[11.5px] font-semibold text-orange-800">Mode</div>
              <b className="text-[15px]">{inc.mode}</b>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-orange-800">Rate</div>
              <b className="text-[15px]">
                {rupee(inc.rate)}/min
                {inc.instant && ` · ${me.instantMultiplier}× standard ${rupee(me.price)}/min`}
              </b>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-orange-800">Customer</div>
              <b className="text-[15px]">{inc.alias} (alias)</b>
            </div>
            <div className="flex gap-2.5 min-[600px]:ml-auto">
              <button
                type="button"
                onClick={() => reject(inc.id)}
                disabled={busy || expired}
                className="h-[46px] rounded-xl border border-orange-200 bg-white px-5 text-[14.5px] font-bold text-orange-800 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => accept(inc.id)}
                disabled={busy || expired}
                className="h-[46px] rounded-xl bg-urgent px-[26px] text-[14.5px] font-bold text-white disabled:opacity-50"
              >
                Accept
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-[1.5] text-orange-800">
            If you reject or let this time out, the customer sees a “you have not been charged” card. Both outcomes bill ₹0
            and are logged distinctly.
          </p>
        </div>
      ) : (
        <Panel className="mt-5 p-5">
          <b className="text-[15px]">No incoming requests</b>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-stone-500">
            New requests appear here as they arrive. You have 3 minutes to accept each one.
          </p>
        </Panel>
      )}

      <Panel className="relative mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="m-0 text-[17px] font-bold">Queue</h2>
          <span className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2.5 text-xs font-bold text-amber-800">
            {data.queue.length} waiting · max {data.queueMax}
          </span>
        </div>
        {data.queue.length === 0 ? (
          <p className="mt-3.5 text-[13px] text-stone-500">Nobody is waiting right now.</p>
        ) : (
          <div className="relative mt-3.5 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Customer</Th>
                  <Th>Mode</Th>
                  <Th>Waiting</Th>
                  <Th>
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((q, i) => (
                  <tr key={q.id}>
                    <td className={`${tdClass} font-bold text-ink tabular-nums`}>{i + 1}</td>
                    <td className={`${tdClass} text-stone-600 tabular-nums`}>{q.alias}</td>
                    <td className={`${tdClass} text-stone-600`}>{q.mode}</td>
                    <td className={`${tdClass} text-stone-600`}>{q.waiting}</td>
                    <td className={`${tdClass} text-right whitespace-nowrap`}>
                      {i === 0 ? (
                        <span className="inline-flex h-6 items-center rounded-full bg-amber-500 px-2.5 text-[11.5px] font-extrabold text-ink">
                          Next up
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toast("Removal request opened. A reason is required — our team reviews every request.")}
                          className="text-[12.5px] font-bold text-amber-700"
                        >
                          Request removal ›
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-4">
        <div className="rounded-[20px] bg-ink p-5 text-line">
          {session ? (
            <>
              <div className="flex items-center justify-between gap-2.5">
                <b className="text-[15px] text-paper">In session · {session.alias}</b>
                <span className="text-[20px] font-bold text-amber-300 tabular-nums">{mmss(sessionSecs)}</span>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-2">
                {SESSION_CONTROLS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => toast(c.msg)}
                    className="h-[42px] rounded-xl border px-[15px] text-[13.5px] font-bold"
                    style={{ background: c.bg, color: c.fg, borderColor: c.border }}
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setConfirmEnd(true)}
                  className="h-[42px] rounded-xl border border-urgent bg-urgent px-[15px] text-[13.5px] font-bold text-white"
                >
                  End session
                </button>
              </div>
              {session.lowBalance && (
                <div className="mt-3.5 rounded-xl border border-[rgba(252,211,77,.3)] bg-[rgba(252,211,77,.12)] px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-amber-200">
                  Customer balance is low. You are shown the indicator only — never the figure.
                </div>
              )}
            </>
          ) : (
            <>
              <b className="text-[15px] text-paper">No session in progress</b>
              <p className="mt-1.5 text-[12.5px] leading-[1.5] text-stone-400">
                When you accept a request, the session and its controls appear here.
              </p>
            </>
          )}
        </div>

        <Panel className="relative p-5">
          <h2 className="m-0 mb-1 text-base font-bold">If a session drops</h2>
          <p className="mb-3 text-[12.5px] leading-[1.5] text-stone-500">
            Once a session has connected, it does not reconnect automatically if the line drops.
          </p>
          <div className="flex flex-col gap-2">
            {DROP_STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-[11px]">
                <span className="grid size-[22px] flex-[0_0_22px] place-items-center rounded-full bg-amber-100 text-[11px] font-extrabold text-amber-800">
                  {i + 1}
                </span>
                <span className="text-[13px] text-stone-600">{label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {confirmEnd && session && (
        <Modal onClose={closeEnd} labelledBy="end-title">
          <h2 id="end-title" className="m-0 text-[18px] font-bold">
            End session with {session.alias}?
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
            Billing is settled once you confirm: the customer is charged for the connected time only.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
              className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold"
            >
              Keep going
            </button>
            <button
              type="button"
              onClick={() => endSession(session.id)}
              disabled={busy}
              className="h-11 flex-1 rounded-xl bg-urgent text-sm font-bold text-white disabled:opacity-60"
            >
              End session
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
