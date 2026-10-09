"use client";

import type { Astrologer } from "@/lib/types";
import { rupee } from "@/lib/format";
import { useOpenConsultation } from "@/lib/consultation-store";
import { useAppUI } from "../app-provider";
import { ConsultFrozenNote, FROZEN_HINT } from "../consult/consult-lock";
import { DiscountBadge, WasPrice, priceNote } from "./parts";

/** Sticky price card with the consult buttons, and the share box, on the profile page. */
export default function ProfileActions({ astrologer: a }: { astrologer: Astrologer }) {
  const { startConsult, openInstantCall, toast } = useAppUI();
  const offline = a.availability === "off";
  // One consultation at a time: while one is open, every way to start another is frozen.
  const open = useOpenConsultation();
  const frozen = !!open;
  const frozenTitle = frozen ? FROZEN_HINT : undefined;
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
        {open && (
          <div className="mt-4">
            <ConsultFrozenNote open={open} astrologerId={a.id} />
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={frozen}
            title={frozenTitle}
            onClick={() => startConsult({ astrologer: a })}
            className={`h-12 rounded-full text-[15px] font-bold ${frozen ? "cursor-not-allowed bg-stone-200 text-stone-500" : "az-cta shadow-[0_6px_16px_rgba(255,140,26,.28)]"}`}
          >
            {frozen ? "🔒 Consultation in progress" : "Consult now"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={frozen}
              title={frozenTitle}
              onClick={() => startConsult({ astrologer: a, mode: "chat" })}
              className="h-[42px] rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              💬 Chat
            </button>
            <button
              type="button"
              disabled={frozen}
              title={frozenTitle}
              onClick={() => startConsult({ astrologer: a, mode: "voice" })}
              className="h-[42px] rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              📞 Voice
            </button>
          </div>
          <button
            type="button"
            disabled={offline || frozen}
            title={frozenTitle}
            onClick={() => openInstantCall(a)}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[13.5px] font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            ⚡ Instant Call · {offline ? "offline" : `${rupee(a.instant)}/min`}
          </button>
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
