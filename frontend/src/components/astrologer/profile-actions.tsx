"use client";

import type { Astrologer } from "@/lib/types";
import { rateFor, rupee } from "@/lib/format";
import { usableWelcome, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import { ConsultBlockedNote, blockedHint, blockedLabel, useConsultGate, type ConsultGate } from "../consult/consult-gate";
import { ConsultFrozenNote, FROZEN_HINT } from "../consult/consult-lock";
import { FreeCallBadge } from "../consult/free-call";
import { multiplierLabel, type ConsultChoice } from "../consult/consult-sheet";
import MessageButton from "../messages/message-button";
import { DiscountBadge, WasPrice, priceNote } from "./parts";
import { useFreshAstrologer } from "./use-fresh-astrologer";

const OPTIONS: { key: ConsultChoice; icon: string; title: string }[] = [
  { key: "chat", icon: "💬", title: "Chat" },
  { key: "voice", icon: "📞", title: "Voice Call" },
  { key: "video", icon: "📹", title: "Video Call" },
  { key: "instant", icon: "⚡", title: "Instant Call" },
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
  const a = useFreshAstrologer(initial);
  // Buttons work only for a customer (or a visitor about to sign in) when the astrologer is
  // available and no other consultation is open (one at a time).
  const gate = useConsultGate(a);
  const blocked = gate.kind !== "ok";
  const frozen = gate.kind === "frozen";
  const disabledTitle = frozen ? FROZEN_HINT : blockedHint(gate);
  const shareText = `astrorize.com/astrologer/${a.slug}`;
  const welcome = usableWelcome(session);
  const freeMins = welcome && a.freeCall ? Math.round(welcome.freeSeconds / 60) : 0;
  const unavailable = unavailableLine(gate, a);

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
              const free = freeMins > 0 && !blocked && (o.key === "chat" || o.key === "voice");
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
                    <span aria-hidden="true" className={`text-base ${blocked ? "opacity-50 grayscale" : ""}`}>
                      {o.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className={`block text-[13.5px] font-bold ${blocked ? "text-stone-500" : instant ? "text-blue-800" : "text-ink"}`}>{o.title}</b>
                      <span className={`block text-[11.5px] leading-snug ${unavailable ? "font-semibold text-rose-700" : "text-stone-500"}`}>
                        {unavailable ?? (instant ? multiplierLabel(a) : free ? `Free ${freeMins} min, then ${rupee(rate)}/min` : "Billed per minute")}
                      </span>
                    </span>
                    <b className={`shrink-0 text-[13.5px] tabular-nums ${blocked ? "text-stone-400" : free ? "text-emerald-700" : instant ? "text-blue-700" : "text-plum"}`}>
                      {free ? "Free" : `${rupee(rate)}/min`}
                    </b>
                  </button>
                </li>
              );
            })}
          </ul>
          <MessageButton slug={a.slug} name={a.name} />
        </div>
        <div className="mt-3.5 border-t border-[#f3e9d8] pt-3 text-[11.5px] leading-normal text-stone-500">
          Eligibility needs 5 minutes of balance{freeMins > 0 ? " (not for your free call)" : ""}. Nothing is billed before the call
          connects — failed attempts cost ₹0.
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
