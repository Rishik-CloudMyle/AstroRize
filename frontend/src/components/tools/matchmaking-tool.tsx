"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { matchCharts, ordinal, type Match, type MatchPersonResult, type Place } from "@/lib/astro";
import type { Tool } from "@/lib/types";
import BirthPlaceInput from "./birth-place-input";
import { EngineLine, ErrorNote, Field, LoadingCard, ResultCard, inputClass } from "./tool-ui";

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
        className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]"
      >
        <h2 className="font-display text-[26px] font-semibold text-ink">Enter both birth details</h2>
        <p className="mt-1 max-w-[64ch] text-sm text-stone-600">
          Guna milan compares the two Moons. The birth time is optional, but it helps: the Moon moves about 13° a day, so
          without a time we use midday and tell you if the Moon changed its sign or nakshatra that day. The time also lets
          us check Mangal dosha from the lagna, not just from the Moon.
        </p>
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
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="az-cta mt-5 h-12 w-full rounded-full px-6 text-[15px] font-bold disabled:cursor-wait disabled:opacity-70 sm:w-auto"
        >
          {busy ? "Matching the charts…" : "Match the charts"}
        </button>
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
    <fieldset className="m-0 grid min-w-0 gap-3.5 rounded-2xl border border-line-soft bg-white/60 p-4">
      <legend className="px-1 text-[13px] font-bold uppercase tracking-[.08em] text-stone-500">{title}</legend>
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
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-28 shrink-0 place-items-center rounded-full border-4 border-amber-300 bg-amber-50 text-center">
          <div>
            <div className="text-[34px] font-bold leading-none tabular-nums text-ink">{match.total}</div>
            <div className="text-xs font-semibold text-stone-500">of {match.max}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <b className={`text-lg ${verdict.tone}`}>{verdict.label}</b>
          <p className="mt-1 max-w-[56ch] text-[13.5px] text-stone-600">
            Ashtakoota guna milan adds up eight kootas from the two Moons. 18 or more is traditionally considered
            acceptable, 28 or more excellent.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MoonCard person={match.boy} who="Boy" />
        <MoonCard person={match.girl} who="Girl" />
      </div>

      <h3 className="mb-2 mt-6 text-[15px] font-bold text-ink">The eight kootas</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {match.kootas.map((k) => (
          <div key={k.key} className="min-w-0 rounded-xl bg-cream px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <b className="text-[13.5px] text-ink">{k.name}</b>
              <span className={`text-[13px] font-bold tabular-nums ${k.points === 0 ? "text-rose-700" : "text-ink"}`}>
                {k.points} / {k.max}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eee7db]">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${(k.points / k.max) * 100}%` }} />
            </div>
            <div className="mt-1 text-[11.5px] text-stone-500">{k.about}</div>
            <div className="mt-0.5 break-words text-[11.5px] text-stone-600">
              {match.boy.name}: {k.boy} · {match.girl.name}: {k.girl}
            </div>
          </div>
        ))}
      </div>

      {match.notes.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <h3 className="text-[14px] font-bold text-ink">Notes</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-stone-700">
            {match.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <EngineLine engine={engine} extra="sidereal (Lahiri)" />
    </ResultCard>
  );
}

function MoonCard({ person, who }: { person: MatchPersonResult; who: string }) {
  const m = person.mangal;
  return (
    <div className="min-w-0 rounded-2xl border border-line-warm bg-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">{who}</div>
      <b className="block break-words text-[16px] text-ink">{person.name}</b>
      <p className="mt-1 text-[13px] text-stone-600">
        Moon in <b className="text-ink">{person.moonSign.name}</b> ({person.moonSign.sanskrit}) · {person.nakshatra.name} pada{" "}
        {person.nakshatra.pada}
      </p>
      {person.uncertain && (
        <p className="mt-1 text-[12px] text-orange-800">The Moon changed sign or nakshatra that day — add the birth time for an exact result.</p>
      )}
      <div className={`mt-2.5 rounded-xl px-3 py-2 text-[12.5px] ${m.present ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-800"}`}>
        <b>{m.present ? "Mangal dosha present" : "No Mangal dosha"}</b>
        <span className="block">
          Mars in {m.marsSign.name}: {ordinal(m.fromMoon)} from the Moon
          {m.fromLagna !== null ? `, ${ordinal(m.fromLagna)} from the lagna` : " (lagna not checked without a birth time)"}.
        </span>
        {m.cancellations.length > 0 && (
          <span className="mt-1 block">
            Reduced or cancelled because: {m.cancellations.join(" ")}
          </span>
        )}
      </div>
    </div>
  );
}
