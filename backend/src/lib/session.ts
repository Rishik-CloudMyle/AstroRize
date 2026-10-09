import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { config } from "../config.ts";

// The session cookie is a signed token (HS256) holding the session id and the role.
// The frontend checks the same signature (with the same SESSION_SECRET) before it
// renders /portal or /admin, and the API checks the session row on every request.

export const SESSION_COOKIE = "astrorize_session";

export type RoleClaim = "customer" | "astrologer" | "admin";
export type AdminRoleClaim = "super" | "finance" | "support" | "compliance" | "marketing";

export interface SessionClaims {
  sid: string;
  sub: string;
  role: RoleClaim;
  adminRole?: AdminRoleClaim;
  astrologerId?: string;
}

const key = new TextEncoder().encode(config.sessionSecret);

export async function signSession(claims: SessionClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key);
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    const role = payload.role;
    if (role !== "customer" && role !== "astrologer" && role !== "admin") return null;
    return {
      sid: payload.sid,
      sub: payload.sub,
      role,
      adminRole: payload.adminRole as AdminRoleClaim | undefined,
      astrologerId: payload.astrologerId as string | undefined,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.isProduction, sameSite: "lax", path: "/" });
}
