"use client";

import type { Astrologer } from "@/lib/types";
import { rateFor, rupee } from "@/lib/format";
import { minutesHeadline } from "@/lib/free-calls";
import { usableWelcome, useSession } from "@/lib/session-store";
import { discountedRate, useConsultDiscount } from "@/lib/offers";
import { useMakeGood } from "@/lib/makegood";
import { useAppUI } from "../app-provider";
import { ConsultBlockedNote, blockedHint, blockedLabel, useConsultGate, type ConsultGate } from "../consult/consult-gate";
import { ConsultFrozenNote, FROZEN_HINT } from "../consult/consult-lock";
import { FreeCallBadge } from "../consult/free-call";
import { multiplierLabel, type ConsultChoice } from "../consult/consult-sheet";
import MessageButton from "../messages/message-button";
import { DiscountBadge, WasPrice, priceNote } from "./parts";
import { useBelowDesktop } from "../directory/use-current-astrologers";
import { useFreshAstrologer } from "./use-fresh-astrologer";
import ModeIcon from "@/components/ui/mode-icon";

const OPTIONS: { key: ConsultChoice; title: string }[] = [
  { key: "chat", title: "Chat" },
  { key: "voice", title: "Voice Call" },
  { key: "video", title: "Video Call" },
  { key: "instant", title: "Instant Call" },
];

/** Why an option can't be used right now, shown under it ("In consultation · wait ~6–12 min"). */
function unavailableLine(gate: ConsultGate, a: Astrologer): string | null {
  // The astrologer's own state comes first: while they're in a consultation (an Instant Call
  // included) every option reads "In consultation" — for every customer, the one in it too.
  if (a.availability === "busy") return `In consultation${a.eta ? ` · wait ${a.eta}` : ""}`;
  if (a.availability === "live") return "Live now — private consults open after";
  if (a.availability === "off") return "Offline right now";
  if (gate.kind === "frozen") return "Paused while your consultation is open";
  if (gate.kind === "staff") return "For customer accounts";
  return null;
}

