"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Tool } from "@/lib/types";
import { NUMBER_MEANINGS, TAROT_CARDS } from "@/lib/tools";
import { APP_CTA } from "../account/app-look";
import { DailyTool, HoroscopeTool } from "./horoscope-tool";
import KundliTool from "./kundli-tool";
import MatchmakingTool from "./matchmaking-tool";
import PanchangTool from "./panchang-tool";
import { Field, FormCard, Panel, ResultCard, inputClass } from "./tool-ui";

// Picks the tool for /free-tools/[tool]. Kundli, horoscope, daily insight, matchmaking and
// panchang are calculated by AstroRize's astrology engine (the API); numerology and tarot are
// worked out here in the browser.

export default function ToolRunner({ tool }: { tool: Tool }) {
  switch (tool.id) {
    case "kundli":
      return <KundliTool tool={tool} />;
    case "horoscope":
      return <HoroscopeTool tool={tool} />;
    case "daily":
      return <DailyTool tool={tool} />;
    case "matchmaking":
      return <MatchmakingTool tool={tool} />;
    case "panchang":
      return <PanchangTool tool={tool} />;
    case "numerology":
      return <NumerologyTool tool={tool} />;
    case "tarot":
      return <TarotTool tool={tool} />;
    default:
      return null;
  }
}

// ---------- Numerology ----------

const LETTER_VALUES = "abcdefghijklmnopqrstuvwxyz";

function reduceNumber(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return n;
}

