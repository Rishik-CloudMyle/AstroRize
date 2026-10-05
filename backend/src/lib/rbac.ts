import type { Request } from "express";
import { forbidden } from "./errors.ts";
import type { AdminRoleClaim } from "./session.ts";
import type { AuthContext } from "../middleware/auth.ts";

// Who may open which admin console page (prototype part D → CAPS).
export type PageKey =
  | "overview"
  | "config"
  | "hr"
  | "marketing"
  | "finance"
  | "support"
  | "compliance"
  | "trust"
  | "rbac"
  | "audit"
  | "recording";

export const PAGES: Record<AdminRoleClaim, PageKey[]> = {
  super: ["overview", "config", "hr", "marketing", "finance", "support", "compliance", "trust", "rbac", "audit", "recording"],
  finance: ["overview", "config", "finance", "audit"],
  support: ["overview", "support", "audit"],
  compliance: ["overview", "compliance", "trust", "audit", "recording"],
};

// What each role may do (prototype part D → RBAC matrix).
export const CAPABILITIES: { key: string; roles: AdminRoleClaim[] }[] = [
  { key: "config.write", roles: ["super", "finance"] },
  { key: "payout.approve", roles: ["super", "finance"] },
  { key: "payout.release", roles: ["super"] },
  { key: "dispute.refund.propose", roles: ["super", "support"] },
  { key: "dispute.refund.approve", roles: ["super", "finance"] },
  { key: "astrologer.suspend", roles: ["super", "compliance"] },
  { key: "astrologer.restore", roles: ["super"] },
  { key: "live.observer.join", roles: ["super", "compliance"] },
  { key: "audit.read", roles: ["super", "finance", "support", "compliance"] },
];

export function adminOf(req: Request): AuthContext & { adminRole: AdminRoleClaim } {
  const auth = req.auth;
  if (!auth || auth.role !== "admin" || !auth.adminRole) throw forbidden();
  return auth as AuthContext & { adminRole: AdminRoleClaim };
}

export function requirePage(req: Request, page: PageKey) {
  const admin = adminOf(req);
  if (!PAGES[admin.adminRole].includes(page)) throw forbidden("You don't have access to this page.");
  return admin;
}

export function requireCapability(req: Request, capability: string, message?: string) {
  const admin = adminOf(req);
  const cap = CAPABILITIES.find((c) => c.key === capability);
  if (!cap?.roles.includes(admin.adminRole)) throw forbidden(message ?? `Your role can't do this (${capability}).`);
  return admin;
}

/** Short name used in audit entries and messages, e.g. "K. Prasad". */
export function actorName(auth: AuthContext): string {
  return auth.user.actorName ?? auth.user.name;
}
