import { redirect } from "next/navigation";
import { cache } from "react";
import { apiGet } from "@/lib/api/server";
import { ApiError } from "@/lib/api/errors";
import { CONFIG_FACETS, FLOOR_MODES, pageLink } from "./constants";
import { bandColours, flagColours, giftColours, kpi, riskColours, slaColours, workColours } from "./view";
import type {
  AdminSession,
  Application,
  AuditEntry,
  BatchState,
  Campaign,
  ConfigData,
  ConfigDetail,
  ConfigKey,
  FinanceData,
  LifecycleData,
  LiveStat,
  MarketingData,
  MonitoringData,
  OverviewData,
  PageKey,
  RbacData,
  RecordingData,
  Role,
  SeriesPoint,
  SupportCase,
  SupportData,
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

interface RawOverview {
  dateLine: string;
  kpis: {
    liveSessions: number;
    emergency: number;
    publicLives: number;
    flaggedLives: number;
    openTickets: number;
    breachedTickets: number;
    applications: number;
    applicationsOverSla: number;
    payoutAwaiting: string;
    payoutBatchesAwaiting: number;
  };
  metrics: {
    dau: number[];
    stickiness: number[];
    channels: [string, number, number, number][];
    live: LiveStat[];
    availability: OverviewData["availability"];
    registered: number;
  };
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
const pct = (n: number) => n.toFixed(1) + "%";

/** A 30-day trend card; the delta compares the last day with the same day a week earlier. */
function trend(
  values: number[],
  fmt: (n: number) => string,
  delta: (last: number, weekAgo: number) => string,
  card: Pick<TrendCard, "title" | "window" | "color" | "ariaLabel">,
): TrendCard {
  const points: SeriesPoint[] = values.map((value) => ({ value, label: fmt(value) }));
  const last = values.at(-1) ?? 0;
  const weekAgo = values.at(-8) ?? last;
  return {
    ...card,
    headline: fmt(last),
    delta: values.length ? delta(last, weekAgo) : "",
    points,
    topLabel: values.length ? fmt(Math.max(...values)) : "",
    bottomLabel: values.length ? fmt(Math.min(...values)) : "",
  };
}

const signed = (n: number, digits: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(digits);

export function toLiveStats(raw: RawOverview["metrics"]["live"]): LiveStat[] {
  return raw.map((s) => ({ label: s.label, value: s.value, sub: s.sub, color: s.color }));
}

export async function getOverview(): Promise<OverviewData> {
  const { overview: o } = await apiGet<{ overview: RawOverview }>("/admin/overview");
  const k = o.kpis;
  return {
    dateLine: o.dateLine,
    kpis: [
      kpi("Live sessions", String(k.liveSessions), `${k.emergency} emergency`, "#c2410c"),
      kpi("Public lives", String(k.publicLives), `${k.flaggedLives} flagged for review`, "#b45309"),
      kpi("Open tickets", String(k.openTickets), `${k.breachedTickets} SLA breached`, "#be123c", k.breachedTickets > 0),
      kpi("Applications", String(k.applications), `${k.applicationsOverSla} over SLA`, "#be123c"),
      kpi(
        "Payout batch",
        k.payoutAwaiting,
        k.payoutBatchesAwaiting ? "awaiting release" : "nothing awaiting release",
        "#78716c",
      ),
    ],
    live: toLiveStats(o.metrics.live),
    dau: trend(o.metrics.dau, intl, (a, b) => `${signed(((a - b) / b) * 100, 1)}% vs last week`, {
      title: "Daily active users",
      window: "last 30 days",
      color: "#2a78d6",
      ariaLabel: "Daily active users, last 30 days",
    }),
    stickiness: trend(o.metrics.stickiness, pct, (a, b) => `${signed(a - b, 1)} pts vs last week`, {
      title: "Stickiness · DAU ÷ MAU",
      window: "last 30 days",
      color: "#eb6834",
      ariaLabel: "DAU over MAU, last 30 days",
    }),
    channels: o.metrics.channels.map(([day, chat, voice, video]) => ({ day, chat, voice, video })),
    availability: o.metrics.availability,
    registered: o.metrics.registered,
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
    grossDelta: string;
    pendingPayouts: string;
    batchesAwaiting: number;
    duplicates: number;
    trialBalance: string;
    trialDate: string;
  };
  cycle: string;
  batches: {
    id: string;
    astrologers: number;
    gross: string;
    tds: string;
    state: BatchState;
    approvedBy?: Role;
    approvedByName: string | null;
  }[];
  denominations: number[];
  enabledDenominations: number[];
  floorPct: number;
  floorMode: "reject" | "adjust";
}

export async function getFinance(): Promise<FinanceData> {
  const { finance: f } = await apiGet<{ finance: RawFinance }>("/admin/finance");
  const k = f.kpis;
  const trialOut = k.trialBalance !== "₹0";
  return {
    kpis: [
      kpi("Gross volume · Sep", k.grossVolume, k.grossDelta, "#047857"),
      kpi(
        "Pending payouts",
        k.pendingPayouts,
        `${k.batchesAwaiting} ${k.batchesAwaiting === 1 ? "batch" : "batches"} awaiting release`,
        "#b45309",
      ),
      kpi("Duplicate payments", String(k.duplicates), "auto-refund queue", "#78716c"),
      trialOut
        ? kpi("Trial balance", k.trialBalance, `out of balance — ${k.trialDate}`, "#be123c", true, true)
        : kpi("Trial balance", k.trialBalance, "in balance", "#047857"),
    ],
    cycle: f.cycle,
    batches: f.batches.map((b) => ({
      id: b.id,
      astrologers: b.astrologers,
      gross: b.gross,
      tds: b.tds,
      state: b.state,
      approvedBy: b.approvedBy,
      approvedByName: b.approvedByName,
    })),
    denominations: f.denominations,
    enabledDenominations: f.enabledDenominations,
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
  alias: string;
  session: string;
  refundState: "NONE" | "PROPOSED" | "INITIATED";
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
      alias: t.alias,
      session: t.session,
      refundState: t.refundState,
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

interface RawMonitoring {
  capacity: { used: number; total: number };
  queue: { id: string; band: string; astro: string; reason: string; age: string; denied: boolean }[];
  risk: { label: string; pct: string; count: string }[];
  myLease: MonitoringData["myLease"];
}

export async function getMonitoring(): Promise<MonitoringData> {
  const { monitoring: m } = await apiGet<{ monitoring: RawMonitoring }>("/admin/monitoring");
  return {
    capacity: m.capacity,
    queue: m.queue.map((q) => ({
      ...q,
      band: q.band as MonitoringData["queue"][number]["band"],
      ...bandColours(q.band),
    })),
    risk: m.risk.map((r) => ({ ...r, ...riskColours(r.label) })),
    myLease: m.myLease,
  };
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

export async function getAuditLog(): Promise<AuditEntry[]> {
  const { entries } = await apiGet<{ entries: AuditEntry[] }>("/admin/audit");
  return entries;
}

export async function getRecording(): Promise<RecordingData> {
  const { recording } = await apiGet<{ recording: RecordingData }>("/admin/recording");
  return recording;
}
