import type { NextFunction, Request, Response } from "express";
import { db } from "../db.ts";
import { forbidden } from "./errors.ts";
import type { AdminRoleClaim } from "./session.ts";
import type { AuthContext } from "../middleware/auth.ts";

/**
 * A department. Several people can share one (each with their own login), so
 * separation-of-duties checks always compare user ids, never the role or the name.
 * (Includes "marketing" even where the session claim type has not caught up yet.)
 */
export type AdminRoleKey = AdminRoleClaim | "marketing";

export const ROLE_ORDER: AdminRoleKey[] = ["super", "finance", "support", "compliance", "marketing"];
export const ROLE_LABELS: Record<AdminRoleKey, string> = {
  super: "Super Admin",
  finance: "Finance",
  support: "Support",
  compliance: "Compliance",
  marketing: "Marketing",
};

// Who may open which admin console page (prototype part D → CAPS).
export type PageKey =
  | "overview"
  | "messages"
  | "config"
  | "hr"
  | "marketing"
  | "finance"
  | "support"
  | "compliance"
  | "trust"
  | "rbac"
  | "audit"
  | "recording"
  | "team";

/** Console order and the names used in the RBAC grid and audit diffs (same as the console nav). */
export const PAGE_LABELS: Record<PageKey, string> = {
  overview: "Overview",
  messages: "Messages",
  config: "Config console",
  hr: "Astrologer lifecycle",
  marketing: "Marketing",
  finance: "Finance",
  support: "Support & disputes",
  compliance: "Live monitoring",
  trust: "Trust & reviews",
  team: "Team",
  rbac: "RBAC",
  audit: "Audit log",
  recording: "Recording",
};
export const PAGE_ORDER = Object.keys(PAGE_LABELS) as PageKey[];

/** The default page access. The Super Admin can override it per department (Setting "rbac.matrix"). */
export const PAGES: Record<AdminRoleKey, PageKey[]> = {
  super: ["overview", "messages", "config", "hr", "marketing", "finance", "support", "compliance", "trust", "rbac", "audit", "recording", "team"],
  finance: ["overview", "messages", "config", "finance", "support", "audit"],
  support: ["overview", "messages", "support", "audit"],
  // Compliance and Marketing open "Support & disputes" for the customer issues forwarded to them
  // (they see only those: lib/tickets.ts ticketScope).
  compliance: ["overview", "messages", "compliance", "support", "trust", "audit", "recording"],
  marketing: ["overview", "messages", "marketing", "support", "audit"],
};

/**
 * The default capabilities (prototype part D → RBAC matrix), what each one lets a person do,
 * and the page whose API routes use it (a capability without its page has no effect; null =
 * no console action checks it yet).
 */
export const CAPABILITIES: { key: string; label: string; page: PageKey | null; roles: AdminRoleKey[] }[] = [
  { key: "config.write", label: "Draft, approve and roll back settings", page: "config", roles: ["super", "finance"] },
  { key: "payout.approve", label: "Approve a payout batch", page: "finance", roles: ["super", "finance"] },
  { key: "payout.release", label: "Release an approved payout batch", page: "finance", roles: ["super"] },
  { key: "wallet.refund.process", label: "Mark a customer wallet refund paid or failed", page: "finance", roles: ["super", "finance"] },
  { key: "dispute.refund.propose", label: "Propose a refund, wallet credit or free replacement call on a ticket, or reject a dispute", page: "support", roles: ["super", "support", "finance"] },
  { key: "dispute.refund.approve", label: "Approve or decline a proposed refund, wallet credit or free replacement call (someone else's)", page: "finance", roles: ["super", "finance"] },
  { key: "price.approve", label: "Approve or reject an astrologer's price increase", page: "hr", roles: ["super"] },
  { key: "astrologer.suspend", label: "Suspend an astrologer, or make a suspension stricter", page: "compliance", roles: ["super", "compliance"] },
  { key: "astrologer.restore", label: "Lift or ease an astrologer's suspension", page: "compliance", roles: ["super"] },
  { key: "account.contact_block", label: "Block, extend or lift a contact-sharing block on an account", page: "trust", roles: ["super", "compliance"] },
  { key: "live.observer.join", label: "Join a public live as an observer", page: "compliance", roles: ["super", "compliance"] },
  { key: "campaign.submit", label: "Submit a campaign for approval", page: "marketing", roles: ["super", "marketing"] },
  { key: "campaign.approve", label: "Approve and activate a campaign", page: "marketing", roles: ["super"] },
  { key: "audit.read", label: "Read and export the audit log", page: "audit", roles: ["super", "finance", "support", "compliance", "marketing"] },
  { key: "staff.manage", label: "Add, deactivate and reset staff accounts", page: "team", roles: ["super"] },
  { key: "retention.edit", label: "Change how long chat and messages are kept", page: "recording", roles: ["super"] },
  { key: "recording.listen", label: "Listen to consultation call recordings (audio)", page: "recording", roles: ["super"] },
  { key: "rbac.edit", label: "Change this access matrix", page: "rbac", roles: ["super"] },
];
const CAP_KEYS = CAPABILITIES.map((c) => c.key);

