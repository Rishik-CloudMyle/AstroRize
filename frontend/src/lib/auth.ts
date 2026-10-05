// Role-based sign-in shared by the website, the astrologer portal and the admin console.
// The Node API issues the session cookie: a signed token (HS256) with the role inside.
// The website checks the signature with the same SESSION_SECRET before it renders
// /portal or /admin; the API re-checks the session on every request.

import { jwtVerify } from "jose";

export type Role = "customer" | "astrologer" | "admin";
export type AdminRole = "super" | "finance" | "support" | "compliance";

/** What the server needs to know about the signed-in person. */
export interface SessionClaims {
  role: Role;
  adminRole?: AdminRole;
  astrologerId?: string;
}

export const SESSION_COOKIE = "astrorize_session";

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === "astrologer" ? "/portal" : role === "admin" ? "/admin" : "/";
}

let key: Uint8Array | null = null;

/** Verifies the session cookie. Returns null when it is missing, forged or expired. */
export async function verifyClaims(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET — copy .env.example to .env.local");
  key ??= new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const role = payload.role;
    if (role !== "customer" && role !== "astrologer" && role !== "admin") return null;
    return {
      role,
      adminRole: payload.adminRole as AdminRole | undefined,
      astrologerId: payload.astrologerId as string | undefined,
    };
  } catch {
    return null;
  }
}
