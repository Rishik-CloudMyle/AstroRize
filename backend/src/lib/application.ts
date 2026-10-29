import type { Astrologer, Prisma } from "../generated/prisma/client.ts";
import { istDate, rupee } from "./format.ts";

// An astrologer's own application: the portal wizard's saved answers (ApplicationDraft.values,
// keyed "step-field" exactly as frontend/src/lib/portal/application-steps.ts lays the steps out),
// what must be filled before it can go to HR, and how HR's stages map onto the account.

/**
 * Sanity limits for a per-minute rate (whole rupees), both for what the astrologer requests in
 * the wizard and for the rate HR sets on approval. No config key exists for these yet.
 */
export const RATE_MIN = 1;
export const RATE_MAX = 1000;

/** HR's applicant stage → the astrologer's lifecycle (what the portal banner shows). */
export const STAGE_LIFECYCLE: Record<string, string> = {
  "Under review": "review",
  "Docs pending": "docs",
  Interview: "interview",
  Negotiation: "negotiation",
  Pricing: "pricing",
  Training: "training",
};

/**
 * Keys starting with "_" in the draft are written by the platform, never by the wizard:
 * when it was submitted, and HR's latest note to the astrologer (what's needed, or why it was rejected).
 */
export const META = { submittedAt: "_submittedAt", note: "_note", noteAt: "_noteAt" } as const;

export type DraftValues = Record<string, string>;

export function draftValues(json: Prisma.JsonValue | undefined | null): DraftValues {
  const out: DraftValues = {};
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const [k, v] of Object.entries(json)) if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** The wizard's own answers, without the platform's "_" keys. */
export function wizardValues(values: DraftValues): DraftValues {
  return Object.fromEntries(Object.entries(values).filter(([k]) => !k.startsWith("_")));
}

/** The platform's "_" keys only. */
export function metaValues(values: DraftValues): DraftValues {
  return Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith("_")));
}

/** "8 Oct 2026" — the day the application first went to HR, or null while it is a draft. */
export function submittedOn(values: DraftValues): string | null {
  const at = values[META.submittedAt];
  return at ? istDate(new Date(at)) : null;
}

/** "₹30", "30", "30/min" → 30; anything else (empty, decimals, words) → null. */
export function parseRate(text: string): number | null {
  const t = text.replace(/[₹,\s]/g, "").replace(/\/min$/i, "");
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}

/** Age in whole years from "DD / MM / YYYY", or null when it isn't a real date. */
function ageFrom(dob: string, today = new Date()): number | null {
  const m = dob.match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

interface Known {
  email: string | null;
}

/** The value the wizard shows for a field: the astrologer's edit, else what the platform pre-fills. */
function answer(values: DraftValues, a: Astrologer, known: Known, key: string): string {
  if (values[key] !== undefined) return values[key].trim();
  switch (key) {
    case "0-1":
      return known.email ?? "";
    case "0-2":
      return a.languages.join(", ");
    case "3-0":
      return String(a.years);
    case "3-2":
      return a.skills.join(", ");
    default:
      return "";
  }
}

export interface Missing {
  /** 0-based wizard step to send the astrologer to. */
  step: number;
  label: string;
}

/** Everything still missing or invalid before the application can go to HR (empty = ready). */
export function missingFor(values: DraftValues, a: Astrologer, known: Known, hasBio: boolean): Missing[] {
  const v = (key: string) => answer(values, a, known, key);
  const out: Missing[] = [];
  const need = (ok: boolean, step: number, label: string) => {
    if (!ok) out.push({ step, label });
  };

  const email = v("0-1");
  need(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 0, "Email — enter a valid address or leave it empty");
  need(v("0-2").length > 0, 0, "Preferred languages — at least one");

  need(v("1-0").length >= 2, 1, "Full name");
  const age = ageFrom(v("1-1"));
  need(age !== null && age >= 18, 1, age === null ? "Date of birth — as DD / MM / YYYY" : "Date of birth — applicants must be 18 or older");
  need(v("1-2").length > 0, 1, "City");
  need(v("1-3").length > 0, 1, "State");

  need(v("2-0").length > 0, 2, "Education — degree");
  need(v("2-1").length > 0, 2, "Education — institution");
  const year = Number(v("2-2"));
  need(/^\d{4}$/.test(v("2-2")) && year >= 1940 && year <= new Date().getFullYear(), 2, "Education — year, as YYYY");

  need(/^\d{1,2}$/.test(v("3-0")) && Number(v("3-0")) <= 60, 3, "Years of experience — a whole number from 0 to 60");
  need(v("3-2").length > 0, 3, "Specialties");

  need(v("6-0").length >= 2, 6, "Bank — account holder");
  need(/^\d{9,18}$/.test(v("6-1").replace(/[\s-]/g, "")), 6, "Bank — account number (9 to 18 digits)");
  need(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v("6-2").toUpperCase()), 6, "Bank — IFSC, e.g. HDFC0001234");

  need(hasBio, 8, "Bio — write it on the Profile page and submit it for review");

  // "10-1" was the Chat rate: paid chat is no longer offered, so it is neither asked nor checked.
  const rates: [string, string][] = [["10-0", "Voice"], ["10-2", "Video"]];
  for (const [key, mode] of rates) {
    const text = v(key);
    const n = parseRate(text);
    need(!text || (n !== null && n >= RATE_MIN && n <= RATE_MAX), 10, `${mode} rate — whole rupees from ${rupee(RATE_MIN)} to ${rupee(RATE_MAX)}`);
  }
  need(!!v("10-0"), 10, "Pricing — request a voice rate");

  need(["11-0", "11-1", "11-2", "11-3"].every((k) => v(k) === "yes"), 11, "Readiness — tick every declaration");
  need(v("12-1") === "yes", 12, "Confirm that your details are accurate");
  return out;
}

