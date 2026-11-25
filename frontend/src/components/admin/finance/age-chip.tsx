"use client";

import { useState } from "react";
import { Chip } from "@/components/admin/ui";

// How long a refund has been waiting, as a traffic light so the team knows what to take first:
// red = waiting long (take first), yellow = recent, green = just came in.
export const YELLOW_AFTER_HOURS = 24;
export const RED_AFTER_HOURS = 72;

export type Urgency = "red" | "yellow" | "green";

const LOOK: Record<Urgency, { bg: string; fg: string; dot: string; word: string }> = {
  red: { bg: "#fff1f2", fg: "#be123c", dot: "#e11d48", word: "Waiting long" },
  yellow: { bg: "#fffbeb", fg: "#b45309", dot: "#f59e0b", word: "Recent" },
  green: { bg: "#ecfdf5", fg: "#047857", dot: "#10b981", word: "New" },
};

export function urgencyOf(iso: string | null | undefined, now = Date.now()): Urgency {
  const hours = iso ? (now - new Date(iso).getTime()) / 3_600_000 : 0;
  return hours >= RED_AFTER_HOURS ? "red" : hours >= YELLOW_AFTER_HOURS ? "yellow" : "green";
}

/** Oldest first: the one waiting longest is at the top. */
export const oldestFirst = <T,>(rows: T[], at: (r: T) => string | null | undefined) =>
  [...rows].sort((a, b) => new Date(at(a) ?? 0).getTime() - new Date(at(b) ?? 0).getTime());

function waited(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
}

/** "● Waiting long · 5 days" in red, yellow or green. */
export function AgeChip({ at }: { at: string | null | undefined }) {
  const [now] = useState(() => Date.now());
  if (!at) return <span className="text-[12px] text-[#a8a29e]">—</span>;
  const l = LOOK[urgencyOf(at, now)];
  return (
    <Chip bg={l.bg} fg={l.fg}>
      <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full" style={{ background: l.dot }} />
      {l.word} · {waited(at, now)}
    </Chip>
  );
}

/** Row accent: a coloured edge on the left of the first cell. */
export const edgeColor = (at: string | null | undefined) => LOOK[urgencyOf(at)].dot;

export function AgeLegend() {
  return (
    <p className="mt-2.5 mb-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#57534e]">
      <b className="text-ink">Take care of first → last:</b>
      {(["red", "yellow", "green"] as const).map((u) => (
        <span key={u} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: LOOK[u].dot }} />
          {u === "red" ? `Red: waiting over ${RED_AFTER_HOURS / 24} days` : u === "yellow" ? `Yellow: ${YELLOW_AFTER_HOURS} h to ${RED_AFTER_HOURS / 24} days` : `Green: under ${YELLOW_AFTER_HOURS} h`}
        </span>
      ))}
    </p>
  );
}
