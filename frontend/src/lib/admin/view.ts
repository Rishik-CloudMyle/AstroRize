import { pageLink } from "./constants";
import type { Gift, Kpi, ModerationItem, PageKey, SearchHit, Ticket, WorkItem } from "./types";

// The prototype's colours for each state the API reports. The API sends states and
// numbers only; how they look belongs to the console. Safe to use on server and client.

const PLAIN_BORDER = "#e7e0d6";

/** A KPI tile; `alert` draws the rose border (and, with `alertValue`, a rose value). */
export function kpi(label: string, value: string, sub: string, subFg: string, alert = false, alertValue = false): Kpi {
  return { label, value, sub, fg: alertValue ? "#be123c" : "#1c1917", subFg, border: alert ? "#fecdd3" : PLAIN_BORDER };
}

/** SLA chip colours by tone (breached / urgent / soon / ok). */
export function slaColours(tone: string): Pick<Ticket, "slaBg" | "slaFg"> {
  switch (tone) {
    case "breached":
      return { slaBg: "#be123c", slaFg: "#fff" };
    case "urgent":
      return { slaBg: "#fff1f2", slaFg: "#be123c" };
    case "soon":
      return { slaBg: "#fffbeb", slaFg: "#92400e" };
    case "closed":
      return { slaBg: "#f5f5f4", slaFg: "#57534e" };
    default:
      return { slaBg: "#ecfdf5", slaFg: "#047857" };
  }
}

/** Worklist row colours by tone (amber / rose / rose-age / plain). */
export function workColours(tone: string): Pick<WorkItem, "ageFg" | "icoBg" | "icoFg" | "bg" | "border"> {
  if (tone === "amber") return { ageFg: "#b45309", icoBg: "#fef3c7", icoFg: "#92400e", bg: "#fffbeb", border: "#fde68a" };
  if (tone === "rose") return { ageFg: "#be123c", icoBg: "#fff1f2", icoFg: "#be123c", bg: "#fff1f2", border: "#fecdd3" };
  return {
    ageFg: tone === "rose-age" ? "#be123c" : "#78716c",
    icoBg: "#f7f4ee",
    icoFg: "#57534e",
    bg: "#fffdf8",
    border: PLAIN_BORDER,
  };
}

/** Review flag chip: abusive / policy breaches in rose, everything else amber. */
export function flagColours(flag: string): Pick<ModerationItem, "flagBg" | "flagFg"> {
  return /^R-0[1-4]/.test(flag) ? { flagBg: "#fff1f2", flagFg: "#be123c" } : { flagBg: "#fffbeb", flagFg: "#92400e" };
}

export function giftColours(state: string): Pick<Gift, "bg" | "border" | "tagBg" | "tagFg"> {
  if (state === "ACTIVE") return { bg: "#fffdf8", border: PLAIN_BORDER, tagBg: "#ecfdf5", tagFg: "#047857" };
  if (state === "AT CAP") return { bg: "#fffdf8", border: PLAIN_BORDER, tagBg: "#eff6ff", tagFg: "#1d4ed8" };
  return { bg: "#fffbeb", border: "#fde68a", tagBg: "#fef3c7", tagFg: "#92400e" };
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
