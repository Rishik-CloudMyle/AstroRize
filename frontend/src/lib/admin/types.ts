// Shared types for the admin console. lib/admin/api.ts turns the Node API's answers
// into these view shapes (adding the prototype's colours), so the pages stay presentational.

export type Role = "super" | "finance" | "support" | "compliance";

/** One key per console page; CAPS decides which keys a role may open. */
export type PageKey =
  | "overview"
  | "config"
  | "hr"
  | "marketing"
  | "finance"
  | "support"
  | "compliance"
  | "trust"
  | "rbac"
  | "audit"
  | "recording";

export type Environment = "production" | "staging" | "sandbox";

export interface AdminSession {
  name: string;
  initials: string;
  /** Short name written into audit entries and toasts, e.g. "K. Prasad". */
  actor: string;
  role: Role;
  /** Pages this role may open (the API's PAGES table). */
  pages: PageKey[];
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
  delta: string;
  color: string;
  ariaLabel: string;
  points: SeriesPoint[];
  topLabel: string;
  bottomLabel: string;
}

export interface ChannelDay {
  day: string;
  chat: number;
  voice: number;
  video: number;
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

export interface OverviewData {
  dateLine: string;
  kpis: Kpi[];
  live: LiveStat[];
  dau: TrendCard;
  stickiness: TrendCard;
  channels: ChannelDay[];
  availability: AvailabilitySlice[];
  registered: number;
  trialBalance: { title: string; body: string } | null;
  worklist: WorkItem[];
  recentAudit: RecentAction[];
}

// ── Config ──
export type ConfigDomain =
  | "finance"
  | "consult"
  | "live"
  | "compliance"
  | "support"
  | "trust"
  | "marketing"
  | "hr"
  | "recording"
  | "rbac";

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
  pending: { id: string; toValue: string; draftedBy: string; effective: string | null } | null;
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
  /** Record version; every action quotes it so a stale screen can't overwrite a newer change. */
  version: number;
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
  tds: string;
  state: BatchState;
  /** Role that approved the batch, if any. */
  approvedBy?: Role;
  /** Short name of the approver, e.g. "K. Prasad". */
  approvedByName: string | null;
}

export interface FinanceData {
  kpis: Kpi[];
  cycle: string;
  batches: PayoutBatch[];
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
  approvedBy: string | null;
  metering: { label: string; value: string }[];
  evidence: Evidence[];
  refund: { billed: string; buckets: { label: string; value: string; total?: boolean }[] };
}

// ── Live monitoring ──
export interface MonitorItem {
  id: string;
  band: "CRITICAL" | "HIGH" | "PROMOTED" | "PRIVATE" | "SAMPLING";
  astro: string;
  reason: string;
  age: string;
  bg: string;
  border: string;
  bandBg: string;
  bandFg: string;
  ageFg: string;
  denied: boolean;
}

export interface RiskBand {
  label: string;
  pct: string;
  count: string;
  fill: string;
  fg: string;
}

export interface MonitoringData {
  capacity: { used: number; total: number };
  queue: MonitorItem[];
  risk: RiskBand[];
  /** The observer lease this admin holds right now, if any. */
  myLease: { id: string; targetId: string; secondsLeft: number } | null;
}

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
export interface RbacData {
  roles: string[];
  matrix: { key: string; grants: boolean[] }[];
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

// ── Recording ──
export interface RecordingModality {
  mode: string;
  note: string;
  retention: string;
  status: "enabled" | "blocked" | "disabled";
}

export interface RecordingData {
  checklist: { title: string; body: string; complete: boolean };
  modalities: RecordingModality[];
}

// ── Search ──
export interface SearchHit {
  kind: string;
  label: string;
  sub: string;
  href: string;
}
