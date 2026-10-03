import type { Astrologer } from "../types";

// Mock data copied from the prototype (part-b-website/logic.js → ASTROS).
// Replace the functions at the bottom with real API calls later.
const ASTROLOGERS: Astrologer[] = [
  {
    id: "raghav",
    slug: "pt-raghav-joshi",
    name: "Pt. Raghav Joshi",
    initials: "RJ",
    recognition: "premium",
    availability: "on",
    skills: ["Vedic", "Face Reading"],
    languages: ["Hindi", "English"],
    years: 18,
    rating: 4.9,
    consults: 1204,
    price: 28,
    was: 35,
    instant: 84,
    eta: null,
    about:
      "Eighteen years reading career and dharma charts for working professionals. Sessions stay practical — timing, not fear.",
    photo: "/assets/avatars/astro-raghav.jpg",
    ratingDistribution: [990, 168, 36, 8, 2],
    reviews: [
      {
        name: "A. Mehta",
        stars: 5,
        when: "11 Aug 2026",
        text: "Asked about a resignation window. He gave two dates and told me what not to decide this week. No scare language.",
      },
      {
        name: "R. Shah",
        stars: 5,
        when: "2 Aug 2026",
        text: "Clear on dasha vs transit. I came for a job offer and left with a sequence, not a slogan.",
      },
      {
        name: "S. Iyer",
        stars: 4,
        when: "24 Jul 2026",
        text: "Useful, a little brisk. The 12 minutes were enough for one decision.",
      },
    ],
  },
  {
    id: "meera",
    slug: "acharya-meera-iyer",
    name: "Acharya Meera Iyer",
    initials: "MI",
    recognition: "trusted",
    availability: "busy",
    skills: ["Nadi", "Counseling"],
    languages: ["Tamil", "English", "Hindi"],
    years: 14,
    rating: 4.8,
    consults: 860,
    price: 32,
    was: null,
    instant: 96,
    eta: "~6–12 min",
    about:
      "Relationship and family charts with a calm, specific style. She names what the chart can answer and what it cannot.",
    photo: "/assets/avatars/astro-meera.jpg",
    ratingDistribution: [666, 140, 40, 10, 4],
    reviews: [
      {
        name: "K. Rao",
        stars: 5,
        when: "8 Aug 2026",
        text: "Asked about a marriage delay. She named what the chart can answer and what it cannot.",
      },
      {
        name: "P. Nair",
        stars: 5,
        when: "29 Jul 2026",
        text: "Soft voice, firm boundaries. I did not leave more anxious than I arrived.",
      },
    ],
  },
  {
    id: "arjun",
    slug: "pandit-arjun-deshmukh",
    name: "Pandit Arjun Deshmukh",
    initials: "AD",
    recognition: "proven",
    availability: "on",
    skills: ["KP", "Timing"],
    languages: ["Marathi", "Hindi", "English"],
    years: 9,
    rating: 4.7,
    consults: 412,
    price: 22,
    was: 28,
    instant: 66,
    eta: null,
    about: "KP timings for money decisions. Speaks plainly. Offers Fixed Sessions of 15, 30, 45 or 60 minutes.",
    photo: "/assets/avatars/astro-arjun.jpg",
    ratingDistribution: [300, 80, 22, 7, 3],
    reviews: [
      {
        name: "D. Kulkarni",
        stars: 5,
        when: "6 Aug 2026",
        text: "Gave me a window for a property registration and explained why the week after was worse.",
      },
      { name: "M. Pawar", stars: 4, when: "21 Jul 2026", text: "Straightforward. No upsell into a longer package." },
    ],
  },
  {
    id: "sneha",
    slug: "sneha-ramanathan",
    name: "Sneha Ramanathan",
    initials: "SR",
    recognition: "rising",
    availability: "live",
    skills: ["Tarot", "Numerology"],
    languages: ["English", "Tamil"],
    years: 6,
    rating: 4.6,
    consults: 188,
    price: 18,
    was: 24,
    instant: 54,
    eta: "~3–7 min",
    about:
      "Tarot with a counselling background. Best for people who want language for a decision they have already half-made.",
    photo: "/assets/avatars/astro-ananya.jpg",
    ratingDistribution: [130, 38, 12, 5, 3],
    reviews: [
      { name: "T. George", stars: 5, when: "12 Aug 2026", text: "She asked better questions than I did. Worth the twelve minutes." },
    ],
  },
  {
    id: "vikram",
    slug: "vikram-sethi",
    name: "Vikram Sethi",
    initials: "VS",
    recognition: "fresh",
    availability: "off",
    skills: ["Vastu", "Palmistry"],
    languages: ["Hindi", "Punjabi"],
    years: 4,
    rating: null,
    consults: 24,
    price: 15,
    was: null,
    instant: 45,
    eta: null,
    about: "New on Astrorize. Vastu walkthroughs for homes and small commercial spaces.",
    photo: "/assets/avatars/astro-vikram.jpg",
    ratingDistribution: [16, 5, 2, 1, 0],
    reviews: [],
  },
  {
    id: "lalita",
    slug: "dr-lalita-bose",
    name: "Dr. Lalita Bose",
    initials: "LB",
    recognition: "premium",
    availability: "on",
    skills: ["Vedic", "Prashna"],
    languages: ["Bengali", "English", "Hindi"],
    years: 22,
    rating: 4.9,
    consults: 2140,
    price: 45,
    was: 60,
    instant: 135,
    eta: null,
    about: "Twenty-two years, mostly Prashna. Answers the question you actually asked, in the time you actually have.",
    photo: "/assets/avatars/astro-leela.jpg",
    ratingDistribution: [1800, 260, 58, 16, 6],
    reviews: [
      {
        name: "N. Banerjee",
        stars: 5,
        when: "9 Aug 2026",
        text: "Precise. She refused a question outside her scope instead of improvising.",
      },
    ],
  },
];

/** Total shown in marketing copy ("See all 247 astrologers"). */
export const TOTAL_ASTROLOGERS = 247;

export async function getAstrologers(): Promise<Astrologer[]> {
  return ASTROLOGERS;
}

export async function getAstrologerBySlug(slug: string): Promise<Astrologer | undefined> {
  return ASTROLOGERS.find((a) => a.slug === slug);
}

export async function getAstrologerById(id: string): Promise<Astrologer | undefined> {
  return ASTROLOGERS.find((a) => a.id === id);
}
