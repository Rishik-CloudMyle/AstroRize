import type { LifecycleStage } from "./types";

/**
 * Every state the status banner can show (logic.js → LIFECYCLE).
 * The backend decides which one applies; the portal only renders it. The submitted date,
 * review time and HR's note are filled in from the account status (lib/portal/status.ts).
 */
export const LIFECYCLE: LifecycleStage[] = [
  { key: "draft", label: "Draft", icon: "📝", bg: "var(--dk-background-color-amber-50, #fffbeb)", border: "var(--dk-border-color-amber-200, #fde68a)", fg: "var(--dk-text-color-amber-800, #92400e)", title: "Application in draft", body: "Nothing has been sent to HR yet. Complete the application and submit it from the last step." },
  { key: "review", label: "Under HR review", icon: "🔍", bg: "var(--dk-background-color-blue-50, #eff6ff)", border: "var(--dk-border-color-blue-200, #bfdbfe)", fg: "var(--dk-text-color-blue-800, #1e40af)", title: "Under HR review", body: "Your application is with HR. They will be in touch soon." },
  { key: "interview", label: "Interview", icon: "📅", bg: "var(--dk-background-color-blue-50, #eff6ff)", border: "var(--dk-border-color-blue-200, #bfdbfe)", fg: "var(--dk-text-color-blue-800, #1e40af)", title: "Interview stage", body: "HR will contact you on your registered mobile number or email to arrange a video interview." },
  { key: "docs", label: "Docs pending", icon: "📎", bg: "var(--dk-background-color-amber-50, #fffbeb)", border: "var(--dk-border-color-amber-200, #fde68a)", fg: "var(--dk-text-color-amber-800, #92400e)", title: "More information needed", body: "HR needs a little more from you. Update your application and send it again from the last step." },
  { key: "negotiation", label: "Negotiation", icon: "💬", bg: "var(--dk-background-color-amber-50, #fffbeb)", border: "var(--dk-border-color-amber-200, #fde68a)", fg: "var(--dk-text-color-amber-800, #92400e)", title: "Rate discussion", body: "HR is reviewing the rates you requested and will contact you about them." },
  { key: "pricing", label: "Pricing pending", icon: "⏳", bg: "var(--dk-background-color-blue-50, #eff6ff)", border: "var(--dk-border-color-blue-200, #bfdbfe)", fg: "var(--dk-text-color-blue-800, #1e40af)", title: "Pricing pending approval", body: "Your rates are agreed and awaiting Finance sign-off. You cannot go online until this clears." },
  { key: "training", label: "Training", icon: "🎓", bg: "var(--dk-background-color-amber-50, #fffbeb)", border: "var(--dk-border-color-amber-200, #fde68a)", fg: "var(--dk-text-color-amber-800, #92400e)", title: "Training stage", body: "HR will share the training to complete. Your account becomes active once HR approves it." },
  { key: "active", label: "Approved — Active", icon: "✓", bg: "var(--dk-background-color-emerald-50, #ecfdf5)", border: "var(--dk-border-color-emerald-200, #a7f3d0)", fg: "var(--dk-text-color-emerald-700, #047857)", title: "Approved — Active", body: "You can go online, host live rooms and accept consultations." },
  { key: "rejected", label: "Rejected", icon: "✕", bg: "var(--dk-background-color-rose-50, #fff1f2)", border: "var(--dk-border-color-rose-200, #fecdd3)", fg: "var(--dk-text-color-rose-700, #be123c)", title: "Application not approved", body: "HR did not approve this application. If you have questions, contact AstroRize support." },
];