// ── Locked rules: never changed by the matrix (the API refuses, the grid shows a lock) ──

const EVERYONE: AdminRoleKey[] = ROLE_ORDER;
const SUPER_ONLY: AdminRoleKey[] = ["super"];

/** A cell that is fixed, with the reason shown next to the lock. */
export interface Lock {
  /** The only departments that have it (everyone else never does). */
  roles: AdminRoleKey[];
  reason: string;
}

export const PAGE_LOCKS: Partial<Record<PageKey, Lock>> = {
  overview: { roles: EVERYONE, reason: "Every department keeps the overview." },
  audit: { roles: EVERYONE, reason: "Every department keeps read access to the audit log." },
  team: { roles: SUPER_ONLY, reason: "Only a Super Admin can manage the team." },
};

export const CAPABILITY_LOCKS: Record<string, Lock> = {
  "audit.read": { roles: EVERYONE, reason: "Every department keeps read access to the audit log." },
  "staff.manage": { roles: SUPER_ONLY, reason: "Only a Super Admin can manage the team." },
  "rbac.edit": { roles: SUPER_ONLY, reason: "Only a Super Admin can change access." },
  "retention.edit": { roles: SUPER_ONLY, reason: "Only a Super Admin can change how long conversations are kept." },
  "recording.listen": { roles: SUPER_ONLY, reason: "Only a Super Admin can listen to call recordings (client decision)." },
};

export const SUPER_LOCK_REASON = "A Super Admin always has every page and capability.";

/**
 * Checks the matrix can never switch off: they compare people, whatever their department. A Super
 * Admin has authority over everything (client decision, Nov 2026) and may decide their own proposal;
 * that decision is audited as "self-approved by Super Admin".
 */
export const SEPARATION_OF_DUTIES = [
  "The person who approves a payout batch can't also release it.",
  "The person who drafts a config change can't also approve it.",
  "The person who proposes a refund or free replacement call can't also approve or decline it.",
  "The person who submits a campaign can't also approve it.",
  "A Super Admin is the exception: they may decide their own proposal, and the audit log records it as self-approved.",
];

/** Added to the audit entry when a Super Admin decides something they proposed themselves. */
export const SELF_APPROVED = "self-approved by Super Admin";

/**
 * The two-person rule for a decision on a proposal. `samePerson` says whether the decider proposed it.
 * Anyone else is refused with `blocked`; a Super Admin may go ahead, and gets back the note to add to
 * the audit entry (" · self-approved by Super Admin"), or "" when it isn't their own.
 */
export function secondPerson(admin: AuthContext & { adminRole: AdminRoleClaim }, samePerson: boolean, blocked: string): string {
  if (!samePerson) return "";
  if (admin.adminRole === "super") return ` · ${SELF_APPROVED}`;
  throw forbidden(blocked);
}

// ── The effective matrix: defaults + the Super Admin's overrides ──

export interface Matrix {
  pages: Record<AdminRoleKey, PageKey[]>;
  capabilities: Record<string, AdminRoleKey[]>;
}

/** What is stored in Setting "rbac.matrix" (absent = the defaults). */
export interface StoredMatrix extends Matrix {
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export const MATRIX_SETTING = "rbac.matrix";

export function defaultMatrix(): Matrix {
  return {
    pages: Object.fromEntries(ROLE_ORDER.map((r) => [r, [...PAGES[r]]])) as Matrix["pages"],
    capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c.key, [...c.roles]])),
  };
}

/**
 * Applies the locked rules and drops anything unknown, in console order. Used on everything read
 * from the database, so a hand-edited setting can't take a lock away or give one out.
 */
