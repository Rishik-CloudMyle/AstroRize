import type { LifecycleStage } from "./types";

/**
 * Every state the status banner can show (logic.js → LIFECYCLE).
 * The backend decides which one applies; the portal only renders it.
 */
export const LIFECYCLE: LifecycleStage[] = [
  { key: "draft", label: "Draft", icon: "📝", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Application in draft", body: "Draft expires in 12 days. Nothing has been sent to HR yet." },
  { key: "review", label: "Under HR review", icon: "🔍", bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", title: "Under HR review", body: "Submitted 3 September. HR typically responds within 5 working days." },
  { key: "interview", label: "Interview scheduled", icon: "📅", bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", title: "Interview scheduled — 18 Sep, 3:00 pm IST", body: "Video call. Request a reschedule up to twice, at least 12 hours before." },
  { key: "docs", label: "Docs pending", icon: "📎", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Documents requested", body: "PAN card was unreadable. Resubmit at step 8 — everything else is accepted." },
  { key: "negotiation", label: "Negotiation", icon: "💬", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Rate proposal received", body: "Platform proposes ₹90/min voice against your ₹100. Two counter-rounds remain." },
  { key: "pricing", label: "Pricing pending", icon: "⏳", bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", title: "Pricing pending approval", body: "Your rates are agreed and awaiting Finance sign-off. You cannot go online until this clears." },
  { key: "training", label: "Training assigned", icon: "🎓", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Training assigned", body: "Two modules: Customer safety and Platform conduct. Both must be completed before your account becomes active." },
  { key: "active", label: "Approved — Active", icon: "✓", bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857", title: "Approved — Active", body: "You can go online, host live rooms and accept consultations." },
  { key: "rejected", label: "Rejected", icon: "✕", bg: "#fff1f2", border: "#fecdd3", fg: "#be123c", title: "Application not approved", body: "Reason: insufficient verifiable practice history. You may reapply in 68 days with a fresh application." },
];
