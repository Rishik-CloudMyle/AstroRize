import type { ApplicationState } from "@/lib/admin/types";

// Labels and chip colours for lifecycle states, shared by the lists and the profile popups.

/** Astrologer stage key → label and chip colours, in lifecycle order. */
export const STAGES: { key: string; label: string; bg: string; fg: string }[] = [
  { key: "draft", label: "Draft", bg: "#f7f4ee", fg: "#57534e" },
  { key: "review", label: "Under review", bg: "#eff6ff", fg: "#1e40af" },
  { key: "interview", label: "Interview", bg: "#eff6ff", fg: "#1e40af" },
  { key: "docs", label: "Docs pending", bg: "#fff1f2", fg: "#be123c" },
  { key: "negotiation", label: "Negotiation", bg: "#fef3c7", fg: "#92400e" },
  { key: "pricing", label: "Pricing", bg: "#eff6ff", fg: "#1d4ed8" },
  { key: "training", label: "Training", bg: "#fffbeb", fg: "#92400e" },
  { key: "active", label: "Active", bg: "#ecfdf5", fg: "#047857" },
  { key: "rejected", label: "Rejected", bg: "#fff1f2", fg: "#be123c" },
];

export function stageOf(key: string) {
  return STAGES.find((s) => s.key === key) ?? { key, label: key, bg: "#f7f4ee", fg: "#57534e" };
}

export const SUSPENSION: Record<string, { label: string; bg: string; fg: string }> = {
  partial: { label: "Partially suspended", bg: "#fffbeb", fg: "#b45309" },
  full: { label: "Suspended", bg: "#fff1f2", fg: "#be123c" },
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
