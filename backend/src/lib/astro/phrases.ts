// Curated wording for the rule-based horoscope. Each line follows a classical gochara (transit)
// rule counted from the Moon sign, written as plain practical advice. Nothing here is random: the
// horoscope picks lines from the real sky (which house the Moon, Jupiter and Saturn occupy, the
// tithi, the Moon's nakshatra), so the same sign and date always read the same.

export type Tone = "favourable" | "mixed" | "careful";

export interface MoonHouseLines {
  theme: string;
  tone: Tone;
  /** One-sentence day readings; the Moon's nakshatra picks between them. */
  daily: string[];
  /** A second sentence giving the classical reason in plain words. */
  why: string;
}

/** The Moon's transit house counted from the Moon sign (1 = the Moon is in your own sign). */
export const MOON_HOUSE: Record<number, MoonHouseLines> = {
  1: {
    theme: "self and energy",
    tone: "favourable",
    daily: [
      "Your energy is up. Start the task you have been circling; momentum matters more than polish today.",
      "A good day to put yourself first for an hour — health, appearance or a personal plan gets easy traction.",
    ],
    why: "The Moon is in your own sign, which classically lifts mood and confidence.",
  },
  2: {
    theme: "money and speech",
    tone: "mixed",
    daily: [
      "Review a money decision before you commit — the second look will be the useful one.",
      "Choose your words with family carefully; a calm sentence saves a long discussion later.",
    ],
    why: "The Moon is in your 2nd house, of savings, food and speech, where it asks for restraint.",
  },
  3: {
    theme: "courage and communication",
    tone: "favourable",
    daily: [
      "Say the thing plainly. A short message or call lands better than a long explanation.",
      "Good day for initiative: send the pitch, make the short trip, ask the sibling or neighbour for help.",
    ],
    why: "The Moon is in your 3rd house, classically a strong place for effort and courage.",
  },
  4: {
    theme: "home and peace of mind",
    tone: "careful",
    daily: [
      "Home needs a little attention. Fix one small thing and the mood lifts.",
      "You may feel restless; keep plans simple and spend the evening somewhere comfortable.",
    ],
    why: "The Moon is in your 4th house, which classically stirs worry; comfort and routine settle it.",
  },
  5: {
    theme: "children, study and creativity",
    tone: "mixed",
    daily: [
      "Give a creative or study task your full attention, but avoid speculative money moves today.",
      "Time with children or a hobby repays you; keep big decisions for a clearer day.",
    ],
    why: "The Moon is in your 5th house, good for the mind's play but classically unsteady for risk.",
  },
  6: {
    theme: "work, health and routines",
    tone: "favourable",
    daily: [
      "Finish, don't perfect. Clear the pending work and the backlog stops weighing on you.",
      "A strong day to sort health routines, paperwork or a dispute — you have the upper hand.",
    ],
    why: "The Moon is in your 6th house, classically a winning position over obstacles.",
  },
  7: {
    theme: "partnership",
    tone: "favourable",
    daily: [
      "A partnership conversation goes well if you name what you need first.",
      "Good day for meetings, agreements and time with your spouse or a close partner.",
    ],
    why: "The Moon is in your 7th house, which classically brings good company and cooperation.",
  },
  8: {
    theme: "caution (Chandrashtama)",
    tone: "careful",
    daily: [
      "Go slow today: double-check travel, money and documents, and postpone anything you can.",
      "Energy dips; protect your sleep and avoid arguments — tomorrow is better for big steps.",
    ],
    why: "The Moon is in your 8th house (Chandrashtama), traditionally a day to avoid new ventures.",
  },
  9: {
    theme: "fortune and guidance",
    tone: "mixed",
    daily: [
      "Reach out to a mentor or teacher; a short call opens a door.",
      "A good day for prayer, reading or planning a trip — less so for pushing hard at work.",
    ],
    why: "The Moon is in your 9th house, of teachers and dharma, which favours reflection over haste.",
  },
  10: {
    theme: "career and recognition",
    tone: "favourable",
    daily: [
      "Your effort is noticed even if no one says so yet. Keep the pace on the main work.",
      "A strong day for career moves: present the work, ask for the responsibility, follow up.",
    ],
    why: "The Moon is in your 10th house, classically good for action and standing.",
  },
  11: {
    theme: "gains and friends",
    tone: "favourable",
    daily: [
      "A friend or network brings a useful lead. Share your idea early rather than refining it alone.",
      "One of the best days of the month for gains — collect what you are owed and ask for the yes.",
    ],
    why: "The Moon is in your 11th house, the classical house of gains and fulfilled wishes.",
  },
  12: {
    theme: "rest and expenses",
    tone: "careful",
    daily: [
      "Protect an hour for yourself; clarity comes in the quiet. Watch impulse spending.",
      "Keep the day light — rest, finish old work and avoid new commitments or loans.",
    ],
    why: "The Moon is in your 12th house, of expense and withdrawal, where it asks for rest.",
  },
};

