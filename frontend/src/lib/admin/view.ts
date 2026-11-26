import { pageLink } from "./constants";
import type { Gift, Kpi, ModerationItem, PageKey, SearchHit, Ticket, WorkItem } from "./types";

// The prototype's colours for each state the API reports. The API sends states and
// numbers only; how they look belongs to the console. Safe to use on server and client.

const PLAIN_BORDER = "var(--dk-border-color-line, #e7e0d6)";

/** A KPI tile; `alert` draws the rose border (and, with `alertValue`, a rose value). */
export function kpi(label: string, value: string, sub: string, subFg: string, alert = false, alertValue = false): Kpi {
  return { label, value, sub, fg: alertValue ? "var(--dk-text-color-rose-700, #be123c)" : "var(--dk-text-color-ink, #1c1917)", subFg, border: alert ? "var(--dk-border-color-rose-200, #fecdd3)" : PLAIN_BORDER };
}

/** SLA chip colours by tone (breached / urgent / soon / ok). */
export function slaColours(tone: string): Pick<Ticket, "slaBg" | "slaFg"> {
  switch (tone) {
    case "breached":
      return { slaBg: "#be123c", slaFg: "#fff" };
    case "urgent":
      return { slaBg: "var(--dk-background-color-rose-50, #fff1f2)", slaFg: "var(--dk-text-color-rose-700, #be123c)" };
    case "soon":
      return { slaBg: "var(--dk-background-color-amber-50, #fffbeb)", slaFg: "var(--dk-text-color-amber-800, #92400e)" };
    case "closed":
      return { slaBg: "var(--dk-background-color-stone-100, #f5f5f4)", slaFg: "var(--dk-text-color-stone-600, #57534e)" };
    default:
      return { slaBg: "var(--dk-background-color-emerald-50, #ecfdf5)", slaFg: "var(--dk-text-color-emerald-700, #047857)" };
  }
}

/** Worklist row colours by tone (amber / rose / rose-age / plain). */
export function workColours(tone: string): Pick<WorkItem, "ageFg" | "icoBg" | "icoFg" | "bg" | "border"> {
  if (tone === "amber") return { ageFg: "var(--dk-text-color-amber-700, #b45309)", icoBg: "var(--dk-background-color-amber-100, #fef3c7)", icoFg: "var(--dk-text-color-amber-800, #92400e)", bg: "var(--dk-background-color-amber-50, #fffbeb)", border: "var(--dk-border-color-amber-200, #fde68a)" };
  if (tone === "rose") return { ageFg: "var(--dk-text-color-rose-700, #be123c)", icoBg: "var(--dk-background-color-rose-50, #fff1f2)", icoFg: "var(--dk-text-color-rose-700, #be123c)", bg: "var(--dk-background-color-rose-50, #fff1f2)", border: "var(--dk-border-color-rose-200, #fecdd3)" };
  return {
    ageFg: tone === "rose-age" ? "var(--dk-text-color-rose-700, #be123c)" : "var(--dk-text-color-stone-500, #78716c)",
    icoBg: "var(--dk-background-color-cream, #f7f4ee)",
    icoFg: "var(--dk-text-color-stone-600, #57534e)",
    bg: "var(--dk-background-color-paper, #fffdf8)",
    border: PLAIN_BORDER,
  };
}

/** Review flag chip: abusive / policy breaches in rose, everything else amber. */
export function flagColours(flag: string): Pick<ModerationItem, "flagBg" | "flagFg"> {
  return /^R-0[1-4]/.test(flag) ? { flagBg: "var(--dk-background-color-rose-50, #fff1f2)", flagFg: "var(--dk-text-color-rose-700, #be123c)" } : { flagBg: "var(--dk-background-color-amber-50, #fffbeb)", flagFg: "var(--dk-text-color-amber-800, #92400e)" };
}

export function giftColours(state: string): Pick<Gift, "bg" | "border" | "tagBg" | "tagFg"> {
  if (state === "ACTIVE") return { bg: "var(--dk-background-color-paper, #fffdf8)", border: PLAIN_BORDER, tagBg: "var(--dk-background-color-emerald-50, #ecfdf5)", tagFg: "var(--dk-text-color-emerald-700, #047857)" };
  if (state === "AT CAP") return { bg: "var(--dk-background-color-paper, #fffdf8)", border: PLAIN_BORDER, tagBg: "var(--dk-background-color-blue-50, #eff6ff)", tagFg: "var(--dk-text-color-blue-700, #1d4ed8)" };
  return { bg: "var(--dk-background-color-amber-50, #fffbeb)", border: "var(--dk-border-color-amber-200, #fde68a)", tagBg: "var(--dk-background-color-amber-100, #fef3c7)", tagFg: "var(--dk-text-color-amber-800, #92400e)" };
}

/** A search hit from GET /admin/search, with its console link. */
export interface RawSearchHit {
  kind: string;
  label: string;
  sub: string;
  page: PageKey;
  param: string | null;
}

export function toSearchHit(h: RawSearchHit): SearchHit {
  return { kind: h.kind, label: h.label, sub: h.sub, href: pageLink(h.page, h.param) };
}

/** A retention period in days: 30 → "30 days", 365 → "1 year", 1095 → "3 years". */
export function periodLabel(days: number): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${days} days`;
}
