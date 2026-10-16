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
import { EngineLine, ErrorNote, Field, FormCard, LoadingCard, PillToggle, ResultCard, inputClass, tdClass, thClass } from "./tool-ui";

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
      <section className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
        <h2 className="mb-5 font-display text-[26px] font-semibold text-ink">Your Kundli</h2>
        <KundliLocked access={access} />
      </section>
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
    <section className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <h2 className="font-display text-[24px] font-semibold text-ink">My saved Kundlis</h2>
      {error && <ErrorNote>{error}</ErrorNote>}
      {saved === null && !error ? (
        <div className="mt-3 h-12 animate-pulse rounded-2xl bg-line-soft" aria-busy="true" />
      ) : saved && saved.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-stone-600">Kundlis you make are saved here.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {saved?.map((c) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 ${
                c.id === currentId ? "border-amber-300 bg-amber-50" : "border-line-soft bg-white"
              }`}
            >
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] text-ink">{c.name}</b>
                <span className="block text-[12.5px] text-stone-600">
                  {shortDate(c.date)}, {c.time} · <span className="break-words">{c.place}</span>
                </span>
                <span className="block text-[12px] text-stone-500">
                  Lagna {c.lagna} · Moon {c.moonSign} · {c.nakshatra}
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

const rasiLabel = (abbr: string, degree: number, retrograde: boolean) => `${abbr} ${Math.floor(degree)}°${retrograde ? "(R)" : ""}`;

export function KundliResult({ tool, chart, eyebrow }: { tool: Tool; chart: SavedChart; eyebrow?: string }) {
  const [style, setStyle] = useState<"north" | "south">("north");
  const k = chart.kundli;
  const tz = k.birth.timezone;
  const rasi: ChartPlacement[] = k.grahas.map((g) => ({ sign: g.sign.index, label: rasiLabel(g.abbr, g.degree, g.retrograde), retrograde: g.retrograde }));
  const d9: ChartPlacement[] = k.grahas.map((g) => ({ sign: g.navamsa.index, label: g.abbr, retrograde: g.retrograde }));
  const first = chart.name.trim().split(/\s+/)[0] || chart.name;

  return (
    <ResultCard
      tool={tool}
      eyebrow={eyebrow}
      title={`${first}'s Kundli`}
      actions={
        <PillToggle
          label="Chart style"
          options={[
            { key: "north", label: "North chart" },
            { key: "south", label: "South chart" },
          ]}
          value={style}
          onChange={(key) => setStyle(key as "north" | "south")}
        />
      }
    >
      {k.birth.timeNote !== "ok" && (
        <p role="alert" className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-800">
          {k.birth.timeNote === "gap"
            ? `The clocks in ${tz} jumped forward on this date, so ${k.birth.time} never happened there. The chart uses ${k.birth.utcOffset}; check the birth time.`
            : `The clocks in ${tz} went back on this date, so ${k.birth.time} happened twice. The chart uses the first (${k.birth.utcOffset}); check the birth time if it was the second.`}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <figure className="m-0">
          <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border border-line">
            <KundliChart style={style} lagnaSign={k.lagna.sign.index} placements={rasi} title="Rasi" />
          </div>
          <figcaption className="mt-2 text-center text-xs text-stone-500">
            Rasi (D1) · <span className="text-rose-700">red</span> = retrograde
          </figcaption>
        </figure>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Fact label="Lagna (Ascendant)" value={`${k.lagna.sign.name} ${k.lagna.dms}`} sub={k.lagna.sign.sanskrit} />
            <Fact label="Moon sign" value={k.moonSign.name} sub={k.moonSign.sanskrit} />
            <Fact label="Sun sign" value={k.sunSign.name} sub={k.sunSign.sanskrit} />
            <Fact label="Birth nakshatra" value={k.birthNakshatra.name} sub={`Pada ${k.birthNakshatra.pada}`} />
            {chart.currentDasha && (
              <Fact
                label="Running dasha"
                value={`${chart.currentDasha.mahadasha.name}${chart.currentDasha.antardasha ? ` / ${chart.currentDasha.antardasha.name}` : ""}`}
                sub="Mahadasha / antardasha"
              />
            )}
            <Fact
              label="Dasha at birth"
              value={k.dasha.mahadashas[0]?.name ?? "—"}
              sub={`${k.dasha.balance.years}y ${k.dasha.balance.months}m ${k.dasha.balance.days}d left`}
            />
          </div>

          <h3 className="mb-2 mt-5 text-[15px] font-bold text-ink">Planet positions</h3>
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={thClass}>Planet</th>
                  <th className={thClass}>Sign</th>
                  <th className={`${thClass} hidden sm:table-cell`}>Degree</th>
                  <th className={`${thClass} hidden sm:table-cell`}>Nakshatra</th>
                  <th className={thClass}>House</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${tdClass} font-semibold text-ink`}>Lagna</td>
                  <SignCells point={k.lagna} />
                  <td className={`${tdClass} tabular-nums`}>1</td>
                </tr>
                {k.grahas.map((g) => (
                  <tr key={g.key}>
                    <td className={`${tdClass} font-semibold text-ink`}>
                      {g.name}
                      {g.retrograde && (
                        <span className="ml-1 text-[11.5px] font-bold text-rose-700" title="Retrograde">
                          (R)
                        </span>
                      )}
                    </td>
                    <SignCells point={g} />
                    <td className={`${tdClass} tabular-nums`}>{g.house}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11.5px] text-stone-500">
            Houses are whole-sign from the lagna.{k.settings.node === "mean" ? " Rahu and Ketu use the mean nodes, which always move backwards." : ""}
          </p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <figure className="m-0">
          <h3 className="mb-2 text-[15px] font-bold text-ink">Navamsa (D9)</h3>
          <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border border-line">
            <KundliChart style={style} lagnaSign={k.navamsa.lagna.index} placements={d9} title="Navamsa" />
          </div>
          <figcaption className="mt-2 text-center text-xs text-stone-500">Navamsa lagna {k.navamsa.lagna.name}</figcaption>
        </figure>
        <DashaList mahadashas={k.dasha.mahadashas} timeZone={tz} />
      </div>

      <div className="mt-7 rounded-2xl bg-cream px-4 py-3.5">
        <h3 className="text-[15px] font-bold text-ink">Birth details</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
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

/** Sign, degree and nakshatra cells; on phones degree and nakshatra sit under the sign. */
function SignCells({ point }: { point: ZodiacPoint }) {
  const nak = `${point.nakshatra.name}–${point.nakshatra.pada}`;
  return (
    <>
      <td className={tdClass}>
        {point.sign.name}
        <span className="block text-[11.5px] tabular-nums text-stone-500 sm:hidden">
          {point.dms} · {nak}
        </span>
      </td>
      <td className={`${tdClass} hidden tabular-nums sm:table-cell`}>{point.dms}</td>
      <td className={`${tdClass} hidden sm:table-cell`}>{nak}</td>
    </>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-cream px-3.5 py-3">
      <div className="text-[11px] font-semibold text-stone-500">{label}</div>
      <b className="mt-[3px] block break-words text-[15px] font-bold leading-snug text-ink">{value}</b>
      {sub && <span className="block text-[11.5px] text-stone-500">{sub}</span>}
    </div>
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
      <h3 className="mb-2 text-[15px] font-bold text-ink">Vimshottari dasha</h3>
      <ul className="grid gap-1.5">
        {mahadashas.map((md) => {
          const on = running(md);
          const past = md.end <= now;
          return (
            <li key={md.start}>
              <details open={on} className={`group rounded-xl border ${on ? "border-amber-300 bg-amber-50" : "border-line-soft bg-white"}`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className={`text-[13.5px] font-bold ${past ? "text-stone-500" : "text-ink"}`}>
                    {md.name}
                    {on && <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10.5px] font-bold text-ink">Now</span>}
                  </span>
                  <span className="flex items-center gap-2 text-[12px] tabular-nums text-stone-600">
                    {isoDate(md.start, timeZone)} – {isoDate(md.end, timeZone)}
                    <span className="text-stone-400 transition-transform group-open:rotate-90" aria-hidden>
                      ›
                    </span>
                  </span>
                </summary>
                {md.antardashas && (
                  <ul className="grid gap-0.5 border-t border-line-soft px-3.5 py-2">
                    {md.antardashas.map((ad) => {
                      const adOn = running(ad);
                      return (
                        <li
                          key={ad.start}
                          className={`flex flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-1 text-[12.5px] ${
                            adOn ? "bg-amber-200/60 font-bold text-ink" : "text-stone-600"
                          }`}
                        >
                          <span>
                            {md.name} / {ad.name}
                            {adOn && <span className="ml-1.5 text-[10.5px] font-bold uppercase text-amber-800">now</span>}
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
      <p className="mt-1.5 text-[11.5px] text-stone-500">
        Dates in the birthplace&apos;s time zone. The first mahadasha began before birth; &ldquo;Dasha at birth&rdquo; shows
        what was left of it.
      </p>
    </div>
  );
}
