// Choices on the astrologer sign-up form. Same lists as the API (backend/src/lib/signup.ts)
// and the directory filters, so a new astrologer's skills and languages are filterable.

export const SKILL_OPTIONS = [
  "Vedic", "Numerology", "Tarot", "Palmistry", "Face Reading", "KP", "Nadi",
  "Prashna", "Psychic", "Signature Reading", "Vastu", "Life Coaching", "Healing", "Counseling",
] as const;

export const LANGUAGE_OPTIONS = [
  "English", "Hindi", "Bengali", "Gujarati", "Kannada", "Malayalam",
  "Marathi", "Odia", "Punjabi", "Tamil", "Telugu", "Urdu",
] as const;

export const MAX_SKILLS = 6;
export const MAX_LANGUAGES = 8;

/** Same rule as the API: at least 8 characters with a letter and a number. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "Use at least 8 characters for your password.";
  if (p.length > 128) return "Passwords can be up to 128 characters.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Your password needs at least one letter and one number.";
  return null;
}
