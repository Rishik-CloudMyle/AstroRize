"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import {
  DATE_LIMIT_MESSAGE,
  DATE_RANGE_NOTE,
  MAX_DATE,
  MIN_DATE,
  deleteKundli,
  getKundli,
  listKundlis,
  makeKundli,
  outsideTestedRange,
  shortDate,
  type Place,
  type SavedChart,
  type SavedChartSummary,
} from "@/lib/astro";
import type { Tool } from "@/lib/types";
import { useAppUI } from "../app-provider";
import { BirthTimeInput } from "../account/time-of-birth";
import BirthPlaceInput from "./birth-place-input";
import AshtakavargaView from "./kundli/ashtakvarga-view";
import BasicView from "./kundli/basic-view";
import ChartsView from "./kundli/charts-view";
import DashaView from "./kundli/dasha-view";
import DoshasView from "./kundli/doshas-view";
import KpView from "./kundli/kp-view";
import PlanetsView from "./kundli/planets-view";
import ReadingView from "./kundli/reading-view";
import ShadbalaView from "./kundli/shadbala-view";
import KundliLocked, { useKundliAccess } from "./kundli-locked";
import { RashiGlyph } from "./tool-icons";
import { EngineLine, ErrorNote, Field, FormCard, LoadingCard, Panel, PillToggle, ResultCard, Stat, inputBase, inputClass, panelClass, panelPad } from "./tool-ui";

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
  // Something typed in the time that can't be used yet (e.g. AM/PM not chosen).
  const [timeProblem, setTimeProblem] = useState<string | null>(null);
  const [node, setNode] = useState<"mean" | "true">("mean");
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
    if (form.date < MIN_DATE || form.date > MAX_DATE) return DATE_LIMIT_MESSAGE;
    if (timeProblem) return `Time of birth: ${timeProblem}`;
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
      const { chart: c } = await makeKundli({ name: form.name.trim(), date: form.date, time: form.time, place: { placeId: place.id }, node });
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
        <Field label="Date of birth" hint={form.date && outsideTestedRange(form.date) ? <span className="text-orange-800">{DATE_RANGE_NOTE}</span> : undefined}>
          <input required type="date" min={MIN_DATE} max={MAX_DATE} value={form.date} onChange={set("date")} className={inputClass} />
        </Field>
        <Field label="Time of birth" hint="Local clock time at the birthplace, as on the birth certificate.">
          <BirthTimeInput
            id="kundli-time"
            value={form.time}
            onChange={(time, problem) => {
              setForm((f) => ({ ...f, time }));
              setTimeProblem(problem);
            }}
            invalid={attempted}
            inputClassName={inputBase}
          />
        </Field>
        <div className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-stone-700">Rahu/Ketu</span>
          <div className="mt-1.5">
            <PillToggle
              label="Rahu/Ketu node"
              options={[
                { key: "mean", label: "Mean" },
                { key: "true", label: "True" },
              ]}
              value={node}
              onChange={(k) => setNode(k as "mean" | "true")}
            />
          </div>
          <span className="mt-1 block text-[12px] leading-snug text-stone-500">Mean node is what most Indian almanacs use.</span>
        </div>
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

type TabKey = "basic" | "charts" | "planets" | "dasha" | "ashtakavarga" | "kp" | "strength" | "doshas" | "reading";

const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "charts", label: "Charts" },
  { key: "planets", label: "Planets" },
  { key: "dasha", label: "Dasha" },
  { key: "ashtakavarga", label: "Ashtakavarga" },
  { key: "kp", label: "KP" },
  { key: "strength", label: "Strength" },
  { key: "doshas", label: "Doshas" },
  { key: "reading", label: "Reading" },
];

