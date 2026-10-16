"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { RASHIS, getHoroscope, ordinal, shortDate, type Horoscope, type Tone } from "@/lib/astro";
import type { Tool } from "@/lib/types";
import { ErrorNote, Field, LoadingCard, PillToggle, ResultCard, SignSelect } from "./tool-ui";

// Horoscope (daily / weekly) and Daily insight, by Moon sign, from the API (GET /astro/horoscope):
// readings worked out from the real transits of the day or week. The sign and period sit in the
// link so a reading can be shared.

type Period = "daily" | "weekly";

type Loaded = { key: string; ok: true; horoscope: Horoscope } | { key: string; ok: false; error: string };

const TONE: Record<Tone, { label: string; className: string }> = {
  favourable: { label: "Favourable", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  mixed: { label: "Mixed", className: "border-amber-200 bg-amber-50 text-amber-800" },
  careful: { label: "Go carefully", className: "border-orange-200 bg-orange-50 text-orange-800" },
};

const validSign = (s: string | null) => RASHIS.find((r) => r.en.toLowerCase() === s?.toLowerCase())?.en ?? RASHIS[0].en;

/** Loads a reading for (sign, period); reloads when either changes. */
function useHoroscope(sign: string, period: Period) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${sign}|${period}|${attempt}`;

  useEffect(() => {
    let cancelled = false;
    getHoroscope(sign, period)
      .then(({ horoscope }) => {
        if (!cancelled) setLoaded({ key, ok: true, horoscope });
      })
      .catch((err) => {
        if (!cancelled)
          setLoaded({ key, ok: false, error: err instanceof ApiError ? err.message : "We couldn't load this reading right now. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [key, sign, period]);

  return { current: loaded?.key === key ? loaded : null, retry: () => setAttempt((a) => a + 1) };
}

function replaceQuery(path: string, params: Record<string, string>) {
  window.history.replaceState(null, "", `${path}?${new URLSearchParams(params)}`);
}

function SignCard({ title, sign, onSign }: { title: string; sign: string; onSign: (s: string) => void }) {
  return (
    <div className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <h2 className="font-display text-[26px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-stone-600">
        Read by Moon sign (rashi), the Vedic convention. Don&apos;t know yours? It&apos;s on your Kundli.
      </p>
      <div className="mt-4 max-w-sm">
        <Field label="Moon sign (rashi)">
          <SignSelect value={sign} onChange={onSign} />
        </Field>
      </div>
    </div>
  );
}

function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="mt-6 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <ErrorNote>{error}</ErrorNote>
      <button type="button" onClick={retry} className="mt-3 h-[38px] rounded-full border border-line bg-white px-4 text-[13px] font-bold text-ink">
        Try again
      </button>
    </section>
  );
}

function ToneBadge({ tone }: { tone: Tone }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px] font-bold ${TONE[tone].className}`}>
      {TONE[tone].label}
    </span>
  );
}

