"use client";

// The call-recording notice (client decision, Nov 2026): voice and video consultations — Instant
// Calls and private calls from a live too — are recorded as audio only, and only AstroRize can
// listen. The customer ticks it before such a consultation is placed (the API refuses without it);
// the astrologer sees it on the incoming call and the call screen. Chat isn't recorded as audio (its
// text is kept like any chat).
// ⚠ Wording drafted for the client's approval.

export const RECORDING_NOTICE = "This consultation is recorded (audio only) for quality and safety. Only AstroRize can access it.";

/** Whether a choice is recorded: voice, video and Instant Call (not chat). */
export const isRecordedChoice = (choice: string | null | undefined) => choice === "voice" || choice === "video" || choice === "instant";

/** The customer's tick, shown before they start a voice or video consultation. */
export function RecordingConsent({ checked, onChange, className = "" }: { checked: boolean; onChange: (checked: boolean) => void; className?: string }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-cream px-3 py-2.5 text-left text-[12.5px] leading-normal text-stone-700 max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-app-tint max-lg:text-app-ink-2 ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-amber-600"
      />
      <span>
        <b className="font-bold text-ink max-lg:text-app-ink">● Recorded call. </b>
        {RECORDING_NOTICE} I agree.
      </span>
    </label>
  );
}

/** "● Recording (audio)" — on the call screen of both sides while the call is recorded. */
export function RecordingBadge({ light = false }: { light?: boolean }) {
  return (
    <span
      title={RECORDING_NOTICE}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold whitespace-nowrap max-lg:h-6 max-lg:px-2.5 max-lg:text-[11px] max-lg:bg-app-error-bg max-lg:text-app-error ${
        light ? "bg-rose-50 text-rose-700" : "bg-rose-500/15 text-rose-200"
      }`}
    >
      <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-rose-500" />
      Recording (audio)
    </span>
  );
}
