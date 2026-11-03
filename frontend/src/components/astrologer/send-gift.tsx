"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { sessionActions, useSession } from "@/lib/session-store";
import type { Astrologer, GiftOption } from "@/lib/types";
import Modal, { CloseButton } from "@/components/ui/modal";
import { useAppUI } from "../app-provider";

// "Send a gift" on an astrologer's profile (client, Nov 2026): the same approved catalogue as the
// live rooms, sent straight to the astrologer whether they are live, available or offline. Paid
// from the service balance like a live gift, after a confirmation step; the astrologer gets their
// usual share and a notification. Shown to customers and visitors (who are asked to log in).

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

/** A fresh id for one send attempt; the API charges once per id however often it arrives. */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const GiftIcon = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
    <path d="M2.5 9h19M12 9v11M12 9c-1.5-3.5-6-4.5-6-1.5S12 9 12 9Zm0 0c1.5-3.5 6-4.5 6-1.5S12 9 12 9Z" />
  </svg>
);

/** The button: `desktop` for the profile's price card, `app` for the phone/tablet profile. */
export default function SendGiftButton({ astrologer, variant }: { astrologer: Astrologer; variant: "desktop" | "app" }) {
  const session = useSession();
  const { openLogin } = useAppUI();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Customers send gifts; astrologers and staff don't see the button.
  if (!session.ready || (session.loggedIn && session.role !== "customer")) return null;

  function start() {
    if (!session.loggedIn) return openLogin({ notice: `Log in to send ${astrologer.name} a gift.` });
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={
          variant === "app"
            ? "inline-flex min-h-app-hit w-full items-center justify-center gap-2 rounded-app-btn border border-app-line-gold-2 bg-app-tint text-[15px] font-bold text-app-active"
            : "flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-[13.5px] font-bold text-amber-900 hover:border-gold"
        }
      >
        <GiftIcon className="size-4" />
        Send a gift
      </button>
      {/* On the page body: the profile's price card is a glass panel (backdrop-filter), which would trap a fixed overlay inside it. */}
      {open && createPortal(<GiftDialog astrologer={astrologer} onClose={close} />, document.body)}
    </>
  );
}

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; gifts: GiftOption[]; balance: number | null };
type Step = "choose" | "confirm" | "sent";

