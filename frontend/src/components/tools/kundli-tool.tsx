"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import {
  coords,
  deleteKundli,
  getKundli,
  isoDate,
  listKundlis,
  longDate,
  makeKundli,
  shortDate,
  type DashaPeriod,
  type KundliGraha,
  type Place,
  type SavedChart,
  type SavedChartSummary,
  type ZodiacPoint,
} from "@/lib/astro";
import type { Tool } from "@/lib/types";
import { useAppUI } from "../app-provider";
import BirthPlaceInput from "./birth-place-input";
import KundliChart, { type ChartPlacement } from "./kundli-chart";
import KundliLocked, { useKundliAccess } from "./kundli-locked";
import { RashiGlyph } from "./tool-icons";
import {
  EngineLine,
  ErrorNote,
  Field,
  FormCard,
  LoadingCard,
  Panel,
  PillToggle,
  ResultCard,
  SectionTitle,
  Stat,
  inputClass,
  panelClass,
  panelPad,
  tdClass,
  thClass,
} from "./tool-ui";

// Kundli: for signed-in customers. The chart is calculated and saved by the API (POST
// /astro/kundli); saved charts can be reopened or deleted. Everyone else sees empty chart frames
// and a log-in prompt.

/** Birth details saved on Wallet & account (GET /me/profile), used to fill the form. */
interface BirthProfile {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string;
}

export default function KundliTool({ tool }: { tool: Tool }) {
  const access = useKundliAccess();
  if (access !== "customer") {
    return (
      <Panel toolId="kundli" title="Your Kundli">
        <div className="mt-6">
          <KundliLocked access={access} />
        </div>
      </Panel>
    );
  }
  return <KundliWorkspace tool={tool} />;
}

