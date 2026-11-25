// Stories & Blogs, taken from the prototype (Insights, part-a data.js). Behind small functions so the
// real articles can come from the API later without touching the pages.

export type BlogCategory = "Astrology" | "Career" | "Relationships" | "Vastu" | "Wellness" | "Spirituality";

export interface Article {
  slug: string;
  category: BlogCategory;
  title: string;
  blurb: string;
  /** Shown as written, e.g. "14 Aug 2026". */
  date: string;
  image: string;
  /** Paragraphs of the story. */
  body: string[];
}

export const BLOG_CATEGORIES: ("All" | BlogCategory)[] = ["All", "Astrology", "Career", "Relationships", "Vastu", "Wellness", "Spirituality"];

const NOTE =
  "Keep the decision on the table. A chart can time a conversation; it cannot replace a lawyer, a doctor, or the person you still need to call.";

const DRAFTS: Omit<Article, "body">[] = [
  { slug: "timing-a-resignation-without-rushing-the-chart", category: "Career", title: "Timing a resignation without rushing the chart", blurb: "A practical way to read dasha windows before you resign.", date: "14 Aug 2026", image: "/assets/gallery/gallery-desk.jpg" },
  { slug: "rented-flats-what-you-can-change", category: "Vastu", title: "Rented flats: what you can change, what you cannot", blurb: "Light, entrance and sleep direction — without buying a new house.", date: "12 Aug 2026", image: "/assets/gallery/gallery-courtyard.jpg" },
  { slug: "read-todays-panchang-in-two-minutes", category: "Astrology", title: "How to read today’s Panchang in two minutes", blurb: "Tithi, nakshatra and a single do-not-start window.", date: "11 Aug 2026", image: "/assets/spotlight/spotlight-panchang.jpg" },
  { slug: "synastry-without-scare-language", category: "Relationships", title: "Synastry without scare language", blurb: "What a match chart can and cannot tell a couple.", date: "9 Aug 2026", image: "/assets/gallery/gallery-study.jpg" },
  { slug: "a-three-card-day-spread", category: "Spirituality", title: "A three-card day spread that stays practical", blurb: "Situation, advice, next step — no fortune-telling theatrics.", date: "7 Aug 2026", image: "/assets/gallery/gallery-palm.jpg" },
  { slug: "name-numbers-after-a-legal-name-change", category: "Wellness", title: "Name numbers after a legal name change", blurb: "When the new spelling starts to matter, and when it does not.", date: "4 Aug 2026", image: "/assets/gallery/gallery-live.jpg" },
  { slug: "saturn-station-what-customers-asked", category: "Astrology", title: "Saturn station: what customers actually asked this week", blurb: "Career and property questions, not planetary panic.", date: "2 Aug 2026", image: "/assets/spotlight/spotlight-live.jpg" },
];

const ARTICLES: Article[] = DRAFTS.map((a) => ({ ...a, body: [a.blurb, NOTE] }));

export function getArticles(): Article[] {
  return ARTICLES;
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
