"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { Account, Presence } from "@/lib/portal/types";
import { acquireLiveBroadcast, onLiveEndedByServer, releaseLiveBroadcast } from "@/lib/media/live-broadcast";
import PortalCallCenter from "./call-alerts";

type Store = Record<string, unknown>;
type SetStateArg<T> = T | ((previous: T) => T);
type Toast = (message: string, tone?: "ok" | "error") => void;

/** While a portal page is open it tells the server so every ~45 s (see backend lib/presence.ts). */
const HEARTBEAT_MS = 45_000;

interface PortalContextValue {
  account: Account;
  presence: Presence;
  setPresence: (presence: Presence) => void;
  toast: Toast;
  store: Store;
  setStore: React.Dispatch<React.SetStateAction<Store>>;
}

const PortalContext = createContext<PortalContextValue | null>(null);

function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("Portal hooks must be used inside <PortalProvider>");
  return ctx;
}

/** The signed-in astrologer's account (from the layout's getAccount()). */
export function useAccount(): Account {
  return usePortal().account;
}

/**
 * The astrologer's presence right now (on / busy / live / off), shared by the dashboard toggle
 * and the live console. Call setPresence with what the server answered after a change.
 */
export function usePresence(): [Presence, (presence: Presence) => void] {
  const { presence, setPresence } = usePortal();
  return [presence, setPresence];
}

/** Shows the dark confirmation toast at the bottom of the screen (prototype's say()). */
export function useToast(): Toast {
  return usePortal().toast;
}

/** Shows an API error (its message is safe to show) in the toast. */
export function useErrorToast(): (error: unknown) => void {
  const toast = usePortal().toast;
  return useCallback(
    (error: unknown) =>
      toast(error instanceof ApiError ? error.message : "Something went wrong. Please check your connection and try again.", "error"),
    [toast],
  );
}

/**
 * useState that lives in the portal layout, so edits survive moving between
 * pages (a new slot, a profile draft, the selected wizard step…) — just like the
 * prototype, where every console shared one state object. `initial` is used
 * until the value is first changed.
 */
export function usePortalState<T>(key: string, initial: T): [T, (value: SetStateArg<T>) => void] {
  const { store, setStore } = usePortal();
  const value = key in store ? (store[key] as T) : initial;
  const set = useCallback(
    (next: SetStateArg<T>) =>
      setStore((s) => {
        const prev = key in s ? (s[key] as T) : initial;
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        return { ...s, [key]: resolved };
      }),
    // `initial` only matters before the first write, so it is fine to capture once per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, setStore],
  );
  return [value, set];
}

