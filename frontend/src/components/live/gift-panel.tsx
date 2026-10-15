"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { sessionActions } from "@/lib/session-store";
import type { GiftOption, LiveGift } from "@/lib/types";

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

/** A fresh id for one send attempt; the API charges once per id however often it arrives. */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; gifts: GiftOption[]; balance: number | null };

/**
 * "Send a gift" over the live video: the approved catalogue with real prices, paid from the
 * service balance only. Opens over the bottom of the video like the app's gift sheet.
 */
export default function GiftPanel({
  roomId,
  onClose,
  onSent,
  onEnded,
}: {
  roomId: string;
  onClose: () => void;
  onSent: (gift: LiveGift) => void;
  /** The room ended while the panel was open. */
  onEnded: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per attempt: a double click or a retry after a dropped answer reuses it.
  const requestId = useRef(newRequestId());
  const panel = useRef<HTMLDivElement>(null);

  const fetchGifts = useCallback(async () => {
    try {
      const res = await api.get<{ gifts: GiftOption[]; balance: number | null }>(`/live-rooms/${encodeURIComponent(roomId)}/gifts`);
      setLoad({ state: "ready", gifts: res.gifts, balance: res.balance });
      setSelected((s) => (s && res.gifts.some((g) => g.id === s) ? s : (res.gifts[0]?.id ?? null)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return onEnded();
      setLoad((l) => (l.state === "ready" ? l : { state: "error", message: errorText(e) }));
    }
  }, [roomId, onEnded]);

  useEffect(() => {
    void fetchGifts();
    // Back from adding money in another tab: show the new balance.
    const onVisible = () => {
      if (!document.hidden) void fetchGifts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchGifts]);

  // Escape closes; focus starts inside the panel.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gifts = load.state === "ready" ? load.gifts : [];
  const gift = gifts.find((g) => g.id === selected) ?? null;
  const balance = load.state === "ready" ? load.balance : null;
  const short = gift && balance !== null && gift.price > balance ? gift.price - balance : 0;

  function choose(id: string) {
    if (id === selected) return;
    setSelected(id);
    setError(null);
    requestId.current = newRequestId();
  }

  async function send() {
    if (!gift || sending || short > 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ gift: LiveGift; balance: number }>(`/live-rooms/${encodeURIComponent(roomId)}/gifts`, {
        giftId: gift.id,
        requestId: requestId.current,
      });
      requestId.current = newRequestId();
      setLoad((l) => (l.state === "ready" ? { ...l, balance: res.balance } : l));
      onSent(res.gift);
      // The header's balance follows.
      void sessionActions.refreshWallet().catch(() => {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return onEnded();
      // Nothing was charged: a new attempt gets a new id.
      if (e instanceof ApiError && e.status < 500) requestId.current = newRequestId();
      setError(errorText(e));
      if (e instanceof ApiError && e.code === "insufficient_balance") void fetchGifts();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="gift-panel-title"
      className="absolute inset-x-3 bottom-3 z-[7] max-h-[calc(100%-24px)] overflow-y-auto rounded-2xl border border-amber-500/25 bg-[rgba(18,15,24,.95)] p-3 text-[#f8f4ec] shadow-[0_18px_40px_rgba(0,0,0,.4)] outline-none sm:left-auto sm:w-[380px]"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <b id="gift-panel-title" className="text-[13.5px]">
          Send a gift
        </b>
        <button type="button" onClick={onClose} className="h-8 rounded-full px-2.5 text-[12.5px] font-bold text-amber-200 hover:bg-white/10">
          Close
        </button>
      </div>

      {load.state === "loading" && (
        <div role="status" className="grid h-[118px] place-items-center text-[12.5px] text-white/70">
          Loading gifts…
        </div>
      )}
      {load.state === "error" && (
        <div role="alert" className="flex flex-col items-center gap-2.5 py-5 text-center text-[12.5px] text-white/80">
          {load.message}
          <button type="button" onClick={() => void fetchGifts()} className="h-9 rounded-full bg-white/10 px-4 font-bold text-amber-200">
            Try again
          </button>
        </div>
      )}
      {load.state === "ready" && gifts.length === 0 && (
        <p className="py-5 text-center text-[12.5px] text-white/75">No gifts are available right now.</p>
      )}
      {load.state === "ready" && gifts.length > 0 && (
        <>
          <div role="radiogroup" aria-label="Gift" className="grid grid-cols-3 gap-1.5 min-[400px]:grid-cols-4">
            {gifts.map((g) => {
              const on = g.id === selected;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => choose(g.id)}
                  className={`flex min-w-0 flex-col items-center rounded-xl border px-1 pb-2 pt-2.5 ${
                    on ? "border-amber-500 bg-amber-500/15" : "border-white/10 bg-white/[.04] hover:bg-white/[.08]"
                  }`}
                >
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-amber-500/15 text-[22px] leading-none">
                    {g.icon}
                  </span>
                  <span className="mt-1 w-full truncate text-[11px] font-semibold">{g.name}</span>
                  <span className="text-[11px] font-bold tabular-nums text-amber-200">{rupee(g.price)}</span>
                </button>
              );
            })}
          </div>
          {balance !== null && (
            <p className="mt-2 text-[11.5px] text-white/65">
              Paid from your service balance · {rupee(balance)} available
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[12px] font-semibold text-orange-300">
              {error}
            </p>
          )}
          {gift && short > 0 ? (
            <>
              {!error && <p className="mt-2 text-[12px] font-semibold text-orange-300">Needs {rupee(short)} more in service balance.</p>}
              <a
                href="/wallet#add-money"
                target="_blank"
                rel="noopener"
                className="az-cta mt-2 flex h-10 w-full items-center justify-center rounded-xl text-[13.5px] font-bold hover:text-cta-ink hover:no-underline"
              >
                Add money<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!gift || sending}
              className="az-cta mt-2 h-10 w-full rounded-xl text-[13.5px] font-bold disabled:opacity-60"
            >
              {sending ? "Sending…" : gift ? `Send ${gift.name} · ${rupee(gift.price)}` : "Choose a gift"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