export function KundliResult({ tool, chart, eyebrow }: { tool: Tool; chart: SavedChart; eyebrow?: string }) {
  const [style, setStyle] = useState<"north" | "south">("north");
  const [tab, setTab] = useState<TabKey>("basic");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const k = chart.kundli;
  const tz = k.birth.timezone;
  const first = chart.name.trim().split(/\s+/)[0] || chart.name;
  const glyph = (sign: number) => <RashiGlyph sign={sign} className="size-3.5" strokeWidth={2} />;
  const tabIndex = TABS.findIndex((t) => t.key === tab);
  const panelId = (key: TabKey) => `kundli-${chart.id}-${key}`;

  function chooseTab(i: number) {
    const next = TABS[(i + TABS.length) % TABS.length]!;
    setTab(next.key);
    const el = tabRefs.current[TABS.indexOf(next)];
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onTabKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowRight: tabIndex + 1, ArrowLeft: tabIndex - 1, Home: 0, End: TABS.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      chooseTab(moves[e.key]!);
    }
  }

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
      <p className="-mt-2 mb-5 text-[12.5px] font-semibold text-stone-600">
        {k.settings.ayanamsa} ayanamsa · {k.settings.node === "true" ? "true node" : "mean node"} (Rahu/Ketu) · whole-sign houses
      </p>
      {k.outsideTestedRange && (
        <p role="alert" className="mb-5 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-[13px] text-orange-800">
          {DATE_RANGE_NOTE} Planet positions for dates this far away rely on estimates of the Earth&apos;s rotation, so the lagna and the Moon may be off.
        </p>
      )}
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
        <Stat label="Dasha at birth" value={k.dasha.mahadashas[0]?.name ?? "—"} sub={`${k.dasha.balance.years}y ${k.dasha.balance.months}m ${k.dasha.balance.days}d left`} />
      </div>

      <div
        role="tablist"
        aria-label="Kundli sections"
        onKeyDown={onTabKey}
        // Phones/tablets: the app's scrolling chip row instead of underlined tabs.
        className="-mx-1 mt-7 flex gap-1 overflow-x-auto border-b border-line-warm bg-paper px-1 pb-0 [scrollbar-width:none] max-lg:-mx-4 max-lg:mt-5 max-lg:gap-2 max-lg:border-0 max-lg:bg-transparent max-lg:px-4 max-lg:pt-px max-lg:pb-0.5"
      >
        {TABS.map((t, i) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${panelId(t.key)}-tab`}
              aria-selected={on}
              aria-controls={panelId(t.key)}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.key)}
              className={`-mb-px shrink-0 rounded-t-xl border-b-2 px-3.5 py-2.5 text-[14px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-600 max-lg:mb-0 max-lg:h-[34px] max-lg:rounded-app-chip max-lg:border max-lg:px-3 max-lg:py-0 max-lg:text-[12px] max-lg:whitespace-nowrap max-lg:focus-visible:outline-offset-2 ${
                on
                  ? "border-amber-500 text-ink max-lg:border-app-selected max-lg:bg-app-tint max-lg:text-app-active"
                  : "border-transparent text-stone-500 hover:text-ink max-lg:border-app-line-gold max-lg:bg-app-surface max-lg:text-app-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId(tab)} aria-labelledby={`${panelId(tab)}-tab`} tabIndex={0} className="mt-6 min-w-0 focus-visible:outline-none max-lg:mt-4">
        {tab === "basic" && <BasicView chart={chart} />}
        {tab === "charts" && <ChartsView chart={chart} style={style} />}
        {tab === "planets" && <PlanetsView k={k} />}
        {tab === "dasha" && <DashaView chart={chart} />}
        {tab === "ashtakavarga" && k.ashtakavarga && <AshtakavargaView k={k} style={style} />}
        {tab === "kp" && k.kp && <KpView k={k} style={style} />}
        {tab === "strength" && k.shadbala && <ShadbalaView k={k} />}
        {tab === "doshas" && <DoshasView chart={chart} />}
        {tab === "reading" && <ReadingView chart={chart} />}
      </div>

      <EngineLine engine={chart.engine} extra={`sidereal zodiac, ${k.settings.node} nodes`} />
    </ResultCard>
  );
}
