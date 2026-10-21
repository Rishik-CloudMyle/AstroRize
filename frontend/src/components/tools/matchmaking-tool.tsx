"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { matchCharts, ordinal, type Match, type MatchPersonResult, type Place } from "@/lib/astro";
import type { Tool } from "@/lib/types";
import BirthPlaceInput from "./birth-place-input";
import { RashiGlyph } from "./tool-icons";
import {
  EngineLine,
  ErrorNote,
  Field,
  GoldHairline,
  LoadingCard,
  PanelHeading,
  ResultCard,
  SectionTitle,
  SubmitButton,
  inputClass,
  panelClass,
  panelPad,
} from "./tool-ui";

// Matchmaking: Ashtakoota guna milan from both Moons, calculated by the API (POST /astro/matchmaking).
// Public; the API also saves the match for a signed-in customer.

interface PersonForm {
  name: string;
  date: string;
  time: string;
}

const EMPTY: PersonForm = { name: "", date: "", time: "" };

const VERDICT: Record<Match["verdict"], { label: string; tone: string }> = {
  excellent: { label: "Excellent match", tone: "text-emerald-800" },
  good: { label: "Good match — acceptable by tradition", tone: "text-ink" },
  "below-threshold": { label: "Below the traditional 18-point threshold", tone: "text-rose-800" },
};

export default function MatchmakingTool({ tool }: { tool: Tool }) {
  const [boy, setBoy] = useState<PersonForm>(EMPTY);
  const [girl, setGirl] = useState<PersonForm>(EMPTY);
  const [boyPlace, setBoyPlace] = useState<Place | null>(null);
  const [girlPlace, setGirlPlace] = useState<Place | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ match: Match; engine: string } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function validate(): string | null {
    for (const [who, p, place] of [
      ["the boy", boy, boyPlace],
      ["the girl", girl, girlPlace],
    ] as const) {
      if (!p.name.trim()) return `Enter ${who}'s name.`;
      if (!p.date) return `Enter ${who}'s date of birth.`;
      if (p.date < "1800-01-01" || p.date > "2200-12-31") return "Dates from 1800 to 2200 are supported.";
      if (!place) return `Choose ${who}'s place of birth from the list (press Search to find it).`;
    }
    return null;
  }

  async function submit() {
    setAttempted(true);
    const problem = validate();
    setError(problem);
    if (problem || !boyPlace || !girlPlace) return;
    setBusy(true);
    try {
      const person = (p: PersonForm, place: Place) => ({
        name: p.name.trim(),
        date: p.date,
        ...(p.time ? { time: p.time } : {}),
        place: { placeId: place.id },
      });
      const res = await matchCharts(person(boy, boyPlace), person(girl, girlPlace));
      setResult({ match: res.match, engine: res.engine });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't match the charts right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
        className={`mt-6 ${panelClass} ${panelPad}`}
      >
        <GoldHairline />
        <PanelHeading
          toolId="matchmaking"
          title="Enter both birth details"
          intro="Guna milan compares the two Moons. The birth time is optional, but it helps: the Moon moves about 13° a day, so without a time we use midday and tell you if the Moon changed its sign or nakshatra that day. The time also lets us check Mangal dosha from the lagna, not just from the Moon."
        />
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <PersonFields
            title="Boy"
            value={boy}
            onChange={setBoy}
            place={boyPlace}
            onPlace={setBoyPlace}
            invalidPlace={attempted && !boyPlace}
          />
          <PersonFields
            title="Girl"
            value={girl}
            onChange={setGirl}
            place={girlPlace}
            onPlace={setGirlPlace}
            invalidPlace={attempted && !girlPlace}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <SubmitButton busy={busy} label="Match the charts" busyLabel="Matching the charts…" />
      </form>

      <div ref={resultRef} className="scroll-mt-20">
        {busy && !result && <LoadingCard label="Comparing the two charts…" />}
        {result && <MatchResult tool={tool} match={result.match} engine={result.engine} />}
      </div>
    </>
  );
}

