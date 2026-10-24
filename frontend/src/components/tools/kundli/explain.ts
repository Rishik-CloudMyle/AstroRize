// Plain-English help for every part of the Kundli result: what a chart or field is for and how to
// read it. Astrorize's own wording; short, practical, no predictions and no remedies.

import type { VargaCode } from "@/lib/astro";

export type ChartKey = VargaCode | "chalit" | "sun" | "moon" | "transit-lagna" | "transit-moon";

export const CHART_HELP: Record<ChartKey, { title: string; purpose: string; read: string }> = {
  D1: {
    title: "Rashi (D1) — the birth chart",
    purpose: "The main chart: where every planet was, sign by sign, when you were born.",
    read: "Start here. House 1 is the lagna (ascendant); each planet's house shows the area of life it works through, and its sign shows its style.",
  },
  chalit: {
    title: "Bhava Chalit",
    purpose: "The same planets placed by bhava (house span measured from the exact ascendant degree) instead of by sign.",
    read: "Compare it with D1: a planet that moves house here sits near a house edge, and many astrologers read its results from the Chalit house.",
  },
  sun: {
    title: "Surya chart (Sun as lagna)",
    purpose: "Your chart redrawn with the Sun's sign as house 1.",
    read: "Used alongside D1 for themes of self, father, authority and vitality: count houses from the Sun to see how other planets support it.",
  },
  moon: {
    title: "Chandra chart (Moon as lagna)",
    purpose: "Your chart redrawn with the Moon's sign as house 1.",
    read: "Indian astrology gives the Moon chart almost as much weight as D1, especially for the mind, emotions and day-to-day transits.",
  },
  "transit-lagna": {
    title: "Transit chart (from lagna)",
    purpose: "Where the planets are today, placed in the houses of your birth chart.",
    read: "Slow planets (Saturn, Jupiter, Rahu, Ketu) set the background for months or years; the Moon changes sign every two to three days.",
  },
  "transit-moon": {
    title: "Transit chart (from Moon)",
    purpose: "Today's planets counted from your Moon sign — the classical way to read gochara (transits).",
    read: "Daily and weekly horoscopes use this view. Saturn in the 12th, 1st or 2nd house here is Sade Sati.",
  },
  D2: { title: "Hora (D2)", purpose: "Wealth and resources.", read: "Only two signs are used (Leo for the Sun's hora, Cancer for the Moon's); see which planets gather in each." },
  D3: { title: "Drekkana (D3)", purpose: "Siblings, courage and initiative.", read: "Look at the 3rd house and Mars here for how you act on your own and relate to brothers and sisters." },
  D4: { title: "Chaturthamsa (D4)", purpose: "Home, property and settled fortune.", read: "The 4th house and its lord here add detail to questions about property and a stable home." },
  D7: { title: "Saptamsa (D7)", purpose: "Children and creativity.", read: "Jupiter and the 5th house in this chart are read for matters of children and what you create." },
  D9: {
    title: "Navamsa (D9)",
    purpose: "Marriage, inner strength and dharma — the most used chart after D1.",
    read: "A planet in a good sign here gains strength even if it looks weak in D1 (and the other way round). The 7th house speaks of the spouse.",
  },
  D10: { title: "Dasamsa (D10)", purpose: "Career, status and achievements.", read: "The 10th house, its lord and the Sun here are read for work and public standing." },
  D12: { title: "Dwadasamsa (D12)", purpose: "Parents and lineage.", read: "The 4th house (mother) and 9th house (father) of this chart are read for parents." },
  D16: { title: "Shodasamsa (D16)", purpose: "Vehicles, comforts and happiness.", read: "Venus and the 4th house here are read for comforts and conveyances." },
  D20: { title: "Vimsamsa (D20)", purpose: "Spiritual practice and devotion.", read: "Jupiter, Ketu and the 9th/12th houses here show inclinations towards worship and meditation." },
  D24: { title: "Chaturvimsamsa (D24)", purpose: "Learning, education and knowledge.", read: "Mercury, Jupiter and the 4th/5th houses here are read for studies." },
  D27: { title: "Bhamsa (D27)", purpose: "General strengths and weaknesses.", read: "Shows which planets carry innate strength; read together with D1 and D9." },
  D30: {
    title: "Trimsamsa (D30)",
    purpose: "Challenges and how you meet them.",
    read: "Uses five unequal parts ruled by Mars, Saturn, Jupiter, Mercury and Venus, so no in-chart degree is given (shown as —).",
  },
  D40: { title: "Khavedamsa (D40)", purpose: "Inherited tendencies from the mother's side.", read: "Read for auspicious and inauspicious effects carried through the maternal line." },
  D45: { title: "Akshavedamsa (D45)", purpose: "Character and the father's side.", read: "Read for conduct and inherited tendencies through the paternal line." },
  D60: {
    title: "Shashtiamsa (D60)",
    purpose: "Past karma; the finest division.",
    read: "Changes every couple of minutes of birth time, so trust it only with an exact, recorded birth time.",
  },
};

