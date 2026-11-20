// Short plain-language notes on the skills an astrologer can list, shown in the profile editor so
// everyone knows what each one means. Descriptions only explain the practice — no claims about results.

export const SKILL_INFO: Record<string, string> = {
  Vedic: "Traditional Indian astrology: reads your birth chart (Kundli), planets and dasha periods for life guidance.",
  KP: "Krishnamurti Paddhati: a precise system that uses sub-lords to time events and answer specific questions.",
  Nadi: "Nadi astrology: interpretation drawn from the ancient Nadi palm-leaf tradition.",
  Prashna: "Horary astrology: answers a specific question using the chart of the moment it is asked.",
  "Face Reading": "Reading facial features for character and tendencies (physiognomy).",
  Palmistry: "Reading the lines and shape of the palm for personality and life themes.",
  Numerology: "Guidance drawn from the numbers in your name and date of birth.",
  Tarot: "Card-based readings to reflect on questions about love, work and decisions.",
  Vastu: "Vastu Shastra: guidance on the layout and energy of homes and workplaces.",
  "Life Coaching": "Practical guidance and goal-setting for personal and career decisions.",
  Counseling: "Supportive one-to-one conversations on relationships and life choices (not medical or psychological therapy).",
};

/** The note for a skill; a skill the astrologer typed themselves has none yet. */
export const skillInfo = (skill: string): string | null => SKILL_INFO[skill] ?? null;

export const CUSTOM_SKILL_NOTE =
  "Your own skill — it is added to your profile once our team has reviewed your changes, like any other profile edit.";

export const SKILL_MAX_LENGTH = 30;
export const SKILLS_MAX = 12;
/** Letters, numbers, spaces and a few marks (& ' . / -) — the same rule the server applies. */
export const SKILL_PATTERN = /^[\p{L}\p{N} &'’./-]{2,30}$/u;

/** A tidy version of what was typed, or why it can't be used. */
export function checkCustomSkill(raw: string, existing: string[]): { skill: string } | { error: string } {
  const skill = raw.trim().replace(/\s+/g, " ");
  if (skill.length < 2) return { error: "Type the skill's name — at least 2 characters." };
  if (!SKILL_PATTERN.test(skill)) return { error: `Use letters, numbers and spaces only, up to ${SKILL_MAX_LENGTH} characters.` };
  if (existing.some((s) => s.toLowerCase() === skill.toLowerCase())) return { error: "That skill is already on your profile." };
  if (existing.length >= SKILLS_MAX) return { error: `You can list up to ${SKILLS_MAX} skills.` };
  return { skill };
}
