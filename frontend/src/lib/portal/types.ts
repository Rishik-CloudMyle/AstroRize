// Shapes of the data the portal shows, as returned by the Astrorize Node API
// (backend/src/routes/portal.ts, GET /api/portal/*).

/** The signed-in astrologer. */
export interface Astrologer {
  id: string;
  slug: string;
  name: string;
  initials: string;
  greeting: string;
  photo: string;
  skills: string[];
  years: number;
  rating: number | null;
  consults: number;
  /** Standard per-minute rate (chat and voice), ₹ */
  price: number;
  /** Pre-discount rate shown struck through, ₹ */
  was: number | null;
  /** Instant Call / Emergency multiplier of the standard rate */
  instantMultiplier: number;
  bio: string;
}

/** Application lifecycle after submission (drives the status banner). */
export type LifecycleKey =
  | "draft"
  | "review"
  | "interview"
  | "docs"
  | "negotiation"
  | "pricing"
  | "training"
  | "active"
  | "rejected";

export type SuspensionScope = "none" | "partial" | "full";

export interface AccountStatus {
  lifecycle: LifecycleKey;
  suspension: SuspensionScope;
  /** "8 Oct 2026": when the application first went to HR (null while it is a draft) */
  submittedOn?: string | null;
  /** HR's latest note: what they need (docs) or why it was not approved (rejected) */
  note?: string | null;
  /** Days HR aims to review an application in */
  reviewDays?: number;
}

export interface LifecycleStage {
  key: LifecycleKey;
  label: string;
  icon: string;
  bg: string;
  border: string;
  fg: string;
  title: string;
  body: string;
}

export interface Banner {
  icon: string;
  title: string;
  body: string;
  bg: string;
  border: string;
  fg: string;
}

export interface NavCounts {
  consultations: number;
  messages: number;
  compliance: number;
}

export interface Account {
  astrologer: Astrologer;
  status: AccountStatus;
  counts: NavCounts;
  /** Taking requests right now (presence is not OFF) */
  online: boolean;
  /** available · in a consultation · hosting a live room · offline */
  presence: Presence;
}

export type Presence = "on" | "busy" | "live" | "off";

// ── Dashboard ──
export interface ScheduleItem {
  /** The availability slot, or null for the live room row. */
  id: string | null;
  time: string;
  what: string;
  kind: "open" | "booked" | "live";
  /** Who booked it (booked slots only). */
  customer: ThreadCustomer | null;
}

export interface TrainingItem {
  label: string;
  done: boolean;
  due: string;
}

export interface Review {
  stars: number;
  when: string;
  text: string;
}

export interface Dashboard {
  dateLine: string;
  todayEarnings: number;
  earningsDelta: string;
  sessions: number;
  emergencySessions: number;
  gifts: number;
  schedule: ScheduleItem[];
  /** Last 10 days, each bar a % of the best day */
  earningsBars: number[];
  /** "26 Sep" / "5 Oct": first and last day of the bars */
  earningsFrom: string;
  earningsTo: string;
  training: TrainingItem[];
  reviews: Review[];
  multiplierOptions: number[];
  /** Welcome campaign: free calls taken today and how many are left */
  freeCalls: FreeCalls;
}

/** Welcome-campaign free calls for today (IST). */
export interface FreeCalls {
  /** Taking part (set by Astrorize HR) and the campaign is on */
  enabled: boolean;
  limit: number;
  today: number;
  remaining: number;
}

// ── Application wizard ──
export type ChipTone = "ok" | "info" | "bad";

export interface WizardField {
  label: string;
  value: string;
  chip?: string;
  /** Field box shown in the error style (rejected file, missing declaration) */
  error?: boolean;
  /** Fixed value the astrologer cannot type over */
  readOnly?: boolean;
  /** Hint shown in an empty typable field */
  placeholder?: string;
  /** A declaration ticked with a checkbox (value "yes" when ticked) instead of typed */
  check?: boolean;
}

export interface WizardStep {
  short: string;
  title: string;
  blurb: string;
  fields: WizardField[];
  note: string;
  /** Data-entry step (typable) rather than upload/verification status */
  typable: boolean;
}

/** What the platform already knows about the astrologer, used to pre-fill the wizard. */
export interface ApplicationKnown {
  phone: string | null;
  email: string | null;
  languages: string[];
  years: number;
  skills: string[];
  price: number;
  videoRate: number;
}

/** GET /portal/application: the saved draft. The wizard's steps are built in lib/portal/application-steps.ts. */
export interface ApplicationDraft {
  currentStep: number;
  /** Field edits keyed "step-field", e.g. { "1-0": "Raghav Joshi" } */
  values: Record<string, string>;
  lastSaved: string;
  known: ApplicationKnown;
  /** What still stops the application going to HR (empty = ready to submit) */
  missing: ApplicationMissing[];
  /** False once it is with HR (it opens again only when HR asks for more information) */
  editable: boolean;
  /** "8 Oct 2026", or null while it is a draft */
  submittedOn: string | null;
  /** HR's latest note (what they need, or why it was not approved) */
  note: string | null;
}

