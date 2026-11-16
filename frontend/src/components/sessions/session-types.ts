// "My consultations" — what GET /api/my-sessions returns (backend/src/routes/my-sessions.ts).

export type SessionMode = "chat" | "voice" | "video" | "instant";

export type RecordingState = "ready" | "partial" | "processing" | "deleted" | "unavailable" | "none" | "off";

export interface RecordingPart {
  id: string;
  durationSeconds: number;
  /** The take ended early (the recording stopped sending) — playable, but may be incomplete. */
  partial: boolean;
  startedAt: string;
}

export interface TranscriptLine {
  id: string;
  from: "me" | "astrologer" | "system";
  text: string;
  at: string;
}

export interface SessionSummary {
  id: string;
  astrologer: { name: string; initials: string; slug: string; photo: string };
  mode: SessionMode;
  fixed: boolean;
  /** When the paid time started (ISO). */
  at: string;
  endedAt: string | null;
  durationSeconds: number;
  amount: number;
  recording: { state: RecordingState; parts: RecordingPart[] };
  transcript: { available: boolean; count: number };
}

export interface SessionDetail extends SessionSummary {
  rate: number;
  messages: TranscriptLine[];
}

const IST = "Asia/Kolkata";

/** "16 Nov 2026, 3:42 pm" (Indian time). */
export function sessionWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).replace(/\s?([ap]m)/i, (_, m: string) => ` ${m.toLowerCase()}`);
  return `${date}, ${time}`;
}

/** "3:42 pm" for a transcript line. */
export function lineTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST })
    .replace(/\s?([ap]m)/i, (_, m: string) => ` ${m.toLowerCase()}`);
}

/** Day heading of a transcript ("16 Nov 2026"). */
export function lineDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
}

export const MODE_LABEL: Record<SessionMode, string> = { chat: "Chat", voice: "Voice call", video: "Video call", instant: "Instant Call" };

/** "12 min" / "4 min 12 s" / "—" */
export function minutesLabel(secs: number): string {
  if (secs <= 0) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** What the list row says about the session's record. */
export function recordLabel(s: SessionSummary): { text: string; tone: "success" | "info" | "neutral" | "gold" } {
  if (s.mode === "chat") return s.transcript.available ? { text: "Chat transcript", tone: "success" } : { text: "No transcript", tone: "neutral" };
  switch (s.recording.state) {
    case "ready":
      return { text: "Recording", tone: "success" };
    case "partial":
      return { text: "Recording (partial)", tone: "gold" };
    case "processing":
      return { text: "Preparing", tone: "info" };
    case "unavailable":
      return { text: "Unavailable", tone: "neutral" };
    case "deleted":
      return { text: "Deleted", tone: "neutral" };
    default:
      return { text: s.transcript.available ? "Messages" : "Not recorded", tone: "neutral" };
  }
}