export function HoroscopeTool({ tool }: { tool: Tool }) {
  const params = useSearchParams();
  const [sign, setSign] = useState(() => validSign(params.get("sign")));
  const [period, setPeriod] = useState<Period>(() => (params.get("period") === "weekly" ? "weekly" : "daily"));
  const { current, retry } = useHoroscope(sign, period);

  function change(nextSign: string, nextPeriod: Period) {
    setSign(nextSign);
    setPeriod(nextPeriod);
    replaceQuery("/free-tools/horoscope", { sign: nextSign, period: nextPeriod });
  }

  const h = current?.ok ? current.horoscope : null;
  const range = h ? (h.from === h.to ? shortDate(h.from) : `${shortDate(h.from)} – ${shortDate(h.to)}`) : "";

  return (
    <>
      <SignCard title="Choose your Moon sign" sign={sign} onSign={(s) => change(s, period)} />
      {!current ? (
        <LoadingCard label="Reading the transits…" />
      ) : !current.ok ? (
        <Failed error={current.error} retry={retry} />
      ) : (
        h && (
          <ResultCard
            tool={tool}
            eyebrow={range}
            title={`${h.sign.name} · ${h.period === "daily" ? "Today" : "This week"}`}
            sharePath={`/free-tools/horoscope?sign=${h.sign.name}&period=${h.period}`}
            actions={
              <PillToggle
                label="Period"
                options={[
                  { key: "daily", label: "Daily" },
                  { key: "weekly", label: "Weekly" },
                ]}
                value={period}
                onChange={(k) => change(sign, k as Period)}
              />
            }
          >
            <ToneBadge tone={h.tone} />
            <p className="mt-2 max-w-[60ch] font-display text-[22px] font-medium leading-[1.4] text-ink">{h.summary}</p>
            {h.details.length > 0 && (
              <ul className="mt-3 max-w-[70ch] list-disc space-y-1.5 pl-5 text-[14px] leading-normal text-stone-700">
                {h.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {h.days && h.days.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-[15px] font-bold text-ink">Day by day</h3>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2 min-[480px]:grid-cols-2 lg:grid-cols-4">
                  {h.days.map((d) => (
                    <div key={d.date} className="min-w-0 rounded-[14px] bg-cream px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-[13.5px] text-ink">{d.weekday}</b>
                        <span className={`size-2.5 shrink-0 rounded-full ${d.tone === "favourable" ? "bg-emerald-500" : d.tone === "careful" ? "bg-orange-500" : "bg-amber-400"}`} title={TONE[d.tone].label} />
                      </div>
                      <span className="block text-[12px] text-stone-600">
                        Moon in {d.moonSign.name}, your {ordinal(d.house)} house · {d.theme}
                      </span>
                      <span className="block text-[11px] text-stone-500">{TONE[d.tone].label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Basis h={h} />
          </ResultCard>
        )
      )}
    </>
  );
}

export function DailyTool({ tool }: { tool: Tool }) {
  const params = useSearchParams();
  const [sign, setSign] = useState(() => validSign(params.get("sign")));
  const { current, retry } = useHoroscope(sign, "daily");
  const h = current?.ok ? current.horoscope : null;

  return (
    <>
      <SignCard
        title="Your sign"
        sign={sign}
        onSign={(s) => {
          setSign(s);
          replaceQuery("/free-tools/daily", { sign: s });
        }}
      />
      {!current ? (
        <LoadingCard label="Reading today's transits…" />
      ) : !current.ok ? (
        <Failed error={current.error} retry={retry} />
      ) : (
        h && (
          <ResultCard tool={tool} eyebrow={shortDate(h.from)} title="One thing today" sharePath={`/free-tools/daily?sign=${h.sign.name}`}>
            <blockquote className="max-w-[56ch] rounded-2xl border border-amber-200 bg-linear-140 from-amber-50 to-amber-100 p-5 font-display text-2xl font-semibold leading-[1.35] text-ink">
              “{h.summary}”
            </blockquote>
            <p className="mt-2 text-[13px] text-stone-500">
              For {h.sign.name} ({h.sign.sanskrit}) Moon sign · <ToneBadge tone={h.tone} />
            </p>
            {h.details[0] && <p className="mt-3 max-w-[64ch] text-[14px] leading-normal text-stone-700">{h.details[0]}</p>}
            <Basis h={h} />
          </ResultCard>
        )
      )}
    </>
  );
}

/** The honest "what this is based on" line, plus where the planets are. */
function Basis({ h }: { h: Horoscope }) {
  return (
    <details className="mt-5 rounded-2xl bg-cream px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold text-stone-700">{h.basis}</summary>
      <div className="mt-3 overflow-x-auto">
        <ul className="grid gap-x-6 gap-y-1 text-[12.5px] text-stone-600 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {h.transits.map((t) => (
            <li key={t.graha}>
              <b className="text-ink">{t.name}</b> in {t.sign.name}
              {t.retrograde && t.graha !== "rahu" && t.graha !== "ketu" ? " (R)" : ""} — your {ordinal(t.house)} house
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-stone-500">
          {h.period === "weekly" ? "Positions on Monday at 6:00 am India time" : "Positions at noon India time"}, sidereal (Lahiri). Houses are counted
          from your Moon sign.
        </p>
      </div>
    </details>
  );
}
