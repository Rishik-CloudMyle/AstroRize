import { redirect } from "next/navigation";
import { cache } from "react";
import { apiGet } from "@/lib/api/server";
import { ApiError } from "@/lib/api/errors";
import { CONFIG_FACETS, FLOOR_MODES, pageLink } from "./constants";
import { flagColours, giftColours, kpi, slaColours, workColours } from "./view";
import type {
  DisputeRefund,
  AdminSession,
  Application,
  AuditEntry,
  BatchKind,
  BatchState,
  Campaign,
  ConfigData,
  ConfigDetail,
  ConfigKey,
  FinanceData,
  InboxConversation,
  InboxThread,
  LifecycleAstrologer,
  LifecycleData,
  LiveStat,
  MarketingData,
  MonitoringData,
  OverviewData,
  PrepareCandidate,
  RunningCycle,
  PageKey,
  RbacData,
  RecordingData,
  Role,
  SeriesPoint,
  StaffDepartment,
  SupportCase,
  SupportData,
  SuspensionsData,
  TopAstrologer,
  TrendCard,
  TrustData,
} from "./types";

// Server-side data for the admin console: each getter calls the Node API at request time
// (with the admin's cookie) and turns the answer into the view shapes in ./types.

// ── Session ──

/** The signed-in admin, from GET /admin/session. Cached per request (layout + page share it). */
export const getSession = cache(async (): Promise<AdminSession> => {
  try {
    const { session } = await apiGet<{ session: AdminSession }>("/admin/session");
    return session;
  } catch (e) {
    // The cookie was valid for src/proxy.ts but the API no longer knows the session.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) redirect("/?login=admin");
    throw e;
  }
});

// ── Overview ──

/** Numbers the API computes from the database (GET /admin/overview → analytics). */
export interface RawAnalytics {
  /** IST dates, oldest first, today last. */
  days: string[];
  series: {
    consultations: number[];
    revenue: number[];
    activeCustomers: number[];
    signups: number[];
    recharges: number[];
    rechargeAmount: number[];
  };
  channels: { day: string; chat: number; voice: number; video: number; instant: number }[];
  top: TopAstrologer[];
  /** [last 7 × 24 h, the 7 × 24 h before]. */
  week: Record<"consultations" | "revenue" | "rechargeAmount" | "recharges" | "signups", [number, number]>;
  now: {
    consultations: { chat: number; voice: number; video: number; instant: number };
    waiting: number;
    longestWaitSeconds: number;
    liveRooms: number;
    liveQueue: number;
    roster: number;
    presence: { on: number; busy: number; live: number; off: number };
  };
}

interface RawOverview {
  dateLine: string;
  generatedAt: string;
  kpis: {
    liveSessions: number;
    emergency: number;
    publicLives: number;
    flaggedLives: number;
    /** Department tiles: null when this department can't open the page behind them. */
    openTickets: number | null;
    breachedTickets: number;
    applications: number | null;
    applicationsOverSla: number;
    payoutAwaiting: string | null;
    payoutBatchesAwaiting: number;
  };
  analytics: RawAnalytics;
  trialBalance: { title: string; body: string } | null;
  worklist: {
    ico: string;
    title: string;
    sub: string;
    age: string;
    tone: string;
    page: PageKey;
    param: string | null;
  }[];
  recentAudit: OverviewData["recentAudit"];
}

const intl = (n: number) => n.toLocaleString("en-IN");
const money = (n: number) => "₹" + intl(n);
const plural = (n: number, one: string, many = one + "s") => `${intl(n)} ${n === 1 ? one : many}`;

/** "Thu 8 Oct" for an IST date key (2026-10-08). */
function dayLabel(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "+12.4% vs previous 7 days" with its tone; no percentage when the earlier week had nothing. */
function weekDelta([now, before]: [number, number]): { text: string; tone: "up" | "down" | "flat" } {
  if (before === 0)
    return now === 0 ? { text: "none in either week", tone: "flat" } : { text: "none the week before", tone: "up" };
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.05) return { text: "same as previous 7 days", tone: "flat" };
  return {
    text: `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% vs previous 7 days`,
    tone: pct > 0 ? "up" : "down",
  };
}

const TONE_FG = { up: "#047857", down: "#be123c", flat: "#78716c" } as const;

