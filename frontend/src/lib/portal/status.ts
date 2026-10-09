import { LIFECYCLE } from "./lifecycle";
import type { AccountStatus, Banner } from "./types";

// What the account state means for the portal (logic.js → renderVals, top half).

export function isActive(status: AccountStatus): boolean {
  return status.lifecycle === "active" && status.suspension === "none";
}

/** Short state line under the astrologer's name in the sidebar. */
export function accountStateLabel(status: AccountStatus): { label: string; color: string } {
  if (status.suspension === "full") return { label: "Fully suspended", color: "#be123c" };
  if (status.suspension === "partial") return { label: "Partially suspended", color: "#be123c" };
  if (status.lifecycle === "active") return { label: "Approved · Active", color: "#047857" };
  const stage = LIFECYCLE.find((l) => l.key === status.lifecycle);
  return { label: stage?.label ?? "", color: "#b45309" };
}

export function bannerFor(status: AccountStatus): Banner {
  if (status.suspension === "partial") {
    return {
      icon: "⚠",
      title: "Account partially suspended",
      body: "You cannot start new sessions or go live. Your profile and earnings remain readable, and you can respond to the open compliance notice.",
      bg: "#fff1f2",
      border: "#fecdd3",
      fg: "#be123c",
    };
  }
  if (status.suspension === "full") {
    return {
      icon: "⛔",
      title: "Account fully suspended",
      body: "Everything is read-only except the compliance response path. Open the compliance console to answer the notice.",
      bg: "#fff1f2",
      border: "#fecdd3",
      fg: "#be123c",
    };
  }
  const stage = LIFECYCLE.find((l) => l.key === status.lifecycle) ?? LIFECYCLE[7];
  return { icon: stage.icon, title: stage.title, body: stageBody(status, stage.body), bg: stage.bg, border: stage.border, fg: stage.fg };
}

/** The stage's text with the real details: when it was sent, HR's review time, HR's note. */
function stageBody(status: AccountStatus, fallback: string): string {
  const note = status.note?.trim();
  if (status.lifecycle === "review" && status.submittedOn) {
    const days = status.reviewDays ? ` HR typically responds within ${status.reviewDays} ${status.reviewDays === 1 ? "day" : "days"}.` : "";
    return `Submitted ${status.submittedOn}.${days}`;
  }
  if (status.lifecycle === "docs" && note) {
    return `HR asks: “${note}” Update your application and send it again from the last step.`;
  }
  if (status.lifecycle === "rejected" && note) {
    return `Reason: ${/[.!?]$/.test(note) ? note : `${note}.`} If you have questions, contact Astrorize support.`;
  }
  return fallback;
}

/** Why the online toggle is unavailable, when it is. */
export function blockedReason(status: AccountStatus): string {
  if (status.suspension !== "none") return "Blocked — account suspended";
  if (status.lifecycle === "pricing") return "Blocked — pricing pending approval";
  return "Blocked — application not approved";
}
