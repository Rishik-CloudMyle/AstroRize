import { z } from "zod";

// Customer contact details: one set of rules for sign-up, sign-in and the profile.
// The website checks the same rules (frontend/src/lib/contact.ts) so mistakes show before sending.

/**
 * The 10-digit number from what was typed, pasted or autofilled: "+91 98765 43210",
 * "91-9876543210" and "09876543210" all become "9876543210". Anything else is left for the
 * check below to refuse.
 */
export function normalizeMobile(raw: unknown): unknown {
  if (typeof raw !== "string" && typeof raw !== "number") return raw;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export const MOBILE_MESSAGE = "Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9).";

/** An Indian mobile number: 10 digits starting 6–9, and not one digit repeated (9999999999). */
export const mobileSchema = z.preprocess(
  normalizeMobile,
  z
    .string(MOBILE_MESSAGE)
    .regex(/^[6-9]\d{9}$/, MOBILE_MESSAGE)
    .refine((v) => !/^(\d)\1{9}$/.test(v), "That doesn't look like a real mobile number. Enter your own number."),
);

/**
 * A sensible address: letters, digits and the usual symbols before the @ (no leading, trailing or
 * double dots); a domain of proper labels; and a top-level domain of 2+ letters. "abc@x.y",
 * "name@@mail.com", "a..b@mail.com" and "name@mail" are refused.
 */
const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export const EMAIL_MESSAGE = "Enter a valid email address, like name@example.com.";

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

/** A required email: trimmed, lower-cased, checked. */
export const emailSchema = z
  .string(EMAIL_MESSAGE)
  .trim()
  .toLowerCase()
  .refine(isValidEmail, EMAIL_MESSAGE);

/** An optional email: blank becomes null. */
export const optionalEmailSchema = z
  .string(EMAIL_MESSAGE)
  .nullish()
  .transform((v) => v?.trim().toLowerCase() || null)
  .refine((v) => v === null || isValidEmail(v), "Enter a valid email address, like name@example.com, or leave it blank.");