export interface ApplicationMissing {
  /** 0-based wizard step */
  step: number;
  label: string;
}

// ── Availability ──
export type SlotState = "open" | "booked" | "cancelled";

export interface Slot {
  id: string;
  /** "Mon 14" */
  day: string;
  /** YYYY-MM-DD (IST) */
  date: string;
  start: string;
  end: string;
  state: SlotState;
  detail?: string | null;
  /** Real name of whoever booked it (booked slots only). */
  customerName?: string | null;
}

export interface Availability {
  weekLabel: string;
  days: string[];
  /** YYYY-MM-DD for each entry in `days` */
  dayKeys: string[];
  today: string;
  hours: string[];
  slots: Slot[];
  bookedDetail: string;
}

// ── Consultations ──
/** A customer's profile summary on a consultation request. Null when the request has no linked profile. */
export interface ConsultCustomer extends LiveQueueSummary {
  gender: string | null;
  city: string | null;
}

export interface IncomingRequest {
  id: string;
  alias: string;
  /** "Chat" | "Voice" | "Video" | "Instant Call" */
  mode: string;
  /** Instant Call / Emergency request (charged at the multiplier rate) */
  instant: boolean;
  /** A customer's welcome free call: the free time earns nothing, paid minutes after it earn as usual */
  free: boolean;
  windowSecs: number;
  remainingSecs: number;
  /** Per-minute rate snapshotted when the customer asked (₹) */
  rate: number;
  profile: ConsultCustomer | null;
}

export interface QueueEntry {
  id: string;
  alias: string;
  mode: string;
  instant: boolean;
  free: boolean;
  rate: number;
  /** "12 min", or "under a minute" */
  waiting: string;
  profile: ConsultCustomer | null;
}

export interface ActiveSession {
  id: string;
  alias: string;
  mode: string;
  /** The session window to open: chat, voice, or video (Instant Call is a video call) */
  window: "chat" | "voice" | "video";
  instant: boolean;
  /** A customer's welcome free call: its first freeSeconds earn nothing */
  free: boolean;
  freeSeconds: number;
  elapsed: string;
  elapsedSeconds: number;
  lowBalance: boolean;
  profile: ConsultCustomer | null;
}

export interface Consultations {
  incoming: IncomingRequest | null;
  queue: QueueEntry[];
  queueMax: number;
  session: ActiveSession | null;
  freeCalls: FreeCalls;
}

/** GET /portal/consultations/:id/profile — everything the customer shared. */
export interface ConsultPersonDetail {
  id: string;
  alias: string;
  mode: string;
  instant: boolean;
  free: boolean;
  rate: number;
  status: "waiting" | "active";
  waiting: string;
  profile: LiveQueueProfile | null;
}

/** POST /portal/consultations/:id/end */
export interface Settlement {
  elapsed: number;
  billedMins: number;
  rate: number;
  total: number;
  promo: number;
  service: number;
  reason: string;
  complimentary: boolean;
  complimentarySeconds: number;
}

// ── Live ──
export interface LiveRequest {
  id: string;
  alias: string;
  /** The customer's real name; null only for a request without an account behind it. */
  name: string | null;
  /** Consults from a live are always private. */
  kind: "private";
  /** How they asked to be consulted, and the rate locked for it (₹/min). */
  consultMode: "chat" | "voice" | "video";
  rate: number;
  /** Can be declined (the first two). */
  actionable: boolean;
  /** Can be accepted: the front of the queue, while no private consultation is in progress. */
  canAccept: boolean;
}

/** The private consultation in progress in the astrologer's live (server clock). */
export interface LiveHostPrivate {
  id: string;
  ref: string;
  /** connecting: accepted, waiting for the customer to join · active: in session */
  status: "connecting" | "active";
  mode: "chat" | "voice" | "video";
  /** The window it opens in (same as a direct consultation in that mode). */
  window: "chat" | "voice" | "video";
  rate: number;
  held: number;
  connectedAt: string | null;
  elapsedSeconds: number;
  freeSeconds: number;
  maxSeconds: number;
  secondsToAnswer: number | null;
  answerWindow: number;
  alias: string;
  profile: LiveQueueSummary | null;
}

export interface LiveRoom {
  id: string;
  isLive: boolean;
  /** This live's details (when not live: the last ones used, to pre-fill "Go live"). Title is "" if never set. */
  title: string;
  topic: string;
  category: string | null;
  language: string | null;
  durationMins: number | null;
  /** ISO start of the current (or last) live session */
  startedAt: string;
  /** What category and language may be set to */
  categories: string[];
  languages: string[];
  elapsed: string;
  viewers: number;
  image: string;
  requests: LiveRequest[];
  waiting: number;
  pollQuestion: string;
  pollOptions: string[];
  /** Consults from the room are charged at the standard rate (₹/min) */
  rate: number;
  /** A private consultation from the room in each mode (₹/min): video carries the video premium. */
  rates: { chat: number; voice: number; video: number };
  /** The private consultation in progress, or null. */
  private: LiveHostPrivate | null;
  /** Newest first. */
  announcements: LiveAnnouncement[];
  /** Everyone waiting, oldest first. */
  queue: LiveQueuePerson[];
}