/** Sticky price card with the consult options, and the share box, on the profile page. */
export default function ProfileActions({ astrologer: initial }: { astrologer: Astrologer }) {
  const { startConsult, openInstantCall, toast } = useAppUI();
  const session = useSession();
  // Kept current while the page is open, so the buttons follow the astrologer's availability.
  // (Only on desktop, where this card shows; phones and tablets render the app's profile instead.)
  const below = useBelowDesktop();
  const a = useFreshAstrologer(initial, !below);
  // Buttons work only for a customer (or a visitor about to sign in) when the astrologer is
  // available and no other consultation is open (one at a time).
  const gate = useConsultGate(a);
  const blocked = gate.kind !== "ok";
  const frozen = gate.kind === "frozen";
  const disabledTitle = frozen ? FROZEN_HINT : blockedHint(gate);
  const shareText = `astrorize.com/astrologer/${a.slug}`;
  const welcome = usableWelcome(session);
  // A free replacement call with this astrologer (offered after a complaint): Chat, Voice or Video,
  // free for its minutes. It takes the place of the welcome free call and any offer here.
  const makeGood = useMakeGood(a.id);
  // A free option with this astrologer: a replacement call, or the weekly free minutes (Chat or Voice).
  // The customer chooses free or paid (and a length) in the consult sheet — nothing is applied here.
  const freeOption = !!makeGood || (!!welcome && a.freeCall);
  const unavailable = unavailableLine(gate, a);
  // A claimed consultation offer: percent off paid Chat, Voice and Video.
  const offer = useConsultDiscount();
  const discount = makeGood ? null : offer;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/astrologer/${a.slug}`);
      toast("Profile link copied to your clipboard.");
    } catch {
      toast("Couldn't copy automatically — select the link and copy it.");
    }
  }

  function choose(key: ConsultChoice) {
    if (key === "instant") openInstantCall(a);
    else startConsult({ astrologer: a, mode: key });
  }

  return (
    <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
      <div className="az-glass az-lift relative rounded-3xl p-5">
        <div className="flex items-baseline gap-2">
          <WasPrice astrologer={a} className="text-sm" />
          <span className="text-[30px] font-bold tracking-[-.02em] tabular-nums text-plum">{rupee(a.price)}</span>
          <span className="text-xs font-semibold text-mauve">/min</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DiscountBadge astrologer={a} className="h-[22px] px-[9px] text-[10.5px]" />
          <FreeCallBadge astrologer={a} />
          <span className="text-[11.5px] text-mauve">{priceNote(a)}</span>
        </div>
        {makeGood && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-[1.5] text-emerald-900">
            <b className="block text-[13.5px] text-emerald-800">🎁 Free replacement call · {makeGood.minutes} min</b>
            We&apos;re sorry about session {makeGood.sessionRef}. Talk to {a.name} again free by Chat, Voice or Video — use it by{" "}
            {makeGood.validUntil}, when they&apos;re available.
          </div>
        )}
        {!makeGood && welcome && a.freeCall && (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] leading-[1.45] text-emerald-900">
            <b className="text-emerald-800">🎁 {minutesHeadline(welcome)}.</b> Use them here for Chat or Voice, or pay per minute — you choose
            when you start.
          </p>
        )}
        {discount && (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800">
            {discount.pct}% off applied · {rupee(discountedRate(a.price, discount.pct))}/min instead of {rupee(a.price)} — your offer “
            {discount.name}”
          </p>
        )}
        {gate.kind === "frozen" ? (
          <div className="mt-4">
            <ConsultFrozenNote open={gate.open} astrologerId={a.id} />
          </div>
        ) : (
          blocked && (
            <div className="mt-4">
              <ConsultBlockedNote gate={gate} astrologer={a} />
            </div>
          )
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={blocked}
            title={disabledTitle}
            onClick={() => startConsult({ astrologer: a })}
            className={`h-12 rounded-full text-[15px] font-bold ${blocked ? "cursor-not-allowed bg-stone-200 text-stone-500" : "az-cta shadow-[0_6px_16px_rgba(255,140,26,.28)]"}`}
          >
            {frozen ? "🔒 Consultation in progress" : (blockedLabel(gate) ?? "Consult now")}
          </button>

          <ul aria-label="Ways to consult" className="flex flex-col gap-1.5">
            {OPTIONS.map((o) => {
              const instant = o.key === "instant";
              const rate = o.key === "instant" ? a.instant : rateFor(a.price, o.key);
              // Could be free (the customer picks free or paid in the sheet); the paid rate is shown either way.
              const free = freeOption && !blocked && (o.key === "chat" || o.key === "voice" || (!!makeGood && o.key === "video"));
              const pct = discount && !instant ? discount.pct : 0;
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    disabled={blocked}
                    title={disabledTitle}
                    onClick={() => choose(o.key)}
                    className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left disabled:cursor-not-allowed ${
                      blocked
                        ? "border-line bg-white/60"
                        : instant
                          ? "border-blue-200 bg-blue-50 hover:border-blue-400"
                          : "border-line bg-white hover:border-amber-300"
                    }`}
                  >
                    <ModeIcon mode={o.key} size={20} className={blocked ? "text-stone-400" : instant ? "text-blue-600" : "text-amber-700"} />
                    <span className="min-w-0 flex-1">
                      <b className={`block text-[13.5px] font-bold ${blocked ? "text-stone-500" : instant ? "text-blue-800" : "text-ink"}`}>{o.title}</b>
                      <span className={`block text-[11.5px] leading-snug ${unavailable ? "font-semibold text-rose-700" : "text-stone-500"}`}>
                        {unavailable ??
                          (instant
                            ? multiplierLabel(a)
                            : free
                              ? makeGood
                                ? `Paid, or your ${makeGood.minutes}-min free replacement call`
                                : "Paid, or with your free minutes"
                              : pct
                                ? `${pct}% off · instead of ${rupee(rate)}/min`
                                : "Billed per minute")}
                      </span>
                    </span>
                    <b
                      className={`shrink-0 text-[13.5px] tabular-nums ${blocked ? "text-stone-400" : pct ? "text-emerald-700" : instant ? "text-blue-700" : "text-plum"}`}
                    >
                      {`${rupee(pct ? discountedRate(rate, pct) : rate)}/min`}
                    </b>
                  </button>
                </li>
              );
            })}
          </ul>
          <MessageButton slug={a.slug} name={a.name} />
        </div>
        <div className="mt-3.5 border-t border-[#f3e9d8] pt-3 text-[11.5px] leading-normal text-stone-500">
          Eligibility needs 5 minutes of balance{freeOption ? ` (not for ${makeGood ? "your free replacement call" : "a call on your free minutes"})` : ""}. Nothing is billed until you are both
          connected — failed attempts cost ₹0.
        </div>
      </div>

      <div className="rounded-[20px] border border-line bg-paper p-[18px]">
        <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">Share this profile</div>
        <div className="mt-2.5 flex gap-2">
          <div className="min-w-0 flex-1 truncate rounded-[10px] bg-cream px-[11px] py-[9px] text-xs text-stone-600">
            {shareText}
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="h-9 rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold"
          >
            Copy
          </button>
        </div>
      </div>
    </aside>
  );
}
