"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getKundli, listKundlis, type SavedChart } from "@/lib/astro";
import type { Tool } from "@/lib/types";
import KundliLocked, { useKundliAccess } from "./kundli-locked";
import { ToolMedallion } from "./tool-icons";
import { GoldHairline, panelClass, panelPad } from "./tool-ui";
import { KundliResult } from "./kundli-tool";

// The Kundli panel under the tool cards on /free-tools. A signed-in customer sees their most
// recently saved Kundli (or a link to make one); everyone else sees empty frames and a log-in prompt.

export default function KundliExample({ tool }: { tool: Tool }) {
  const access = useKundliAccess();

  if (access !== "customer") {
    return (
      <section className={`mt-9 ${panelClass} ${panelPad}`}>
        <GoldHairline />
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-amber-900">
          <ToolMedallion id="kundli" size="sm" />
          Free with an account
        </div>
        <h2 className="mt-1 font-display text-[28px] font-semibold text-ink">Your Kundli</h2>
        <div className="mt-5">
          <KundliLocked access={access} />
        </div>
      </section>
    );
  }
  return <LatestKundli tool={tool} />;
}

type State = { kind: "loading" } | { kind: "none" } | { kind: "error"; message: string } | { kind: "chart"; chart: SavedChart };

function LatestKundli({ tool }: { tool: Tool }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    listKundlis()
      .then(async ({ charts }) => {
        if (cancelled) return;
        if (!charts[0]) return setState({ kind: "none" });
        const { chart } = await getKundli(charts[0].id);
        if (!cancelled) setState({ kind: "chart", chart });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't load your Kundli." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "chart") {
    return (
      <div className="mt-9">
        <KundliResult tool={tool} chart={state.chart} eyebrow="Your latest saved Kundli" />
        <p className="mt-2 text-[13px] text-stone-600">
          <Link href="/free-tools/kundli">Make another Kundli or open your saved ones →</Link>
        </p>
      </div>
    );
  }

  return (
    <section className={`mt-9 ${panelClass} ${panelPad}`} aria-busy={state.kind === "loading"}>
      <GoldHairline />
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-amber-900">
        <ToolMedallion id="kundli" size="sm" />
        Free with your account
      </div>
      <h2 className="mt-1 font-display text-[28px] font-semibold text-ink">Your Kundli</h2>
      {state.kind === "loading" ? (
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-line-soft" />
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="m-0 max-w-[56ch] text-[13.5px] text-stone-700">
            {state.kind === "error"
              ? state.message
              : "You haven't made a Kundli yet. Enter your birth date, time and place to see your North and South Indian charts, planet positions and dasha."}
          </p>
          <Link
            href="/free-tools/kundli"
            className="az-cta inline-flex h-11 items-center rounded-full px-5 text-sm font-bold hover:text-cta-ink hover:no-underline"
          >
            Make my Kundli →
          </Link>
        </div>
      )}
    </section>
  );
}
