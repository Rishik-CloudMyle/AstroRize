import type { LifecycleStage } from "./types";

/**
 * Every state the status banner can show (logic.js → LIFECYCLE).
 * The backend decides which one applies; the portal only renders it. The submitted date,
 * review time and HR's note are filled in from the account status (lib/portal/status.ts).
 */
export const LIFECYCLE: LifecycleStage[] = [
  { key: "draft", label: "Draft", icon: "📝", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Application in draft", body: "Nothing has been sent to HR yet. Complete the application and submit it from the last step." },
  { key: "review", label: "Under HR review", icon: "🔍", bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", title: "Under HR review", body: "Your application is with HR. They will be in touch soon." },
  { key: "interview", label: "Interview", icon: "📅", bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", title: "Interview stage", body: "HR will contact you on your registered mobile number or email to arrange a video interview." },
  { key: "docs", label: "Docs pending", icon: "📎", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "More information needed", body: "HR needs a little more from you. Update your application and send it again from the last step." },
  { key: "negotiation", label: "Negotiation", icon: "💬", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Rate discussion", body: "HR is reviewing the rates you requested and will contact you about them." },
  { key: "pricing", label: "Pricing pending", icon: "⏳", bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", title: "Pricing pending approval", body: "Your rates are agreed and awaiting Finance sign-off. You cannot go online until this clears." },
  { key: "training", label: "Training", icon: "🎓", bg: "#fffbeb", border: "#fde68a", fg: "#92400e", title: "Training stage", body: "HR will share the training to complete. Your account becomes active once HR approves it." },
  { key: "active", label: "Approved — Active", icon: "✓", bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857", title: "Approved — Active", body: "You can go online, host live rooms and accept consultations." },
  { key: "rejected", label: "Rejected", icon: "✕", bg: "#fff1f2", border: "#fecdd3", fg: "#be123c", title: "Application not approved", body: "HR did not approve this application. If you have questions, contact AstroRize support." },
];
