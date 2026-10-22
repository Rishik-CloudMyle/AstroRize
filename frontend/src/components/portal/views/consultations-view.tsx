"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api/client";
import { countdown, rupee } from "@/lib/portal/format";
import type { ConsultCustomer, ConsultPersonDetail, Consultations, Settlement } from "@/lib/portal/types";
import Modal from "../modal";
import { useAccount, useErrorToast, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";
import { Avatar, PersonProfileDialog } from "./live-queue-people";
import { SessionWindow } from "@/components/consult/session/session-window";

/** How often the page asks the API for new requests, the queue and the live session. */
const POLL_MS = 4000;

const DROP_STEPS = [
  "Metering stops at the moment of the drop",
  "Actual connected time settles against both balances",
  "The session closes — it does not wait to reconnect",
  "To continue, the customer starts a new consultation",
];

const BUSY_HINT = "End your current session to accept another";

function mmss(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "Kavya Menon", or the alias when the customer has no profile. */
const nameOf = (profile: ConsultCustomer | null, alias: string) => profile?.name ?? `Customer ${alias}`;

/** "Age 32 · Woman · Pune", with "not shared" where they left something out. */
function factsOf(profile: ConsultCustomer | null): string {
  if (!profile) return "Profile not shared";
  return [profile.age !== null ? `Age ${profile.age}` : "Age not shared", profile.gender, profile.city].filter(Boolean).join(" · ");
}

const noSubscribe = () => () => {};

/** A customer's welcome free call: distinct from paid requests. */
function FreeBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="The customer's free call: Astrorize pays you for the free minutes (monthly, at your rate × your share); any paid minutes after them earn as usual."
      className={`inline-flex h-[22px] items-center rounded-full bg-emerald-700 px-2 text-[10.5px] font-extrabold tracking-[.04em] text-white ${className}`}
    >
      🎁 FREE CALL
    </span>
  );
}

