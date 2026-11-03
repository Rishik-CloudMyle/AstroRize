import type { FeaturedReview } from "@/lib/types";

const MODE_LABEL: Record<string, string> = { chat: "Chat", voice: "Voice", video: "Video" };

/** "Voice consultation" */
export function consultationLabel(r: FeaturedReview): string {
  const mode = r.mode ? MODE_LABEL[r.mode] : null;
  return mode ? `${mode} consultation` : "Consultation";
}

/** "A. Mehta · Voice consultation with Pandit Raghav Joshi" */
export function reviewByline(r: FeaturedReview): string {
  return `${r.customerName} · ${consultationLabel(r)} with ${r.astrologerName}`;
}

/** A long review cut at a word boundary for the large rotating quote (the full text is on the profile). */
export function shortQuote(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}