export const SECTION_HELP = {
  birth: "The details this chart is calculated from. Positions use the sidereal zodiac with the Lahiri ayanamsa (the Indian government standard).",
  panchang:
    "The five limbs of the Hindu calendar at the moment of birth. They describe the quality of the day and are used in naming, muhurta and compatibility.",
  tithi: "The lunar day: each 12° the Moon gains on the Sun. Shukla is the waxing half, Krishna the waning half.",
  vara: "The weekday. A Vedic day runs from sunrise to sunrise, so a birth before sunrise belongs to the previous weekday.",
  nakshatra: "The Moon's lunar mansion (one of 27). Its lord starts the Vimshottari dasha.",
  yoga: "One of 27 combinations of the Sun's and Moon's longitudes, describing the day's general tone.",
  karana: "Half of a tithi. There are 11 karanas; Vishti (Bhadra) is traditionally avoided for new beginnings.",
  avakhada:
    "A summary of qualities read from the Moon's sign and nakshatra. Several of these (varna, vashya, yoni, gana, nadi) are the same factors used in guna milan.",
  varna: "Temperament class of the Moon sign, used in the Varna koota of matching.",
  vashya: "The Moon sign's 'nature' group (human, quadruped, water, wild, insect), used in the Vashya koota.",
  yoni: "The animal symbol of the nakshatra, used in the Yoni koota for physical compatibility.",
  gana: "Deva, Manushya or Rakshasa — the nakshatra's temperament, used in the Gana koota.",
  nadi: "Adi, Madhya or Antya — the nakshatra's constitution type, used in the Nadi koota.",
  sign: "The Moon sign (rashi) and the planet that rules it.",
  charan: "Which quarter (pada) of the nakshatra the Moon is in.",
  tatva: "The element of the Moon sign: fire, earth, air or water.",
  nameAlphabet: "The traditional first syllable for a name, from the Moon's nakshatra pada.",
  paya: "The 'metal' of the birth, from the Moon's house counted from the lagna (1, 6, 11 gold; 2, 5, 9 silver; 3, 7, 10 copper; 4, 8, 12 iron).",
  yunja: "Which part of the nakshatra cycle (Adi, Madhya or Antya) the birth star belongs to.",
  planets:
    "Each planet's sign, exact degree, nakshatra and house. Status shows its dignity (exalted, own sign, friendly…) and combust means it is too close to the Sun to show its own strength fully.",
  vimshottari:
    "The 120-year cycle of planetary periods used for timing. Each mahadasha is split into nine antardashas; the running ones colour the present.",
  yogini: "A shorter 36-year cycle of eight yoginis, used by many astrologers as a cross-check on Vimshottari timing.",
  manglik:
    "Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house from the lagna or the Moon. Tradition lists several cancellations, and it is weighed together with the partner's chart.",
  kalsarpa: "All seven planets on one side of the Rahu–Ketu axis. It is named after the house Rahu occupies.",
  sadeSati:
    "Saturn's roughly seven-and-a-half-year passage through the 12th, 1st and 2nd signs from your Moon. Dhaiya is Saturn's 2½-year stay in the 4th or 8th from the Moon.",
  reading:
    "Short notes on single placements, written from the classical meanings of each planet, sign and house. A real reading weighs the whole chart together.",
} as const;
