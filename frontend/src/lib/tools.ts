import type { Tool } from "./types";

// The free tools (from the prototype's logic.js → TOOLS): names, art and descriptions.
// Results come from AstroRize's astrology engine (/api/astro, see lib/astro.ts); numerology
// and tarot are worked out in the browser.
const TOOLS: Tool[] = [
  {
    id: "kundli",
    name: "Kundli",
    sub: "Birth chart",
    art: "/assets/tools/kundli.jpg",
    bg: "#fcf4e4",
    ink: "#6b4a1e",
    scrim: "rgba(252,244,228,.94)",
    description: "Your Vedic birth chart in North or South Indian style, with planet positions by house, sign and degree.",
  },
  {
    id: "horoscope",
    name: "Horoscope",
    sub: "Daily & weekly",
    art: "/assets/tools/horoscope.jpg",
    bg: "#1e2a5a",
    ink: "#fffdf8",
    scrim: "rgba(20,28,64,.88)",
    description: "A short, practical reading for your Moon sign from the real planetary transits — for today or the week ahead.",
  },
  {
    id: "matchmaking",
    name: "Matchmaking",
    sub: "Guna milan",
    art: "/assets/tools/matchmaking.jpg",
    bg: "#ffe8f2",
    ink: "#9d174d",
    scrim: "rgba(255,232,242,.94)",
    description: "Ashtakoota guna milan for two people: the score out of 36 and what each koota measures.",
  },
  {
    id: "panchang",
    name: "Panchang",
    sub: "Today's timings",
    art: "/assets/tools/panchang.jpg",
    bg: "#ecf6e8",
    ink: "#3f5f3a",
    scrim: "rgba(240,246,234,.94)",
    description: "Tithi, nakshatra, yoga, karana, sunrise, sunset and Rahu Kaal for any date and place.",
  },
  {
    id: "numerology",
    name: "Numerology",
    sub: "Name & number",
    art: "/assets/tools/numerology.jpg",
    bg: "#3b2461",
    ink: "#fffdf8",
    scrim: "rgba(48,28,82,.88)",
    description: "Your life path number from your date of birth and your destiny number from your full name.",
  },
  {
    id: "tarot",
    name: "Tarot",
    sub: "Three-card pull",
    art: "/assets/tools/tarot.jpg",
    bg: "#faf0dc",
    ink: "#6b4a1e",
    scrim: "rgba(250,240,220,.94)",
    description: "Hold a question in mind and draw three cards: past, present and what comes next.",
  },
  {
    id: "daily",
    name: "Daily insight",
    sub: "One thing today",
    art: "/assets/tools/daily-mountains.jpg",
    bg: "#fcf3e2",
    ink: "#5c5340",
    scrim: "rgba(252,243,226,.94)",
    description: "One short, specific thing to keep in mind today, from the day's transits for your Moon sign.",
  },
];

/** One line on what each tool gives you, for the tool cards on /free-tools. */
export const TOOL_BENEFITS: Record<string, string> = {
  kundli: "Your birth chart, planets, houses and dasha, saved to your account.",
  horoscope: "Today or the week ahead for your Moon sign, from real transits.",
  matchmaking: "Guna milan out of 36, with Mangal dosha for both.",
  panchang: "Tithi, nakshatra, sunrise and Rahu Kaal for any place.",
  numerology: "Your life path and destiny numbers, and what they mean.",
  tarot: "Three cards for one question: past, present and next.",
  daily: "One short, specific thing to keep in mind today.",
};

export async function getTools(): Promise<Tool[]> {
  return TOOLS;
}

export async function getTool(id: string): Promise<Tool | undefined> {
  return TOOLS.find((t) => t.id === id);
}

// ---------- Content the tools read from ----------

export const NUMBER_MEANINGS: Record<number, string> = {
  1: "The initiator — independent, direct, at your best when you start things.",
  2: "The diplomat — patient and perceptive, strongest in partnership.",
  3: "The communicator — expressive and social; words are your tool.",
  4: "The builder — steady, practical, trusted to finish what others start.",
  5: "The explorer — adaptable and curious; change keeps you sharp.",
  6: "The caretaker — responsible and warm; people lean on you.",
  7: "The seeker — analytical and inward; you need time alone to think.",
  8: "The executive — ambitious and organised; money and authority come naturally.",
  9: "The humanitarian — generous and idealistic; you think in big circles.",
  11: "Master number 11 — intuitive and inspiring, with high sensitivity to manage.",
  22: "Master number 22 — the master builder; large plans made practical.",
  33: "Master number 33 — the teacher; service and compassion at scale.",
};

/** The 22 cards of the Major Arcana; a draw picks three at random (see the Tarot tool). */
export const TAROT_CARDS = [
  { name: "The Fool", meaning: "A fresh start; step forward before you feel fully ready." },
  { name: "The Magician", meaning: "You already have the tools. Use them deliberately." },
  { name: "The High Priestess", meaning: "Listen to what you know but haven't said aloud." },
  { name: "The Empress", meaning: "Growth through care — nurture the thing, don't force it." },
  { name: "The Emperor", meaning: "Structure helps now. Set the rule and keep it." },
  { name: "The Hierophant", meaning: "Tradition or a mentor holds the answer you need." },
  { name: "The Lovers", meaning: "A choice that reflects your values, not only your wants." },
  { name: "The Chariot", meaning: "Direction and willpower; pick one road and drive." },
  { name: "Strength", meaning: "Gentle persistence beats force in this situation." },
  { name: "The Hermit", meaning: "Step back and think. Solitude brings the clear view." },
  { name: "Wheel of Fortune", meaning: "A cycle is turning. Adapt rather than resist." },
  { name: "Justice", meaning: "Fairness and consequence; be honest about your part." },
  { name: "The Hanged Man", meaning: "Pause. A new angle matters more than new effort." },
  { name: "Death", meaning: "An ending that clears space — not a loss, a transition." },
  { name: "Temperance", meaning: "Moderation and blending; the middle path works." },
  { name: "The Devil", meaning: "Notice what is holding you by habit, not by need." },
  { name: "The Tower", meaning: "A sudden shake-up that reveals what was unstable." },
  { name: "The Star", meaning: "Hope and healing; trust the slow recovery." },
  { name: "The Moon", meaning: "Not everything is visible yet. Wait for clarity." },
  { name: "The Sun", meaning: "Warmth, success and confidence. Say yes." },
  { name: "Judgement", meaning: "A calling or reckoning — answer it honestly." },
  { name: "The World", meaning: "Completion. Close this chapter with gratitude." },
];