function PersonFields({
  title,
  value,
  onChange,
  place,
  onPlace,
  invalidPlace,
}: {
  title: string;
  value: PersonForm;
  onChange: (v: PersonForm) => void;
  place: Place | null;
  onPlace: (p: Place | null) => void;
  invalidPlace: boolean;
}) {
  const set = (k: keyof PersonForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 rounded-2xl border border-line-warm bg-[#fbf6ea] p-4 pt-3 sm:p-5 sm:pt-4">
      <legend className="rounded-full border border-[#ecd49a] bg-paper px-3 py-0.5 text-[11.5px] font-bold uppercase tracking-[.1em] text-amber-900">
        {title}
      </legend>
      <Field label="Name">
        <input value={value.name} onChange={set("name")} maxLength={80} className={inputClass} />
      </Field>
      <div className="grid gap-3.5 min-[400px]:grid-cols-2">
        <Field label="Date of birth">
          <input type="date" min="1800-01-01" max="2200-12-31" value={value.date} onChange={set("date")} className={inputClass} />
        </Field>
        <Field label="Time of birth (optional)">
          <input type="time" value={value.time} onChange={set("time")} className={inputClass} />
        </Field>
      </div>
      <BirthPlaceInput label="Place of birth" value={place} onChange={onPlace} invalid={invalidPlace} />
    </fieldset>
  );
}

function MatchResult({ tool, match, engine }: { tool: Tool; match: Match; engine: string }) {
  const verdict = VERDICT[match.verdict];
  return (
    <ResultCard tool={tool} title={`${match.boy.name} & ${match.girl.name}`}>
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
        <ScoreRing total={match.total} max={match.max} verdict={match.verdict} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[.1em] text-amber-900">Guna milan score</div>
          <b className={`mt-1 block font-display text-[26px] font-semibold leading-tight ${verdict.tone}`}>{verdict.label}</b>
          <p className="mx-auto mt-2 max-w-[56ch] text-[14px] leading-normal text-stone-600 sm:mx-0">
            Ashtakoota guna milan adds up eight kootas from the two Moons. 18 or more is traditionally considered
            acceptable, 28 or more excellent.
          </p>
          <ScoreScale total={match.total} max={match.max} />
        </div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <MoonCard person={match.boy} who="Boy" />
        <MoonCard person={match.girl} who="Girl" />
      </div>

      <SectionTitle className="mt-8">The eight kootas</SectionTitle>
      <ul className="grid gap-2.5 md:grid-cols-2">
        {match.kootas.map((k) => {
          const zero = k.points === 0;
          const full = k.points === k.max;
          return (
            <li key={k.key} className="min-w-0 rounded-2xl border border-line-warm bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-[14.5px] text-ink">{k.name}</b>
                  <span className="block text-[12.5px] text-stone-500">{k.about}</span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums ${
                    zero ? "bg-rose-50 text-rose-700" : full ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {k.points} / {k.max}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f1e7d3]">
                <div className="h-full rounded-full bg-linear-to-r from-[#f5c542] to-[#d98a12]" style={{ width: `${(k.points / k.max) * 100}%` }} />
              </div>
              <div className="mt-2 grid gap-0.5 text-[12.5px] leading-snug text-stone-600">
                <span className="break-words">
                  <b className="font-semibold text-stone-700">{match.boy.name}:</b> {k.boy}
                </span>
                <span className="break-words">
                  <b className="font-semibold text-stone-700">{match.girl.name}:</b> {k.girl}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {match.notes.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <h3 className="text-[14.5px] font-bold text-ink">Notes</h3>
          <ul className="mt-2 grid gap-1.5 text-[13.5px] leading-snug text-stone-700">
            {match.notes.map((n) => (
              <li key={n} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[6px] size-[6px] shrink-0 rotate-45 bg-[#d6a84a]" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <EngineLine engine={engine} extra="sidereal (Lahiri)" />
    </ResultCard>
  );
}

const RING_TONE: Record<Match["verdict"], [string, string]> = {
  excellent: ["#34d399", "#047857"],
  good: ["#fcd34d", "#d97706"],
  "below-threshold": ["#fdba74", "#c2410c"],
};

/** The score as a gold ring gauge out of the maximum (36). */
function ScoreRing({ total, max, verdict }: { total: number; max: number; verdict: Match["verdict"] }) {
  const r = 52;
  const len = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, total / max));
  const [from, to] = RING_TONE[verdict];
  return (
    <div className="relative size-[148px] shrink-0" data-score={total}>
      <svg viewBox="0 0 140 140" className="size-full -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="mm-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r="64" fill="#fffaf0" stroke="#e8cf91" strokeWidth="1" />
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f1e4c4" strokeWidth="11" />
        {frac > 0 && (
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="url(#mm-ring)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${len * frac} ${len}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[40px] font-bold leading-none tabular-nums text-ink">{total}</div>
          <div className="mt-1 text-[12px] font-semibold text-stone-600">out of {max}</div>
        </div>
      </div>
    </div>
  );
}

/** A slim 0–36 scale showing the 18 and 28 marks. */
function ScoreScale({ total, max }: { total: number; max: number }) {
  const pct = (n: number) => `${(Math.max(0, Math.min(max, n)) / max) * 100}%`;
  return (
    <div className="mx-auto mt-4 max-w-[420px] sm:mx-0" aria-hidden="true">
      <div className="relative h-2 rounded-full bg-linear-to-r from-orange-200 via-amber-200 to-emerald-200">
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink shadow"
          style={{ left: pct(total) }}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] font-semibold text-stone-500">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(18) }}>
          18
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(28) }}>
          28
        </span>
        <span className="absolute right-0">{max}</span>
      </div>
    </div>
  );
}

function MoonCard({ person, who }: { person: MatchPersonResult; who: string }) {
  const m = person.mangal;
  return (
    <div className="min-w-0 rounded-2xl border border-[#ecd49a] bg-linear-to-b from-[#fffaf0] to-[#fbefd2] p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full border border-[#d6a84a] bg-white/70 text-amber-900">
          <RashiGlyph sign={person.moonSign.index} className="size-6" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[.1em] text-amber-900">{who}</div>
          <b className="block break-words text-[16px] leading-snug text-ink">{person.name}</b>
        </div>
      </div>
      <p className="mt-2.5 text-[13.5px] text-stone-700">
        Moon in <b className="text-ink">{person.moonSign.name}</b> ({person.moonSign.sanskrit}) · {person.nakshatra.name} pada{" "}
        {person.nakshatra.pada}
      </p>
      {person.uncertain && (
        <p className="mt-1.5 text-[12.5px] text-orange-800">The Moon changed sign or nakshatra that day — add the birth time for an exact result.</p>
      )}
      <div
        className={`mt-3 rounded-xl border px-3 py-2 text-[12.5px] leading-snug ${
          m.present ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        <b>{m.present ? "Mangal dosha present" : "No Mangal dosha"}</b>
        <span className="block">
          Mars in {m.marsSign.name}: {ordinal(m.fromMoon)} from the Moon
          {m.fromLagna !== null ? `, ${ordinal(m.fromLagna)} from the lagna` : " (lagna not checked without a birth time)"}.
        </span>
        {m.cancellations.length > 0 && <span className="mt-1 block">Reduced or cancelled because: {m.cancellations.join(" ")}</span>}
      </div>
    </div>
  );
}