export function normalise(input: Partial<Matrix> | null | undefined): Matrix {
  const base = defaultMatrix();
  const pages = {} as Matrix["pages"];
  for (const role of ROLE_ORDER) {
    const asked = new Set(Array.isArray(input?.pages?.[role]) ? input!.pages![role] : base.pages[role]);
    pages[role] = PAGE_ORDER.filter((p) => {
      if (role === "super") return true;
      const lock = PAGE_LOCKS[p];
      return lock ? lock.roles.includes(role) : asked.has(p);
    });
  }
  const capabilities: Matrix["capabilities"] = {};
  for (const key of CAP_KEYS) {
    const raw = input?.capabilities?.[key];
    const asked = new Set(Array.isArray(raw) ? raw : base.capabilities[key]);
    const lock = CAPABILITY_LOCKS[key];
    capabilities[key] = ROLE_ORDER.filter((r) => r === "super" || (lock ? lock.roles.includes(r) : asked.has(r)));
  }
  return { pages, capabilities };
}

/** Readable changes from one matrix to another, e.g. "Marketing: + Finance page". Empty when equal. */
export function matrixDiff(from: Matrix, to: Matrix): string[] {
  const out: string[] = [];
  for (const role of ROLE_ORDER) {
    const was = new Set(from.pages[role]);
    const now = new Set(to.pages[role]);
    for (const p of PAGE_ORDER) {
      if (now.has(p) && !was.has(p)) out.push(`${ROLE_LABELS[role]}: + ${PAGE_LABELS[p]} page`);
      if (was.has(p) && !now.has(p)) out.push(`${ROLE_LABELS[role]}: − ${PAGE_LABELS[p]} page`);
    }
    for (const key of CAP_KEYS) {
      const had = from.capabilities[key]?.includes(role) ?? false;
      const has = to.capabilities[key]?.includes(role) ?? false;
      if (has && !had) out.push(`${ROLE_LABELS[role]}: + ${key}`);
      if (had && !has) out.push(`${ROLE_LABELS[role]}: − ${key}`);
    }
  }
  return out;
}

// A small cache so every request doesn't read the setting. A save or reset clears it at once;
// the time limit only matters if the setting is changed outside this API (e.g. a re-seed).
const CACHE_MS = 30_000;
let cache: { matrix: Matrix; stored: StoredMatrix | null; at: number } | null = null;

export async function loadMatrix(): Promise<{ matrix: Matrix; stored: StoredMatrix | null }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const row = await db.setting.findUnique({ where: { key: MATRIX_SETTING } });
  const stored = (row?.value as StoredMatrix | undefined) ?? null;
  cache = { matrix: normalise(stored), stored, at: Date.now() };
  return cache;
}

export function invalidateMatrix() {
  cache = null;
}

/** Express middleware for the admin router: makes sure the matrix is loaded before the sync checks below. */
export async function withMatrix(_req: Request, _res: Response, next: NextFunction) {
  try {
    await loadMatrix();
    next();
  } catch (e) {
    next(e);
  }
}

/** The matrix in force (loaded by withMatrix; the defaults before the first load). */
function current(): Matrix {
  return cache?.matrix ?? normalise(null);
}

export function pagesOf(role: AdminRoleKey): PageKey[] {
  return current().pages[role] ?? [];
}

export function capabilitiesOf(role: AdminRoleKey): string[] {
  const m = current();
  return CAP_KEYS.filter((k) => m.capabilities[k]?.includes(role));
}

export function adminOf(req: Request): AuthContext & { adminRole: AdminRoleClaim } {
  const auth = req.auth;
  // An admin whose department isn't known (unknown role) gets nothing.
  if (!auth || auth.role !== "admin" || !auth.adminRole || !ROLE_ORDER.includes(auth.adminRole as AdminRoleKey)) throw forbidden();
  return auth as AuthContext & { adminRole: AdminRoleClaim };
}

export function requirePage(req: Request, page: PageKey) {
  const admin = adminOf(req);
  if (!pagesOf(admin.adminRole).includes(page)) throw forbidden("You don't have access to this page.");
  return admin;
}

export function requireCapability(req: Request, capability: string, message?: string) {
  const admin = adminOf(req);
  if (!capabilitiesOf(admin.adminRole).includes(capability)) throw forbidden(message ?? `Your role can't do this (${capability}).`);
  return admin;
}

/** Short name used in audit entries and messages, e.g. "K. Prasad". */
export function actorName(auth: AuthContext): string {
  return auth.user.actorName ?? auth.user.name;
}