function ModeBadge({ mode, instant }: { mode: string; instant: boolean }) {
  return instant ? (
    <span className="inline-flex h-[22px] items-center rounded-full bg-urgent px-2 text-[10.5px] font-extrabold tracking-[.04em] text-white">
      ⚡ INSTANT CALL
    </span>
  ) : (
    <span className="inline-flex h-[22px] items-center rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-900">{mode}</span>
  );
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
  // The request (or session) whose full profile is open in the popup.
  const [detailId, setDetailId] = useState<string | null>(null);
  const queueSize = useRef(initial.queue.length);
  // The session window: opens by itself when a session starts (and on arrival during one).
  const [windowFor, setWindowFor] = useState<string | null>(initial.session?.id ?? null);
  // The session window is portalled into <body>, which only exists in the browser: a page loaded
  // while a session is in progress must not render it on the server.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const sessionRef = useRef<string | null>(initial.session?.id ?? null);
  // Set while this astrologer is ending the session, so it isn't reported as ended by the customer.
  const endingRef = useRef(false);
  // Stable, so the dialogs keep focus while the clock ticks underneath them.
  const closeEnd = useCallback(() => setConfirmEnd(false), []);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ consultations: Consultations }>("/portal/consultations");
      setSnap({ data: res.consultations, at: Date.now() });
      setNow(Date.now());
      const next = res.consultations.session?.id ?? null;
      if (next !== sessionRef.current) {
        if (next) setWindowFor(next);
        else if (!endingRef.current) {
          setWindowFor(null);
          toast("The session has ended — the customer ended it, or their balance ran out.");
        }
        sessionRef.current = next;
      }
      // Keep the sidebar's request count in step with the queue.
      if (res.consultations.queue.length !== queueSize.current) {
        queueSize.current = res.consultations.queue.length;
        router.refresh();
      }
    } catch {
      // A missed poll is retried on the next tick.
    }
  }, [router, toast]);

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
  // One active consult at a time.
  const inSession = session !== null;

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
      setDetailId(null);
      toast("Declined. The customer sees a “you have not been charged” card — this bills ₹0.");
    });
  const accept = (id: string) =>
    act(async () => {
      await api.post(`/portal/consultations/${id}/accept`);
      setDetailId(null);
      toast("Accepted — the customer is joining your session now.");
    });
  const endSession = (id: string) =>
    act(async () => {
      endingRef.current = true;
      let settlement: Settlement;
      try {
        ({ settlement } = await api.post<{ settlement: Settlement }>(`/portal/consultations/${id}/end`));
      } finally {
        endingRef.current = false;
      }
      sessionRef.current = null;
      setWindowFor(null);
      setConfirmEnd(false);
      toast(
        settlement.complimentary && settlement.billedMins === 0
          ? "Free call ended — nothing was billed (welcome campaign). It shows on your statement as ₹0."
          : `Session ended · ${settlement.billedMins} min at ${rupee(settlement.rate)}/min — ${rupee(settlement.total)} billed to the customer.`,
      );
    });

  // The popup's buttons follow the live state: a request that stopped waiting can't be accepted.
  const detailWaiting = detailId ? data.queue.find((q) => q.id === detailId) : undefined;
  const detailIsHead = !!detailWaiting && inc?.id === detailId;
  const detailActions = detailWaiting ? (
    <>
      {detailIsHead && (
        <button
          type="button"
          onClick={() => reject(detailWaiting.id)}
          disabled={busy || expired}
          className="h-11 flex-1 rounded-xl border border-orange-200 bg-white text-sm font-bold text-orange-800 disabled:opacity-50"
        >
          Decline
        </button>
      )}
      <button
        type="button"
        onClick={() => accept(detailWaiting.id)}
        disabled={busy || inSession}
        title={inSession ? BUSY_HINT : undefined}
        className="h-11 flex-1 rounded-xl bg-urgent text-sm font-bold text-white disabled:opacity-50"
      >
        Accept
      </button>
    </>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Consultations"
        subtitle="Customers waiting to consult you, and your session in progress. Phone numbers are never revealed — all calls are masked."
      />

      {data.freeCalls.enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <FreeBadge />
          <b className="text-[13.5px] text-emerald-900 tabular-nums">
            {data.freeCalls.remaining} of {data.freeCalls.limit} free calls left {data.freeCalls.period === "week" ? "this week" : "today"}
          </b>
          <span className="text-[12px] text-emerald-900/75">
            Customers can use their welcome free calls with you, one at a time. Change how many you take on your dashboard.
          </span>
        </div>
      )}

      {inc ? (
        <div className="relative mt-5 rounded-[20px] border-2 border-urgent bg-orange-50 p-4 min-[420px]:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold tracking-[.06em] text-white">
              {inc.instant ? "⚡ INSTANT CALL" : "● NEW REQUEST"}
            </span>
            {inc.free && <FreeBadge />}
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
          <button
            type="button"
            onClick={() => setDetailId(inc.id)}
            className="mt-3.5 flex w-full items-center gap-3 rounded-2xl border border-orange-200 bg-white/70 p-3 text-left hover:bg-white"
          >
            <Avatar photoUrl={inc.profile?.photoUrl ?? null} initials={inc.profile?.initials ?? "?"} size={52} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[16px] text-ink">{nameOf(inc.profile, inc.alias)}</b>
              <span className="block text-[12.5px] text-stone-600">{factsOf(inc.profile)}</span>
            </span>
            <span className="shrink-0 text-[12.5px] font-bold text-orange-800">Details ›</span>
          </button>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-3">
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
            <div className="flex w-full gap-2.5 min-[600px]:ml-auto min-[600px]:w-auto">
              <button
                type="button"
                onClick={() => reject(inc.id)}
                disabled={busy || expired}
                className="h-[46px] flex-1 rounded-xl border border-orange-200 bg-white px-5 text-[14.5px] font-bold text-orange-800 disabled:opacity-50"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => accept(inc.id)}
                disabled={busy || expired || inSession}
                title={inSession ? BUSY_HINT : undefined}
                className="h-[46px] flex-1 rounded-xl bg-urgent px-[26px] text-[14.5px] font-bold text-white disabled:opacity-50"
              >
                Accept
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-[1.5] text-orange-800">
            {inSession
              ? "You're in a session — end it to accept. "
              : inc.instant
                ? "Accept and the customer joins your session straight away. "
                : ""}
            If you decline or let this time out, the customer sees a “you have not been charged” card. Both outcomes bill ₹0
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

      <Panel className="relative mt-4 p-4 min-[420px]:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="m-0 text-[17px] font-bold">Incoming</h2>
          <span className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2.5 text-xs font-bold text-amber-800">
            {data.queue.length} waiting · max {data.queueMax}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Tap a customer to see the details they shared. Only you can see them — use them to prepare; don&apos;t save or share them.
        </p>
        {data.queue.length === 0 ? (
          <p className="mt-3.5 text-[13px] text-stone-500">Nobody is waiting right now.</p>
        ) : (
          <ol className="mt-3.5 flex flex-col gap-2">
            {data.queue.map((q, i) => {
              const head = i === 0;
              const name = nameOf(q.profile, q.alias);
              return (
                <li
                  key={q.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3 py-2.5 ${q.instant ? "border-orange-300 bg-orange-50/70" : "border-line bg-white"}`}
                >
                  <button
                    type="button"
                    onClick={() => setDetailId(q.id)}
                    aria-label={`See details for ${name}`}
                    className="flex min-w-0 flex-[1_1_220px] items-center gap-3 text-left"
                  >
                    <span className="w-5 shrink-0 text-center text-[13px] font-bold text-stone-400 tabular-nums">{i + 1}</span>
                    <Avatar photoUrl={q.profile?.photoUrl ?? null} initials={q.profile?.initials ?? "?"} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <b className="truncate text-[14px] text-ink">{name}</b>
                        <ModeBadge mode={q.mode} instant={q.instant} />
                        {q.free && <FreeBadge />}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-stone-500">
                        {factsOf(q.profile)} · waiting {q.waiting}
                      </span>
                    </span>
                  </button>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {head && (
                      <span className="inline-flex h-7 items-center rounded-full bg-amber-500 px-2.5 text-[11.5px] font-extrabold text-ink tabular-nums">
                        {expired ? "Timing out…" : `Next up · ${countdown(remaining)}`}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailId(q.id)}
                      className="h-8 rounded-[10px] border border-line bg-white px-3 text-[12.5px] font-bold text-amber-800"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => accept(q.id)}
                      disabled={busy || inSession || (head && expired)}
                      title={inSession ? BUSY_HINT : undefined}
                      className="h-8 rounded-[10px] bg-urgent px-3 text-[12.5px] font-bold text-white disabled:opacity-45"
                    >
                      Accept
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-4">
        <div className="rounded-[20px] bg-ink p-5 text-line">
          {session ? (
            <>
              <div className="flex items-center gap-3">
                <Avatar photoUrl={session.profile?.photoUrl ?? null} initials={session.profile?.initials ?? "?"} size={44} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] text-paper">In session · {nameOf(session.profile, session.alias)}</b>
                  <span className="block text-[12px] text-stone-400">
                    {session.mode}
                    {session.free &&
                      (sessionSecs < session.freeSeconds
                        ? ` · 🎁 ${session.makeGood ? "free replacement call" : "free call"} · ${mmss(session.freeSeconds - sessionSecs)} free left`
                        : " · 🎁 free time over — now billed")}
                    {session.profile && (
                      <>
                        {" · "}
                        <button type="button" onClick={() => setDetailId(session.id)} className="font-bold text-amber-300">
                          Details ›
                        </button>
                      </>
                    )}
                  </span>
                </div>
                <span className="text-[20px] font-bold text-amber-300 tabular-nums">{mmss(sessionSecs)}</span>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWindowFor(session.id)}
                  className="h-[42px] rounded-xl bg-amber-400 px-[15px] text-[13.5px] font-bold text-ink"
                >
                  Open session window
                </button>
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

      {/* The session's own window (chat, voice or video), over the whole portal. */}
      {session &&
        inBrowser &&
        windowFor === session.id &&
        createPortal(
          <SessionWindow
            base={`/portal/consultations/${session.id}`}
            kind={session.window}
            active
            peer={{
              name: nameOf(session.profile, session.alias),
              photo: session.profile?.photoUrl ?? null,
              initials: session.profile?.initials ?? "?",
            }}
            title={session.mode}
            badges={
              <>
                {session.instant && (
                  <span className="inline-flex h-7 items-center rounded-full bg-urgent/30 px-3 text-[12px] font-bold text-orange-200">⚡ Instant Call</span>
                )}
                {session.free && (
                  <span className="inline-flex h-7 items-center rounded-full bg-emerald-400/15 px-3 text-[12px] font-bold text-emerald-300">
                    {sessionSecs < session.freeSeconds
                      ? `🎁 ${session.makeGood ? "Free replacement call" : "Free call"} · ${mmss(session.freeSeconds - sessionSecs)} free left`
                      : "🎁 Free time over — now billed"}
                  </span>
                )}
              </>
            }
            clock={mmss(sessionSecs)}
            alerts={
              session.lowBalance ? (
                <div role="status" className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-3.5 py-2.5 text-[13px] text-amber-100">
                  The customer&apos;s balance is low — the session may end soon. You see the indicator only, never the figure.
                </div>
              ) : null
            }
            ending={busy}
            onEnd={() => setConfirmEnd(true)}
            onMinimise={() => setWindowFor(null)}
          />,
          document.body,
        )}

      {confirmEnd &&
        session &&
        createPortal(
        <Modal onClose={closeEnd} labelledBy="end-title">
            <h2 id="end-title" className="m-0 text-[18px] font-bold">
              End session with {nameOf(session.profile, session.alias)}?
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
          </Modal>,
          document.body,
        )}

      {/* Rendered on <body> so no panel effect can trap the fixed overlay; centred on every screen size. */}
      {detailId &&
        createPortal(
          <PersonProfileDialog
            key={detailId}
            url={`/portal/consultations/${encodeURIComponent(detailId)}/profile`}
            read={(body) => {
              const person = (body as { person: ConsultPersonDetail }).person;
              return {
                alias: person.alias,
                profile: person.profile,
                badges: [
                  { label: person.instant ? "⚡ Instant Call" : person.mode, tone: person.instant ? "urgent" : "amber" },
                  ...(person.free ? [{ label: "🎁 Free call", tone: "plain" as const }] : []),
                  { label: `${rupee(person.rate)}/min`, tone: "plain" },
                  { label: person.status === "active" ? "In session" : `Waiting ${person.waiting}`, tone: "plain" },
                ],
              };
            }}
            note="Shared with you only because they asked you for a consultation."
            onClose={closeDetail}
            actions={detailActions}
          />,
          document.body,
        )}
    </div>
  );
}
