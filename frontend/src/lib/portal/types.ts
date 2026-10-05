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
}

// ── Dashboard ──
export interface ScheduleItem {
  time: string;
  what: string;
  kind: "open" | "booked" | "live";
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
export interface IncomingRequest {
  id: string;
  alias: string;
  mode: string;
  /** Instant Call / Emergency request (charged at the multiplier rate) */
  instant: boolean;
  windowSecs: number;
  remainingSecs: number;
  /** Per-minute rate snapshotted when the customer asked (₹) */
  rate: number;
}

export interface QueueEntry {
  id: string;
  alias: string;
  mode: string;
  waiting: string;
}

export interface ActiveSession {
  id: string;
  alias: string;
  elapsed: string;
  elapsedSeconds: number;
  lowBalance: boolean;
}

export interface Consultations {
  incoming: IncomingRequest | null;
  queue: QueueEntry[];
  queueMax: number;
  session: ActiveSession | null;
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
}

// ── Live ──
export interface LiveRequest {
  id: string;
  alias: string;
  kind: "private" | "stage";
  actionable: boolean;
}

export interface LiveRoom {
  id: string;
  isLive: boolean;
  elapsed: string;
  viewers: number;
  image: string;
  requests: LiveRequest[];
  waiting: number;
  pollQuestion: string;
  pollOptions: string[];
  /** Consults from the room are charged at the standard rate (₹/min) */
  rate: number;
}

// ── Messages ──
export interface ChatMessage {
  /** "blocked" = the notice shown when a message contained contact details */
  from: "customer" | "me" | "blocked";
  text: string;
}

export interface Thread {
  id: string;
  alias: string;
  preview: string;
  messages: ChatMessage[];
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
  videoRenewalDays: number;
  publicProfileUrl: string;
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