function KundliWorkspace({ tool }: { tool: Tool }) {
  const [form, setForm] = useState({ name: "", date: "", time: "" });
  const [place, setPlace] = useState<Place | null>(null);
  const [prefillPlace, setPrefillPlace] = useState<string | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chart, setChart] = useState<SavedChart | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedChartSummary[] | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  // Fill in the birth details saved on the customer's profile; anything already typed is kept.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ profile: BirthProfile }>("/me/profile")
      .then(({ profile: p }) => {
        if (cancelled) return;
        setForm((f) => ({
          name: f.name || [p.firstName, p.lastName].filter(Boolean).join(" "),
          date: f.date || (p.birthDate ?? ""),
          time: f.time || (p.birthTime ?? ""),
        }));
        if (p.birthPlace) setPrefillPlace(p.birthPlace);
      })
      .catch(() => {
        // No saved details: the form simply starts empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSaved = useCallback(() => {
    listKundlis()
      .then(({ charts }) => {
        setSaved(charts);
        setSavedError(null);
      })
      .catch((err) => setSavedError(err instanceof ApiError ? err.message : "Couldn't load your saved Kundlis."));
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  function showChart(c: SavedChart) {
    setChart(c);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Enter the name for this Kundli.";
    if (!form.date) return "Enter the date of birth.";
    if (form.date < "1800-01-01" || form.date > "2200-12-31") return "Dates from 1800 to 2200 are supported.";
    if (!form.time) return "Enter the time of birth — the Kundli's houses depend on it. A close estimate is better than none.";
    if (!place) return "Choose the place of birth from the list (press Search to find it).";
    return null;
  }

  async function submit() {
    setAttempted(true);
    const problem = validate();
    setError(problem);
    if (problem || !place) return;
    setBusy(true);
    try {
      const { chart: c } = await makeKundli({ name: form.name.trim(), date: form.date, time: form.time, place: { placeId: place.id } });
      showChart(c);
      loadSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't make the Kundli right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setOpening(id);
    setSavedError(null);
    try {
      const { chart: c } = await getKundli(id);
      showChart(c);
    } catch (err) {
      setSavedError(err instanceof ApiError ? err.message : "Couldn't open that Kundli.");
      if (err instanceof ApiError && err.status === 404) loadSaved();
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <FormCard
        toolId="kundli"
        title="Enter your birth details"
        intro="Your Kundli is saved to your account so you can open it again. Only you can see it."
        submitLabel="Make my Kundli"
        busy={busy}
        busyLabel="Calculating your Kundli…"
        error={error}
        onSubmit={submit}
      >
        <Field label="Full name">
          <input required value={form.name} onChange={set("name")} maxLength={80} className={inputClass} autoComplete="name" />
        </Field>
        <BirthPlaceInput label="Place of birth" value={place} onChange={setPlace} prefill={prefillPlace} invalid={attempted && !place} />
        <Field label="Date of birth">
          <input required type="date" min="1800-01-01" max="2200-12-31" value={form.date} onChange={set("date")} className={inputClass} />
        </Field>
        <Field label="Time of birth" hint="Local clock time at the birthplace, as on the birth certificate.">
          <input required type="time" value={form.time} onChange={set("time")} className={inputClass} />
        </Field>
      </FormCard>

      <SavedKundlis
        saved={saved}
        error={savedError}
        opening={opening}
        currentId={chart?.id ?? null}
        onOpen={open}
        onDeleted={(id) => {
          setSaved((list) => list?.filter((c) => c.id !== id) ?? null);
          if (chart?.id === id) setChart(null);
        }}
      />

      <div ref={resultRef} className="scroll-mt-20">
        {busy && !chart && <LoadingCard label="Calculating planet positions…" />}
        {chart && <KundliResult key={chart.id} tool={tool} chart={chart} />}
      </div>
    </>
  );
}

// ---------- Saved charts ----------

function SavedKundlis({
  saved,
  error,
  opening,
  currentId,
  onOpen,
  onDeleted,
}: {
  saved: SavedChartSummary[] | null;
  error: string | null;
  opening: string | null;
  currentId: string | null;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useAppUI();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await deleteKundli(id);
      onDeleted(id);
      toast("Kundli deleted.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onDeleted(id);
      toast(err instanceof ApiError ? err.message : "Couldn't delete that Kundli. Please try again.");
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  return (
    <section className={`mt-6 ${panelClass} ${panelPad}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[24px] font-semibold text-ink">My saved Kundlis</h2>
        {saved && saved.length > 0 && <span className="text-[12.5px] text-stone-500">{saved.length} saved · only you can see them</span>}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {saved === null && !error ? (
        <div className="mt-3 h-12 animate-pulse rounded-2xl bg-line-soft" aria-busy="true" />
      ) : saved && saved.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-stone-600">Kundlis you make are saved here.</p>
      ) : (
        <ul className="mt-4 grid gap-2.5 lg:grid-cols-2">
          {saved?.map((c) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 ${
                c.id === currentId ? "border-amber-300 bg-linear-to-b from-[#fffaf0] to-[#fdf0d2]" : "border-line-warm bg-white"
              }`}
            >
              <div className="min-w-[min(100%,230px)] flex-1">
                <b className="block truncate text-[14.5px] text-ink">{c.name}</b>
                <span className="block text-[12.5px] text-stone-600">
                  {shortDate(c.date)}, {c.time} · <span className="break-words">{c.place}</span>
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] font-semibold text-amber-900">
                  <span className="rounded-full bg-amber-100/80 px-2 py-0.5">Lagna {c.lagna}</span>
                  <span className="rounded-full bg-amber-100/80 px-2 py-0.5">Moon {c.moonSign}</span>
                  <span className="rounded-full bg-amber-100/80 px-2 py-0.5">{c.nakshatra}</span>
                </span>
              </div>
              {confirming === c.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-stone-600">Delete this Kundli?</span>
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    disabled={deleting === c.id}
                    className="h-[34px] rounded-full bg-rose-700 px-3.5 text-[13px] font-bold text-white disabled:opacity-60"
                  >
                    {deleting === c.id ? "Deleting…" : "Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="h-[34px] rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    disabled={opening !== null}
                    className="h-[34px] rounded-full border border-amber-400 bg-amber-50 px-3.5 text-[13px] font-bold text-ink disabled:opacity-60"
                  >
                    {opening === c.id ? "Opening…" : c.id === currentId ? "Showing" : "Open"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(c.id)}
                    className="h-[34px] rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-stone-600"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- The chart ----------

export function KundliResult({ tool, chart, eyebrow }: { tool: Tool; chart: SavedChart; eyebrow?: string }) {
  const [style, setStyle] = useState<"north" | "south">("north");
  const k = chart.kundli;
  const tz = k.birth.timezone;
  const rasi: ChartPlacement[] = k.grahas.map((g) => ({ sign: g.sign.index, abbr: g.abbr, degree: Math.floor(g.degree), retrograde: g.retrograde }));
  const d9: ChartPlacement[] = k.grahas.map((g) => ({ sign: g.navamsa.index, abbr: g.abbr, retrograde: g.retrograde }));
  const first = chart.name.trim().split(/\s+/)[0] || chart.name;
  const glyph = (sign: number) => <RashiGlyph sign={sign} className="size-3.5" strokeWidth={2} />;

  return (
    <ResultCard
      tool={tool}
      eyebrow={eyebrow}
      title={`${first}'s Kundli`}
      actions={
        <PillToggle
          label="Chart style"
          options={[
            { key: "north", label: "North Indian" },
            { key: "south", label: "South Indian" },
          ]}
          value={style}
          onChange={(key) => setStyle(key as "north" | "south")}
        />
      }
    >
      {k.birth.timeNote !== "ok" && (
        <p role="alert" className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-800">
          {k.birth.timeNote === "gap"
            ? `The clocks in ${tz} jumped forward on this date, so ${k.birth.time} never happened there. The chart uses ${k.birth.utcOffset}; check the birth time.`
            : `The clocks in ${tz} went back on this date, so ${k.birth.time} happened twice. The chart uses the first (${k.birth.utcOffset}); check the birth time if it was the second.`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Stat tone="gold" icon={glyph(k.lagna.sign.index)} label="Lagna" value={k.lagna.sign.name} sub={`${k.lagna.sign.sanskrit} · ${k.lagna.dms}`} />
        <Stat tone="gold" icon={glyph(k.moonSign.index)} label="Moon sign" value={k.moonSign.name} sub={k.moonSign.sanskrit} />
        <Stat tone="gold" label="Nakshatra" value={k.birthNakshatra.name} sub={`Pada ${k.birthNakshatra.pada}`} />
        {chart.currentDasha ? (
          <Stat
            tone="gold"
            label="Running dasha"
            value={`${chart.currentDasha.mahadasha.name}${chart.currentDasha.antardasha ? ` / ${chart.currentDasha.antardasha.name}` : ""}`}
            sub="Mahadasha / antardasha"
          />
        ) : null}
        <Stat icon={glyph(k.sunSign.index)} label="Sun sign" value={k.sunSign.name} sub={k.sunSign.sanskrit} />
        <Stat
          label="Dasha at birth"
          value={k.dasha.mahadashas[0]?.name ?? "—"}
          sub={`${k.dasha.balance.years}y ${k.dasha.balance.months}m ${k.dasha.balance.days}d left`}
        />
      </div>

      <SectionTitle className="mt-8">Birth charts</SectionTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 sm:gap-5">
        <ChartFigure title="Rasi (D1)" caption={<>Lagna {k.lagna.sign.name} · degrees in each sign</>}>
          <KundliChart style={style} lagnaSign={k.lagna.sign.index} placements={rasi} title="Rasi" />
        </ChartFigure>
        <ChartFigure title="Navamsa (D9)" caption={<>Navamsa lagna {k.navamsa.lagna.name}</>}>
          <KundliChart style={style} lagnaSign={k.navamsa.lagna.index} placements={d9} title="Navamsa" />
        </ChartFigure>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-stone-600">
        {style === "north" ? "Numbers are signs (1 = Aries … 12 = Pisces); the top diamond is the lagna. " : ""}
        <span className="font-bold text-rose-700">Red R</span> = retrograde.
      </p>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:gap-7">
        <div className="min-w-0">
          <SectionTitle>Planet positions</SectionTitle>
          <PlanetTable lagna={k.lagna} grahas={k.grahas} />
          <PlanetList lagna={k.lagna} grahas={k.grahas} />
          <p className="mt-2 text-[12px] text-stone-500">
            Houses are whole-sign from the lagna.{k.settings.node === "mean" ? " Rahu and Ketu use the mean nodes, which always move backwards." : ""}
          </p>
        </div>
        <DashaList mahadashas={k.dasha.mahadashas} timeZone={tz} />
      </div>

      <div className="mt-8 rounded-2xl border border-line-warm bg-[#fbf6ea] px-4 py-4 sm:px-5">
        <SectionTitle className="!mb-2 !text-[19px]">Birth details</SectionTitle>
        <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
          <Detail term="Name" value={chart.input.name} />
          <Detail term="Born" value={`${longDate(k.birth.date)}, ${k.birth.time}`} />
          <Detail term="Place" value={chart.input.place.name} />
          <Detail term="Coordinates" value={coords(k.birth.latitude, k.birth.longitude)} />
          <Detail term="Time zone" value={`${tz} (${k.birth.utcOffset} at birth)`} />
          <Detail term="Ayanamsa" value={`${k.settings.ayanamsa}, ${k.settings.ayanamsaDegrees.toFixed(4)}°`} />
        </dl>
        <EngineLine engine={chart.engine} extra={`sidereal zodiac, ${k.settings.node} nodes`} />
      </div>
    </ResultCard>
  );
}

function ChartFigure({ title, caption, children }: { title: string; caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="m-0 min-w-0">
      <div className="mx-auto w-full max-w-[400px]">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <b className="text-[14px] font-bold text-ink">{title}</b>
          <span className="truncate text-[12px] text-stone-500">{caption}</span>
        </div>
        <div className="aspect-square w-full drop-shadow-[0_8px_18px_rgba(120,72,10,.14)]">{children}</div>
      </div>
    </figure>
  );
}

const nakLabel = (p: ZodiacPoint) => `${p.nakshatra.name} · pada ${p.nakshatra.pada}`;

/** Wider screens: the planet table. */
function PlanetTable({ lagna, grahas }: { lagna: ZodiacPoint; grahas: KundliGraha[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-line-warm bg-white sm:block">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            <th className={thClass}>Planet</th>
            <th className={thClass}>Sign</th>
            <th className={thClass}>Degree</th>
            <th className={thClass}>Nakshatra</th>
            <th className={`${thClass} text-right`}>House</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-amber-50/60">
            <td className={`${tdClass} font-bold text-ink`}>Lagna</td>
            <td className={tdClass}>{lagna.sign.name}</td>
            <td className={`${tdClass} tabular-nums`}>{lagna.dms}</td>
            <td className={tdClass}>{nakLabel(lagna)}</td>
            <td className={`${tdClass} text-right font-semibold tabular-nums text-ink`}>1</td>
          </tr>
          {grahas.map((g) => (
            <tr key={g.key} className="hover:bg-[#fffaf0]">
              <td className={`${tdClass} font-semibold text-ink`}>
                {g.name}
                {g.retrograde && <RetroBadge />}
              </td>
              <td className={tdClass}>{g.sign.name}</td>
              <td className={`${tdClass} tabular-nums`}>{g.dms}</td>
              <td className={tdClass}>{nakLabel(g)}</td>
              <td className={`${tdClass} text-right font-semibold tabular-nums text-ink`}>{g.house}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phones: one stacked row per planet instead of a cramped table. */
function PlanetList({ lagna, grahas }: { lagna: ZodiacPoint; grahas: KundliGraha[] }) {
  const rowsList = [
    { key: "lagna", abbr: "As", name: "Lagna", point: lagna, house: 1, retrograde: false },
    ...grahas.map((g) => ({ key: g.key, abbr: g.abbr, name: g.name, point: g as ZodiacPoint, house: g.house, retrograde: g.retrograde })),
  ];
  return (
    <ul className="grid gap-2 sm:hidden">
      {rowsList.map((r) => (
        <li key={r.key} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${r.key === "lagna" ? "border-amber-200 bg-amber-50/70" : "border-line-warm bg-white"}`}>
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[#d6a84a] bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#f6e3b4)] text-[12px] font-bold text-amber-900"
          >
            {r.abbr}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <b className="text-[14.5px] text-ink">
                {r.name}
                {r.retrograde && <RetroBadge />}
              </b>
              <span className="shrink-0 text-[12.5px] font-semibold text-stone-600">House {r.house}</span>
            </div>
            <div className="text-[13px] text-stone-700">
              {r.point.sign.name} <span className="tabular-nums text-stone-500">· {r.point.dms}</span>
            </div>
            <div className="text-[12px] text-stone-500">{nakLabel(r.point)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RetroBadge() {
  return (
    <span className="ml-1.5 inline-flex h-[18px] items-center rounded-full bg-rose-50 px-1.5 align-[1px] text-[10.5px] font-bold text-rose-700" title="Retrograde">
      R<span className="sr-only">etrograde</span>
    </span>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-[92px] shrink-0 text-stone-500">{term}</dt>
      <dd className="m-0 min-w-0 break-words font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** Vimshottari mahadashas; the running one is highlighted and opens to show its antardashas. */
function DashaList({ mahadashas, timeZone }: { mahadashas: DashaPeriod[]; timeZone: string }) {
  // The current moment, read once per mount (a chart is reopened to refresh it).
  const [now] = useState(() => new Date().toISOString());
  const running = (p: DashaPeriod) => p.start <= now && now < p.end;

  return (
    <div className="min-w-0">
      <SectionTitle>Vimshottari dasha</SectionTitle>
      <ul className="grid gap-1.5">
        {mahadashas.map((md) => {
          const on = running(md);
          const past = md.end <= now;
          return (
            <li key={md.start}>
              <details
                open={on}
                className={`group rounded-xl border ${on ? "border-amber-300 bg-linear-to-b from-[#fffaf0] to-[#fdf0d2]" : "border-line-warm bg-white"}`}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-xl px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className={`text-[14px] font-bold ${past ? "text-stone-500" : "text-ink"}`}>
                    {md.name}
                    {on && <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10.5px] font-bold text-ink">Now</span>}
                  </span>
                  <span className="flex items-center gap-2 text-[12.5px] tabular-nums text-stone-600">
                    {isoDate(md.start, timeZone)} – {isoDate(md.end, timeZone)}
                    <span className="text-[15px] leading-none text-amber-700 transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </span>
                </summary>
                {md.antardashas && (
                  <ul className="grid gap-0.5 border-t border-amber-200/70 px-2 py-2 sm:px-3">
                    {md.antardashas.map((ad) => {
                      const adOn = running(ad);
                      return (
                        <li
                          key={ad.start}
                          className={`flex flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-1 text-[12.5px] ${
                            adOn ? "bg-amber-200/70 font-bold text-ink" : "text-stone-600"
                          }`}
                        >
                          <span>
                            {md.name} / {ad.name}
                            {adOn && <span className="ml-1.5 text-[10.5px] font-bold uppercase text-amber-900">now</span>}
                          </span>
                          <span className="tabular-nums">
                            {isoDate(ad.start, timeZone)} – {isoDate(ad.end, timeZone)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </details>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-stone-500">
        Dates in the birthplace&apos;s time zone. The first mahadasha began before birth; &ldquo;Dasha at birth&rdquo; shows
        what was left of it.
      </p>
    </div>
  );
}
