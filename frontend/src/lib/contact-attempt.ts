"use client";

import { api } from "@/lib/api/client";

/**
 * Tells the API about a message the contact filter stopped on this page before it was sent, so
 * the off-platform contact attempt is flagged for staff (Trust & reviews) like one the API stopped
 * itself. The API checks the text again and keeps only a masked snippet. Fire-and-forget: the
 * person already sees the notice, and a failed report must never get in their way.
 *
 * `ref`: Messages — the astrologer's slug (customer) or the conversation id (astrologer);
 * a consultation's id; a live room's id.
 */
export function reportContactAttempt(where: "messages" | "consultation" | "live", ref: string, text: string) {
  void api.post("/contact-attempts", { where, ref, text }).catch(() => {});
}
