"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { AdminSession, NavCounts } from "@/lib/admin/types";

/** How often the nav badges are re-read while the tab is visible (they are also re-read after every action). */
const NAV_COUNTS_POLL_MS = 30_000;

interface AdminUI {
  session: AdminSession;
  /** Short toast at the bottom of the screen, like the prototype's say(). */
  say: (message: string) => void;
  /** The nav badges as last read. */
  nav: NavCounts;
  /** Re-reads the nav badges now (after an action changed what is waiting). */
  refreshNav: () => void;
}

const AdminContext = createContext<AdminUI | null>(null);

function useAdminContext(): AdminUI {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("Admin hooks must be used inside <AdminProvider>");
  return ctx;
}

/** The signed-in admin and the toast function. */
export function useAdmin(): AdminUI {
  return useAdminContext();
}

/** The nav badges' counts and what each counts (tooltips), kept current. */
export function useNavCounts(): NavCounts {
  return useAdminContext().nav;
}

/**
 * Runs an API action: on success shows `done` (string, or built from the response) and
 * re-fetches the page's server data; on failure shows the API's message (e.g. a
 * separation-of-duties block) in the same toast. Resolves to the response, or null on error.
 */
export function useAction() {
  const { say, refreshNav } = useAdminContext();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(call: () => Promise<T>, done?: string | ((res: T) => string), refresh = true): Promise<T | null> => {
      setBusy(true);
      try {
        const res = await call();
        if (done) say(typeof done === "function" ? done(res) : done);
        if (refresh) router.refresh();
        // The badges follow at once (a refresh re-reads them too, but not every action refreshes).
        refreshNav();
        return res;
      } catch (e) {
        say(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [say, router, refreshNav],
  );

  return { run, busy };
}

export default function AdminProvider({ session, children }: { session: AdminSession; children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  // Seeded from the session the layout read; a newer session (router.refresh) replaces it.
  const fromSession = (s: AdminSession): NavCounts => ({ counts: s.counts, hints: s.hints ?? {} });
  const [nav, setNav] = useState<{ from: AdminSession; counts: NavCounts }>(() => ({ from: session, counts: fromSession(session) }));
  if (nav.from !== session) setNav({ from: session, counts: fromSession(session) });
  // Only the newest answer counts if two reads overlap.
  const seq = useRef(0);
  const refreshNav = useCallback(() => {
    const mine = ++seq.current;
    api
      .get<NavCounts>("/admin/nav-counts")
      .then((res) => {
        if (mine === seq.current) setNav((n) => ({ ...n, counts: res }));
      })
      .catch(() => {}); // A missed read is retried on the next tick.
  }, []);
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refreshNav();
    const id = setInterval(tick, NAV_COUNTS_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshNav]);

  const counts = nav.counts;
  const ui = useMemo<AdminUI>(() => ({ session, say, nav: counts, refreshNav }), [session, say, counts, refreshNav]);

  return (
    <AdminContext.Provider value={ui}>
      {children}
      {toast && (
        <div
          role="status"
          key={toast}
          className="az-toast fixed bottom-7 left-1/2 z-[300] flex max-w-[600px] -translate-x-1/2 items-start gap-[11px] rounded-[14px] bg-ink px-[18px] py-3.5 text-line shadow-[0_16px_40px_rgba(11,31,51,.3)]"
        >
          <span className="text-[14px] text-amber-300">▤</span>
          <span className="text-[13.5px] leading-[1.5]">{toast}</span>
        </div>
      )}
    </AdminContext.Provider>
  );
}
