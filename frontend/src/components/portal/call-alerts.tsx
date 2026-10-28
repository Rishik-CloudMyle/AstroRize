"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, api } from "@/lib/api/client";
import { callBases, getCallSession, releaseCallSessionsExcept, serverCallBases, subscribeCalls } from "@/lib/media/call-session";
import {
  playChime,
  serverSoundState,
  setAlertsMuted,
  soundState,
  startRingtone,
  stopRingtone,
  subscribeSound,
  unlockOnFirstGesture,
  unlockSound,
} from "@/lib/media/ring";
import { countdown, rupee } from "@/lib/portal/format";
import { usePresence, useToast } from "./portal-provider";
import { Avatar } from "./views/live-queue-people";
import LiveReturnBar from "./live-return-bar";

// Incoming consultations for the astrologer, on EVERY portal page: while they are online the portal
// asks GET /portal/incoming every few seconds and, when someone is calling, rings — a dialog (a
// bottom sheet on phones) with who, how, the rate and the time left to answer; a ringtone (until
// answered, declined or expired; mutable, remembered on this device); a browser notification when
// the tab is in the background (once they turned call alerts on); and a flashing tab title.
// It also keeps a call that was minimised reachable from any page ("Return to call"), and lets go of
// a call whose consultation is over.

const POLL_MS = 3000;
/** A live-queue request has no deadline: it rings this long, then waits quietly in the live console. */
const LIVE_RING_SECS = 45;
const FLASH_TITLE = "📞 Incoming call…";

export interface Incoming {
  key: string;
  /** session: a connected call they haven't picked up · request: an Instant Call request · live: their live's private queue */
  kind: "session" | "request" | "live";
  id: string;
  name: string;
  photoUrl: string | null;
  initials: string;
  mode: string;
  window: "chat" | "voice" | "video";
  instant: boolean;
  free: boolean;
  makeGood: boolean;
  freeMinutes: number | null;
  rate: number;
  secondsLeft: number | null;
  windowSecs: number | null;
  waitingSecs?: number;
}

export interface CurrentCall {
  id: string;
  origin: "direct" | "live";
  status: string;
  name: string;
  photoUrl: string | null;
  initials: string;
  mode: string;
  window: "chat" | "voice" | "video";
  astrologerJoined: boolean;
  billingStartedAt: string | null;
  elapsedSeconds: number;
}

interface Answer {
  incoming: Incoming | null;
  current: CurrentCall | null;
}

// ── "Answered here": the consultation the astrologer just picked up, so its page opens the window ──

let answered: string | null = null;
const answeredListeners = new Set<() => void>();
export function markAnswered(id: string | null) {
  answered = id;
  answeredListeners.forEach((l) => l());
}
function subscribeAnswered(l: () => void) {
  answeredListeners.add(l);
  return () => answeredListeners.delete(l);
}
/** The consultation the astrologer picked up from the call alert (its page opens its window). */
export function useAnswered(): string | null {
  return useSyncExternalStore(
    subscribeAnswered,
    () => answered,
    () => null,
  );
}

/**
 * A steady tick that keeps going in a background tab: browsers slow plain timers there (to once a
 * minute after a while), but not a worker's. One worker for the page, started once and kept (it only
 * ticks while someone listens); falls back to setInterval.
 */
const tickListeners = new Set<() => void>();
let tickWorker: Worker | null | undefined;
let tickFallback: ReturnType<typeof setInterval> | null = null;
function startTicker(ms: number, tick: () => void): () => void {
  tickListeners.add(tick);
  if (tickWorker === undefined) {
    try {
      const src = `let id=null;onmessage=(e)=>{clearInterval(id);id=e.data>0?setInterval(()=>postMessage(0),e.data):null;};`;
      tickWorker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      tickWorker.onmessage = () => tickListeners.forEach((l) => l());
    } catch {
      tickWorker = null;
    }
  }
  if (tickListeners.size === 1) {
    if (tickWorker) tickWorker.postMessage(ms);
    else tickFallback = setInterval(() => tickListeners.forEach((l) => l()), ms);
  }
  return () => {
    tickListeners.delete(tick);
    if (tickListeners.size) return;
    if (tickWorker) tickWorker.postMessage(0);
    if (tickFallback) clearInterval(tickFallback);
    tickFallback = null;
  };
}

