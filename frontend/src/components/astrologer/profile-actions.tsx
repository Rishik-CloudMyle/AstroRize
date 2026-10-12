"use client";

import type { Astrologer } from "@/lib/types";
import { rupee } from "@/lib/format";
import { useAppUI } from "../app-provider";
import { ConsultBlockedNote, blockedHint, blockedLabel, useConsultGate } from "../consult/consult-gate";
import { ConsultFrozenNote, FROZEN_HINT } from "../consult/consult-lock";
import MessageButton from "../messages/message-button";
import { DiscountBadge, WasPrice, priceNote } from "./parts";
import { useFreshAstrologer } from "./use-fresh-astrologer";

/** Sticky price card with the consult buttons, and the share box, on the profile page. */
export default function ProfileActions({ astrologer: initial }: { astrologer: Astrologer }) {
  const { startConsult, openInstantCall, toast } = useAppUI();
  // Kept current while the page is open, so the buttons follow the astrologer's availability.
  const a = useFreshAstrologer(initial);
  // Buttons work only for a customer (or a visitor about to sign in) when the astrologer is
  // available and no other consultation is open (one at a time).
  const gate = useConsultGate(a);
  const blocked = gate.kind !== "ok";
  const frozen = gate.kind === "frozen";
  const disabledTitle = frozen ? FROZEN_HINT : blockedHint(gate);
  const shareText = `astrorize.com/astrologer/${a.slug}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/astrologer/${a.slug}`);
      toast("Profile link copied to your clipboard.");
    } catch {
      toast("Couldn't copy automatically — select the link and copy it.");
    }
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={blocked}
              title={disabledTitle}
              onClick={() => startConsult({ astrologer: a, mode: "chat" })}
              className="h-[42px] rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              💬 Chat
            </button>
            <button
              type="button"
              disabled={blocked}
              title={disabledTitle}
              onClick={() => startConsult({ astrologer: a, mode: "voice" })}
              className="h-[42px] rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              📞 Voice
            </button>
          </div>
          <button
            type="button"
            disabled={blocked}
            title={disabledTitle}
            onClick={() => openInstantCall(a)}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[13.5px] font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            ⚡ Instant Call · {a.availability === "on" ? `${rupee(a.instant)}/min` : a.availability === "off" ? "offline" : "unavailable"}
          </button>
          <MessageButton slug={a.slug} name={a.name} />
        </div>
        <div className="mt-3.5 border-t border-[#f3e9d8] pt-3 text-[11.5px] leading-normal text-stone-500">
          Eligibility needs 5 minutes of balance. Nothing is billed before the call connects — failed attempts cost ₹0.
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
