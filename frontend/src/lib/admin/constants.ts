import type { ConfigDomain, Environment, FinanceData, NavGroup, PageKey, Role } from "./types";

// Fixed console labels from the prototype (part-d-admin/logic.js). Data comes from the API;
// these are presentation only.

export const PAGE_HREF: Record<PageKey, string> = {
  overview: "/admin",
  messages: "/admin/messages",
  config: "/admin/config",
  hr: "/admin/lifecycle",
  marketing: "/admin/marketing",
  finance: "/admin/finance",
  support: "/admin/support",
  compliance: "/admin/monitoring",
  trust: "/admin/trust",
  rbac: "/admin/rbac",
  audit: "/admin/audit",
  recording: "/admin/recording",
  team: "/admin/team",
};

/** The console nav. Badge counts are filled in from the session (open work per page). */
export const NAV: NavGroup[] = [
  {
    title: "Platform",
    items: [
      { key: "overview", label: "Overview", icon: "◱", href: PAGE_HREF.overview },
      { key: "messages", label: "Messages", icon: "✎", href: PAGE_HREF.messages },
      { key: "config", label: "Config console", icon: "⚙", href: PAGE_HREF.config },
    ],
  },
  {
    title: "Operations",
    items: [
      { key: "hr", label: "Astrologer lifecycle", icon: "◍", href: PAGE_HREF.hr },
      { key: "marketing", label: "Marketing", icon: "◈", href: PAGE_HREF.marketing },
      { key: "finance", label: "Finance", icon: "₹", href: PAGE_HREF.finance },
      { key: "support", label: "Support & disputes", icon: "✉", href: PAGE_HREF.support },
    ],
  },
  {
    title: "Governance",
    items: [
      { key: "compliance", label: "Live monitoring", icon: "🛡", href: PAGE_HREF.compliance },
      { key: "trust", label: "Trust & reviews", icon: "★", href: PAGE_HREF.trust },
      { key: "team", label: "Team", icon: "☷", href: PAGE_HREF.team },
      { key: "rbac", label: "RBAC", icon: "⚿", href: PAGE_HREF.rbac },
      { key: "audit", label: "Audit log", icon: "▤", href: PAGE_HREF.audit },
      { key: "recording", label: "Recording", icon: "⏺", href: PAGE_HREF.recording },
    ],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  super: "Super Admin",
  finance: "Finance",
  support: "Support",
  compliance: "Compliance",
  marketing: "Marketing",
};

export const CONFIG_FACETS: { id: ConfigDomain | "all"; label: string }[] = [
  { id: "all", label: "All keys" },
  { id: "finance", label: "Finance" },
  { id: "consult", label: "Consult" },
  { id: "live", label: "Live" },
  { id: "compliance", label: "Risk" },
  { id: "support", label: "Support" },
  { id: "trust", label: "Trust" },
  { id: "marketing", label: "Marketing" },
  { id: "hr", label: "Astrologers" },
  { id: "recording", label: "Recording" },
  { id: "rbac", label: "RBAC" },
];

export const FLOOR_MODES: FinanceData["floorModes"] = [
  {
    key: "reject",
    label: "REJECT",
    body: "Campaigns that breach the floor are blocked at submission and the marketer is told which denomination broke it.",
  },
  {
    key: "adjust",
    label: "AUTO_ADJUST",
    body: "Offending values are clamped to the floor and the adjustment is recorded against the campaign.",
  },
];

/** Which deployment this console is pointed at; drives the environment pill. */
export function getEnvironment(): Environment {
  const env = (process.env.NEXT_PUBLIC_APP_ENV ?? "production").toLowerCase();
  return env === "staging" || env === "sandbox" ? env : "production";
}

/** Link for a page key plus an optional "a=b" query, as the API's worklist and search return them. */
export function pageLink(page: PageKey, param?: string | null): string {
  return PAGE_HREF[page] + (param ? `?${param}` : "");
}