export default function PortalProvider({ account, children }: { account: Account; children: React.ReactNode }) {
  const [store, setStore] = useState<Store>({});
  const [toastMessage, setToastMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<Toast>((message, tone = "ok") => {
    setToastMessage({ text: message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Presence: starts from the layout's account and follows the server (a refresh of the layout,
  // a toggle, or the heartbeat's answer).
  const router = useRouter();
  const [presence, setPresenceState] = useState<Presence>(account.presence);
  const [accountPresence, setAccountPresence] = useState(account.presence);
  if (account.presence !== accountPresence) {
    setAccountPresence(account.presence);
    setPresenceState(account.presence);
  }
  const presenceRef = useRef(presence);
  const changes = useRef(0);
  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);
  const setPresence = useCallback((next: Presence) => {
    changes.current += 1; // a heartbeat already on its way must not undo this
    setPresenceState(next);
  }, []);

  // Heartbeat: keeps an online astrologer online while any portal page is open (also in a
  // background tab). If the server switched them off meanwhile (no heartbeat reached it for a
  // while — e.g. the computer slept or the browser paused this tab), say so — it never switches
  // them back on by itself.
  // A browser holds one sign-in: if another tab signs in as a different account (or signs out),
  // beats are refused. Then the beat stops and a notice explains why, instead of failing quietly
  // until the server takes the astrologer offline. Coming back to the tab checks again, so
  // signing in again as this astrologer elsewhere resumes it.
  const [signInLost, setSignInLost] = useState<"signed_out" | "other_account" | null>(null);
  // The astrologer this portal was opened for. A refresh of the layout under someone else's
  // sign-in must not quietly turn this tab into their portal.
  const [openedFor] = useState(() => ({ id: account.astrologer.id, name: account.astrologer.name }));
  const astrologerId = openedFor.id;
  const lostReason = signInLost ?? (account.astrologer.id !== openedFor.id ? "other_account" : null);
  useEffect(() => {
    let stopped = false;
    let lost = false;
    let lastBeatAt = 0;
    const beat = async () => {
      const startedAt = changes.current;
      lastBeatAt = Date.now();
      try {
        const res = await api.post<{ presence: Presence }>("/portal/heartbeat", { astrologerId });
        if (stopped) return;
        if (lost) {
          // Signed in again as this astrologer: pick up where the portal left off.
          lost = false;
          setSignInLost(null);
          router.refresh();
        }
        if (changes.current !== startedAt) return;
        if (presenceRef.current !== "off" && res.presence === "off") {
          toast("You're offline now — Astrorize didn't hear from your portal for a while (it was closed, the computer slept, or the connection dropped). Go online again when you're ready.", "error");
          router.refresh();
        }
        setPresenceState(res.presence);
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          lost = true;
          setSignInLost(error.status === 401 ? "signed_out" : "other_account");
        }
        // Anything else (offline, the API restarting): the next beat tries again.
      }
    };
    void beat();
    const id = setInterval(() => {
      if (!lost) void beat();
    }, HEARTBEAT_MS);
    // Back on the tab, back online, or the window focused: beat now rather than waiting for the
    // interval (browsers slow down timers in background tabs and stop them while asleep).
    const onReturn = () => {
      if (document.hidden || Date.now() - lastBeatAt < 5_000) return;
      void beat();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [toast, router, astrologerId]);

  // Live: the broadcast (camera, microphone, the published stream, the room's feed) runs from here,
  // not from the Live page, so moving between portal pages or minimising never stops it. It ends on
  // End live, when the server says the room closed (then the portal re-reads), or with the page.
  useEffect(() => {
    if (lostReason) return releaseLiveBroadcast();
    if (presence === "live") acquireLiveBroadcast();
  }, [presence, lostReason]);
  useEffect(
    () =>
      onLiveEndedByServer(() => {
        toast("Your live has ended — the room is closed.");
        router.refresh();
      }),
    [toast, router],
  );

  const value = useMemo(() => ({ account, presence, setPresence, toast, store, setStore }), [account, presence, setPresence, toast, store]);

  return (
    <PortalContext.Provider value={value}>
      {children}
      {/* Incoming consultations ring on every portal page (and a minimised call stays reachable). */}
      {!lostReason && <PortalCallCenter />}
      {lostReason && <SignInLostNotice reason={lostReason} name={openedFor.name} />}
      {toastMessage && (
        <div
          role="status"
          className="az-toast fixed bottom-7 left-1/2 z-[300] max-lg:bottom-[calc(20px+var(--app-tabbar-space))] flex w-[calc(100%-32px)] max-w-[600px] -translate-x-1/2 items-start gap-[11px] rounded-[14px] bg-ink px-[18px] py-3.5 text-line shadow-[0_16px_40px_rgba(11,31,51,.3)] min-[640px]:w-max"
        >
          {toastMessage.tone === "error" ? (
            <span className="text-sm text-rose-300">!</span>
          ) : (
            <span className="text-sm text-amber-300">✓</span>
          )}
          <span className="text-[13.5px] leading-normal">{toastMessage.text}</span>
        </div>
      )}
    </PortalContext.Provider>
  );
}

/**
 * Shown when this browser's sign-in no longer belongs to the astrologer this portal was opened
 * for. It stays until they sign in again (nothing in the portal works meanwhile).
 */
function SignInLostNotice({ reason, name }: { reason: "signed_out" | "other_account"; name: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-[250] grid place-items-center overflow-y-auto bg-[rgba(28,25,23,.55)] p-4 sm:p-6">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="portal-signin-lost-title"
        aria-describedby="portal-signin-lost-text"
        tabIndex={-1}
        className="az-rise w-full max-w-[460px] rounded-[20px] bg-paper p-5 shadow-[0_16px_40px_rgba(11,31,51,.18)] outline-none sm:p-[26px]"
      >
        <h2 id="portal-signin-lost-title" className="m-0 font-display text-[22px] font-semibold text-ink">
          {reason === "signed_out" ? "You've been signed out" : "Signed in as a different account"}
        </h2>
        <p id="portal-signin-lost-text" className="mt-2 text-[14px] leading-relaxed text-stone-600">
          {reason === "signed_out"
            ? "This browser was signed out (perhaps from another tab), so your astrologer portal stopped."
            : "This browser is now signed in as a different account (perhaps in another tab), so your astrologer portal stopped."}{" "}
          If you were online, you&rsquo;ll be taken offline in a few minutes. Sign in again as <b className="text-ink">{name}</b> to continue.
        </p>
        <p className="mt-2 text-[12.5px] leading-normal text-stone-500">
          A browser keeps one sign-in at a time. To use two accounts together, use a separate browser or a private window for one of them.
        </p>
        <a
          href="/login?method=email&next=%2Fportal"
          className="az-cta mt-5 flex h-[46px] items-center justify-center rounded-full text-[14.5px] font-bold hover:text-cta-ink hover:no-underline"
        >
          Sign in again
        </a>
      </div>
    </div>
  );
}
