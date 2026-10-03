import type { LiveRoom } from "../types";

// Live rooms from the prototype (logic.js → liveRooms). A room has no price of its
// own: consults started from a room use the host astrologer's normal rate, so an
// astrologer's price is the same on every page.
const LIVE_ROOMS: LiveRoom[] = [
  {
    id: "sneha",
    astrologerId: "sneha",
    topic: "Tarot: career crossroads",
    viewers: 312,
    state: "private",
    thumb: "/assets/spotlight/spotlight-live.jpg",
    queue: { position: 2, waiting: 7, capacity: 20, eta: "~3–7 min" },
    poll: {
      question: "Which spread should I pull next?",
      options: [
        { label: "Past · present · future", pct: 52 },
        { label: "Career crossroads", pct: 33 },
        { label: "Yes / no card", pct: 15 },
      ],
    },
    chat: [
      { who: "Meghna", text: "the tower card scared me but this explanation helps" },
      { who: "Arvind", text: "watching from Kochi 👋" },
      { who: "Priya", text: "can you do a reading for job switch?" },
      { who: "Moderator", text: "Tap Consult now to start a private consultation." },
    ],
  },
  {
    id: "raghav",
    astrologerId: "raghav",
    topic: "Saturn transit Q&A",
    viewers: 846,
    state: "normal",
    thumb: "/assets/gallery/gallery-live.jpg",
    queue: { position: 4, waiting: 12, capacity: 20, eta: "~6–12 min" },
    poll: {
      question: "Which house should I read next?",
      options: [
        { label: "7th house — relationships", pct: 46 },
        { label: "10th house — career", pct: 31 },
        { label: "2nd house — money", pct: 23 },
      ],
    },
    chat: [
      { who: "Ananya", text: "pranam 🙏 can you look at 7th house next" },
      { who: "Ravi", text: "joined from Pune, listening" },
      { who: "Deepa", text: "the timing point was useful, thank you" },
      { who: "Karthik", text: "can I book a one-to-one after this?" },
      { who: "Moderator", text: "Yes — tap Consult now to start a private consultation." },
    ],
  },
  {
    id: "lalita",
    astrologerId: "lalita",
    topic: "Prashna hour",
    viewers: 204,
    state: "normal",
    thumb: "/assets/gallery/gallery-study.jpg",
    queue: { position: 6, waiting: 15, capacity: 20, eta: "~10–18 min" },
    poll: {
      question: "What should the next Prashna be about?",
      options: [
        { label: "Health of a parent", pct: 38 },
        { label: "Property purchase", pct: 41 },
        { label: "Travel abroad", pct: 21 },
      ],
    },
    chat: [
      { who: "Sourav", text: "namaskar didi 🙏" },
      { who: "Rina", text: "the clarity on timing was very helpful" },
      { who: "Moderator", text: "Tap Consult now to start a private consultation." },
    ],
  },
  {
    id: "arjun",
    astrologerId: "arjun",
    topic: "KP timing clinic",
    viewers: 97,
    state: "normal",
    thumb: "/assets/gallery/gallery-desk.jpg",
    queue: { position: 3, waiting: 5, capacity: 20, eta: "~4–9 min" },
    poll: {
      question: "Which decision should we time next?",
      options: [
        { label: "Job change", pct: 44 },
        { label: "Business launch", pct: 35 },
        { label: "Loan / investment", pct: 21 },
      ],
    },
    chat: [
      { who: "Nikhil", text: "sub-lord explanation was excellent" },
      { who: "Swati", text: "joined late, is there a recording?" },
      { who: "Moderator", text: "Tap Consult now to start a private consultation." },
    ],
  },
];

export async function getLiveRooms(): Promise<LiveRoom[]> {
  return LIVE_ROOMS;
}

/** The room /live opens when no room is chosen. */
const DEFAULT_ROOM = "raghav";

export async function getLiveRoom(id: string | undefined): Promise<LiveRoom> {
  return LIVE_ROOMS.find((r) => r.id === id) ?? LIVE_ROOMS.find((r) => r.id === DEFAULT_ROOM) ?? LIVE_ROOMS[0];
}