export interface LiveAnnouncement {
  id: string;
  text: string;
  /** "09:38" IST */
  at: string;
  /** "8 Oct" */
  date: string;
}

/** A queued customer's profile summary. Null when the person hasn't shared a profile. */
export interface LiveQueueSummary {
  name: string;
  initials: string;
  photoUrl: string | null;
  age: number | null;
}

export interface LiveQueuePerson {
  id: string;
  alias: string;
  mode: "private" | "public";
  consultMode: "chat" | "voice" | "video";
  /** "12 min" */
  waiting: string;
  profile: LiveQueueSummary | null;
}

/** "See more": everything the customer shared. Null fields were not shared. */
export interface LiveQueueProfile extends LiveQueueSummary {
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  /** "14 May 1994" */
  birthDate: string | null;
  /** "06:42" (24-hour) */
  birthTime: string | null;
  birthPlace: string | null;
  city: string | null;
  state: string | null;
}

export interface LiveQueueDetail {
  id: string;
  alias: string;
  mode: "private" | "public";
  status: "waiting" | "accepted";
  waiting: string;
  profile: LiveQueueProfile | null;
}

// ── Messages ──
export interface ChatMessage {
  id: string;
  /** "blocked" = the notice shown when a message contained contact details */
  from: "customer" | "me" | "blocked";
  text: string;
  /** ISO time it was sent */
  at: string;
}

/** The customer in a conversation: real name, photo or initials, and "32 · Pune". */
export interface ThreadCustomer extends LiveQueueSummary {
  line: string;
}

export interface CustomerThread {
  kind: "customer";
  id: string;
  /** Older conversations may not be linked to a customer account; only then is the alias shown. */
  alias: string;
  customer: ThreadCustomer | null;
  preview: string;
  lastAt: string | null;
  /** The customer wrote last. */
  awaitingReply: boolean;
  /** Customer messages since the astrologer last opened this conversation. */
  unread: number;
  messages: ChatMessage[];
}

/** A message in a conversation the Astrorize team started. */
export interface TeamMessage {
  id: string;
  from: "me" | "team";
  /** "Neha Gupta · Finance"; null for my own messages. */
  author: string | null;
  text: string;
  at: string;
}

/** A conversation the Astrorize team started with the astrologer (same list as customer threads). */
export interface TeamThread {
  kind: "team";
  id: string;
  /** "Astrorize team · Neha Gupta (Finance)" */
  title: string;
  subject: string | null;
  preview: string;
  lastAt: string;
  lastFromMe: boolean;
  /** Messages from the team the astrologer hasn't opened yet. */
  unread: number;
  messages: TeamMessage[];
}

export type Thread = CustomerThread | TeamThread;

/** GET /portal/messages/:threadId/customer */
/** A booked slot and the customer who booked it (GET /portal/schedule/:slotId). */
export interface BookingDetail extends ThreadCustomerDetail {
  slot: { date: string; start: string; end: string; detail: string };
}

export interface ThreadCustomerDetail {
  alias: string;
  profile: LiveQueueProfile;
  history: { consultations: number; lastConsultation: string | null };
}

// ── Earnings ──
export interface StatementRow {
  date: string;
  session: string;
  kind: "voice" | "chat" | "video" | "emergency" | "welcome" | "adjustment";
  mode: string;
  minutes: number;
  gifts: number;
  /** Your gross for the row (₹), worked out by the API from your rates */
  amount: number;
}

export interface Earnings {
  periodLabel: string;
  periods: string[];
  periodIndex: number;
  gross: number;
  gifts: number;
  tdsRate: number;
  nextPayout: string;
  payoutPaused: boolean;
  statement: StatementRow[];
}

// ── Profile ──
export interface ProfileData {
  pendingChanges: number;
  skillPool: string[];
  /** The intro video on the public profile, or null */
  introVideoUrl: string | null;
  video: { maxMb: number; maxSeconds: number };
  /** null until the astrologer is approved and listed on the site. */
  publicProfileUrl: string | null;
  published: { bio: string; skills: string[] };
  /** The latest submission waiting for moderation, if any */
  draft: { bio: string; skills: string[] } | null;
}

// ── Compliance ──
export interface CaseStep {
  label: string;
  when: string;
  reached: boolean;
}

export type Permission = "yes" | "no" | "read";

export interface ScopeRow {
  state: string;
  newSessions: Permission;
  goLive: Permission;
  earnings: Permission;
  respond: Permission;
}

export type NoticeStatus = "OPEN" | "RESPONDED" | "DECIDED";

export interface ComplianceNotice {
  id: string;
  category: string;
  respondIn: string;
  summary: string;
  status: NoticeStatus;
  response: string | null;
}

export interface Compliance {
  notice: ComplianceNotice | null;
  steps: CaseStep[];
  scopes: ScopeRow[];
  reapplyInDays: number;
}
