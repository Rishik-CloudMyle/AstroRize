import { cache } from "react";
import { apiGet, apiGetOr404 } from "@/lib/api/server";
import type { Astrologer, LiveRoom } from "@/lib/types";

// Data the public website reads from the Node API. Each call forwards the
// visitor's cookies, so pages using these render at request time (never at build).
// cache() shares one answer between generateMetadata and the page in a request.

export const getAstrologers = cache(async () => {
  return apiGet<{ astrologers: Astrologer[]; total: number }>("/astrologers");
});

/** One astrologer, or the not-found page. */
export const getAstrologer = cache(async (slug: string) => {
  const { astrologer } = await apiGetOr404<{ astrologer: Astrologer }>(`/astrologers/${encodeURIComponent(slug)}`);
  return astrologer;
});

export const getLiveRooms = cache(async () => {
  const { rooms } = await apiGet<{ rooms: LiveRoom[] }>("/live-rooms");
  return rooms;
});
