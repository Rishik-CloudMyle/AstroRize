"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { discountLabel, rupee } from "@/lib/portal/format";
import type { Pricing } from "@/lib/portal/types";
import Modal from "../modal";
import { useAccount, useErrorToast, useToast } from "../portal-provider";
import { Panel } from "../ui";

/**
 * "Your price": the astrologer's own chat/voice price, what customers pay for each way of
 * consulting, and a change form within the rules from the API (largest increase, price range,
 * one change per cooldown). A decrease applies at once; an increase waits for the Astrorize
 * team (shown here with a Withdraw button, then the decision and any reason). A change applies
 * to new consultations only.
 */
export default function PriceCard({ pricing: p }: { pricing: Pricing }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const discount = discountLabel(p.price, p.was);
  const canChange = p.editable && !p.nextChangeOn && !p.pending;
  const raising = confirm !== null && confirm > p.price;

  // What customers would pay at a new price (video adds the same premium as now; Instant Call keeps your multiplier).
  const videoPremium = p.rates.video - p.price;
  const multiplier = useAccount().astrologer.instantMultiplier;
  const ratesAt = (price: number) => ({
    chat: price,
    voice: price,
    video: price + videoPremium,
    instant: Math.round(price * multiplier),
  });

  function review() {
    const price = Number(value.trim());
    if (!value.trim() || !Number.isInteger(price)) return setProblem("Enter your new price in whole rupees.");
    if (price === p.price) return setProblem(`${rupee(price)}/min is already your price.`);
    if (price < p.allowed.min || price > p.allowed.max) {
      return setProblem(
        price > p.price && price - p.price > p.maxIncrease
          ? `You can raise your price by at most ${rupee(p.maxIncrease)} at a time — up to ${rupee(p.allowed.max)}/min.`
          : `Choose a price from ${rupee(p.allowed.min)} to ${rupee(p.allowed.max)} per minute.`,
      );
    }
    setProblem(null);
    setConfirm(price);
  }

  async function save() {
    if (confirm === null || busy) return;
    setBusy(true);
    try {
      const res = await api.patch<{ applied: boolean; pricing: Pricing }>("/portal/price", { price: confirm });
      toast(
        res.applied
          ? `Your price is now ${rupee(confirm)}/min for new consultations. Sessions already running keep their rate.`
          : `Sent for approval. Customers keep paying ${rupee(p.price)}/min until the Astrorize team approves ${rupee(confirm)}/min.`,
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
      await api.post<{ pricing: Pricing }>("/portal/price/withdraw");
      toast("Request withdrawn. Your price stays as it is.");
    } catch (e) {
      showError(e);
    } finally {
      setWithdrawing(false);
      router.refresh();
    }
  }

  const rows: [string, number][] = [
    ["Chat", p.rates.chat],
    ["Voice", p.rates.voice],
    ["Video", p.rates.video],
    ["Instant Call", p.rates.instant],
  ];
  const next = confirm !== null ? ratesAt(confirm) : null;

  return (
    <>
    <Panel className="p-5">
      <h2 className="m-0 mb-1 text-base font-bold">Your price</h2>
      <p className="mb-3.5 text-[12.5px] leading-[1.5] text-stone-500">
        Per minute. Increases are checked by the Astrorize team before customers see them; decreases apply at once. Sessions already running keep
        their rate.
      </p>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[14px] border border-amber-200 bg-amber-50 px-3.5 py-3">
        <span className="text-xs font-semibold text-amber-800">Chat &amp; voice</span>
        {discount && p.was && <span className="text-[13px] text-stone-400 line-through tabular-nums">{rupee(p.was)}</span>}
        <b className="text-[22px] text-amber-800 tabular-nums">{p.price > 0 ? `${rupee(p.price)}/min` : "Not set yet"}</b>
        {discount && (
          <span className="inline-flex h-[20px] items-center rounded-full bg-amber-100 px-2 text-[10.5px] font-extrabold text-amber-800">{discount}</span>
        )}
      </div>

      {p.price > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
          {rows.map(([label, rate]) => (
            <div key={label} className="rounded-xl border border-line bg-white px-3 py-2">
              <dt className="text-[11px] font-semibold text-stone-500">{label}</dt>
              <dd className="m-0 text-[14.5px] font-bold text-ink tabular-nums">{rupee(rate)}</dd>
            </div>
          ))}
        </dl>
      )}

      {p.pending && (
        <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="m-0 text-[13.5px] font-bold text-ink tabular-nums">
            {rupee(p.pending.from)} → {rupee(p.pending.to)}/min waiting for approval
          </p>
          <p className="mt-0.5 mb-0 text-[12.5px] leading-[1.5] text-amber-900">
            Requested {p.pending.requestedOn}. Customers keep paying {rupee(p.price)}/min until the Astrorize team approves it.
          </p>
          <button
            type="button"
            onClick={withdraw}
            disabled={withdrawing}
            className="mt-2.5 h-10 rounded-xl border border-amber-300 bg-white px-4 text-[13px] font-bold text-amber-900 disabled:opacity-60"
          >
            {withdrawing ? "Withdrawing…" : "Withdraw request"}
          </button>
        </div>
      )}

      {!p.pending && p.lastDecision?.status === "REJECTED" && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12.5px] leading-[1.5] text-rose-900">
          <b className="block text-[13px] text-rose-900">
            Your increase to {rupee(p.lastDecision.to)}/min wasn&apos;t approved{p.lastDecision.decidedOn ? ` (${p.lastDecision.decidedOn})` : ""}.
          </b>
          {p.lastDecision.reason && <span className="block break-words">Reason: “{p.lastDecision.reason}”</span>}
          <span className="block">Your price stays {rupee(p.price)}/min. You can ask again.</span>
        </div>
      )}
      {!p.pending && p.lastDecision?.status === "APPROVED" && (
        <p className="mt-3 mb-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-emerald-900">
          Your increase to {rupee(p.lastDecision.to)}/min was approved{p.lastDecision.decidedOn ? ` on ${p.lastDecision.decidedOn}` : ""}.
        </p>
      )}

      {p.pending ? null : !p.editable ? (
        <p className="mt-3 mb-0 text-[12.5px] leading-[1.5] text-stone-500">
          Astrorize sets your first price during onboarding. You can change it yourself once your profile is live.
        </p>
      ) : p.nextChangeOn ? (
        <p className="mt-3 mb-0 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] leading-[1.5] text-stone-600">
          You changed your price on {p.changedAt}. You can change it again from <b className="text-ink">{p.nextChangeOn}</b> (one change every{" "}
          {p.cooldownDays} days).
        </p>
      ) : (
        <form
          noValidate
          className="mt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            review();
          }}
        >
          <label htmlFor="new-price" className="mb-1.5 block text-xs font-semibold text-stone-600">
            New chat &amp; voice price (₹/min)
          </label>
          <div className="flex gap-2">
            <input
              id="new-price"
              type="number"
              inputMode="numeric"
              min={p.allowed.min}
              max={p.allowed.max}
              step={1}
              value={value}
              placeholder={`${p.allowed.min}–${p.allowed.max}`}
              onChange={(e) => {
                setValue(e.target.value);
                setProblem(null);
              }}
              aria-describedby="price-rules"
              aria-invalid={!!problem}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-[14px] text-ink tabular-nums outline-none focus:border-amber-500"
            />
            <button type="submit" disabled={!canChange} className="h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-60">
              Review change
            </button>
          </div>
          {problem && (
            <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
              {problem}
            </p>
          )}
          <p id="price-rules" className="mt-2 mb-0 text-[11.5px] leading-[1.5] text-stone-500">
            You can set {rupee(p.allowed.min)}–{rupee(p.allowed.max)} now: raise it by up to {rupee(p.maxIncrease)} at a time (the Astrorize team
            approves it first), or lower it as much as you like (applies at once). One change every {p.cooldownDays} days. Video is your price +{" "}
            {rupee(videoPremium)}; Instant Call follows your multiplier.
          </p>
        </form>
      )}

    </Panel>

      {/* Outside the panel: a hovered .az-panel is transformed, which would trap a fixed overlay inside it. */}
      {confirm !== null && next && (
        <Modal onClose={() => !busy && setConfirm(null)} labelledBy="price-title">
          <h2 id="price-title" className="m-0 text-[18px] font-bold">
            {raising ? `Ask to raise your price to ${rupee(confirm)}/min?` : `Lower your price to ${rupee(confirm)}/min?`}
          </h2>
          {raising ? (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
              The Astrorize team checks increases before customers see them. Until it&apos;s approved, customers keep paying {rupee(p.price)}/min. Once
              approved they pay <b className="text-ink">{rupee(next.chat)}</b> for chat and voice, <b className="text-ink">{rupee(next.video)}</b> for video
              and <b className="text-ink">{rupee(next.instant)}</b> for Instant Call, per minute.
            </p>
          ) : (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
              From now on customers pay <b className="text-ink">{rupee(next.chat)}</b> for chat and voice, <b className="text-ink">{rupee(next.video)}</b>{" "}
              for video and <b className="text-ink">{rupee(next.instant)}</b> for Instant Call, per minute. Sessions already running keep their rate.
            </p>
          )}
          <p className="mt-2 text-[12.5px] leading-[1.5] text-amber-800">
            {raising
              ? `Once it's approved you can't change it again for ${p.cooldownDays} days. You can withdraw the request while it waits.`
              : `You can't change it again for ${p.cooldownDays} days.`}
          </p>
          <div className="mt-5 flex gap-2.5">
            <button type="button" onClick={() => setConfirm(null)} disabled={busy} className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="h-11 flex-1 rounded-xl bg-amber-500 text-sm font-bold text-ink disabled:opacity-60">
              {busy ? "Saving…" : raising ? "Send for approval" : "Confirm price"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