/** A 30-day chart card: the headline is the 30-day total, the delta compares the last two weeks. */
function trend(
  a: RawAnalytics,
  values: number[],
  fmt: (n: number) => string,
  unit: (n: number) => string,
  card: Pick<TrendCard, "title" | "color" | "ariaLabel"> & { headline: string; headlineNote: string },
  delta: { text: string; tone: "up" | "down" | "flat" },
): TrendCard {
  const last = a.days.length - 1;
  const points: SeriesPoint[] = values.map((value, i) => ({
    value,
    label: `${dayLabel(a.days[i])}${i === last ? " (today so far)" : ""} · ${unit(value)}`,
  }));
  return {
    title: card.title,
    window: `last ${a.days.length} days`,
    color: card.color,
    ariaLabel: card.ariaLabel,
    headline: card.headline,
    headlineNote: card.headlineNote,
    delta: delta.text,
    deltaTone: delta.tone,
    points,
    topLabel: values.length ? fmt(Math.max(...values)) : "",
    bottomLabel: values.length ? fmt(Math.min(...values)) : "",
  };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** "3 m 10 s" */
function waitLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : m ? `${m} m ${s} s` : `${s} s`;
}

/** The "Live right now" tiles, from the current state of consultations, rooms and presence. */
export function toLiveStats(n: RawAnalytics["now"]): LiveStat[] {
  const c = n.consultations;
  const inProgress = c.chat + c.voice + c.video + c.instant;
  const online = n.presence.on + n.presence.busy + n.presence.live;
  const occupied = n.presence.busy + n.presence.live;
  return [
    {
      label: "Consultations now",
      value: inProgress,
      sub: inProgress
        ? `chat ${c.chat} · voice ${c.voice} · video ${c.video} · instant ${c.instant}`
        : "none in progress",
      color: "#1c1917",
    },
    {
      label: "Waiting in queue",
      value: n.waiting,
      sub: n.waiting ? `longest wait ${waitLabel(n.longestWaitSeconds)}` : "nobody waiting",
      color: "#b45309",
    },
    {
      label: "Public live rooms",
      value: n.liveRooms,
      sub: `${plural(n.liveQueue, "customer")} in live queues`,
      color: "#eb6834",
    },
    { label: "Astrologers online", value: online, sub: `of ${n.roster} on the public roster`, color: "#2a78d6" },
    { label: "Available now", value: n.presence.on, sub: "ready for a consultation", color: "#047857" },
    {
      label: "Busy or live",
      value: occupied,
      sub: online ? `${Math.round((occupied / online) * 100)}% of those online` : "nobody online",
      color: "#be123c",
    },
  ];
}

