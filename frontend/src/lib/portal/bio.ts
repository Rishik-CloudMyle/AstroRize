// One bio readout shared by the application wizard and the Profile console, so the
// word count and the claims check can never disagree (logic.js → bioWords, bioLint).

export const BIO_WORD_LIMIT = 300;

export function wordCount(bio: string): number {
  const t = bio.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Guaranteed-outcome language that moderators reject. */
export function hasClaimWarning(bio: string): boolean {
  return /guarantee|100%|definitely|cure|certain/i.test(bio);
}
