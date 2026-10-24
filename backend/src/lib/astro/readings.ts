// Plain-English readings for a Kundli: an ascendant summary and a short note for every graha by
// its sign and by its house. Our own wording, composed deterministically from the curated phrase
// library below (no randomness: the same chart always reads the same). Classical basis: the
// karakatva (significations) of grahas, bhavas and rashis in Brihat Parashara Hora Shastra
// chs. 3, 4 and 11, kept balanced and practical. House "tone" follows the classical groups:
// kendras 1, 4, 7, 10 and trikonas 1, 5, 9 support; upachayas 3, 6, 10, 11 favour natural
// malefics (they "grow" with effort); dusthanas 6, 8, 12 ask for patience. No predictions of
// death or illness, no remedies (client decision); readings point to an astrologer instead.

import type { GrahaKey } from "./constants.ts";
import type { Dignity } from "./dignity.ts";

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];

/** What each graha stands for, and how it tends to act. */
const GRAHA: Record<GrahaKey, { name: string; stands: string; nature: "benefic" | "malefic" | "node" | "luminary" }> = {
  sun: { name: "The Sun", stands: "your sense of self, confidence and the way you lead", nature: "luminary" },
  moon: { name: "The Moon", stands: "your feelings, comfort needs and everyday mood", nature: "luminary" },
  mars: { name: "Mars", stands: "your drive, courage and how you go after what you want", nature: "malefic" },
  mercury: { name: "Mercury", stands: "your thinking, speech, learning and practical skills", nature: "benefic" },
  jupiter: { name: "Jupiter", stands: "your wisdom, optimism, teachers and growth", nature: "benefic" },
  venus: { name: "Venus", stands: "your relationships, taste, comforts and sense of beauty", nature: "benefic" },
  saturn: { name: "Saturn", stands: "your discipline, patience, duties and long-term effort", nature: "malefic" },
  rahu: { name: "Rahu", stands: "your ambitions, appetite for the new and unconventional paths", nature: "node" },
  ketu: { name: "Ketu", stands: "your detachment, intuition and what comes to you naturally from the past", nature: "node" },
};

/** The life areas of each whole-sign house. */
const HOUSE: string[] = [
  "your personality, body and the way you meet the world",
  "family, savings, food and the way you speak",
  "courage, siblings, short journeys and your own efforts",
  "home, mother, inner peace and property",
  "creativity, children, study and romance",
  "work routines, health habits, service and handling competition",
  "partnerships, marriage and dealings with others",
  "change, shared resources, research and what lies beneath the surface",
  "higher learning, faith, teachers, long journeys and good fortune",
  "career, reputation and your public role",
  "gains, friendships, networks and long-held wishes",
  "rest, spending, foreign lands and the inner, spiritual life",
];

/** The style each sign gives to whatever sits in it. */
const SIGN: { name: string; style: string }[] = [
  { name: "Aries", style: "direct, quick and pioneering" },
  { name: "Taurus", style: "steady, patient and comfort-seeking" },
  { name: "Gemini", style: "curious, talkative and adaptable" },
  { name: "Cancer", style: "caring, protective and emotionally aware" },
  { name: "Leo", style: "warm, proud and generous" },
  { name: "Virgo", style: "careful, analytical and helpful" },
  { name: "Libra", style: "fair-minded, sociable and graceful" },
  { name: "Scorpio", style: "intense, private and determined" },
  { name: "Sagittarius", style: "optimistic, principled and freedom-loving" },
  { name: "Capricorn", style: "practical, ambitious and disciplined" },
  { name: "Aquarius", style: "independent, inventive and community-minded" },
  { name: "Pisces", style: "imaginative, gentle and intuitive" },
];

const DIGNITY_LINE: Record<Dignity, string> = {
  exalted: "It is exalted here — classically its strongest sign — so these qualities come out with ease.",
  moolatrikona: "This is its moolatrikona sign, where it works in a focused, dependable way.",
  own: "It sits in its own sign, comfortable and able to act on its own terms.",
  friend: "It is in a friendly sign, so it can express itself without much friction.",
  neutral: "It is in a neutral sign: results depend more on the rest of the chart.",
  enemy: "It is in a less comfortable sign, so its gifts may need more conscious effort to show.",
  debilitated: "It is debilitated here, classically its weakest sign; its themes tend to grow through effort and learning rather than coming easily.",
};

const KENDRA = new Set([1, 4, 7, 10]);
const TRIKONA = new Set([1, 5, 9]);
const UPACHAYA = new Set([3, 6, 10, 11]);
const DUSTHANA = new Set([6, 8, 12]);

