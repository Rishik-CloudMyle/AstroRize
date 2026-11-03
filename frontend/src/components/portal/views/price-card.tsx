"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api/client";
import { discountLabel, rupee } from "@/lib/portal/format";
import type { Pricing, PriceRequest } from "@/lib/portal/types";
import Modal from "../modal";
import { useAccount, useErrorToast, useToast } from "../portal-provider";
import { M_INPUT, M_LABEL, M_PRIMARY, M_SECONDARY, Panel } from "../ui";

type Channel = "call" | "chat";

/** One of the astrologer's two prices, in the shape the editor below works with. */
interface ChannelPricing {
  price: number;
  allowed: { min: number; max: number };
  changedAt: string | null;
  nextChangeOn: string | null;
  pending: PriceRequest | null;
  lastDecision: PriceRequest | null;
}

/**
 * "Your price": the astrologer's own call (voice) price and separate chat price (client, Nov 2026),
 * what customers pay for each way of consulting, and a change form for each within the rules from
 * the API (largest increase, price range, one change per cooldown). A decrease applies at once; an
 * increase waits for the AstroRize team (shown here with a Withdraw button, then the decision and
 * any reason). A change applies to new consultations only.
 */
export default function PriceCard({ pricing: p }: { pricing: Pricing }) {
  const discount = discountLabel(p.price, p.was);
  const rows: [string, number][] = [
    ["Chat", p.rates.chat],
    ["Voice", p.rates.voice],
    ["Video", p.rates.video],
    ["Instant Call", p.rates.instant],
  ];

  return (
    <Panel className="p-5">
      <h2 className="m-0 mb-1 text-base font-bold">Your price</h2>
      <p className="mb-3.5 text-[12.5px] leading-[1.5] text-stone-500">
        Per minute. Calls and chat have separate prices. Increases are checked by the AstroRize team before customers see them; decreases apply at
        once. Sessions already running keep their rate.
      </p>

      <div className="grid gap-2 min-[480px]:grid-cols-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[14px] border border-amber-200 bg-amber-50 px-3.5 py-3 max-lg:rounded-app-card max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:p-3">
          <span className="text-xs font-semibold text-amber-800">Calls</span>
          {discount && p.was && <span className="text-[13px] text-stone-400 line-through tabular-nums">{rupee(p.was)}</span>}
          <b className="text-[22px] text-amber-800 tabular-nums">{p.price > 0 ? `${rupee(p.price)}/min` : "Not set yet"}</b>
          {discount && (
            <span className="inline-flex h-[20px] items-center rounded-full bg-amber-100 px-2 text-[10.5px] font-extrabold text-amber-800">{discount}</span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[14px] border border-sky-200 bg-sky-50 px-3.5 py-3 max-lg:rounded-app-card max-lg:p-3">
          <span className="text-xs font-semibold text-sky-800">Chat</span>
          <b className="text-[22px] text-sky-800 tabular-nums">{p.chat.price > 0 ? `${rupee(p.chat.price)}/min` : "Not set yet"}</b>
          {p.price > 0 && !p.chat.separate && <span className="text-[11.5px] text-sky-700">same as calls</span>}
        </div>
      </div>

      {p.price > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
          {rows.map(([label, rate]) => (
            <div key={label} className="rounded-xl border border-line bg-white px-3 py-2 max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-app-surface">
              <dt className="text-[11px] font-semibold text-stone-500 max-lg:text-[12px] max-lg:font-normal max-lg:text-app-ink-3">{label}</dt>
              <dd className="m-0 text-[14.5px] font-bold text-ink tabular-nums">{rupee(rate)}</dd>
            </div>
          ))}
        </dl>
      )}

      {!p.editable ? (
        <p className="mt-3 mb-0 text-[12.5px] leading-[1.5] text-stone-500">
          AstroRize sets your first price during onboarding. You can change it yourself once your profile is live.
        </p>
      ) : (
        <>
          <PriceEditor channel="call" pricing={p} current={p} />
          <PriceEditor channel="chat" pricing={p} current={p.chat} />
        </>
      )}
    </Panel>
  );
}

/** The change form, request status and decision for one price (call or chat). */
function PriceEditor({ channel, pricing: p, current: c }: { channel: Channel; pricing: Pricing; current: ChannelPricing }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const canChange = !c.nextChangeOn && !c.pending;
  const raising = confirm !== null && confirm > c.price;
  const name = channel === "chat" ? "chat price" : "call price";
  const id = `new-${channel}-price`;

  // What customers would pay at a new call price (video adds the same premium as now; Instant Call keeps your multiplier).
  const videoPremium = p.rates.video - p.price;
  const multiplier = useAccount().astrologer.instantMultiplier;

  function review() {
    const price = Number(value.trim());
    if (!value.trim() || !Number.isInteger(price)) return setProblem(`Enter your new ${name} in whole rupees.`);
    if (price === c.price) return setProblem(`${rupee(price)}/min is already your ${name}.`);
    if (price < c.allowed.min || price > c.allowed.max) {
      return setProblem(
        price > c.price && price - c.price > p.maxIncrease
          ? `You can raise your ${name} by at most ${rupee(p.maxIncrease)} at a time — up to ${rupee(c.allowed.max)}/min.`
          : `Choose a price from ${rupee(c.allowed.min)} to ${rupee(c.allowed.max)} per minute.`,
      );
    }
    setProblem(null);
    setConfirm(price);
  }

  async function save() {
    if (confirm === null || busy) return;
    setBusy(true);
    try {
      const res = await api.patch<{ applied: boolean; pricing: Pricing }>("/portal/price", { price: confirm, channel });
      toast(
        res.applied
          ? `Your ${name} is now ${rupee(confirm)}/min for new consultations. Sessions already running keep their rate.`
          : `Sent for approval. Customers keep paying ${rupee(c.price)}/min until the AstroRize team approves ${rupee(confirm)}/min.`,
      );
      setConfirm(null);
      setValue("");
      router.refresh();
    } catch (e) {
      setConfirm(null);
      showError(e);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      await api.post<{ pricing: Pricing }>("/portal/price/withdraw", { channel });
      toast(`Request withdrawn. Your ${name} stays as it is.`);
    } catch (e) {
      showError(e);
    } finally {
      setWithdrawing(false);
      router.refresh();
    }
  }

  return (
    <section aria-label={channel === "chat" ? "Chat price" : "Call price"} className="mt-4 border-t border-line pt-3.5">
      <h3 className="m-0 text-[13.5px] font-bold text-ink">{channel === "chat" ? "Chat price" : "Call price (voice)"}</h3>

      {c.pending && (
        <div role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="m-0 text-[13.5px] font-bold text-ink tabular-nums">
            {rupee(c.pending.from)} → {rupee(c.pending.to)}/min waiting for approval
          </p>
          <p className="mt-0.5 mb-0 text-[12.5px] leading-[1.5] text-amber-900">
            Requested {c.pending.requestedOn}. Customers keep paying {rupee(c.price)}/min until the AstroRize team approves it.
          </p>
          <button
            type="button"
            onClick={withdraw}
            disabled={withdrawing}
            className="mt-2.5 h-10 rounded-xl border border-amber-300 bg-white px-4 text-[13px] font-bold text-amber-900 disabled:opacity-60 max-lg:min-h-app-hit max-lg:w-full max-lg:rounded-app-btn max-lg:text-[15px]"
          >
            {withdrawing ? "Withdrawing…" : "Withdraw request"}
          </button>
        </div>
      )}

      {!c.pending && c.lastDecision?.status === "REJECTED" && (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12.5px] leading-[1.5] text-rose-900">
          <b className="block text-[13px] text-rose-900">
            Your increase to {rupee(c.lastDecision.to)}/min wasn&apos;t approved{c.lastDecision.decidedOn ? ` (${c.lastDecision.decidedOn})` : ""}.
          </b>
          {c.lastDecision.reason && <span className="block break-words">Reason: “{c.lastDecision.reason}”</span>}
          <span className="block">
            Your {name} stays {rupee(c.price)}/min. You can ask again.
          </span>
        </div>
      )}
      {!c.pending && c.lastDecision?.status === "APPROVED" && (
        <p className="mt-2 mb-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-emerald-900">
          Your increase to {rupee(c.lastDecision.to)}/min was approved{c.lastDecision.decidedOn ? ` on ${c.lastDecision.decidedOn}` : ""}.
        </p>
      )}

      {c.pending ? null : c.nextChangeOn ? (
        <p className="mt-2 mb-0 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] leading-[1.5] text-stone-600">
          You changed your {name} on {c.changedAt}. You can change it again from <b className="text-ink">{c.nextChangeOn}</b> (one change every{" "}
          {p.cooldownDays} days).
        </p>
      ) : (
        <form
          noValidate
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <label htmlFor={id} className={`mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
            New {name} (₹/min)
          </label>
          <div className="flex gap-2 max-lg:flex-col">
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={c.allowed.min}
              max={c.allowed.max}
              step={1}
              value={value}
              placeholder={`${c.allowed.min}–${c.allowed.max}`}
              onChange={(e) => {
                setValue(e.target.value);
                setProblem(null);
              }}
              aria-describedby={`${id}-rules`}
              aria-invalid={!!problem}
              className={`h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-[14px] text-ink tabular-nums outline-none focus:border-amber-500 ${M_INPUT} max-lg:flex-none`}
            />
            <button type="submit" disabled={!canChange} className={`h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-60 ${M_PRIMARY}`}>
              Review change
            </button>
          </div>
          {problem && (
            <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
              {problem}
            </p>
          )}
          <p id={`${id}-rules`} className="mt-2 mb-0 text-[11.5px] leading-[1.5] text-stone-500">
            You can set {rupee(c.allowed.min)}–{rupee(c.allowed.max)} now: raise it by up to {rupee(p.maxIncrease)} at a time (the AstroRize team
            approves it first), or lower it as much as you like (applies at once). One change every {p.cooldownDays} days.{" "}
            {channel === "chat"
              ? "Chat customers pay this price."
              : `Voice customers pay this price; video is it + ${rupee(videoPremium)}, and Instant Call follows your multiplier.`}
          </p>
        </form>
      )}

      {/* Portalled to <body>: a hovered .az-panel is transformed, which would trap a fixed overlay inside it. */}
      {confirm !== null &&
        createPortal(
        <Modal onClose={() => !busy && setConfirm(null)} labelledBy={`${id}-title`}>
          <h2 id={`${id}-title`} className="m-0 text-[18px] font-bold">
            {raising ? `Ask to raise your ${name} to ${rupee(confirm)}/min?` : `Lower your ${name} to ${rupee(confirm)}/min?`}
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
            {raising ? `The AstroRize team checks increases before customers see them. Until it's approved, customers keep paying ${rupee(c.price)}/min. Once approved they pay ` : "From now on customers pay "}
            {channel === "chat" ? (
              <>
                <b className="text-ink">{rupee(confirm)}</b> per minute for chat.
              </>
            ) : (
              <>
                <b className="text-ink">{rupee(confirm)}</b> for voice, <b className="text-ink">{rupee(confirm + videoPremium)}</b> for video and{" "}
                <b className="text-ink">{rupee(Math.round(confirm * multiplier))}</b> for Instant Call, per minute
                {p.chat.separate ? "." : `, and ${rupee(confirm)} for chat (chat follows your call price until you set a chat price).`}
              </>
            )}
            {raising ? "" : " Sessions already running keep their rate."}
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.5] text-amber-800">
            {raising
              ? `Once it's approved you can't change it again for ${p.cooldownDays} days. You can withdraw the request while it waits.`
              : `You can't change it again for ${p.cooldownDays} days.`}
          </p>
          <div className="mt-5 flex gap-2.5">
            <button type="button" onClick={() => setConfirm(null)} disabled={busy} className={`h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold ${M_SECONDARY}`}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className={`h-11 flex-1 rounded-xl bg-amber-500 text-sm font-bold text-ink disabled:opacity-60 ${M_PRIMARY}`}>
              {busy ? "Saving…" : raising ? "Send for approval" : "Confirm price"}
            </button>
          </div>
        </Modal>,
          document.body,
        )}
    </section>
  );
}
