"use client";

import { readResponse } from "@/lib/api/errors";

/** DELETE through the site's /api proxy (the shared client has no delete helper). */
export async function apiDelete<T = { ok: boolean }>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json" } });
  return readResponse<T>(res);
}