/** The house tone line: classical group of the house, read for the kind of graha. */
function houseTone(key: GrahaKey, house: number): string {
  // The Sun is a mild natural malefic (thrives in upachayas, e.g. the 10th); the Moon a benefic.
  const nature = key === "sun" ? "malefic" : GRAHA[key].nature;
  if (nature === "malefic" || nature === "node") {
    if (UPACHAYA.has(house)) return "Classically a strong place for it: what it touches improves steadily with effort and time.";
    if (house === 8 || house === 12) return "This placement favours patience, inner work and careful planning over haste.";
    if (KENDRA.has(house) || TRIKONA.has(house)) return "It brings energy and seriousness to this area; channelled well it builds lasting strength.";
    return "It adds push to this area; steady, measured effort gets the best from it.";
  }
  if (KENDRA.has(house) || TRIKONA.has(house)) return "Classically a supportive placement: this area of life tends to receive its help.";
  if (house === 11 || house === 2) return "A helpful position for gains and resources when its gifts are used actively.";
  if (DUSTHANA.has(house)) return "Its help here works more quietly — through service, research or inner growth.";
  return "It lends its qualities to this area in a practical, everyday way.";
}

export interface PlanetReading {
  key: GrahaKey;
  /** "Mars in Capricorn" */
  signTitle: string;
  bySign: string;
  /** "Mars in the 3rd house" */
  houseTitle: string;
  byHouse: string;
}

export function planetReading(g: { key: GrahaKey; sign: { index: number }; house: number; dignity: Dignity | null; retrograde: boolean; combust: boolean | null }): PlanetReading {
  const info = GRAHA[g.key];
  const sign = SIGN[g.sign.index]!;
  const short = info.name.replace(/^The /, "");
  const bySign = [
    `${info.name} shows ${info.stands}. In ${sign.name} these come out in ${/^[aeiou]/.test(sign.style) ? "an" : "a"} ${sign.style} way.`,
    g.dignity ? DIGNITY_LINE[g.dignity] : "",
    g.retrograde && g.key !== "rahu" && g.key !== "ketu" ? "Being retrograde, it tends to work inwardly first — reviewing and revisiting before acting." : "",
    g.combust ? "It is close to the Sun (combust), so its themes often run through your own will and identity rather than standing alone." : "",
  ].filter(Boolean).join(" ");
  const byHouse = `${info.name} in the ${ORD[g.house - 1]} house links ${info.stands} with ${HOUSE[g.house - 1]}. ${houseTone(g.key, g.house)}`;
  return { key: g.key, signTitle: `${short} in ${sign.name}`, bySign, houseTitle: `${short} in the ${ORD[g.house - 1]} house`, byHouse };
}

/** The twelve lagna (ascendant) summaries. */
export const ASCENDANT_TEXT: string[] = [
  "An Aries ascendant gives a quick, energetic start to life: you tend to act first and refine later. Mars, the chart ruler, makes courage and independence central themes, and you do best with clear goals and room to lead.",
  "A Taurus ascendant brings a calm, steady presence. Venus, the chart ruler, gives an eye for quality, loyalty and comfort; you build slowly and keep what you build, and you value security and good company.",
  "A Gemini ascendant makes you curious and quick-witted. Mercury, the chart ruler, puts learning, conversation and variety at the centre; you adapt easily and enjoy keeping several interests going at once.",
  "A Cancer ascendant gives a caring, perceptive nature. The Moon, the chart ruler, makes home, family and emotional security important; you remember kindness and protect the people close to you.",
  "A Leo ascendant brings warmth and natural presence. The Sun, the chart ruler, puts self-expression, dignity and generosity at the centre; you like to lead from the front and lift others along the way.",
  "A Virgo ascendant gives a careful, practical mind. Mercury, the chart ruler, makes skill, detail and usefulness central; you notice what others miss and like to improve whatever you touch.",
  "A Libra ascendant brings charm and a strong sense of fairness. Venus, the chart ruler, makes relationships, balance and good taste important; you work well with people and prefer harmony to conflict.",
  "A Scorpio ascendant gives depth and determination. Mars, the chart ruler, adds intensity and staying power; you are private, perceptive and capable of real transformation when you commit to something.",
  "A Sagittarius ascendant brings optimism and a love of meaning. Jupiter, the chart ruler, puts learning, principles and travel at the centre; you are generous, frank and always looking at the bigger picture.",
  "A Capricorn ascendant gives a serious, capable approach to life. Saturn, the chart ruler, rewards patience and structure; you take responsibility early and your achievements tend to grow steadily with time.",
  "An Aquarius ascendant brings an independent, forward-looking outlook. Saturn, the chart ruler, here works through ideas, groups and causes; you value fairness and are drawn to doing things your own way.",
  "A Pisces ascendant gives a gentle, imaginative and compassionate nature. Jupiter, the chart ruler, adds faith and wisdom; you are intuitive, sensitive to atmosphere and often drawn to creative or spiritual pursuits.",
];

export interface KundliReading {
  ascendant: { sign: string; text: string };
  planets: PlanetReading[];
  /** Shown where readers might look for remedies (client decision: none on the website). */
  astrologerNote: string;
}

export function kundliReading(k: {
  lagna: { sign: { index: number; name: string } };
  grahas: { key: GrahaKey; sign: { index: number }; house: number; dignity: Dignity | null; retrograde: boolean; combust: boolean | null }[];
}): KundliReading {
  return {
    ascendant: { sign: k.lagna.sign.name, text: ASCENDANT_TEXT[k.lagna.sign.index]! },
    planets: k.grahas.map(planetReading),
    astrologerNote: "These notes describe single placements on their own. A full reading weighs the whole chart together — talk to an astrologer about this.",
  };
}
