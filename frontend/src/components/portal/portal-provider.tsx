"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { Account, Presence } from "@/lib/portal/types";

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
  // background tab). If the server switched them off meanwhile (the portal was closed or the
  // computer slept for a few minutes), say so — it never switches them back on by itself.
  useEffect(() => {
    let stopped = false;
    const beat = async () => {
      const startedAt = changes.current;
      try {
        const res = await api.post<{ presence: Presence }>("/portal/heartbeat");
        if (stopped || changes.current !== startedAt) return;
        if (presenceRef.current !== "off" && res.presence === "off") {
          toast("You're offline now — the portal was closed or inactive for a few minutes. Go online again when you're ready.", "error");
          router.refresh();
        }
        setPresenceState(res.presence);
      } catch {
        // Offline or the API restarting: the next beat tries again.
      }
    };
    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (!document.hidden) void beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [toast, router]);

  const value = useMemo(() => ({ account, presence, setPresence, toast, store, setStore }), [account, presence, setPresence, toast, store]);

  return (
    <PortalContext.Provider value={value}>
      {children}
      {toastMessage && (
        <div
          role="status"
          className="az-toast fixed bottom-7 left-1/2 z-[300] flex w-[calc(100%-32px)] max-w-[600px] -translate-x-1/2 items-start gap-[11px] rounded-[14px] bg-ink px-[18px] py-3.5 text-line shadow-[0_16px_40px_rgba(11,31,51,.3)] min-[640px]:w-max"
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