export async function getOverview(): Promise<OverviewData> {
  const { overview: o } = await apiGet<{ overview: RawOverview }>("/admin/overview");
  const k = o.kpis;
  const a = o.analytics;
  const s = a.series;
  const weekKpi = (label: string, value: string, d: { text: string; tone: "up" | "down" | "flat" }) =>
    kpi(label, value, d.text, TONE_FG[d.tone]);
  const consultDelta = weekDelta(a.week.consultations);
  const revenueDelta = weekDelta(a.week.revenue);
  const rechargeDelta = weekDelta(a.week.rechargeAmount);
  const signupDelta = weekDelta(a.week.signups);
  const avgActive = s.activeCustomers.length ? Math.round(sum(s.activeCustomers) / s.activeCustomers.length) : 0;

  return {
    dateLine: o.dateLine,
    generatedAt: o.generatedAt,
    kpis: [
      kpi("Live sessions", String(k.liveSessions), `${k.emergency} emergency`, "#c2410c"),
      kpi("Public lives", String(k.publicLives), `${k.flaggedLives} flagged for review`, "#b45309"),
      ...(k.openTickets !== null
        ? [kpi("Open tickets", String(k.openTickets), `${k.breachedTickets} SLA breached`, "#be123c", k.breachedTickets > 0)]
        : []),
      ...(k.applications !== null ? [kpi("Applications", String(k.applications), `${k.applicationsOverSla} over SLA`, "#be123c")] : []),
      ...(k.payoutAwaiting !== null
        ? [
            kpi(
              "Payout batch",
              k.payoutAwaiting,
              k.payoutBatchesAwaiting ? "awaiting release" : "nothing awaiting release",
              "#78716c",
            ),
          ]
        : []),
    ],
    weekKpis: [
      weekKpi("Consultations · 7 days", intl(a.week.consultations[0]), consultDelta),
      weekKpi("Revenue · 7 days", money(a.week.revenue[0]), revenueDelta),
      weekKpi("Recharges · 7 days", money(a.week.rechargeAmount[0]), rechargeDelta),
      weekKpi("New customers · 7 days", intl(a.week.signups[0]), signupDelta),
    ],
    live: toLiveStats(a.now),
    trends: [
      {
        id: "azConsults",
        card: trend(
          a,
          s.consultations,
          intl,
          (n) => plural(n, "consultation"),
          {
            title: "Consultations per day",
            color: "#2a78d6",
            ariaLabel: "Completed consultations per day, last 30 days",
            headline: intl(sum(s.consultations)),
            headlineNote: "completed in 30 days",
          },
          consultDelta,
        ),
      },
      {
        id: "azRevenue",
        card: trend(
          a,
          s.revenue,
          money,
          money,
          {
            title: "Revenue per day",
            color: "#eb6834",
            ariaLabel: "Amount billed for completed consultations per day, last 30 days",
            headline: money(sum(s.revenue)),
            headlineNote: "billed in 30 days",
          },
          revenueDelta,
        ),
      },
      {
        id: "azRecharges",
        card: trend(
          a,
          s.rechargeAmount,
          money,
          (n) => `${money(n)} recharged`,
          {
            title: "Wallet recharges per day",
            color: "#1baf7a",
            ariaLabel: "Wallet recharge amount per day (before GST), last 30 days",
            headline: money(sum(s.rechargeAmount)),
            headlineNote: `${plural(sum(s.recharges), "payment")} in 30 days`,
          },
          rechargeDelta,
        ),
      },
      {
        id: "azActive",
        card: trend(
          a,
          s.activeCustomers,
          intl,
          (n) => plural(n, "customer"),
          {
            title: "Customers who consulted",
            color: "#7c3aed",
            ariaLabel: "Customers with at least one completed consultation per day, last 30 days",
            headline: intl(avgActive),
            headlineNote: "a day on average",
          },
          { text: `${intl(s.activeCustomers.at(-1) ?? 0)} today so far`, tone: "flat" },
        ),
      },
      {
        id: "azSignups",
        card: trend(
          a,
          s.signups,
          intl,
          (n) => plural(n, "sign-up"),
          {
            title: "New customer sign-ups",
            color: "#b45309",
            ariaLabel: "New customer accounts per day, last 30 days",
            headline: intl(sum(s.signups)),
            headlineNote: "in 30 days",
          },
          signupDelta,
        ),
      },
    ],
    channels: a.channels.map((c) => ({ ...c, day: c.day.slice(8), date: dayLabel(c.day) })),
    top: a.top,
    availability: [
      { label: "Available", count: a.now.presence.on, color: "#047857" },
      { label: "Busy", count: a.now.presence.busy, color: "#be123c" },
      { label: "Live", count: a.now.presence.live, color: "#b45309" },
      { label: "Offline", count: a.now.presence.off, color: "#a8a29e" },
    ],
    registered: a.now.roster,
    trialBalance: o.trialBalance,
    worklist: o.worklist.map((w) => ({
      ico: w.ico,
      title: w.title,
      sub: w.sub,
      age: w.age,
      href: pageLink(w.page, w.param),
      ...workColours(w.tone),
    })),
    recentAudit: o.recentAudit,
  };
}

/** Page key a worklist link points at, so rows for pages the role can't open are dropped. */
export function pageOfHref(href: string, pages: Record<PageKey, string>): PageKey | undefined {
  const path = href.split("?")[0];
  return (Object.keys(pages) as PageKey[]).find((k) => pages[k] === path);
}

// ── Config ──

export async function getConfig(): Promise<ConfigData> {
  const { keys } = await apiGet<{ keys: ConfigKey[] }>("/admin/config");
  return { keys, facets: CONFIG_FACETS };
}

export async function getConfigDetail(key: string): Promise<ConfigDetail> {
  const { detail } = await apiGet<{ detail: ConfigDetail }>(`/admin/config/${encodeURIComponent(key)}`);
  return detail;
}

// ── Finance ──

