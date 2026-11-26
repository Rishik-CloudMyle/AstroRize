"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { isoDate, type SavedChart } from "@/lib/astro";
import { SectionTitle } from "../tool-ui";
import { SECTION_HELP } from "./explain";
import { GRAHA_EN, Help } from "./shared";

interface Period {
  name: string;
  start: string;
  end: string;
  sub?: string;
  antardashas?: Period[];
}

/** Mahadashas with the running one highlighted and open on its antardashas. */
function PeriodList({ periods, timeZone, label, chartId }: { periods: Period[]; timeZone: string; label: string; chartId?: string }) {
  // The current moment, read once per mount (a chart is reopened to refresh it).
  const [now] = useState(() => new Date().toISOString());
  const running = (p: Period) => p.start <= now && now < p.end;
  return (
    <ul className="grid gap-1.5" aria-label={label}>
      {periods.map((md, mdIndex) => {
        const on = running(md);
        const past = md.end <= now;
        return (
          <li key={md.start}>
            <details open={on} className={`group rounded-xl border ${on ? "border-amber-300 bg-linear-to-b from-[#fffaf0] to-[#fdf0d2]" : "border-line-warm bg-white"}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-xl px-3.5 py-2.5 focus-visible:outline-2 focus-visible:outline-amber-600 [&::-webkit-details-marker]:hidden">
                <span className={`text-[14px] font-bold ${past ? "text-stone-500" : "text-ink"}`}>
                  {md.name}
                  {md.sub && <span className="ml-1.5 text-[12px] font-semibold text-stone-500">{md.sub}</span>}
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
                  {md.antardashas.map((ad, adIndex) => {
                    const adOn = running(ad);
                    if (chartId) {
                      return (
                        <li key={ad.start}>
                          <SubPeriod chartId={chartId} path={[mdIndex, adIndex]} names={[md.name, ad.name]} period={ad} timeZone={timeZone} now={now} />
                        </li>
                      );
                    }
                    return (
                      <li
                        key={ad.start}
                        className={`flex flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-1 text-[12.5px] ${adOn ? "bg-amber-200/70 font-bold text-ink" : "text-stone-600"}`}
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
  );
}

const LEVELS = ["pratyantar", "sookshma", "prana"];

/** One Vimshottari period below the mahadasha: tap it to open the nine periods inside (down to prana). */
function SubPeriod({ chartId, path, names, period, timeZone, now }: { chartId: string; path: number[]; names: string[]; period: Period; timeZone: string; now: string }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Period[] | null>(null);
  const [error, setError] = useState("");
  const on = period.start <= now && now < period.end;
  // [md, ad] opens pratyantar, then sookshma, then prana: nothing below a path of five.
  const canOpen = path.length <= 4;
  const toggle = async () => {
    setOpen(!open);
    if (open || children) return;
    setError("");
    try {
      setChildren((await api.get<{ periods: Period[] }>(`/astro/kundli/${encodeURIComponent(chartId)}/dasha/sub?path=${path.join(",")}`)).periods);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load these periods.");
    }
  };
  const look = `flex w-full flex-wrap items-center justify-between gap-x-3 rounded-lg px-2 py-1 text-left text-[12.5px] ${on ? "bg-amber-200/70 font-bold text-ink" : "text-stone-600"}`;
  const row = (
    <>
      <span className="min-w-0">
        {canOpen && (
          <span aria-hidden className={`mr-1 inline-block text-amber-700 transition-transform ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        )}
        {names.join(" / ")}
        {on && <span className="ml-1.5 text-[10.5px] font-bold uppercase text-amber-900">now</span>}
      </span>
      <span className="tabular-nums">
        {isoDate(period.start, timeZone)} – {isoDate(period.end, timeZone)}
      </span>
    </>
  );
  if (!canOpen) return <div className={look}>{row}</div>;
  return (
    <>
      <button type="button" onClick={() => void toggle()} aria-expanded={open} className={`${look} hover:bg-amber-100`}>
        {row}
      </button>
      {open && (
        <ul className="ml-3 grid gap-0.5 border-l border-amber-200 py-1 pl-2">
          {error && (
            <li role="alert" className="px-2 text-[12px] font-semibold text-red-700">
              {error}
            </li>
          )}
          {!error && !children && <li className="px-2 text-[12px] text-stone-500">Loading {LEVELS[path.length - 2]} periods…</li>}
          {children?.map((c, i) => (
            <li key={c.start}>
              <SubPeriod chartId={chartId} path={[...path, i]} names={[...names, c.name]} period={c} timeZone={timeZone} now={now} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Dasha tab: Vimshottari and Yogini. */
export default function DashaView({ chart }: { chart: SavedChart }) {
  const k = chart.kundli;
  const tz = k.birth.timezone;
  const b = k.dasha.balance;
  const yb = k.yogini.balance;
  const yNow = chart.today.yogini;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-2 xl:gap-7">
      <section className="min-w-0" aria-labelledby="k-vim">
        <SectionTitle>
          <span id="k-vim">Vimshottari dasha</span>
        </SectionTitle>
        <Help className="-mt-1 mb-3">{SECTION_HELP.vimshottari}</Help>
        <p className="mb-3 text-[13px] text-stone-700">
          Balance at birth: <b className="text-ink">{GRAHA_EN[b.lord]}</b> {b.years}y {b.months}m {b.days}d
          {chart.currentDasha && (
            <>
              {" "}
              · Running now:{" "}
              <b className="text-ink">
                {chart.currentDasha.mahadasha.name}
                {chart.currentDasha.antardasha ? ` / ${chart.currentDasha.antardasha.name}` : ""}
              </b>
            </>
          )}
        </p>
        <PeriodList label="Vimshottari mahadashas" periods={k.dasha.mahadashas} timeZone={tz} chartId={chart.id} />
        <p className="mt-2 text-[12px] text-stone-500">
          Tap an antardasha to see its pratyantar, sookshma and prana periods. Dates in the birthplace&apos;s time zone; dasha years are solar years (the Sun&apos;s return). The first mahadasha began before birth.
        </p>
      </section>

      <section className="min-w-0" aria-labelledby="k-yog">
        <SectionTitle>
          <span id="k-yog">Yogini dasha</span>
        </SectionTitle>
        <Help className="-mt-1 mb-3">{SECTION_HELP.yogini}</Help>
        <p className="mb-3 text-[13px] text-stone-700">
          Balance at birth: <b className="text-ink">{yb.name}</b> {yb.years}y {yb.months}m {yb.days}d
          {yNow && (
            <>
              {" "}
              · Running now:{" "}
              <b className="text-ink">
                {yNow.mahadasha.name}
                {yNow.antardasha ? ` / ${yNow.antardasha.name}` : ""}
              </b>
            </>
          )}
        </p>
        <PeriodList
          label="Yogini mahadashas"
          periods={k.yogini.mahadashas.map((m) => ({ ...m, sub: `${GRAHA_EN[m.lord]} · ${m.years}y` }))}
          timeZone={tz}
        />
        <p className="mt-2 text-[12px] text-stone-500">
          Eight yoginis (Mangala 1 year … Sankata 8 years), started from the birth nakshatra; three 36-year cycles are listed.
        </p>
      </section>
    </div>
  );
}