/** Tithi groups (by number within the paksha, 1–15) and what each traditionally suits. */
export function tithiLine(number: number, paksha: "Shukla" | "Krishna", name: string): string {
  const label = `${paksha} ${name}`;
  if (number === 15) {
    return paksha === "Shukla"
      ? `It is Purnima, the full Moon: a day of completion — finish and celebrate rather than start.`
      : `It is Amavasya, the new Moon: a quiet day for rest, remembrance and planning, not for launches.`;
  }
  if (number === 11) return `It is ${label} (Ekadashi): keep food and plans simple; a good day for discipline.`;
  switch (number % 5) {
    case 1:
      return `The tithi is ${label}, a Nanda tithi — traditionally good for beginnings and celebrations.`;
    case 2:
      return `The tithi is ${label}, a Bhadra tithi — good for steady work, health and anything meant to last.`;
    case 3:
      return `The tithi is ${label}, a Jaya tithi — favoured for competitive tasks and overcoming obstacles.`;
    case 4:
      return `The tithi is ${label}, a Rikta tithi — better for clearing and finishing than for new beginnings.`;
    default:
      return `The tithi is ${label}, a Purna tithi — good for completing work and important commitments.`;
  }
}

/** Jupiter's transit from the Moon sign (gochara): supportive in 2, 5, 7, 9, 11. */
export const JUPITER_HOUSE: Record<number, string> = {
  1: "Jupiter in your own sign asks you to look after health and avoid overcommitting this year.",
  2: "Jupiter in your 2nd house supports savings and family matters through this period.",
  3: "Jupiter in your 3rd house asks for steady effort; results come from persistence, not luck.",
  4: "Jupiter in your 4th house can unsettle home life; keep property and family decisions unhurried.",
  5: "Jupiter in your 5th house favours children, study and good judgement through this period.",
  6: "Jupiter in your 6th house asks for care with health and debts; avoid lending.",
  7: "Jupiter in your 7th house supports marriage, partnerships and agreements through this period.",
  8: "Jupiter in your 8th house is a slower patch; keep risks small and paperwork tidy.",
  9: "Jupiter in your 9th house brings good fortune, travel and support from elders.",
  10: "Jupiter in your 10th house can bring changes at work; stay flexible rather than forcing it.",
  11: "Jupiter in your 11th house is one of the best placements for gains and wishes coming true.",
  12: "Jupiter in your 12th house raises expenses; spend on what matters, such as learning or charity.",
};

/** Saturn's transit from the Moon sign: favourable in 3, 6, 11; Sade Sati in 12, 1, 2; Ashtama in 8. */
export const SATURN_HOUSE: Record<number, string> = {
  1: "Saturn is over your Moon sign (the peak of Sade Sati): keep a disciplined routine and be patient with results.",
  2: "Saturn in your 2nd house (the last phase of Sade Sati) asks for care with money and words.",
  3: "Saturn in your 3rd house rewards hard work and gives staying power.",
  4: "Saturn in your 4th house (Ardhashtama) can bring pressure at home; keep calm and rest well.",
  5: "Saturn in your 5th house asks for patience with children and studies.",
  6: "Saturn in your 6th house is strong — steady effort wins against competition and illness.",
  7: "Saturn in your 7th house asks for patience and fairness in partnerships.",
  8: "Saturn in your 8th house (Ashtama Shani) calls for caution with health, travel and risk.",
  9: "Saturn in your 9th house can slow luck; rely on effort and the advice of elders.",
  10: "Saturn in your 10th house brings heavy responsibility at work that pays off over time.",
  11: "Saturn in your 11th house is one of its best placements — slow, solid gains.",
  12: "Saturn in your 12th house (the start of Sade Sati) asks you to control expenses and rest enough.",
};

/** Weekly opening line by the share of the week the Moon spends in good houses. */
export function weekOpening(goodDays: number, carefulDays: number): string {
  if (goodDays >= 5) return "A productive week with the Moon mostly in supportive houses for you.";
  if (carefulDays >= 3) return "A week to pace yourself: the Moon spends several days in your quieter houses.";
  if (goodDays >= 3) return "A balanced week — push on the good days and keep the slow ones light.";
  return "A mixed week; plan important things for the days marked good below.";
}