/** What HR sees of a submitted application (bank details masked). */
export function answersFor(values: DraftValues, a: Astrologer, known: Known & { phone: string | null }) {
  const v = (key: string) => answer(values, a, known, key) || "—";
  const account = answer(values, a, known, "6-1").replace(/[\s-]/g, "");
  const rate = (key: string) => {
    const n = parseRate(answer(values, a, known, key));
    return n === null ? "—" : `${rupee(n)}/min`;
  };
  return [
    { label: "Full name", value: v("1-0") },
    { label: "Date of birth", value: v("1-1") },
    { label: "City, state", value: [answer(values, a, known, "1-2"), answer(values, a, known, "1-3")].filter(Boolean).join(", ") || "—" },
    { label: "Mobile", value: known.phone ?? "—" },
    { label: "Email", value: v("0-1") },
    { label: "Languages", value: v("0-2") },
    { label: "Education", value: [answer(values, a, known, "2-0"), answer(values, a, known, "2-1"), answer(values, a, known, "2-2")].filter(Boolean).join(" · ") || "—" },
    { label: "Experience", value: `${v("3-0")} years` },
    { label: "Prior platforms", value: v("3-1") },
    { label: "Specialties", value: v("3-2") },
    { label: "Skills", value: a.skills.join(", ") || "—" },
    { label: "Bank", value: account ? `${v("6-0")} · ••••${account.slice(-4)} · ${v("6-2").toUpperCase()}` : "—" },
    // A Chat rate is shown only on an application sent before paid chat was withdrawn.
    { label: "Requested rates", value: `Voice ${rate("10-0")}${answer(values, a, known, "10-1") ? ` · Chat ${rate("10-1")}` : ""} · Video ${rate("10-2")}` },
    { label: "Fixed sessions", value: v("10-3") },
    { label: "Bio", value: a.about.trim() || "Submitted for review on the Profile page" },
  ];
}

/** The voice rate the astrologer asked for (else, on an older application, its chat rate), as a hint for HR when approving. */
export function requestedRate(values: DraftValues): number | null {
  return parseRate(values["10-0"] ?? "") ?? parseRate(values["10-1"] ?? "");
}

/**
 * The next free application id: one after the highest ever used, including applications that
 * were since rejected or approved (their audit trail is keyed by the id, so it is never reused).
 */
export async function nextApplicantId(tx: Prisma.TransactionClient): Promise<string> {
  const [apps, audited] = await Promise.all([
    tx.applicant.findMany({ select: { id: true } }),
    tx.auditLog.findMany({ where: { object: { startsWith: "APP-" } }, select: { object: true }, distinct: ["object"] }),
  ]);
  let max = 0;
  for (const id of [...apps.map((r) => r.id), ...audited.map((r) => r.object)]) {
    const n = Number(id.slice(4));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `APP-${String(max + 1).padStart(4, "0")}`;
}

/** Writes HR's latest note to the astrologer onto their draft (created if they never had one). */
export async function setNote(tx: Prisma.TransactionClient, astrologerId: string, note: string) {
  const draft = await tx.applicationDraft.findUnique({ where: { astrologerId } });
  const values = { ...draftValues(draft?.values), [META.note]: note, [META.noteAt]: new Date().toISOString() };
  await tx.applicationDraft.upsert({ where: { astrologerId }, create: { astrologerId, values }, update: { values } });
}