const label = (i: Incoming) =>
  i.kind === "live" ? `Private ${i.mode.toLowerCase()} request from your live` : i.instant ? "Instant Call" : i.window === "chat" ? "Chat request" : `${i.mode} call`;

export default function PortalCallCenter() {
  const [presence] = usePresence();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [answer, setAnswer] = useState<{ data: Answer; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  // Alerts this page already acted on or let go (accepted, declined, expired, a live request rung out).
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const bases = useSyncExternalStore(subscribeCalls, callBases, serverCallBases);
  const hasCall = bases.some((b) => b.startsWith("/portal/consultations/"));
  const polling = presence !== "off" || hasCall;

  const load = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const data = await api.get<Answer>("/portal/incoming");
      setAnswer({ data, at: Date.now() });
      setNow(Date.now());
      // A call that is over (ended on the other side, or here in another tab): leave its room.
      // Only calls already open when this question was asked — a newer one may not be in the answer yet.
      const keep = data.current ? `/portal/consultations/${data.current.id}` : null;
      releaseCallSessionsExcept("/portal/consultations/", (base) => base === keep || (getCallSession(base)?.createdAt ?? 0) > sentAt);
    } catch {
      // Offline or the API restarting: the next tick asks again.
    }
  }, []);

  useEffect(() => {
    unlockOnFirstGesture();
  }, []);

  useEffect(() => {
    if (!polling) return;
    const first = setTimeout(() => void load(), 0);
    const stop = startTicker(POLL_MS, () => {
      void load();
    });
    // Back on the tab: ask straight away.
    const onVisible = () => !document.hidden && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [polling, load]);

  const raw = polling ? (answer?.data.incoming ?? null) : null;
  const since = answer ? Math.floor((now - answer.at) / 1000) : 0;
  const left = raw?.secondsLeft != null ? Math.max(0, raw.secondsLeft - since) : null;
  const liveRungOut = raw?.kind === "live" && (raw.waitingSecs ?? 0) + since >= LIVE_RING_SECS;
  // Already picked up here: its window is open (it is joining).
  const windowOpen = raw?.kind === "session" && (getCallSession(`/portal/consultations/${raw.id}`)?.windowCount ?? 0) > 0;
  const incoming = raw && !done.has(raw.key) && left !== 0 && !liveRungOut && !windowOpen ? raw : null;

  // The countdown ticks between polls while something rings.
  useEffect(() => {
    if (!incoming) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [incoming]);

  // Ringtone, tab title and the browser notification, while it rings.
  const ringingKey = incoming?.key ?? null;
  const incomingRef = useRef(incoming);
  useEffect(() => {
    incomingRef.current = incoming;
  });
  useEffect(() => {
    const ring = incomingRef.current;
    if (!ringingKey || !ring) return;
    startRingtone();
    const original = document.title;
    let flash = false;
    const titleTimer = setInterval(() => {
      flash = !flash;
      document.title = flash ? FLASH_TITLE : original;
    }, 1000);
    document.title = FLASH_TITLE;
    let notice: Notification | null = null;
    const notifyIfHidden = () => {
      if (notice || !document.hidden || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      try {
        notice = new Notification(`${label(ring)} — ${ring.name}`, {
          body: `${rupee(ring.rate)}/min${ring.free ? ` · 🎁 ${ring.makeGood ? "free replacement call" : "free call"}${ring.freeMinutes ? ` (${ring.freeMinutes} min)` : ""}` : ""} · Tap to answer in the portal`,
          tag: `astrorize-call-${ring.key}`,
          requireInteraction: true,
          icon: ring.photoUrl ?? "/assets/brand/logo-mark.png",
        });
        notice.onclick = () => {
          window.focus();
          notice?.close();
        };
      } catch {
        // Some browsers only allow notifications from a service worker: the ring and title still work.
      }
    };
    notifyIfHidden();
    document.addEventListener("visibilitychange", notifyIfHidden);
    return () => {
      stopRingtone();
      clearInterval(titleTimer);
      if (document.title === FLASH_TITLE) document.title = original;
      document.removeEventListener("visibilitychange", notifyIfHidden);
      notice?.close();
    };
  }, [ringingKey]);

  // Expired while ringing: it's gone (the bell keeps a "Missed call" for it).
  const expiredKey = raw && left === 0 && !done.has(raw.key) ? raw.key : null;
  const expiredName = raw?.name;
  const toldExpired = useRef(new Set<string>());
  useEffect(() => {
    if (!expiredKey || toldExpired.current.has(expiredKey)) return;
    toldExpired.current.add(expiredKey);
    if (!expiredKey.startsWith("live:")) toast(`Missed call from ${expiredName} — it's on your notifications.`, "error");
    const t = setTimeout(() => void load(), 1500);
    return () => clearTimeout(t);
  }, [expiredKey, expiredName, toast, load]);

  async function accept(i: Incoming) {
    if (busy) return;
    setBusy(true);
    void unlockSound();
    try {
      if (i.kind === "request") {
        await api.post(`/portal/consultations/${encodeURIComponent(i.id)}/accept`);
        markAnswered(i.id);
      } else if (i.kind === "session") {
        markAnswered(i.id);
      } else {
        await api.post(`/portal/live/requests/${encodeURIComponent(i.id)}/accept`);
      }
      setDone((d) => new Set(d).add(i.key));
      const target = i.kind === "live" ? "/portal/live" : "/portal/consultations";
      if (pathname !== target) router.push(target);
      else router.refresh();
      if (i.kind === "live") toast(`Accepted — ${i.name} is being asked to join your private ${i.window === "chat" ? "chat" : "call"}.`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't accept. Check your connection and try again.", "error");
      setDone((d) => new Set(d).add(i.key));
    } finally {
      setBusy(false);
      void load();
    }
  }

  async function decline(i: Incoming) {
    if (busy) return;
    setBusy(true);
    try {
      if (i.kind === "request") await api.post(`/portal/consultations/${encodeURIComponent(i.id)}/reject`);
      else if (i.kind === "session") await api.post(`/portal/consultations/${encodeURIComponent(i.id)}/end`);
      else await api.post(`/portal/live/requests/${encodeURIComponent(i.id)}/decline`);
      setDone((d) => new Set(d).add(i.key));
      toast(`Declined — ${i.name} sees a “you have not been charged” message. Nothing is billed.`);
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't decline. Check your connection and try again.", "error");
      setDone((d) => new Set(d).add(i.key));
    } finally {
      setBusy(false);
      void load();
    }
  }

  // The other side joined a call this astrologer is in: a short chime (also while minimised).
  const current = polling ? (answer?.data.current ?? null) : null;
  const startedKey = current?.billingStartedAt ? current.id : null;
  const lastStarted = useRef<string | null>(null);
  useEffect(() => {
    if (startedKey && lastStarted.current !== startedKey) {
      lastStarted.current = startedKey;
      if (!soundState().muted) playChime();
    }
  }, [startedKey]);

  // A call minimised while the astrologer moved to another page: the way back to it.
  const currentBase = current ? `/portal/consultations/${current.id}` : null;
  const callHere = currentBase ? bases.includes(currentBase) : false;
  const home = current?.origin === "live" ? "/portal/live" : "/portal/consultations";
  const showReturn = !!current && callHere && current.status === "active" && !pathname.startsWith(home);
  const elapsed = current?.billingStartedAt ? current.elapsedSeconds + since : 0;

  return (
    <>
      {incoming && <IncomingDialog key={incoming.key} i={incoming} left={left} busy={busy} onAccept={() => void accept(incoming)} onDecline={() => void decline(incoming)} />}
      {showReturn && current && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-[140] flex max-w-[calc(100%-32px)] items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-3 text-paper shadow-[0_16px_40px_rgba(11,31,51,.3)] max-lg:right-3 max-lg:left-3 max-lg:bottom-[calc(12px+var(--app-tabbar-space))] max-lg:max-w-none max-lg:rounded-app-card"
        >
          <span className="az-live-dot size-2 shrink-0 rounded-full bg-green-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px]">
            <b>{current.window === "chat" ? "Chat" : "Call"} with {current.name}</b>
            <span className="text-stone-400"> · {current.billingStartedAt ? countdown(elapsed) : "joining…"}</span>
          </span>
          <Link
            href={home}
            className="flex h-9 shrink-0 items-center rounded-full bg-amber-400 px-4 text-[13px] font-bold text-ink hover:text-ink hover:no-underline"
          >
            Return to {current.window === "chat" ? "chat" : "call"}
          </Link>
        </div>
      )}
      {/* Phones/tablets: while live, the way back to the broadcast (desktop: at the top of the page). */}
      <LiveReturnBar placement="bottom" raised={showReturn} />
    </>
  );
}

function IncomingDialog({
  i,
  left,
  busy,
  onAccept,
  onDecline,
}: {
  i: Incoming;
  left: number | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const sound = useSyncExternalStore(subscribeSound, soundState, serverSoundState);
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    acceptRef.current?.focus();
  }, []);
  const pct = left != null && i.windowSecs ? `${Math.min(100, (left / i.windowSecs) * 100)}%` : null;
  const what = label(i);
  return (
    <div className="fixed inset-0 z-[220] grid place-items-center bg-[rgba(28,25,23,.5)] p-4 sm:p-6 max-lg:place-items-end max-lg:p-0">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        aria-describedby="incoming-call-detail"
        className="az-rise relative w-full max-w-[400px] rounded-[22px] bg-paper p-6 text-center shadow-[0_16px_40px_rgba(11,31,51,.25)] max-lg:max-w-none max-lg:rounded-b-none max-lg:rounded-t-app-modal max-lg:bg-app-elev max-lg:px-4 max-lg:pt-3 max-lg:pb-[calc(24px+var(--app-safe-bottom))] max-lg:shadow-app-modal"
      >
        <div aria-hidden="true" className="mx-auto mt-1 mb-3 h-1 w-9 rounded-full bg-app-line lg:hidden" />
        <button
          type="button"
          onClick={() => setAlertsMuted(!sound.muted)}
          aria-pressed={sound.muted}
          aria-label={sound.muted ? "Turn the ringtone on" : "Mute the ringtone"}
          title={sound.muted ? "Turn the ringtone on" : "Mute the ringtone"}
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-stone-500 hover:bg-stone-100 max-lg:top-4"
        >
          {sound.muted ? <BellOffIcon /> : <BellIcon />}
        </button>
        <span className="relative mx-auto mt-1 grid size-[92px] place-items-center">
          <span className="az-pulse-ring absolute -inset-1.5 rounded-full border-2 border-urgent" aria-hidden="true" />
          <Avatar photoUrl={i.photoUrl} initials={i.initials} size={84} />
        </span>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          <span className="inline-flex h-[24px] items-center rounded-full bg-urgent px-2.5 text-[11px] font-extrabold tracking-[.05em] text-white uppercase">
            {i.instant ? "⚡ " : ""}
            {what}
          </span>
          {i.free && (
            <span className="inline-flex h-[24px] items-center rounded-full bg-emerald-700 px-2.5 text-[11px] font-extrabold tracking-[.04em] text-white">
              🎁 {i.makeGood ? "FREE REPLACEMENT" : "FREE CALL"}
              {i.freeMinutes ? ` · ${i.freeMinutes} MIN` : ""}
            </span>
          )}
        </div>
        <h2 id="incoming-call-title" className="mt-2.5 text-[22px] leading-tight font-bold break-words text-ink max-lg:text-app-ink">
          {i.name}
        </h2>
        <p id="incoming-call-detail" className="mt-1 text-[14px] text-stone-600 max-lg:text-app-ink-2">
          {i.kind === "session"
            ? `is waiting in the ${i.window === "chat" ? "chat" : "call"} for you`
            : i.kind === "live"
              ? "is at the front of your live's queue"
              : "wants to consult you now"}{" "}
          · <b className="text-ink">{rupee(i.rate)}/min</b>
        </p>
        {left != null ? (
          <div className="mt-4" aria-live="polite">
            <div className="text-[12.5px] font-bold text-orange-700 tabular-nums">
              {i.kind === "session" ? "Pick up within" : "Accept within"} {countdown(left)}
            </div>
            {pct && (
              <div className="mx-auto mt-1.5 h-1.5 max-w-[260px] overflow-hidden rounded-full bg-orange-100">
                <span className="block h-full rounded-full bg-urgent transition-[width] duration-1000 ease-linear" style={{ width: pct }} />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-stone-500">Waiting in your queue — accept when you&apos;re ready.</p>
        )}
        {!sound.unlocked && !sound.muted && (
          <button type="button" onClick={() => void unlockSound()} className="mt-3 text-[12.5px] font-bold text-amber-800 underline">
            Turn on the ringtone sound
          </button>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className="h-12 rounded-xl border border-orange-200 bg-white text-[15px] font-bold text-orange-800 disabled:opacity-60 max-lg:h-app-hit max-lg:rounded-app-btn"
          >
            Decline
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="h-12 rounded-xl bg-emerald-600 text-[15px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60 max-lg:h-app-hit max-lg:rounded-app-btn"
          >
            {busy ? "One moment…" : i.window === "chat" ? "Accept chat" : "Accept call"}
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-normal text-stone-500">
          {i.kind === "live"
            ? "Accepting asks them to join a private consultation; billing starts once you're both in."
            : "Billing starts only once you're both in. Declining or letting it time out bills ₹0."}
        </p>
      </div>
    </div>
  );
}

/**
 * Shown at the top of every portal page while the astrologer is online, only when call alerts
 * need something from them: browser notifications not turned on yet, sound blocked until they
 * interact with the page, or the ringtone muted.
 */
export function CallAlertsBar() {
  const [presence] = usePresence();
  const sound = useSyncExternalStore(subscribeSound, soundState, serverSoundState);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | null>(null);
  useEffect(() => {
    const read = () => setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    read();
    // Changed in the browser's site settings meanwhile.
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  if (presence === "off" || permission === null) return null;
  const askNotifications = permission === "default";
  const soundBlocked = !sound.unlocked && !sound.muted;
  if (!askNotifications && !soundBlocked && !sound.muted) return null;
  const chip = "inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-bold max-lg:min-h-app-hit";
  return (
    <div
      role="region"
      aria-label="Call alerts"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 max-lg:mb-3 max-lg:rounded-app-card max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:px-3"
    >
      <span className="min-w-[160px] flex-1 text-[13px] text-amber-900 max-lg:text-app-ink-2">
        {sound.muted
          ? "Call ringtone is muted — you'll still see incoming calls on screen."
          : soundBlocked && askNotifications
            ? "Don't miss a call: turn on sound and alerts for incoming consultations."
            : soundBlocked
              ? "Your browser is holding back the ringtone until you allow sound."
              : "Get an alert for incoming calls even when this tab is in the background."}
      </span>
      <span className="flex flex-wrap gap-2">
        {soundBlocked && (
          <button type="button" onClick={() => void unlockSound()} className={`${chip} bg-amber-400 text-ink max-lg:bg-app-primary max-lg:text-app-on-primary`}>
            Enable sound
          </button>
        )}
        {sound.muted && (
          <button type="button" onClick={() => setAlertsMuted(false)} className={`${chip} bg-amber-400 text-ink max-lg:bg-app-primary max-lg:text-app-on-primary`}>
            Unmute ringtone
          </button>
        )}
        {askNotifications && (
          <button
            type="button"
            onClick={() => {
              void unlockSound();
              void Notification.requestPermission().then(setPermission, () => {});
            }}
            className={`${chip} border border-amber-300 bg-white text-amber-900 max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink`}
          >
            Turn on call alerts
          </button>
        )}
      </span>
    </div>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" {...stroke} aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
function BellOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" {...stroke} aria-hidden="true">
      <path d="M6 9a6 6 0 0 1 .5-2.4M9 3.8A6 6 0 0 1 18 9c0 4 .7 5.6 1.3 6.6M17 18H4c0-2 2-2 2-9M10 20a2 2 0 0 0 4 0M3 3l18 18" />
    </svg>
  );
}
