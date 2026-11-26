import type { ApplicationState } from "@/lib/admin/types";

// Labels and chip colours for lifecycle states, shared by the lists and the profile popups.

/** Astrologer stage key → label and chip colours, in lifecycle order. */
export const STAGES: { key: string; label: string; bg: string; fg: string }[] = [
  { key: "draft", label: "Draft", bg: "var(--dk-background-color-cream, #f7f4ee)", fg: "var(--dk-text-color-stone-600, #57534e)" },
  { key: "review", label: "Under review", bg: "var(--dk-background-color-blue-50, #eff6ff)", fg: "var(--dk-text-color-blue-800, #1e40af)" },
  { key: "interview", label: "Interview", bg: "var(--dk-background-color-blue-50, #eff6ff)", fg: "var(--dk-text-color-blue-800, #1e40af)" },
  { key: "docs", label: "Docs pending", bg: "var(--dk-background-color-rose-50, #fff1f2)", fg: "var(--dk-text-color-rose-700, #be123c)" },
  { key: "negotiation", label: "Negotiation", bg: "var(--dk-background-color-amber-100, #fef3c7)", fg: "var(--dk-text-color-amber-800, #92400e)" },
  { key: "pricing", label: "Pricing", bg: "var(--dk-background-color-blue-50, #eff6ff)", fg: "var(--dk-text-color-blue-700, #1d4ed8)" },
  { key: "training", label: "Training", bg: "var(--dk-background-color-amber-50, #fffbeb)", fg: "var(--dk-text-color-amber-800, #92400e)" },
  { key: "active", label: "Active", bg: "var(--dk-background-color-emerald-50, #ecfdf5)", fg: "var(--dk-text-color-emerald-700, #047857)" },
  { key: "rejected", label: "Rejected", bg: "var(--dk-background-color-rose-50, #fff1f2)", fg: "var(--dk-text-color-rose-700, #be123c)" },
];

export function stageOf(key: string) {
  return STAGES.find((s) => s.key === key) ?? { key, label: key, bg: "var(--dk-background-color-cream, #f7f4ee)", fg: "var(--dk-text-color-stone-600, #57534e)" };
}

export const SUSPENSION: Record<string, { label: string; bg: string; fg: string }> = {
  partial: { label: "Partially suspended", bg: "var(--dk-background-color-amber-50, #fffbeb)", fg: "var(--dk-text-color-amber-700, #b45309)" },
  full: { label: "Suspended", bg: "var(--dk-background-color-rose-50, #fff1f2)", fg: "var(--dk-text-color-rose-700, #be123c)" },
};

/** Application state → [background, text] chip colours. */
export const STATE_TONE: Record<ApplicationState, [string, string]> = {
  Negotiation: ["#fef3c7", "#92400e"],
  "Docs pending": ["#fff1f2", "#be123c"],
  Pricing: ["#eff6ff", "#1d4ed8"],
  Training: ["#ecfdf5", "#047857"],
  "Under review": ["#f7f4ee", "#57534e"],
  Interview: ["#f7f4ee", "#57534e"],
};

export function stateTone(state: string): [string, string] {
  return STATE_TONE[state as ApplicationState] ?? STATE_TONE["Under review"];
}
