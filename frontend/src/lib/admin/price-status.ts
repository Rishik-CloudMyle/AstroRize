import type { PriceChangeStatus } from "./price-changes";

// Shared by client components (price-changes.ts is server-only: it reads with the visitor's cookies).

/** Status pill colours and labels, shared by the lifecycle queue, the record popup and Finance. */
export const PRICE_STATUS: Record<PriceChangeStatus, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: "#fffbeb", fg: "#b45309", label: "Waiting" },
  APPROVED: { bg: "#ecfdf5", fg: "#047857", label: "Approved" },
  APPLIED: { bg: "#eff6ff", fg: "#1d4ed8", label: "Applied" },
  REJECTED: { bg: "#fff1f2", fg: "#be123c", label: "Rejected" },
  WITHDRAWN: { bg: "#f5f5f4", fg: "#57534e", label: "Withdrawn" },
};

export const rupee = (n: number) => "₹" + n.toLocaleString("en-IN");
