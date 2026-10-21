"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  coords,
  getPanchang,
  longDate,
  stampTime,
  type Limb,
  type Panchang,
  type PanchangPlace,
  type Place,
  type Span,
  type Stamp,
} from "@/lib/astro";
import type { Tool } from "@/lib/types";
import BirthPlaceInput from "./birth-place-input";
import { RashiGlyph } from "./tool-icons";
import { EngineLine, FailedCard, Field, FormCard, LoadingCard, ResultCard, SectionTitle, Stat, inputClass } from "./tool-ui";

// Panchang for a date and place, from the API (GET /astro/panchang). Opens on today for New
// Delhi (or the date and place in the link); every time is local to the chosen place.

interface Query {
  date: string | null;
  placeId: string | null;
}

type Loaded =
  | { key: string; ok: true; place: PanchangPlace; panchang: Panchang }
  | { key: string; ok: false; error: string };

const keyOf = (q: Query) => `${q.date ?? ""}|${q.placeId ?? ""}`;
const validDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export default function PanchangTool({ tool }: { tool: Tool }) {
  const params = useSearchParams();
  const [query, setQuery] = useState<Query>(() => ({ date: validDate(params.get("date")), placeId: params.get("place") || null }));
  const [date, setDate] = useState(query.date ?? "");
  const [place, setPlace] = useState<Place | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${keyOf(query)}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    getPanchang(query.date, query.placeId)
      .then(({ place: p, panchang }) => {
        if (cancelled) return;
        setLoaded({ key, ok: true, place: p, panchang });
        // A place from the link: show it in the picker. (New Delhi, the default, has no id.)
        if (p.placeId) setPlace((cur) => cur ?? { id: p.placeId!, name: p.name, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone });
        setDate((d) => d || panchang.date);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({ key, ok: false, error: err instanceof ApiError ? err.message : "We couldn't load the Panchang right now. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [key, query.date, query.placeId]);

  function submit() {
    if (date && (date < "1800-01-01" || date > "2200-12-31")) {
      setFormError("Dates from 1800 to 2200 are supported.");
      return;
    }
    setFormError(null);
    const next: Query = { date: date || null, placeId: place?.id ?? null };
    setQuery(next);
    const qs = new URLSearchParams();
    if (next.date) qs.set("date", next.date);
    if (next.placeId) qs.set("place", next.placeId);
    window.history.replaceState(null, "", `/free-tools/panchang${qs.size ? `?${qs}` : ""}`);
  }

  const current = loaded?.key === key ? loaded : null;
  const share = current?.ok
    ? `/free-tools/panchang?date=${current.panchang.date}${current.place.placeId ? `&place=${current.place.placeId}` : ""}`
    : undefined;

  return (
    <>
      <FormCard
        toolId="panchang"
        title="Pick a date and place"
        intro="Timings change with the place: sunrise, Rahu Kaal and the rest are worked out for where you are."
        submitLabel="Show Panchang"
        busy={!current}
        busyLabel="Loading…"
        error={formError}
        onSubmit={submit}
      >
        <BirthPlaceInput label="Place" value={place} onChange={setPlace} hint="Leave empty for New Delhi. Type a town, then press Search." />
        <Field label="Date" hint="Leave empty for today at that place.">
          <input type="date" min="1800-01-01" max="2200-12-31" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
      </FormCard>

      {!current ? (
        <LoadingCard label="Working out the Panchang…" />
      ) : !current.ok ? (
        <FailedCard error={current.error} retry={() => setAttempt((a) => a + 1)} />
      ) : (
        <PanchangResult tool={tool} place={current.place} p={current.panchang} sharePath={share} />
      )}
    </>
  );
}

function PanchangResult({ tool, place, p, sharePath }: { tool: Tool; place: PanchangPlace; p: Panchang; sharePath?: string }) {
  const day = p.date;
  const at = (s: Stamp | null) => (s ? stampTime(s, day) : "Does not occur");
  const span = (s: Span | null) => (s ? `${stampTime(s.start, day)} – ${stampTime(s.end, day)}` : "—");
  const wednesday = p.vara.index === 3;

  return (
    <ResultCard tool={tool} eyebrow={`Panchang · ${place.name}`} title={longDate(p.date)} sharePath={sharePath}>
      {p.note && (
        <p className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-800">{p.note}</p>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat big tone="gold" icon={<Icon kind="sunrise" />} label="Sunrise" value={at(p.sunrise)} />
        <Stat big tone="gold" icon={<Icon kind="sunset" />} label="Sunset" value={at(p.sunset)} />
        <Stat tone="warn" label="Rahu Kaal" value={span(p.rahuKaal)} sub="Avoid starting new work" />
        <Stat
          tone={wednesday ? "plain" : "good"}
          label="Abhijit muhurta"
          value={span(p.abhijit)}
          sub={wednesday ? "Traditionally not observed on Wednesdays" : "Auspicious midday window"}
        />
      </div>

      <SectionTitle className="mt-8">The five limbs</SectionTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-3">
        <LimbCard label="Tithi" items={p.tithi.map((t) => ({ ...t, name: `${t.paksha} ${t.name}` }))} day={day} />
        <LimbCard label="Nakshatra" items={p.nakshatra} day={day} />
        <LimbCard label="Yoga" items={p.yoga} day={day} />
        <LimbCard label="Karana" items={p.karana} day={day} />
        <Stat label="Vara (weekday)" value={p.vara.name} sub={p.vara.sanskrit} />
        <Stat
          label="Lunar month"
          value={`${p.month.amanta}${p.month.adhika ? " (Adhika)" : ""} · ${p.paksha} paksha`}
          sub={p.month.purnimanta !== p.month.amanta ? `${p.month.purnimanta} in the purnimanta calendar` : "Amanta and purnimanta agree"}
        />
      </div>

      <SectionTitle className="mt-8">Sun and Moon</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat icon={<Icon kind="moon" />} label="Moonrise" value={at(p.moonrise)} />
        <Stat icon={<Icon kind="moon" />} label="Moonset" value={at(p.moonset)} />
        <Stat icon={<RashiGlyph sign={p.sunSign.index} className="size-3.5" strokeWidth={2} />} label="Sun sign" value={p.sunSign.name} sub={p.sunSign.sanskrit} />
        <Stat
          icon={<RashiGlyph sign={p.moonSign.index} className="size-3.5" strokeWidth={2} />}
          label="Moon sign"
          value={p.moonSign.name}
          sub={`${p.moonSign.sanskrit} · at sunrise`}
        />
      </div>

      <SectionTitle className="mt-8">Other periods to avoid</SectionTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 min-[480px]:grid-cols-2">
        <Stat tone="warn" label="Yamaganda" value={span(p.yamaganda)} sub="Inauspicious" />
        <Stat tone="warn" label="Gulika Kaal" value={span(p.gulika)} sub="Inauspicious" />
      </div>

      <p className="mt-5 text-[12.5px] leading-normal text-stone-500">
        All times are local to {place.name} ({p.timezone}, {p.utcOffset}) · {coords(p.latitude, p.longitude)}. Limbs are as
        they stand at sunrise, each with the time it ends. Sunrise and sunset use the upper edge of the Sun with standard
        refraction.
      </p>
      <EngineLine engine="astrorize-astro" extra="sidereal (Lahiri)" />
    </ResultCard>
  );
}

/** Small line icons for the Sun and Moon timings. */
function Icon({ kind }: { kind: "sunrise" | "sunset" | "moon" }) {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {kind === "moon" ? (
        <path d="M13 3.2a7 7 0 1 0 3.8 9.6A5.6 5.6 0 0 1 13 3.2Z" />
      ) : (
        <>
          <path d="M2.5 15h15M5.5 15a4.5 4.5 0 0 1 9 0M4 11l1.2.8M16 11l-1.2.8" />
          <path d={kind === "sunrise" ? "M10 9V3.5M7.8 5.5 10 3.3l2.2 2.2" : "M10 3.5V9M7.8 7 10 9.2 12.2 7"} />
        </>
      )}
    </svg>
  );
}

function LimbCard({ label, items, day }: { label: string; items: (Limb & { pada?: number })[]; day: string }) {
  const [first, ...rest] = items;
  if (!first) return <Stat label={label} value="—" />;
  const until = (l: Limb) => (l.end ? `until ${stampTime(l.end, day)}` : "all day");
  return (
    <Stat
      label={label}
      value={
        <>
          {first.name}
          {first.pada ? <span className="font-semibold text-stone-600"> · pada {first.pada}</span> : null}
        </>
      }
      sub={until(first)}
    >
      {rest.length > 0 && (
        <div className="mt-2 grid gap-0.5 border-t border-line-soft pt-2">
          {rest.map((l) => (
            <span key={`${l.index}-${l.end?.iso ?? "x"}`} className="block text-[12.5px] leading-snug text-stone-500">
              then <b className="font-semibold text-stone-700">{l.name}</b> {until(l)}
            </span>
          ))}
        </div>
      )}
    </Stat>
  );
}
