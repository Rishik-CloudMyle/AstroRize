import type { PriceChangeStatus } from "./price-changes";

// Shared by client components (price-changes.ts is server-only: it reads with the visitor's cookies).

/** Status pill colours and labels, shared by the lifecycle queue, the record popup and Finance. */
export const PRICE_STATUS: Record<PriceChangeStatus, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: "var(--dk-background-color-amber-50, #fffbeb)", fg: "var(--dk-text-color-amber-700, #b45309)", label: "Waiting" },
  APPROVED: { bg: "var(--dk-background-color-emerald-50, #ecfdf5)", fg: "var(--dk-text-color-emerald-700, #047857)", label: "Approved" },
  APPLIED: { bg: "var(--dk-background-color-blue-50, #eff6ff)", fg: "var(--dk-text-color-blue-700, #1d4ed8)", label: "Applied" },
  REJECTED: { bg: "var(--dk-background-color-rose-50, #fff1f2)", fg: "var(--dk-text-color-rose-700, #be123c)", label: "Rejected" },
  WITHDRAWN: { bg: "var(--dk-background-color-stone-100, #f5f5f4)", fg: "var(--dk-text-color-stone-600, #57534e)", label: "Withdrawn" },
};

export const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");
