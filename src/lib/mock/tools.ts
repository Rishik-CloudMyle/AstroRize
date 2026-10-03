import type { Tool } from "../types";

// Free tools from the prototype (logic.js → TOOLS).
// ⚠ Tool results below are mock content so the pages work end to end.
// The real calculations (ephemeris, panchang, matching) will come from the backend.
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
    description: "A short, practical reading for your Moon sign — for today or for the week ahead.",
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
    description: "Tithi, nakshatra, yoga, karana, sunrise, sunset and Rahu Kaal for any date.",
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
    art: "/assets/tools/daily.jpg",
    bg: "#fcf3e2",
    ink: "#5c5340",
    scrim: "rgba(252,243,226,.94)",
    description: "One short, specific thing to keep in mind today, based on your sign.",
  },
];

export async function getTools(): Promise<Tool[]> {
  return TOOLS;
}

export async function getTool(id: string): Promise<Tool | undefined> {
  return TOOLS.find((t) => t.id === id);
}

// ---------- Tool content ----------

export const KUNDLI_PLANETS = [
  { planet: "Sun", house: 10, sign: "Capricorn", deg: "12°14′" },
  { planet: "Moon", house: 4, sign: "Cancer", deg: "3°02′" },
  { planet: "Mars", house: 7, sign: "Libra", deg: "21°48′" },
  { planet: "Mercury", house: 11, sign: "Aquarius", deg: "8°31′" },
  { planet: "Jupiter", house: 2, sign: "Taurus", deg: "27°06′" },
];

export const ZODIAC_SIGNS = [
  { name: "Aries", hindi: "Mesha", today: "Start the task you have been circling; momentum matters more than polish today.", week: "A busy first half. Leave Thursday free for a conversation that needs patience." },
  { name: "Taurus", hindi: "Vrishabha", today: "Review a money decision before you commit — the second look will be the useful one.", week: "Steady progress at work. A family matter asks for a calm, specific answer." },
  { name: "Gemini", hindi: "Mithuna", today: "Say the thing plainly. A short message lands better than a long explanation.", week: "Good week for learning and short travel. Avoid promising two people the same day." },
  { name: "Cancer", hindi: "Karka", today: "Home needs a little attention. Fix one small thing and the mood lifts.", week: "Emotions run high mid-week; decisions made on Saturday will hold better." },
  { name: "Leo", hindi: "Simha", today: "Let someone else lead one meeting. You will see what you have been missing.", week: "Recognition arrives late in the week. Keep spending modest until then." },
  { name: "Virgo", hindi: "Kanya", today: "Finish, don't perfect. The draft is good enough to share.", week: "Health routines pay off. A colleague's request is worth saying yes to." },
  { name: "Libra", hindi: "Tula", today: "A partnership conversation goes well if you name what you need first.", week: "Balance work and rest deliberately; the weekend is better for big talks." },
  { name: "Scorpio", hindi: "Vrishchika", today: "Trust the quiet hunch, but check one fact before acting on it.", week: "Research and planning are favoured. Hold off on signing anything until Friday." },
  { name: "Sagittarius", hindi: "Dhanu", today: "Reach out to a mentor or teacher; a short call opens a door.", week: "Travel or study plans move forward. Watch impulsive purchases on Wednesday." },
  { name: "Capricorn", hindi: "Makara", today: "Your effort is noticed even if no one says so yet. Keep the pace.", week: "Career focus pays. Make time for one person who has been waiting on you." },
  { name: "Aquarius", hindi: "Kumbha", today: "A group plan needs your idea. Share it early rather than refining it alone.", week: "Friends and networks bring a useful lead. Sleep earlier mid-week." },
  { name: "Pisces", hindi: "Meena", today: "Protect an hour for yourself; clarity comes in the quiet.", week: "Creative work flows. Be precise with money and paperwork on Thursday." },
];

export const KOOTAS = [
  { name: "Varna", max: 1, about: "Spiritual compatibility" },
  { name: "Vashya", max: 2, about: "Mutual attraction" },
  { name: "Tara", max: 3, about: "Health and wellbeing" },
  { name: "Yoni", max: 4, about: "Physical compatibility" },
  { name: "Graha Maitri", max: 5, about: "Friendship of Moon signs" },
  { name: "Gana", max: 6, about: "Temperament" },
  { name: "Bhakoot", max: 7, about: "Family and finances" },
  { name: "Nadi", max: 8, about: "Health of progeny" },
];

export const TITHIS = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima / Amavasya"];
export const NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
export const YOGAS = ["Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Sukarma", "Dhriti", "Shoola", "Ganda", "Vriddhi", "Dhruva", "Siddhi", "Shiva", "Siddha", "Shubha", "Brahma"];
export const KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"];
/** Rahu Kaal by weekday (Sunday first), for a typical 6 am sunrise. */
export const RAHU_KAAL = ["4:30 pm – 6:00 pm", "7:30 am – 9:00 am", "3:00 pm – 4:30 pm", "12:00 pm – 1:30 pm", "1:30 pm – 3:00 pm", "10:30 am – 12:00 pm", "9:00 am – 10:30 am"];

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
