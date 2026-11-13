import { cache } from "react";
import { apiGet, apiGetOr404 } from "@/lib/api/server";
import type { WelcomeOffer } from "@/components/home/promo-banner";
import type { Astrologer, FeaturedReview, LiveRoom } from "@/lib/types";

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

/**
 * Recent published customer reviews for the home page. Empty when there are none yet, or when
 * the API can't answer: the reviews sections are simply left out rather than breaking the page.
 */
export const getFeaturedReviews = cache(async (): Promise<FeaturedReview[]> => {
  try {
    const { reviews } = await apiGet<{ reviews: FeaturedReview[] }>("/reviews/featured");
    return reviews;
  } catch {
    return [];
  }
});

/** What a new mobile number gets on joining (the home banner's free-minutes slide); null if the API can't say. */
export const getWelcomeOffer = cache(async (): Promise<WelcomeOffer | null> => {
  try {
    return await apiGet<WelcomeOffer>("/welcome-offer");
  } catch {
    return null;
  }
});

export interface FixedSessionConfig {
  durations: number[];
  discounts: Record<number, number>;
}

/** Admin-configured durations and savings for Fixed Sessions. */
export const getFixedSessionConfig = cache(async (): Promise<FixedSessionConfig> => {
  try {
    return await apiGet<FixedSessionConfig>("/fixed-session-config");
  } catch {
    return {
      durations: [5, 10, 15, 30, 45, 60],
      discounts: { 5: 5, 10: 10, 15: 15, 30: 20, 45: 25, 60: 30 },
    };
  }
});
