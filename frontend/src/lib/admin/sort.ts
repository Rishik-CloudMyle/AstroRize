import { CONFIG_FACETS } from "./constants";
import type { Application, Campaign, ConfigKey, LifecycleAstrologer, PayoutBatch, StaffMember, Ticket } from "./types";

// "Sort by" orders for the console lists. Pure functions, so a server page can apply the
// order from ?sort=… before the first paint and the client view re-applies it on change.
// Sorting is stable: rows that tie keep the order the API sent them in.

export interface SortOption<T> {
  key: string;
  label: string;
  /** Omitted when the API does the sorting (the audit log). */
  compare?: (a: T, b: T) => number;
}

/** The option the URL asks for, or the default when it is missing or unknown. */
export function pickSort<T>(options: readonly SortOption<T>[], asked: unknown, fallback = options[0].key): string {
  return typeof asked === "string" && options.some((o) => o.key === asked) ? asked : fallback;
}

/** A sorted copy (Array#sort is stable, so ties keep their incoming order). */
export function sortRows<T>(rows: readonly T[], options: readonly SortOption<T>[], key: string): T[] {
  const compare = options.find((o) => o.key === key)?.compare;
  return compare ? [...rows].sort(compare) : [...rows];
}

// ── building blocks ──

const collator = new Intl.Collator("en-IN", { sensitivity: "base", numeric: true });
const text = (a: string, b: string) => collator.compare(a, b);
/** ISO timestamps: newest first. Missing ones go last. */
const newest = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : Date.parse(b) - Date.parse(a);
const oldest = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : Date.parse(a) - Date.parse(b);
/** Position in a fixed order; unknown values go after the known ones. */
const rank = (order: readonly string[]) => (v: string) => {
  const i = order.indexOf(v);
  return i === -1 ? order.length : i;
};
/** true sorts before false. */
const first = (a: boolean, b: boolean) => Number(b) - Number(a);

// ── Config console ──

const domainRank = rank(CONFIG_FACETS.map((f) => f.id));

export const CONFIG_SORTS: SortOption<ConfigKey>[] = [
  { key: "department", label: "Department (grouped)", compare: (a, b) => domainRank(a.domain) - domainRank(b.domain) },
  { key: "name", label: "Name A–Z", compare: (a, b) => text(a.key, b.key) },
  { key: "recent", label: "Recently changed", compare: (a, b) => newest(a.changedAt, b.changedAt) },
  { key: "pending", label: "Needs approval first", compare: (a, b) => first(a.pending, b.pending) },
  { key: "flagged", label: "Flagged first", compare: (a, b) => first(a.flagged, b.flagged) },
];

// ── Lifecycle: all astrologers ──

/** Astrologer lifecycle stages in order (the Astrologer model's `lifecycle`). */
const ASTROLOGER_STAGE_ORDER = [
  "draft",
  "review",
  "interview",
  "docs",
  "negotiation",
  "pricing",
  "training",
  "active",
  "rejected",
] as const;
const astroStage = rank(ASTROLOGER_STAGE_ORDER);

export const ASTROLOGER_SORTS: SortOption<LifecycleAstrologer>[] = [
  { key: "name", label: "Name A–Z", compare: (a, b) => text(a.name, b.name) },
  { key: "name-desc", label: "Name Z–A", compare: (a, b) => text(b.name, a.name) },
  { key: "newest", label: "Newest joined", compare: (a, b) => newest(a.joinedAt, b.joinedAt) },
  { key: "oldest", label: "Oldest joined", compare: (a, b) => oldest(a.joinedAt, b.joinedAt) },
  { key: "consults", label: "Most consults", compare: (a, b) => b.consults - a.consults || text(a.name, b.name) },
  {
    key: "rating",
    label: "Highest rating",
    // Unrated ("New") astrologers go last.
    compare: (a, b) =>
      (a.rating === null ? 1 : 0) - (b.rating === null ? 1 : 0) || (b.rating ?? 0) - (a.rating ?? 0) || text(a.name, b.name),
  },
  {
    key: "stage",
    label: "Stage",
    compare: (a, b) => astroStage(a.lifecycle) - astroStage(b.lifecycle) || text(a.name, b.name),
  },
];
/** The API lists newest first; that stays the default. */
export const ASTROLOGER_DEFAULT_SORT = "newest";

// ── Lifecycle: applications ──

const appStage = rank(["Under review", "Docs pending", "Interview", "Negotiation", "Pricing", "Training"]);