function NumerologyTool({ tool }: { tool: Tool }) {
  const [form, setForm] = useState({ name: "", date: "" });
  const [result, setResult] = useState<{ name: string; lifePath: number; destiny: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate() {
    if (!form.name.trim()) return setError("Enter your full name at birth.");
    if (!/[a-z]/i.test(form.name)) return setError("The destiny number uses the letters A–Z — enter your name in English letters.");
    if (!form.date) return setError("Enter your date of birth.");
    setError(null);
    const digits = form.date.replace(/\D/g, "").split("").map(Number);
    const lifePath = reduceNumber(digits.reduce((a, b) => a + b, 0));
    const letters = form.name.toLowerCase().replace(/[^a-z]/g, "").split("");
    const destiny = reduceNumber(letters.reduce((sum, ch) => sum + ((LETTER_VALUES.indexOf(ch) % 9) + 1), 0));
    setResult({ name: form.name, lifePath, destiny });
  }

  return (
    <>
      <FormCard toolId="numerology" title="Your name and birth date" submitLabel="Find my numbers" error={error} onSubmit={calculate}>
        <Field label="Full name at birth">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            autoComplete="name"
          />
        </Field>
        <Field label="Date of birth">
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={inputClass}
          />
        </Field>
      </FormCard>

      {result && (
        <ResultCard tool={tool} title={`${result.name.split(" ")[0]}'s numbers`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Life path number", value: result.lifePath, from: "from your date of birth" },
              { label: "Destiny number", value: result.destiny, from: "from the letters of your name" },
            ].map((n) => (
              <div
                key={n.label}
                className="flex min-w-0 items-start gap-4 rounded-2xl border border-[#ecd49a] bg-linear-to-b from-[#fffaf0] to-[#fbefd2] p-5"
              >
                <span
                  className="grid size-[76px] shrink-0 place-items-center rounded-full border-2 border-[#d6a84a] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#f8e7bd_70%,#ecc979)] font-display text-[40px] font-bold leading-none text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_6px_14px_rgba(146,64,14,.18)] [font-variant-numeric:lining-nums_tabular-nums]"
                  aria-hidden="true"
                >
                  {n.value}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[.1em] text-amber-900">{n.label}</div>
                  <div className="sr-only">{n.value}</div>
                  <p className="mt-1.5 text-[14.5px] leading-normal text-stone-700">{NUMBER_MEANINGS[n.value]}</p>
                  <p className="mt-1.5 text-[12px] text-stone-500">Calculated {n.from}</p>
                </div>
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </>
  );
}

// ---------- Tarot ----------

/** A uniform random integer in [0, n), from the browser's cryptographic generator. */
function randomBelow(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** Three different cards, shuffled fresh each time (Fisher–Yates on the deck's indices). */
function drawThree(): number[] {
  const deck = TAROT_CARDS.map((_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 3);
}

/** "3-17-8" from a shared link → card indices, or null when it isn't a valid draw. */
function parseCards(raw: string | null): number[] | null {
  if (!raw) return null;
  const parts = raw.split("-");
  if (parts.length !== 3 || !parts.every((p) => /^\d{1,2}$/.test(p))) return null;
  const ids = parts.map(Number);
  if (ids.some((i) => i >= TAROT_CARDS.length) || new Set(ids).size !== 3) return null;
  return ids;
}

function TarotTool({ tool }: { tool: Tool }) {
  const params = useSearchParams();
  const [draw, setDraw] = useState<{ cards: number[]; shared: boolean } | null>(() => {
    const cards = parseCards(params.get("cards"));
    return cards ? { cards, shared: true } : null;
  });

  function pull() {
    const cards = drawThree();
    setDraw({ cards, shared: false });
    window.history.replaceState(null, "", `/free-tools/tarot?cards=${cards.join("-")}`);
  }

  return (
    <>
      <Panel
        toolId="tarot"
        title="Hold your question in mind"
        intro="Take a breath, think of one specific question, then draw. Three cards from the 22 of the Major Arcana, shuffled fresh each time: what led here, where you are, and what comes next."
      >
        <button type="button" onClick={pull} className={`az-cta mt-6 h-12 w-full rounded-full px-7 text-[15px] font-bold sm:w-auto ${APP_CTA}`}>
          {draw ? "Draw again" : "Draw three cards"}
        </button>
      </Panel>

      {draw && (
        <ResultCard
          key={draw.cards.join("-")}
          tool={tool}
          eyebrow={draw.shared ? "A shared draw" : "Your result"}
          title="Your three cards"
          sharePath={`/free-tools/tarot?cards=${draw.cards.join("-")}`}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {draw.cards.map((id, i) => {
              const card = TAROT_CARDS[id];
              return (
                <div
                  key={card.name}
                  className="az-rise flex min-w-0 items-center gap-4 rounded-2xl border border-[#ecd49a] bg-linear-180 from-[#fffaf0] to-[#f6e8c8] p-4 text-left sm:flex-col sm:gap-0 sm:p-5 sm:text-center"
                  style={{ animationDelay: `${i * 0.12}s` }}
                >
                  <CardFace number={id} />
                  <div className="min-w-0 sm:mt-4">
                    <div className="text-[11px] font-bold uppercase tracking-[.1em] text-amber-900">
                      {["Past", "Present", "What comes next"][i]}
                    </div>
                    <b className="mt-0.5 block font-display text-[22px] font-semibold leading-tight text-ink">{card.name}</b>
                    <p className="mt-1.5 text-[13.5px] leading-normal text-stone-700">{card.meaning}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </ResultCard>
      )}
    </>
  );
}

const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

/** A drawn card: deep plum face in a gold double frame, with its Major Arcana number. */
function CardFace({ number }: { number: number }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-[112px] w-[72px] shrink-0 rounded-[10px] border-2 border-[#d6a84a] bg-[radial-gradient(circle_at_50%_40%,#4a2d7a,#2a1848_75%)] p-1 shadow-[0_10px_22px_rgba(42,24,72,.28)] sm:h-[150px] sm:w-[96px]"
    >
      <div className="flex size-full flex-col items-center justify-between rounded-[6px] border border-[#d6a84a]/70 py-1.5 text-amber-300">
        <span className="font-display text-[13px] font-semibold leading-none [font-variant-numeric:lining-nums] sm:text-[15px]">{ROMAN[number]}</span>
        <svg viewBox="0 0 40 40" className="size-8 sm:size-11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <circle cx="20" cy="20" r="7" />
          <path d="M20 4v6M20 30v6M4 20h6M30 20h6M8.7 8.7l4.2 4.2M27.1 27.1l4.2 4.2M8.7 31.3l4.2-4.2M27.1 12.9l4.2-4.2" />
        </svg>
        <span className="text-[9px] leading-none tracking-[.3em]">✦✦✦</span>
      </div>
    </div>
  );
}
