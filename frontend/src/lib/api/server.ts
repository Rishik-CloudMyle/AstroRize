import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ApiError, readResponse } from "./errors";

// Server-side calls to the Node API (server components and route handlers).
// The visitor's cookies are forwarded so the API knows who is asking, and
// nothing is cached: every page view gets current data.

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function apiGet<T>(path: string): Promise<T> {
  const store = await cookies();
  const res = await fetch(`${BACKEND}/api${path}`, {
    headers: { cookie: store.toString(), accept: "application/json" },
    cache: "no-store",
  });
  return readResponse<T>(res);
}

/** Like apiGet, but a 404 from the API shows the site's not-found page. */
export async function apiGetOr404<T>(path: string): Promise<T> {
  try {
    return await apiGet<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