export const APPLICATION_SORTS: SortOption<Application>[] = [
  { key: "newest", label: "Newest submitted", compare: (a, b) => newest(a.submittedAt, b.submittedAt) },
  { key: "oldest", label: "Oldest submitted", compare: (a, b) => oldest(a.submittedAt, b.submittedAt) },
  { key: "name", label: "Name A–Z", compare: (a, b) => text(a.name, b.name) },
  {
    key: "stage",
    label: "Stage",
    compare: (a, b) => appStage(a.state) - appStage(b.state) || oldest(a.submittedAt, b.submittedAt),
  },
  {
    key: "breach",
    label: "SLA breach first",
    // Breached first, longest-waiting at the top of each group.
    compare: (a, b) => first(a.breach, b.breach) || oldest(a.submittedAt, b.submittedAt),
  },
];
/** The queue is worked oldest first (as the API sends it); that stays the default. */
export const APPLICATION_DEFAULT_SORT = "oldest";

// ── Team (within each department) ──

export const STAFF_SORTS: SortOption<StaffMember>[] = [
  { key: "name", label: "Name A–Z", compare: (a, b) => text(a.name, b.name) },
  {
    key: "last-login",
    label: "Last sign-in (most recent)",
    // Never signed in goes last.
    compare: (a, b) => newest(a.lastLoginAt, b.lastLoginAt) || text(a.name, b.name),
  },
  { key: "newest", label: "Newest added", compare: (a, b) => newest(a.addedAt, b.addedAt) || text(a.name, b.name) },
  { key: "active", label: "Active first", compare: (a, b) => first(a.active, b.active) || text(a.name, b.name) },
];

// ── Support tickets ──

const ticketState = rank([
  "ESCALATED",
  "EVIDENCE_REQUESTED",
  "INVESTIGATING",
  "REFUND_PROPOSED",
  "MAKEGOOD_PROPOSED",
  "CREDIT_PROPOSED",
  "REFUND_INITIATED",
  "RESOLVED",
]);
const refundState = rank(["PROPOSED", "INITIATED", "NONE"]);
const slaDue = (a: Ticket, b: Ticket) => oldest(a.slaDueAt, b.slaDueAt);

export const TICKET_SORTS: SortOption<Ticket>[] = [
  // Breached tickets are already past due, so they come first.
  { key: "sla", label: "SLA due soonest", compare: slaDue },
  { key: "newest", label: "Newest", compare: (a, b) => newest(a.createdAt, b.createdAt) },
  { key: "oldest", label: "Oldest", compare: (a, b) => oldest(a.createdAt, b.createdAt) },
  { key: "activity", label: "Latest activity", compare: (a, b) => newest(a.lastActivityAt, b.lastActivityAt) },
  { key: "status", label: "Status", compare: (a, b) => ticketState(a.state) - ticketState(b.state) || slaDue(a, b) },
  {
    key: "refund",
    label: "Refund state",
    compare: (a, b) => refundState(a.refundState) - refundState(b.refundState) || slaDue(a, b),
  },
];

// ── Finance: payout batches ──

const batchState = rank(["DRAFT", "APPROVED", "RELEASED"]);
const batchNewest = (a: PayoutBatch, b: PayoutBatch) => newest(a.createdAt, b.createdAt);

export const BATCH_SORTS: SortOption<PayoutBatch>[] = [
  { key: "newest", label: "Newest", compare: batchNewest },
  { key: "oldest", label: "Oldest", compare: (a, b) => oldest(a.createdAt, b.createdAt) },
  { key: "gross-desc", label: "Gross high → low", compare: (a, b) => b.grossValue - a.grossValue || batchNewest(a, b) },
  { key: "gross-asc", label: "Gross low → high", compare: (a, b) => a.grossValue - b.grossValue || batchNewest(a, b) },
  { key: "status", label: "Status", compare: (a, b) => batchState(a.state) - batchState(b.state) || batchNewest(a, b) },
];

// ── Marketing: campaigns ──

/** Live first, then waiting for approval, drafts, and expired last. */
const campaignState = rank(["ACTIVE", "UNDER_REVIEW", "SUBMITTED", "DRAFT", "EXPIRED"]);
/** Campaign ids are issued in sequence (CMP-14, CMP-15 …), so a higher number is newer. */
const idNumber = (c: Campaign) => Number(c.id.replace(/\D/g, "")) || 0;
const campaignNewest = (a: Campaign, b: Campaign) => idNumber(b) - idNumber(a);

export const CAMPAIGN_SORTS: SortOption<Campaign>[] = [
  { key: "status", label: "Status", compare: (a, b) => campaignState(a.state) - campaignState(b.state) || campaignNewest(a, b) },
  { key: "name", label: "Name A–Z", compare: (a, b) => text(a.name, b.name) },
  { key: "newest", label: "Newest", compare: campaignNewest },
];

// ── Audit log (sorted by the API: the list is capped, so "Oldest" must reach the first entries) ──

export const AUDIT_SORTS: SortOption<never>[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "actor", label: "Actor A–Z" },
  { key: "action", label: "Action A–Z" },
];
