// Shared types for the admin console. lib/admin/api.ts turns the Node API's answers
// into these view shapes (adding the prototype's colours), so the pages stay presentational.

export type Role = "super" | "finance" | "support" | "compliance" | "marketing";

/** One key per console page; CAPS decides which keys a role may open. */
export type PageKey =
  | "overview"
  | "messages"
  | "config"
  | "hr"
  | "marketing"
  | "finance"
  | "support"
  | "compliance"
  | "trust"
  | "rbac"
  | "audit"
  | "recording"
  | "team";

export type Environment = "production" | "staging" | "sandbox";

export interface AdminSession {
  /** User id. Separation-of-duties checks compare ids: several people can share a department and a short name. */
  id: string;
  name: string;
  initials: string;
  /** Short name written into audit entries and toasts, e.g. "K. Prasad". */
  actor: string;
  role: Role;
  /** Pages this department may open (the API's access matrix: defaults + the Super Admin's changes). */
  pages: PageKey[];
  /** Capabilities this department has, e.g. "campaign.approve" (same matrix). */
  capabilities: string[];
  /** Open-work counts for the nav badges. */
  counts: Partial<Record<PageKey, number>>;
}

export interface NavItem {
  key: PageKey;
  label: string;
  icon: string;
  href: string;
  /** Open-work count shown as an orange badge. */
  count?: number;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// ── Overview ──
export interface Kpi {
  label: string;
  value: string;
  sub: string;
  fg: string;
  subFg: string;
  border: string;
}

export interface LiveStat {
  label: string;
  value: number;
  sub: string;
  color: string;
}

export interface SeriesPoint {
  value: number;
  label: string;
}

export interface TrendCard {
  title: string;
  window: string;
  headline: string;
  /** What the headline is, e.g. "in 30 days". */
  headlineNote?: string;
  delta: string;
  /** Colour of the delta: up is good for every series on the overview. */
  deltaTone?: "up" | "down" | "flat";
  color: string;
  ariaLabel: string;
  points: SeriesPoint[];
  topLabel: string;
  bottomLabel: string;
}

export interface ChannelDay {
  /** Short label, e.g. "08". */
  day: string;
  /** Full label for the read-out and table, e.g. "Thu 8 Oct". */
  date: string;
  chat: number;
  voice: number;
  video: number;
  instant: number;
}

export interface AvailabilitySlice {
  label: string;
  count: number;
  color: string;
}

export interface WorkItem {
  ico: string;
  title: string;
  sub: string;
  age: string;
  ageFg: string;
  icoBg: string;
  icoFg: string;
  bg: string;
  border: string;
  href: string;
}

export interface RecentAction {
  time: string;
  action: string;
  who: string;
  object: string;
  breakGlass: boolean;
}

export interface TopAstrologer {
  id: string;
  name: string;
  consultations: number;
  revenue: number;
}

export interface OverviewData {
  dateLine: string;
  /** ISO time the API computed these numbers. */
  generatedAt: string;
  kpis: Kpi[];
  /** Last 7 days against the 7 days before, from the database. */
  weekKpis: Kpi[];
  live: LiveStat[];
  trends: { card: TrendCard; id: string }[];
  channels: ChannelDay[];
  top: TopAstrologer[];
  availability: AvailabilitySlice[];
  registered: number;
  trialBalance: { title: string; body: string } | null;
  worklist: WorkItem[];
  recentAudit: RecentAction[];
}

// ── Config ──
export type ConfigDomain =
  "finance" | "consult" | "live" | "compliance" | "support" | "trust" | "marketing" | "hr" | "recording" | "rbac";

export interface ConfigKey {
  key: string;
  /** Flagged keys need dual control and step-up MFA. */
  flagged: boolean;
  description: string;
  current: string;
  scope: "global" | "country" | "segment";
  bounds: string;
  dryRun: string;
  domain: ConfigDomain;
  version: number;
  /** The bounds parsed by the API; null when the key's range is malformed (it can't be drafted). */
  range: { min: number; max: number; integer: boolean; decimals: number } | null;
  /** A change to this key is waiting for a second approver. */
  pending: boolean;
  /** When the live value last changed: "2 Aug 2026", and the ISO timestamp for sorting. */
  changed: string;
  changedAt: string;
}

export interface ConfigData {
  keys: ConfigKey[];
  facets: { id: ConfigDomain | "all"; label: string }[];
}

/** One key's versions and its pending change, from GET /admin/config/:key. */
export interface ConfigDetail {
  key: string;
  version: number;
  since: string;
  pending: {
    id: string;
    toValue: string;
    draftedBy: string;
    draftedById: string | null;
    effective: string | null;
  } | null;
  history: { version: number | null; value: string; draftedBy: string; approvedBy: string; when: string }[];
}

// ── Astrologer lifecycle ──
export type ApplicationState = "Negotiation" | "Under review" | "Docs pending" | "Interview" | "Pricing" | "Training";

export interface Application {
  id: string;
  name: string;
  skill: string;
  state: ApplicationState;
  age: string;
  breach: boolean;
  /** ISO timestamp, for sorting. */
  submittedAt: string;
  /** Record version; every action quotes it so a stale screen can't overwrite a newer change. */
  version: number;
  /** Sent by the astrologer from the portal: stages show on their account and it can be activated. */
  fromPortal: boolean;
}

export interface NegotiationRow {
  mode: string;
  requested: string;
  proposed: string;
}

export interface LifecycleData {
  filters: { label: string; count: number }[];
  applications: Application[];
  negotiation: {
    appId: string;
    applicant: string;
    version: number;
    rows: NegotiationRow[];
    round: number;
    maxRounds: number;
  } | null;
  pricing: { effective: string; mode: string; version: string };
}

/** Lifecycle stage keys of an astrologer account (the Astrologer model's `lifecycle`). */
export type AstrologerStage =
  "draft" | "review" | "interview" | "docs" | "negotiation" | "pricing" | "training" | "active" | "rejected";

/** One astrologer on the platform, from GET /admin/lifecycle/astrologers. */
export interface LifecycleAstrologer {
  id: string;
  slug: string;
  name: string;
  initials: string;
  photo: string;
  skills: string[];
  lifecycle: AstrologerStage | string;
  /** none | partial | full */
  suspension: string;
  online: boolean;
  consults: number;
  rating: number | null;
  /** "8 Oct 2026" */
  joined: string;
  /** ISO timestamp, for sorting. */
  joinedAt: string;
}

/** One astrologer's full record (GET /admin/lifecycle/astrologers/:id). */
export interface AstrologerDetail {
  id: string;
  slug: string;
  name: string;
  photo: string;
  gender: string | null;
  greeting: string;
  about: string;
  recognition: string;
  lifecycle: string;
  suspension: string;
  /** on | busy | live | off */
  presence: string;
  skills: string[];
  languages: string[];
  years: number;
  joined: string;
  consults: number;
  rating: number | null;
  ratings: number;
  reviews: number;
  price: { chat: string; voice: string; video: string; instant: string; multiplier: number; was: string | null };
  month: { consultations: number; minutes: number; billed: string };
  lastConsultation: string | null;
  contact: { email: string | null; phone: string | null; lastSignIn: string | null } | null;
  live: { isLive: boolean; topic: string } | null;
  training: { done: number; total: number } | null;
  application: { step: number; savedAt: string } | null;
  openNotices: number;
}

/** One application with its negotiation and audit trail (GET /admin/applicants/:id). */
export interface ApplicationDetail extends Application {
  submitted: string;
  slaDays: number;
  negotiation: { round: number; maxRounds: number; rows: NegotiationRow[] } | null;
  history: { when: string; action: string; who: string; diff: string }[];
  /** What the astrologer filled in on the portal; null for applications entered by HR. */
  portal: {
    astrologerId: string;
    answers: { label: string; value: string }[];
    /** The voice (else chat) rate they asked for, ₹/min */
    requestedRate: number | null;
    /** Allowed per-minute rate on approval, whole rupees */
    rateLimits: { min: number; max: number };
  } | null;
}

// ── Team (staff) ──
export interface StaffMember {
  id: string;
  name: string;
  initials: string;
  email: string | null;
  actorName: string;
  active: boolean;
  /** "8 Oct 11:43:19" IST, or null when they have never signed in. */
  lastLogin: string | null;
  /** ISO timestamps, for sorting. */
  lastLoginAt: string | null;
  added: string;
  addedAt: string;
  isYou: boolean;
}

export interface StaffDepartment {
  role: Role;
  label: string;
  people: StaffMember[];
}

// ── Marketing ──
export type CampaignState = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "ACTIVE" | "EXPIRED";

export interface Campaign {
  id: string;
  name: string;
  denoms: string;
  cashback: string;
  state: CampaignState;
}

export interface Gift {
  id: string;
  icon: string;
  name: string;
  price: string;
  state: string;
  bg: string;
  border: string;
  tagBg: string;
  tagFg: string;
}

export interface MarketingData {
  ribbon: string[];
  activeIndex: number;
  ribbonCampaign: string;
  campaigns: Campaign[];
  gifts: Gift[];
  giftCap: string;
}

// ── Finance ──
export type BatchState = "DRAFT" | "APPROVED" | "RELEASED";

export interface PayoutBatch {
  id: string;
  astrologers: number;
  gross: string;
  /** Gross in rupees and the batch's ISO creation time, for sorting. */
  grossValue: number;
  createdAt: string;
  tds: string;
  state: BatchState;
  /** Role that approved the batch, if any. */
  approvedBy?: Role;
  /** Short name of the approver, e.g. "K. Prasad". */
  approvedByName: string | null;
  /** User id of the approver; the releaser must be a different person. */
  approvedById: string | null;
  releasedByName: string | null;
  /** "20 Sep, 18:04 IST" */
  releasedAt: string | null;
}

/** A refund Support proposed on a dispute, waiting for a second approver (Finance or Super Admin). */
export interface DisputeRefund {
  id: string;
  subject: string;
  customer: string;
  session: string;
  amount: string;
  proposedBy: string | null;
  proposedById: string | null;
}

export interface FinanceData {
  kpis: Kpi[];
  cycle: string;
  batches: PayoutBatch[];
  disputeRefunds: DisputeRefund[];
  denominations: number[];
  enabledDenominations: number[];
  floorPct: number;
  floorMode: "reject" | "adjust";
  floorModes: { key: "reject" | "adjust"; label: string; body: string }[];
}

// ── Support ──
export interface Ticket {
  id: string;
  subject: string;
  state: string;
  sla: string;
  slaBg: string;
  slaFg: string;
  /** ISO timestamps, for sorting. */
  slaDueAt: string;
  createdAt: string;
  alias: string;
  session: string;
  refundState: "NONE" | "PROPOSED" | "INITIATED";
}

export interface Evidence {
  rank: "PLATFORM" | "CUSTOMER";
  label: string;
  when: string;
}

export interface SupportData {
  tickets: Ticket[];
}

/** A ticket's case file, from GET /admin/support/:id. */
export interface SupportCase {
  id: string;
  state: string;
  refundState: "NONE" | "PROPOSED" | "INITIATED";
  proposedBy: string | null;
  /** User id of the proposer (null for older data); the approver must be a different person. */
  proposedById: string | null;
  approvedBy: string | null;
  metering: { label: string; value: string }[];
  evidence: Evidence[];
  refund: { billed: string; buckets: { label: string; value: string; total?: boolean }[] };
}

// ── Live monitoring ──
/** A public live room being hosted right now. */
export interface MonitorLive {
  id: string;
  astrologer: string;
  photo: string;
  topic: string;
  /** ISO time the live started. */
  startedAt: string;
  viewers: number;
  waiting: number;
  /** "review": flagged or contact details in chat; "new": newly approved astrologer; null: no signals. */
  priority: "review" | "new" | null;
  signals: string[];
}

/** A private consultation in progress: never observable, no customer details. */
export interface MonitorPrivate {
  id: string;
  astrologer: string;
  mode: string;
  fromLive: boolean;
  startedAt: string;
}

export interface MonitoringData {
  generatedAt: string;
  capacity: { used: number; total: number };
  lives: MonitorLive[];
  privates: MonitorPrivate[];
  summary: { lives: number; privates: number; review: number; newAstrologers: number };
  flagReasons: string[];
  /** The observer lease this admin holds right now, if any. */
  myLease: { id: string; roomId: string; astrologer: string } | null;
}

/** GET /admin/monitoring/leases/:id — what the observer sees. */
export type ObserverView =
  | { status: "ended" | "released" | "expired" }
  | {
      status: "observing";
      lease: { id: string; secondsLeft: number; breakGlass: boolean };
      room: {
        id: string;
        topic: string;
        astrologer: string;
        photo: string;
        slug: string;
        startedAt: string;
        viewers: number;
        queue: { waiting: number; capacity: number };
        poll: { question: string; totalVotes: number; options: { label: string; votes: number; pct: number }[] };
        chat: { id: string; who: string; text: string; at: string; contact: boolean }[];
        announcements: { id: string; text: string; at: string }[];
      };
    };

// ── Trust ──
export interface ModerationItem {
  id: string;
  status: "FLAGGED" | "SOFT_HIDDEN";
  stars: string;
  flag: string;
  flagBg: string;
  flagFg: string;
  when: string;
  astro: string;
  text: string;
  /** Already soft-hidden when the queue loaded; minutes left on its undo window. */
  hiddenUndoLeft?: string;
}

export interface TrustData {
  queue: ModerationItem[];
  reasonCodes: string[];
  undoWindow: string;
  density: { value: number; target: number };
  sampleFloor: { floor: string; below: string };
}

// ── RBAC ──
export interface RbacCell {
  on: boolean;
  /** Locked cells never change (the Super Admin column and the platform rules). */
  locked: boolean;
  reason: string | null;
  isDefault: boolean;
}

export interface RbacData {
  roles: { key: Role; label: string }[];
  pages: { key: PageKey; label: string; cells: RbacCell[] }[];
  capabilities: { key: string; label: string; page: PageKey | null; cells: RbacCell[] }[];
  separationOfDuties: string[];
  /** 0 = the defaults have never been changed. */
  version: number;
  customised: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  canEdit: boolean;
  /** Open (or just resolved) separation-of-duties case; null when there is none. */
  conflict: {
    user: string;
    requested: string;
    existing: string;
    alternative: string;
    resolved?: "revoke" | "grant-alternative";
  } | null;
}

// ── Audit ──
export interface AuditEntry {
  ts: string;
  actor: string;
  action: string;
  object: string;
  diff: string;
  corr: string;
  breakGlass: boolean;
}

// ── Recording & retention ──
export interface RecordingData {
  provider: { connected: boolean };
  stored: { liveChat: number; messages: number; conversations: number; oldest: string | null };
  retention: {
    days: number;
    defaultDays: number;
    minDays: number;
    maxDays: number;
    updatedBy: string | null;
    updatedAt: string | null;
    canEdit: boolean;
  };
  lastPurge: { at: string; chatMessages: number; messages: number; threads: number } | null;
}

// ── Search ──
export interface SearchHit {
  kind: string;
  label: string;
  sub: string;
  href: string;
}

// ── Messages ──
export type PersonKind = "staff" | "astrologer" | "customer";

/** Someone in a conversation as staff see them. `line`: department, "Astrologer", or "Customer · +91 98••• ••210". */
export interface MessagePerson {
  id: string;
  kind: PersonKind;
  name: string;
  initials: string;
  photo: string | null;
  line: string;
}

/** GET /admin/messages */
export interface InboxConversation {
  id: string;
  subject: string | null;
  /** Everyone in it except me. */
  people: MessagePerson[];
  preview: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

export interface InboxMessage {
  id: string;
  mine: boolean;
  author: MessagePerson;
  text: string;
  at: string;
}

/** GET /admin/messages/:id */
export interface InboxThread {
  id: string;
  subject: string | null;
  startedBy: string | null;
  startedAt: string;
  people: MessagePerson[];
  messages: InboxMessage[];
  canSend: boolean;
  /** Why the conversation is closed, when it is. */
  notice: string | null;
}
