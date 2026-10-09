import type { NextFunction, Request, Response } from "express";
import { db } from "../db.ts";
import { forbidden, unauthorized } from "../lib/errors.ts";
import { SESSION_COOKIE, verifySession, type AdminRoleClaim, type RoleClaim } from "../lib/session.ts";
import type { User } from "../generated/prisma/client.ts";

export interface AuthContext {
  user: User;
  sessionId: string;
  role: RoleClaim;
  adminRole?: AdminRoleClaim;
  astrologerId?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Reads the session cookie on every request. A valid signature is not enough:
 * the session must also exist in the database and not be revoked or expired.
 */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const claims = await verifySession(req.cookies?.[SESSION_COOKIE]);
  if (claims) {
    const session = await db.session.findUnique({ where: { id: claims.sid }, include: { user: true } });
    if (session && !session.revokedAt && session.expiresAt > new Date() && session.userId === claims.sub && session.user.active) {
      req.auth = {
        user: session.user,
        sessionId: session.id,
        role: session.user.role.toLowerCase() as RoleClaim,
        adminRole: session.user.adminRole?.toLowerCase() as AdminRoleClaim | undefined,
        astrologerId: claims.astrologerId,
      };
    }
  }
  next();
}

export function requireUser(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function requireRole(req: Request, role: RoleClaim): AuthContext {
  const auth = requireUser(req);
  if (auth.role !== role) throw forbidden();
  return auth;
}

/** Route-level guard: every route in the router needs this role. */
export function roleGuard(role: RoleClaim) {
  return (req: Request, _res: Response, next: NextFunction) => {
    requireRole(req, role);
    next();
  };
}
