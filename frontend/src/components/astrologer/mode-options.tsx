"use client";

import type { Astrologer } from "@/lib/types";
import { useAppUI } from "../app-provider";
import { blockedHint, useConsultGate } from "../consult/consult-gate";
import type { OfferedChoice } from "../consult/consult-sheet";
import { useBelowDesktop } from "../directory/use-current-astrologers";
import { useFreshAstrologer } from "./use-fresh-astrologer";
import ModeIcon from "@/components/ui/mode-icon";

const MODES: { key: OfferedChoice; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "voice", label: "Voice" },
  { key: "video", label: "Video" },
  { key: "instant", label: "Instant" },
];

/**
 * Chat / Voice / Video / Instant on an astrologer card. Each one starts that kind of consultation
 * straight away (sign-in first if needed, then the price and balance check before anything is
 * billed); Instant opens the Instant Call rate confirmation. Disabled, with the reason, when the
 * astrologer can't take it right now.
 */
export default function ModeOptions({ astrologer: initial }: { astrologer: Astrologer }) {
  const { startConsult, openInstantCall } = useAppUI();
  // Kept current while the page is open, so the options follow the astrologer's availability.
  // (Only on desktop, where this card shows; phones and tablets render the app's card instead.)
  const below = useBelowDesktop();
  const a = useFreshAstrologer(initial, !below);
  const gate = useConsultGate(a);
  const blocked = gate.kind !== "ok";
  const [state, fg] =
    a.availability === "on"
      ? ["Online", "#16a34a"]
      : a.availability === "busy"
        ? ["Busy", "#c81e4a"]
        : a.availability === "live"
          ? ["Live", "#c2410c"]
          : ["Offline", "#9a93a5"];

  function choose(key: OfferedChoice) {
    if (key === "instant") openInstantCall(a);
    else startConsult({ astrologer: a, mode: key });
  }

  return (
    <div className="mt-2.5 grid grid-cols-4 gap-1">
      {MODES.map((m) => {
        const instant = m.key === "instant";
        return (
          <button
            key={m.key}
            type="button"
            disabled={blocked}
            title={blocked ? blockedHint(gate) : undefined}
            onClick={() => choose(m.key)}
            aria-label={`${m.label} with ${a.name}${blocked ? ` — ${state.toLowerCase()}` : ""}`}
            className={`flex flex-col items-center gap-px rounded-xl py-1.5 transition-colors disabled:cursor-not-allowed ${
              blocked ? "opacity-60" : instant ? "hover:bg-blue-50" : "hover:bg-amber-50"
            }`}
          >
            <ModeIcon mode={m.key} size={18} className={blocked ? "text-stone-400" : instant ? "text-blue-600" : "text-amber-700"} />
            <b className={`text-[10px] font-bold ${instant && !blocked ? "text-blue-700" : "text-[#3f4f9a]"}`}>{m.label}</b>
            <span className="text-[10px] font-[650]" style={{ color: instant && !blocked ? "#2563eb" : fg }}>
              {instant && !blocked ? "Ready" : state}
            </span>
          </button>
        );
      })}
    </div>
  );
}