interface RawFinance {
  kpis: {
    grossVolume: string;
    grossMonth: string;
    grossDelta: string;
    pendingPayouts: string;
    batchesAwaiting: number;
    duplicates: number;
    trialBalance: string;
    walletsOut: number;
    walletsChecked: number;
    splitMonth: string;
    platformRevenue: string;
    customerGross: string;
    astrologerShare: string;
    freeCallCost: string;
    freeCallMinutes: number;
    campaignMonth: string;
    campaignCost: string;
    campaignCashback: string;
    campaignBonus: string;
    campaignDiscount: string;
  };
  cycle: string;
  tdsPct: number;
  toPrepare: PrepareCandidate[];
  running: RunningCycle[];
  batches: {
    id: string;
    kind: BatchKind;
    cycle: string;
    lines: number;
    astrologers: number;
    gross: string;
    grossValue: number;
    createdAt: string;
    tds: string;
    state: BatchState;
    approvedBy?: Role;
    approvedByName: string | null;
    approvedById: string | null;
    releasedByName: string | null;
    releasedAt: string | null;
  }[];
  disputeRefunds: DisputeRefund[];
  denominations: number[];
  enabledDenominations: number[];
  customAmount: { enabled: boolean; min: number; max: number };
  floorPct: number;
  floorMode: "reject" | "adjust";
}

export async function getFinance(): Promise<FinanceData> {
  const { finance: f } = await apiGet<{ finance: RawFinance }>("/admin/finance");
  const k = f.kpis;
  const trialOut = k.walletsOut > 0;
  return {
    kpis: [
      kpi(`Gross volume · ${k.grossMonth}`, k.grossVolume, k.grossDelta, "#047857"),
      kpi(
        "Pending payouts",
        k.pendingPayouts,
        `${k.batchesAwaiting} ${k.batchesAwaiting === 1 ? "batch" : "batches"} awaiting release`,
        "#b45309",
      ),
      kpi(
        `Platform share · ${k.splitMonth}`,
        k.platformRevenue,
        `of ${k.customerGross} customers paid · astrologers keep ${k.astrologerShare}`,
        "#047857",
      ),
      kpi(
        `Free-call cost · ${k.splitMonth}`,
        k.freeCallCost,
        `${k.freeCallMinutes} free ${k.freeCallMinutes === 1 ? "minute" : "minutes"} AstroRize pays astrologers for`,
        "#78716c",
      ),
      kpi(
        `Campaign cost · ${k.campaignMonth}`,
        k.campaignCost,
        `cashback ${k.campaignCashback} · bonus credit ${k.campaignBonus} · discounts ${k.campaignDiscount}`,
        "#78716c",
      ),
      kpi(
        "Duplicate payments",
        String(k.duplicates),
        k.duplicates ? "same customer and amount within 10 min · 30 days" : "none in the last 30 days",
        "#78716c",
      ),
      trialOut
        ? kpi("Wallet trial balance", k.trialBalance, `${k.walletsOut} of ${k.walletsChecked} wallets don't match their ledger`, "#be123c", true, true)
        : kpi("Wallet trial balance", k.trialBalance, `in balance · ${k.walletsChecked} wallets match their ledger`, "#047857"),
    ],
    cycle: f.cycle,
    tdsPct: f.tdsPct,
    toPrepare: f.toPrepare,
    running: f.running,
    batches: f.batches.map((b) => ({
      id: b.id,
      kind: b.kind,
      cycle: b.cycle,
      lines: b.lines,
      astrologers: b.astrologers,
      gross: b.gross,
      grossValue: b.grossValue,
      createdAt: b.createdAt,
      tds: b.tds,
      state: b.state,
      approvedBy: b.approvedBy,
      approvedByName: b.approvedByName,
      approvedById: b.approvedById,
      releasedByName: b.releasedByName,
      releasedAt: b.releasedAt,
    })),
    disputeRefunds: f.disputeRefunds,
    denominations: f.denominations,
    enabledDenominations: f.enabledDenominations,
    customAmount: f.customAmount,
    floorPct: f.floorPct,
    floorMode: f.floorMode,
    floorModes: FLOOR_MODES,
  };
}

// ── Support ──

interface RawTicket {
  id: string;
  subject: string;
  state: string;
  sla: string;
  slaTone: string;
  slaDueAt: string;
  createdAt: string;
  alias: string;
  session: string;
  refundState: "NONE" | "PROPOSED" | "INITIATED";
  resolution: "REFUND" | "MAKE_GOOD" | null;
}

