import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyClaims, type SessionClaims } from "./auth";

/** The signed-in person as the server sees them (null when signed out). */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifyClaims(store.get(SESSION_COOKIE)?.value);
}
