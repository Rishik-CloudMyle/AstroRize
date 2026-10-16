"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Tool } from "@/lib/types";
import { NUMBER_MEANINGS, TAROT_CARDS } from "@/lib/tools";
import { DailyTool, HoroscopeTool } from "./horoscope-tool";
import KundliTool from "./kundli-tool";
import MatchmakingTool from "./matchmaking-tool";
import PanchangTool from "./panchang-tool";
import { Field, FormCard, ResultCard, inputClass } from "./tool-ui";

// Picks the tool for /free-tools/[tool]. Kundli, horoscope, daily insight, matchmaking and
// panchang are calculated by Astrorize's astrology engine (the API); numerology and tarot are
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
      <FormCard title="Your name and birth date" submitLabel="Find my numbers" error={error} onSubmit={calculate}>
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
              <div key={n.label} className="rounded-2xl border border-line-warm bg-card p-5">
                <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">{n.label}</div>
                <div className="mt-1 font-display text-[56px] font-semibold leading-none text-amber-600">{n.value}</div>
                <p className="mt-2 text-[13.5px] leading-normal text-stone-600">{NUMBER_MEANINGS[n.value]}</p>
                <p className="mt-1 text-[11.5px] text-stone-500">Calculated {n.from}</p>
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
      <div className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
        <h2 className="font-display text-[26px] font-semibold text-ink">Hold your question in mind</h2>
        <p className="mt-1 max-w-[56ch] text-sm text-stone-600">
          Take a breath, think of one specific question, then draw. Three cards from the 22 of the Major Arcana, shuffled
          fresh each time: what led here, where you are, and what comes next.
        </p>
        <button type="button" onClick={pull} className="az-cta mt-5 h-12 rounded-full px-6 text-[15px] font-bold">
          {draw ? "Draw again" : "Draw three cards"}
        </button>
      </div>

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
                  className="az-rise rounded-2xl border border-line-warm bg-linear-180 from-[#fffaf0] to-[#f6edd6] p-5 text-center"
                  style={{ animationDelay: `${i * 0.12}s` }}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[.1em] text-amber-800">
                    {["Past", "Present", "What comes next"][i]}
                  </div>
                  <div className="mx-auto my-3 grid h-24 w-16 place-items-center rounded-lg border-2 border-gold bg-plum text-2xl text-amber-300">
                    ✦
                  </div>
                  <b className="font-display text-xl font-semibold text-ink">{card.name}</b>
                  <p className="mt-1.5 text-[13px] leading-normal text-stone-600">{card.meaning}</p>
                </div>
              );
            })}
          </div>
        </ResultCard>
      )}
    </>
  );
}
