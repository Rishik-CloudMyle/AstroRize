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
import { EngineLine, ErrorNote, Field, FormCard, LoadingCard, ResultCard, inputClass } from "./tool-ui";

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
        <section className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
          <ErrorNote>{current.error}</ErrorNote>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-3 h-[38px] rounded-full border border-line bg-white px-4 text-[13px] font-bold text-ink"
          >
            Try again
          </button>
        </section>
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

  return (
    <ResultCard tool={tool} eyebrow={`Panchang · ${place.name}`} title={longDate(p.date)} sharePath={sharePath}>
      {p.note && (
        <p className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-800">{p.note}</p>
      )}

      <h3 className="mb-2 text-[15px] font-bold text-ink">The five limbs</h3>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-3">
        <LimbCard
          label="Tithi"
          items={p.tithi.map((t) => ({ ...t, name: `${t.paksha} ${t.name}` }))}
          day={day}
        />
        <LimbCard label="Nakshatra" items={p.nakshatra} day={day} />
        <LimbCard label="Yoga" items={p.yoga} day={day} />
        <LimbCard label="Karana" items={p.karana} day={day} />
        <Cell label="Vara (weekday)" value={p.vara.name} sub={p.vara.sanskrit} />
        <Cell
          label="Lunar month"
          value={`${p.month.amanta}${p.month.adhika ? " (Adhika)" : ""} · ${p.paksha} paksha`}
          sub={p.month.purnimanta !== p.month.amanta ? `${p.month.purnimanta} in the purnimanta calendar` : "Amanta and purnimanta agree"}
        />
      </div>

      <h3 className="mb-2 mt-6 text-[15px] font-bold text-ink">Sun and Moon</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Cell label="Sunrise" value={at(p.sunrise)} />
        <Cell label="Sunset" value={at(p.sunset)} />
        <Cell label="Moonrise" value={at(p.moonrise)} />
        <Cell label="Moonset" value={at(p.moonset)} />
        <Cell label="Sun sign" value={p.sunSign.name} sub={p.sunSign.sanskrit} />
        <Cell label="Moon sign" value={p.moonSign.name} sub={`${p.moonSign.sanskrit} · at sunrise`} />
      </div>

      <h3 className="mb-2 mt-6 text-[15px] font-bold text-ink">Timings to note</h3>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <Cell label="Rahu Kaal" value={span(p.rahuKaal)} sub="Avoid starting new work" warn />
        <Cell label="Yamaganda" value={span(p.yamaganda)} sub="Inauspicious" warn />
        <Cell label="Gulika Kaal" value={span(p.gulika)} sub="Inauspicious" warn />
        <Cell
          label="Abhijit muhurta"
          value={span(p.abhijit)}
          sub={p.vara.index === 3 ? "Traditionally not observed on Wednesdays" : "Auspicious midday window"}
        />
      </div>

      <p className="mt-4 text-[12px] leading-normal text-stone-500">
        All times are local to {place.name} ({p.timezone}, {p.utcOffset}) · {coords(p.latitude, p.longitude)}. Limbs are as
        they stand at sunrise, each with the time it ends. Sunrise and sunset use the upper edge of the Sun with standard
        refraction.
      </p>
      <EngineLine engine="astrorize-astro" extra="sidereal (Lahiri)" />
    </ResultCard>
  );
}

function Cell({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[14px] px-3.5 py-[13px] ${warn ? "bg-orange-50" : "bg-cream"}`}>
      <div className="text-[11px] font-semibold text-stone-500">{label}</div>
      <b className="mt-[3px] block break-words text-[15px] font-bold leading-snug text-ink">{value}</b>
      {sub && <span className="mt-0.5 block text-[11.5px] text-stone-500">{sub}</span>}
    </div>
  );
}

function LimbCard({ label, items, day }: { label: string; items: (Limb & { pada?: number })[]; day: string }) {
  const [first, ...rest] = items;
  if (!first) return <Cell label={label} value="—" />;
  const until = (l: Limb) => (l.end ? `until ${stampTime(l.end, day)}` : "all day");
  return (
    <div className="min-w-0 rounded-[14px] bg-cream px-3.5 py-[13px]">
      <div className="text-[11px] font-semibold text-stone-500">{label}</div>
      <b className="mt-[3px] block break-words text-[15px] font-bold leading-snug text-ink">
        {first.name}
        {first.pada ? <span className="font-semibold text-stone-600"> · pada {first.pada}</span> : null}
      </b>
      <span className="block text-[12px] text-stone-600">{until(first)}</span>
      {rest.map((l) => (
        <span key={`${l.index}-${l.end?.iso ?? "x"}`} className="mt-0.5 block text-[12px] text-stone-500">
          then <b className="font-semibold text-stone-700">{l.name}</b> {until(l)}
        </span>
      ))}
    </div>
  );
}
