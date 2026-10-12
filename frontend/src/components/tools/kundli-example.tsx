"use client";

import Link from "next/link";
import { useState } from "react";
import { KUNDLI_PLANETS } from "@/lib/mock/tools";
import { useAppUI } from "../app-provider";
import KundliChart from "./kundli-chart";
import KundliLocked, { useKundliAccess } from "./kundli-locked";

const thClass =
  "border-b-2 border-line bg-cream px-2.5 py-[9px] text-left text-[11px] uppercase tracking-[.08em] text-stone-500";
const tdClass = "border-b border-line-soft px-2.5 py-[9px] text-stone-600";

/** "Example result" panel under the tool cards on /free-tools (as in the prototype). */
export default function KundliExample() {
  const { toast } = useAppUI();
  const [chart, setChart] = useState<"north" | "south">("north");
  // Only a signed-in customer sees the filled chart; everyone else sees empty frames.
  const access = useKundliAccess();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/free-tools/kundli`);
      toast("Kundli result link copied to your clipboard.");
    } catch {
      toast("Couldn't copy automatically — copy the link from your address bar.");
    }
  }

  return (
    <section className="relative mt-9 rounded-3xl border border-line bg-paper p-5 sm:p-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">Example result page</div>
          <h2 className="mt-1 font-display text-[28px] font-semibold text-ink">Your Kundli</h2>
        </div>
        {access === "customer" && (
          <div className="flex flex-wrap items-center gap-2">
            {(["north", "south"] as const).map((style) => {
              const on = chart === style;
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChart(style)}
                  className={`h-[34px] rounded-full border px-3.5 text-[13px] font-bold ${
                    on ? "border-amber-500 bg-amber-500 text-ink" : "border-line bg-white text-stone-600"
                  }`}
                >
                  {style === "north" ? "North chart" : "South chart"}
                </button>
              );
            })}
            <button
              type="button"
              onClick={copyLink}
              className="h-[34px] rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink"
            >
              Copy link
            </button>
          </div>
        )}
      </div>

      {access !== "customer" ? (
        <div className="mt-5">
          <KundliLocked access={access} />
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border border-line">
              <KundliChart style={chart} />
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">
                <thead>
                  <tr>
                    <th className={thClass}>Planet</th>
                    <th className={thClass}>House</th>
                    <th className={thClass}>Sign</th>
                    <th className={thClass}>Degree</th>
                  </tr>
                </thead>
                <tbody>
                  {KUNDLI_PLANETS.map((p) => (
                    <tr key={p.planet}>
                      <td className={`${tdClass} font-semibold text-ink`}>{p.planet}</td>
                      <td className={`${tdClass} tabular-nums`}>{p.house}</td>
                      <td className={tdClass}>{p.sign}</td>
                      <td className={`${tdClass} tabular-nums`}>{p.deg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-[18px] flex items-start gap-3 rounded-[14px] border border-blue-200 bg-blue-50 px-[15px] py-[13px]">
            <span className="text-[15px] leading-[1.3]">ⓘ</span>
            <div className="text-[13px] leading-normal text-blue-800">
              <b>AI-generated — for guidance; not professional advice.</b> Read the{" "}
              <Link href="/terms#ai">full disclaimer</Link>.
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3.5">
            <span className="text-xs text-stone-500">Share this result · astrorize.com/free-tools/kundli</span>
            <Link
              href="/astrologers"
              className="az-cta inline-flex h-[42px] items-center rounded-full px-5 text-sm font-bold hover:text-cta-ink hover:no-underline"
            >
              Ask an astrologer about this →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