export async function getSupport(): Promise<SupportData> {
  const { tickets } = await apiGet<{ tickets: RawTicket[] }>("/admin/support");
  return {
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      state: t.state,
      sla: t.sla,
      ...slaColours(t.slaTone),
      slaDueAt: t.slaDueAt,
      createdAt: t.createdAt,
      alias: t.alias,
      session: t.session,
      refundState: t.refundState,
      resolution: t.resolution ?? null,
    })),
  };
}

export async function getSupportCase(id: string): Promise<SupportCase> {
  const res = await apiGet<{ case: SupportCase }>(`/admin/support/${encodeURIComponent(id)}`);
  return res.case;
}

// ── Lifecycle ──

export async function getLifecycle(): Promise<LifecycleData> {
  const { lifecycle } = await apiGet<{ lifecycle: LifecycleData & { applications: Application[] } }>(
    "/admin/lifecycle",
  );
  return lifecycle;
}

/** Every astrologer with their lifecycle stage (the console filters the list). */
export async function getLifecycleAstrologers(): Promise<LifecycleAstrologer[]> {
  const { astrologers } = await apiGet<{ astrologers: LifecycleAstrologer[] }>("/admin/lifecycle/astrologers");
  return astrologers;
}

// ── Messages ──

/** My conversations, newest first (GET /admin/messages). */
export async function getInbox(): Promise<InboxConversation[]> {
  return (await apiGet<{ conversations: InboxConversation[] }>("/admin/messages")).conversations;
}

/** One conversation (GET /admin/messages/:id), or null when I'm not in it / it doesn't exist. Opening it marks it read. */
export async function getInboxThread(id: string): Promise<InboxThread | null> {
  try {
    return (await apiGet<{ conversation: InboxThread }>(`/admin/messages/${encodeURIComponent(id)}`)).conversation;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// ── Team ──

export async function getStaff(): Promise<StaffDepartment[]> {
  const { departments } = await apiGet<{ departments: StaffDepartment[] }>("/admin/staff");
  return departments;
}

// ── Marketing ──

interface RawMarketing extends Omit<MarketingData, "gifts" | "campaigns"> {
  campaigns: Campaign[];
  gifts: { id: string; icon: string; name: string; price: string; state: string }[];
}

export async function getMarketing(): Promise<MarketingData> {
  const { marketing: m } = await apiGet<{ marketing: RawMarketing }>("/admin/marketing");
  return { ...m, gifts: m.gifts.map((g) => ({ ...g, ...giftColours(g.state) })) };
}

// ── Monitoring ──

export async function getMonitoring(): Promise<MonitoringData> {
  const { monitoring } = await apiGet<{ monitoring: MonitoringData }>("/admin/monitoring");
  return monitoring;
}

export async function getSuspensions(): Promise<SuspensionsData> {
  const { suspensions } = await apiGet<{ suspensions: SuspensionsData }>("/admin/suspensions");
  return suspensions;
}

// ── Trust ──

interface RawTrust extends Omit<TrustData, "queue"> {
  queue: {
    id: string;
    stars: string;
    flag: string;
    when: string;
    astro: string;
    text: string;
    status: "FLAGGED" | "SOFT_HIDDEN";
    hiddenUndoLeft?: string;
  }[];
}

export async function getTrust(): Promise<TrustData> {
  const { trust } = await apiGet<{ trust: RawTrust }>("/admin/trust");
  return { ...trust, queue: trust.queue.map((r) => ({ ...r, ...flagColours(r.flag) })) };
}

// ── RBAC, audit, recording ──

export async function getRbac(): Promise<RbacData> {
  const { rbac } = await apiGet<{ rbac: RbacData }>("/admin/rbac");
  return rbac;
}

/** The audit log in the given order (sorted by the API, since the list is capped). */
export async function getAuditLog(sort = "newest"): Promise<AuditEntry[]> {
  const { entries } = await apiGet<{ entries: AuditEntry[] }>(`/admin/audit?sort=${encodeURIComponent(sort)}`);
  return entries;
}

export async function getRecording(): Promise<RecordingData> {
  const { recording } = await apiGet<{ recording: RecordingData }>("/admin/recording");
  return recording;
}
