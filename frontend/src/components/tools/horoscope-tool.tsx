"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { RASHIS, getHoroscope, ordinal, shortDate, type Horoscope, type Tone } from "@/lib/astro";
import type { Tool } from "@/lib/types";
import { RashiGlyph } from "./tool-icons";
import { FailedCard, LoadingCard, Panel, PillToggle, ResultCard, SectionTitle } from "./tool-ui";

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

function SignCard({ toolId, title, sign, onSign }: { toolId: string; title: string; sign: string; onSign: (s: string) => void }) {
  return (
    <Panel
      toolId={toolId}
      title={title}
      intro={<>Read by Moon sign (rashi), the Vedic convention. Don&apos;t know yours? It&apos;s on your Kundli.</>}
    >
      <div role="group" aria-label="Moon sign (rashi)" className="mt-5 grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 md:grid-cols-6 xl:grid-cols-12">
        {RASHIS.map((r, i) => {
          const on = r.en === sign;
          return (
            <button
              key={r.en}
              type="button"
              aria-pressed={on}
              onClick={() => onSign(r.en)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-center ${
                on
                  ? "border-amber-500 bg-linear-to-b from-[#fff3cf] to-[#fbdf9a] shadow-[0_6px_14px_rgba(180,83,9,.18)]"
                  : "border-line-warm bg-white hover:border-amber-300 hover:bg-[#fffaf0]"
              }`}
            >
              <RashiGlyph sign={i} className={`size-6 ${on ? "text-amber-900" : "text-amber-700"}`} />
              <span className="max-w-full truncate text-[12.5px] font-bold text-ink">{r.en}</span>
              <span className="max-w-full truncate text-[11px] text-stone-600">{r.sa}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function ToneBadge({ tone }: { tone: Tone }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px] font-bold ${TONE[tone].className}`}>
      {TONE[tone].label}
    </span>
  );
}

const DAY_EDGE: Record<Tone, string> = {
  favourable: "border-l-emerald-500",
  mixed: "border-l-amber-400",
  careful: "border-l-orange-500",
};
const DAY_TEXT: Record<Tone, string> = { favourable: "text-emerald-800", mixed: "text-amber-800", careful: "text-orange-800" };

/** The headline reading: the sign in a gold medallion beside the summary. */
function Reading({ h }: { h: Horoscope }) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="hidden size-16 shrink-0 place-items-center rounded-full border border-[#d6a84a] bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#f6e3b4_70%,#ecc979)] text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_6px_14px_rgba(146,64,14,.18)] min-[420px]:grid"
      >
        <RashiGlyph sign={h.sign.index} className="size-8" strokeWidth={1.4} />
      </span>
      <div className="min-w-0">
        <ToneBadge tone={h.tone} />
        <p className="mt-2 max-w-[60ch] font-display text-[23px] font-semibold leading-[1.35] text-ink sm:text-[26px]">{h.summary}</p>
      </div>
    </div>
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
      <SignCard toolId="horoscope" title="Choose your Moon sign" sign={sign} onSign={(s) => change(s, period)} />
      {!current ? (
        <LoadingCard label="Reading the transits…" />
      ) : !current.ok ? (
        <FailedCard error={current.error} retry={retry} />
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
            <Reading h={h} />
            {h.details.length > 0 && (
              <ul className="mt-5 grid max-w-[78ch] gap-2.5 text-[14.5px] leading-normal text-stone-700">
                {h.details.map((d) => (
                  <li key={d} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[7px] size-[6px] shrink-0 rotate-45 bg-[#d6a84a]" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
            {h.days && h.days.length > 0 && (
              <div className="mt-7">
                <SectionTitle>Day by day</SectionTitle>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 min-[480px]:grid-cols-2 lg:grid-cols-4">
                  {h.days.map((d) => (
                    <div key={d.date} className={`min-w-0 rounded-2xl border border-line-warm border-l-4 bg-white px-3.5 py-3 ${DAY_EDGE[d.tone]}`}>
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-[14.5px] text-ink">{d.weekday}</b>
                        <span className={`text-[11.5px] font-bold ${DAY_TEXT[d.tone]}`}>{TONE[d.tone].label}</span>
                      </div>
                      <span className="mt-1 block text-[13px] leading-snug text-stone-600">
                        Moon in {d.moonSign.name}, your {ordinal(d.house)} house
                      </span>
                      <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-stone-700">{d.theme}</span>
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
        toolId="daily"
        title="Your Moon sign"
        sign={sign}
        onSign={(s) => {
          setSign(s);
          replaceQuery("/free-tools/daily", { sign: s });
        }}
      />
      {!current ? (
        <LoadingCard label="Reading today's transits…" />
      ) : !current.ok ? (
        <FailedCard error={current.error} retry={retry} />
      ) : (
        h && (
          <ResultCard tool={tool} eyebrow={shortDate(h.from)} title="One thing today" sharePath={`/free-tools/daily?sign=${h.sign.name}`}>
            <blockquote className="relative max-w-[60ch] overflow-hidden rounded-3xl border border-[#ecd49a] bg-linear-140 from-[#fffaf0] via-[#fdf0d2] to-[#f8e2b4] px-6 py-6 font-display text-[24px] font-semibold leading-[1.35] text-ink sm:px-8 sm:text-[28px]">
              <RashiGlyph sign={h.sign.index} className="pointer-events-none absolute -right-3 -top-3 size-28 text-amber-700/15" strokeWidth={1.2} />
              <span className="relative">“{h.summary}”</span>
            </blockquote>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-stone-600">
              <span>
                For {h.sign.name} ({h.sign.sanskrit}) Moon sign
              </span>
              <ToneBadge tone={h.tone} />
            </div>
            {h.details[0] && <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-stone-700">{h.details[0]}</p>}
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
    <details className="group mt-6 rounded-2xl border border-line-warm bg-[#fbf6ea] px-4 py-3">
      <summary className="flex cursor-pointer list-none items-start gap-2 text-[13px] font-semibold leading-snug text-stone-700 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-[15px] leading-[1.1] text-amber-700 transition-transform group-open:rotate-90">
          ›
        </span>
        <span>
          {h.basis} <span className="whitespace-nowrap font-bold text-amber-800">See the planets</span>
        </span>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <ul className="grid gap-x-6 gap-y-1.5 text-[13px] text-stone-600 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {h.transits.map((t) => (
            <li key={t.graha}>
              <b className="text-ink">{t.name}</b> in {t.sign.name}
              {t.retrograde && t.graha !== "rahu" && t.graha !== "ketu" ? " (R)" : ""} — your {ordinal(t.house)} house
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12px] text-stone-500">
          {h.period === "weekly" ? "Positions on Monday at 6:00 am India time" : "Positions at noon India time"}, sidereal (Lahiri). Houses are counted
          from your Moon sign.
        </p>
      </div>
    </details>
  );
}