function GiftDialog({ astrologer: a, onClose }: { astrologer: Astrologer; onClose: () => void }) {
  const { toast } = useAppUI();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ icon: string; name: string; price: number } | null>(null);
  // One id per attempt: a double click or a retry after a dropped answer reuses it.
  const requestId = useRef(newRequestId());
  const path = `/astrologers/${encodeURIComponent(a.slug)}/gifts`;

  const fetchGifts = useCallback(async () => {
    try {
      const res = await api.get<{ gifts: GiftOption[]; balance: number | null }>(path);
      setLoad({ state: "ready", gifts: res.gifts, balance: res.balance });
      setSelected((s) => (s && res.gifts.some((g) => g.id === s) ? s : (res.gifts[0]?.id ?? null)));
    } catch (e) {
      setLoad((l) => (l.state === "ready" ? l : { state: "error", message: errorText(e) }));
    }
  }, [path]);

  useEffect(() => {
    void fetchGifts();
    // Back from adding money in another tab: show the new balance.
    const onVisible = () => {
      if (!document.hidden) void fetchGifts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchGifts]);

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
      const res = await api.post<{ gift: { icon: string; name: string; price: number }; balance: number }>(path, {
        giftId: gift.id,
        requestId: requestId.current,
      });
      requestId.current = newRequestId();
      setLoad((l) => (l.state === "ready" ? { ...l, balance: res.balance } : l));
      setSent(res.gift);
      setStep("sent");
      toast(`${res.gift.icon} ${res.gift.name} sent to ${a.name}.`);
      // The header's balance follows.
      void sessionActions.refreshWallet().catch(() => {});
    } catch (e) {
      // Nothing was charged: a new attempt gets a new id.
      if (e instanceof ApiError && e.status < 500) requestId.current = newRequestId();
      setError(errorText(e));
      if (e instanceof ApiError && e.code === "insufficient_balance") {
        setStep("choose");
        void fetchGifts();
      }
    } finally {
      setSending(false);
    }
  }

  const primary =
    "az-cta flex h-11 w-full items-center justify-center rounded-xl text-[14.5px] font-bold hover:text-cta-ink hover:no-underline disabled:opacity-60 max-lg:h-app-hit max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-[15px] max-lg:text-app-on-primary max-lg:shadow-none";
  const secondary =
    "flex h-11 w-full items-center justify-center rounded-xl border border-line bg-white text-[14.5px] font-bold text-ink max-lg:h-app-hit max-lg:rounded-app-btn max-lg:border-app-line max-lg:text-[15px]";

  return (
    <Modal onClose={onClose} labelledBy="send-gift-title" maxWidth={520}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="send-gift-title" className="font-display text-[26px] leading-tight font-semibold text-ink max-lg:font-sans max-lg:text-[18px] max-lg:font-bold">
            {step === "sent" ? "Gift sent" : `Send a gift to ${a.name}`}
          </h2>
          {step === "choose" && (
            <p className="mt-1 text-[12.5px] leading-[1.45] text-stone-500 max-lg:text-app-ink-2">
              They get it even when they&apos;re offline. Paid from your service balance; gifts can&apos;t be refunded.
            </p>
          )}
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {step === "sent" && sent ? (
        <div className="mt-4 text-center" role="status">
          <div aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-amber-100 text-[34px] leading-none">
            {sent.icon}
          </div>
          <p className="mt-3 text-[15px] font-bold text-ink">
            {sent.name} · {rupee(sent.price)} sent to {a.name}
          </p>
          <p className="mt-1 text-[12.5px] text-stone-500 max-lg:text-app-ink-2">
            We&apos;ve let them know.{balance !== null ? ` Service balance left: ${rupee(balance)}.` : ""}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setSent(null);
                setStep("choose");
              }}
            >
              Send another
            </button>
            <button type="button" className={primary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          {load.state === "loading" && (
            <div role="status" className="grid h-[160px] place-items-center text-[13px] text-stone-500">
              Loading gifts…
            </div>
          )}
          {load.state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-2.5 py-6 text-center text-[13px] text-stone-600">
              {load.message}
              <button type="button" onClick={() => void fetchGifts()} className="h-9 rounded-full border border-line bg-white px-4 font-bold text-ink">
                Try again
              </button>
            </div>
          )}
          {load.state === "ready" && gifts.length === 0 && (
            <p className="py-6 text-center text-[13px] text-stone-500">No gifts are available right now.</p>
          )}
          {load.state === "ready" && gifts.length > 0 && step === "choose" && (
            <div role="radiogroup" aria-label="Gift" className="mt-4 grid auto-rows-fr grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5">
              {gifts.map((g) => {
                const on = g.id === selected;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(g.id)}
                    className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1.5 pt-2.5 pb-2 text-center max-lg:rounded-app-card ${
                      on ? "border-amber-500 bg-amber-50 shadow-[0_0_0_1px_var(--color-amber-500)]" : "border-line bg-white hover:border-amber-300"
                    }`}
                  >
                    <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-amber-100 text-[24px] leading-none">
                      {g.icon}
                    </span>
                    <span className="flex min-h-[2lh] w-full items-center justify-center text-[12.5px] leading-tight font-semibold break-words text-ink">{g.name}</span>
                    <span className="text-[12.5px] font-bold tabular-nums text-plum">{rupee(g.price)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {load.state === "ready" && gift && step === "confirm" && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-[28px] leading-none">
                {gift.icon}
              </span>
              <p className="min-w-0 text-[13.5px] leading-[1.45] text-ink">
                Send <b>{gift.name}</b> to <b>{a.name}</b> for <b className="tabular-nums">{rupee(gift.price)}</b>? It&apos;s paid from your service
                balance and can&apos;t be refunded.
              </p>
            </div>
          )}

          {load.state === "ready" && gifts.length > 0 && (
            // Phones and tablets: the balance and the button stay in view under the scrolling gifts.
            <div className="mt-3 max-lg:sticky max-lg:-bottom-[calc(24px+var(--app-safe-bottom))] max-lg:-mx-4 max-lg:bg-app-elev max-lg:px-4 max-lg:pt-2 max-lg:pb-[calc(24px+var(--app-safe-bottom))]">
              {balance !== null && (
                <p className="text-[12px] text-stone-500 max-lg:text-app-ink-2">Paid from your service balance · {rupee(balance)} available</p>
              )}
              {error && (
                <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose-700">
                  {error}
                </p>
              )}
              {gift && short > 0 ? (
                <>
                  {!error && <p className="mt-2 text-[12.5px] font-semibold text-rose-700">Needs {rupee(short)} more in service balance.</p>}
                  <a href="/wallet#add-money" target="_blank" rel="noopener" className={`${primary} mt-2`}>
                    Add money<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              ) : step === "confirm" ? (
                <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" className={secondary} disabled={sending} onClick={() => setStep("choose")}>
                    Back
                  </button>
                  <button type="button" className={primary} disabled={sending} onClick={() => void send()}>
                    {sending ? "Sending…" : `Send · ${rupee(gift?.price ?? 0)}`}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${primary} mt-2`}
                  disabled={!gift}
                  onClick={() => {
                    setError(null);
                    setStep("confirm");
                  }}
                >
                  {gift ? `Continue with ${gift.name} · ${rupee(gift.price)}` : "Choose a gift"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
