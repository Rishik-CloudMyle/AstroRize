import { db } from "../db.ts";
import { istDayMonth, rupee } from "./format.ts";

// How a customer sees one of their consultations: never by its internal reference ("SES-48213", which
// staff and astrologers keep using), but as a sentence — who, when, how long, how much:
//   "Voice call with Pt. Raghav Joshi · 6 Nov, 3:42 PM · 12 min · ₹360"
// Text that was stored before this rule (wallet ledger lines, old notifications, old ticket subjects and
// messages) is never rewritten: customer endpoints run it through scrubSessionRefs() when they read it.

const IST = "Asia/Kolkata";

/** "3:42 PM" (IST) */
function clock12(d: Date): string {
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST })
    .replace(/ /g, " ");
}

/** "6 Nov, 3:42 PM" */
const dayAndTime = (d: Date) => `${istDayMonth(d)}, ${clock12(d)}`;

export interface DescribableConsultation {
  mode: string;
  kind: string;
  requestedAt: Date;
  connectedAt: Date | null;
  endedAt: Date | null;
  billedSeconds: number;
  billedMinutes: number;
  total: number;
  astrologer: { name: string };
}

/** The relevant fields of a consultation, for `select`/`include`. */
export const DESCRIBE_SELECT = {
  mode: true,
  kind: true,
  requestedAt: true,
  connectedAt: true,
  endedAt: true,
  billedSeconds: true,
  billedMinutes: true,
  total: true,
  astrologer: { select: { name: true } },
} as const;

/** "Voice call", "Video call", "Chat" or "Instant call" */
export function sessionKindLabel(c: Pick<DescribableConsultation, "mode" | "kind">): string {
  if (c.kind === "INSTANT") return "Instant call";
  return c.mode === "VIDEO" ? "Video call" : c.mode === "VOICE" ? "Voice call" : "Chat";
}

const when = (c: DescribableConsultation) => c.connectedAt ?? c.endedAt ?? c.requestedAt;

/** "Voice call with Pt. Raghav Joshi · 6 Nov, 3:42 PM · 12 min · ₹360" (a ₹0 session ends "free"). */
export function sessionLabel(c: DescribableConsultation): string {
  const minutes = c.billedSeconds > 0 ? Math.max(1, Math.round(c.billedSeconds / 60)) : c.billedMinutes;
  const parts = [`${sessionKindLabel(c)} with ${c.astrologer.name}`, dayAndTime(when(c))];
  if (c.endedAt && minutes > 0) parts.push(`${minutes} min`);
  if (c.endedAt) parts.push(c.total > 0 ? rupee(c.total) : "free");
  return parts.join(" · ");
}

/** The same in a sentence: "your voice call with Pt. Raghav Joshi on 6 Nov, 3:42 PM". */
export function sessionInline(c: DescribableConsultation): string {
  const kind = sessionKindLabel(c);
  return `your ${kind[0]!.toLowerCase()}${kind.slice(1)} with ${c.astrologer.name} on ${dayAndTime(when(c))}`;
}

const REF_TEST = /SES-\d+/;
const REF_ALL = /SES-\d+/g;
// "session SES-1", "the consultation SES-1", "your session SES-1" or a bare "SES-1".
const REF_PHRASE = /(?:\b(?:the |your )?(?:session|consultation)\s+)?SES-\d+/gi;

export const hasSessionRef = (text: string | null | undefined) => !!text && REF_TEST.test(text);

/**
 * `texts` with every session reference swapped for a description of that consultation ("your voice
 * call with … on 6 Nov, 3:42 PM"), or "a consultation" when it isn't this customer's / can't be found.
 * One query for the whole batch.
 */
export async function scrubSessionRefs<T extends string | null | undefined>(userId: string, texts: T[]): Promise<T[]> {
  const refs = new Set<string>();
  for (const t of texts) if (t) for (const m of t.match(REF_ALL) ?? []) refs.add(m.toUpperCase());
  if (refs.size === 0) return texts;
  const rows = await db.consultation.findMany({ where: { ref: { in: [...refs] }, customerId: userId }, select: { ref: true, ...DESCRIBE_SELECT } });
  const byRef = new Map(rows.map((c) => [c.ref, sessionInline(c)]));
  return texts.map((t) => {
    if (!t || !REF_TEST.test(t)) return t;
    return t.replace(REF_PHRASE, (m, offset: number) => {
      const ref = /SES-\d+/i.exec(m)![0].toUpperCase();
      const s = byRef.get(ref) ?? "a consultation";
      return offset === 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
    }) as T;
  });
}

/** One text, scrubbed. */
export async function scrubOne(userId: string, text: string): Promise<string> {
  return (await scrubSessionRefs(userId, [text]))[0]!;
}

/** "your voice call with … on 6 Nov, 3:42 PM" for a consultation by reference ("your consultation" if it can't be found). Staff routes use it when writing text a customer will read. */
export async function sessionInlineByRef(ref: string): Promise<string> {
  const c = await db.consultation.findUnique({ where: { ref }, select: DESCRIBE_SELECT });
  return c ? sessionInline(c) : "your consultation";
}
