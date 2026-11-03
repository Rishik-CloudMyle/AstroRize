import { z } from "zod";
import { db } from "../db.ts";
import { conflict } from "./errors.ts";

// Self sign-up for customers and astrologers. Staff accounts are never created here:
// a Super Admin adds them from the admin console (Team).
//
// ⚠ Emails given at sign-up are not verified yet: no email provider is connected. The
// mobile number is verified with a one-time code; add an email check here once a
// provider (e.g. SES, Postmark) exists.

/** Same lists as the website's sign-up form and directory filters (frontend/src/app/(site)/signup/options.ts). */
export const SKILL_OPTIONS = [
  "Vedic", "Numerology", "Tarot", "Palmistry", "Face Reading", "KP", "Nadi",
  "Prashna", "Psychic", "Signature Reading", "Vastu", "Life Coaching", "Healing", "Counseling",
] as const;
export const LANGUAGE_OPTIONS = [
  "English", "Hindi", "Bengali", "Gujarati", "Kannada", "Malayalam",
  "Marathi", "Odia", "Punjabi", "Tamil", "Telugu", "Urdu",
] as const;

/** Self-chosen passwords: at least 8 characters with a letter and a number. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters for your password.")
  .max(128, "Passwords can be up to 128 characters.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Your password needs at least one letter and one number.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "Enter a valid email address."));

/** Friendly 409s before anything is created (the unique indexes still decide in a race). */
export async function assertContactsFree(email: string, phone: string) {
  const [byEmail, byPhone] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true } }),
    db.user.findUnique({ where: { phone }, select: { id: true } }),
  ]);
  if (byEmail) throw conflict("An AstroRize account already uses this email. Log in instead, or use a different email.");
  if (byPhone) throw conflict("An AstroRize account already uses this mobile number. Log in instead, or use a different number.");
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "astrologer"
  );
}

/**
 * A free astrologer id (short, e.g. "priya") and public slug (e.g. "priya-sharma").
 * Numbers are added when taken: "priya-2", "priya-sharma-2".
 */
export async function freeAstrologerKeys(name: string): Promise<{ id: string; slug: string }> {
  const slugBase = slugify(name);
  const idBase = slugBase.split("-")[0] || "astrologer";
  const [ids, slugs] = await Promise.all([
    db.astrologer.findMany({ where: { id: { startsWith: idBase } }, select: { id: true } }),
    db.astrologer.findMany({ where: { slug: { startsWith: slugBase } }, select: { slug: true } }),
  ]);
  const takenIds = new Set(ids.map((r) => r.id));
  const takenSlugs = new Set(slugs.map((r) => r.slug));
  const pick = (base: string, taken: Set<string>) => {
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  };
  return { id: pick(idBase, takenIds), slug: pick(slugBase, takenSlugs) };
}

/**
 * Placeholders for a brand-new astrologer. The row stays in lifecycle "draft", so the
 * public directory, profile pages and booking never show it (they only read "active");
 * HR approves the real rate, photo and bio before it goes live.
 */
export const NEW_ASTROLOGER_DEFAULTS = {
  recognition: "FRESH",
  presence: "OFF",
  lifecycle: "draft",
  /** 0 = "not set yet". Rates are agreed with HR/Finance during the application. */
  price: 0,
  about: "",
  /** Brand mark until the astrologer's own photo is approved (step 10, Media). */
  photo: "/assets/brand/logo-mark.png",
  ratingDistribution: [0, 0, 0, 0, 0],
} as const;
