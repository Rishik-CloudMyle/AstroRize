import AccessDenied from "@/components/admin/access-denied";
import PhoneBackupSetting from "@/components/admin/recording/phone-backup-setting";
import RecordingAccess from "@/components/admin/recording/recording-access";
import { PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getRecording } from "@/lib/admin/api";
import { periodLabel } from "@/lib/admin/view";

export const metadata = { title: "Recording" };

const RECORDED_AUDIO = [
  { mode: "Voice", note: "Voice consultations, Instant Calls and private voice calls from a live are recorded as audio, once both sides have accepted the recording notice." },
  { mode: "Video", note: "Video consultations are recorded as audio only — the picture is never saved." },
  { mode: "Phone line", note: "Phone backup calls (used when in-app voice can't connect) are recorded by the phone provider and copied here." },
];
const NOT_RECORDED = [
  { mode: "Live video", note: "Public live sessions aren't recorded. They go through the call provider and are never saved." },
];

const ROW = "grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 rounded-[14px] border px-4 py-3.5 sm:grid-cols-[130px_minmax(0,1fr)_auto]";
const PILL = "inline-flex h-8 w-fit items-center rounded-full border px-3.5 text-[12.5px] font-bold whitespace-nowrap";

export default async function RecordingPage() {
  if (!(await allowed("recording"))) return <AccessDenied />;
  const data = await getRecording();
  const { stored, retention } = data;
  return (
    <>
      <div className="mt-[18px] flex items-start gap-3 rounded-2xl border border-line bg-cream px-[18px] py-3.5">
        <span className="text-[16px]" aria-hidden="true">
          ⏺
        </span>
        <div className="flex-1">
          <b className="block text-[14px] text-ink">Voice and video consultations are recorded — audio only</b>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-[#57534e]">
            {data.media.connected
              ? "Both sides see the notice before the call (the customer ticks it) and a “Recording (audio)” sign during it. Video pictures and public lives are never saved. A Super Admin, and Support or Compliance when a Super Admin gives them access, can listen here (every playback is logged); the customer can play their own paid-session recording inside the app (playback only, no download)."
              : "Voice and video aren't connected yet (the call provider isn't set up). Once they are, consultations are recorded as audio only, after both sides accept the notice. Only staff given access can listen here; the customer can play their own recording inside the app."}
          </span>
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">What is recorded</h2>
        <div className="flex flex-col gap-[9px]">
          <div className={ROW} style={{ background: "var(--dk-background-color-emerald-50, #ecfdf5)", borderColor: "var(--dk-border-color-emerald-200, #a7f3d0)" }}>
            <b className="text-[14px] text-ink">Chat</b>
            <span className="text-[12.5px] leading-[1.5] text-[#57534e]">
              Live-room chat, chat inside consultations and astrologer–customer messages are stored in the database:{" "}
              <b className="tabular-nums">{stored.liveChat.toLocaleString("en-IN")}</b> live chat{" "}
              {stored.liveChat === 1 ? "message" : "messages"},{" "}
              <b className="tabular-nums">{stored.consultChat.toLocaleString("en-IN")}</b> consultation chat{" "}
              {stored.consultChat === 1 ? "message" : "messages"} and{" "}
              <b className="tabular-nums">{stored.messages.toLocaleString("en-IN")}</b>{" "}
              {stored.messages === 1 ? "message" : "messages"} in{" "}
              <b className="tabular-nums">{stored.conversations.toLocaleString("en-IN")}</b>{" "}
              {stored.conversations === 1 ? "conversation" : "conversations"}
              {stored.oldest ? ` · oldest from ${stored.oldest} IST` : ""}. Kept for {periodLabel(retention.days)}.
            </span>
            <span className={PILL} style={{ background: "#047857", borderColor: "#047857", color: "#fff" }}>
              Stored
            </span>
          </div>
          {RECORDED_AUDIO.map((r) => (
            <div key={r.mode} className={ROW} style={{ background: "var(--dk-background-color-rose-50, #fff1f2)", borderColor: "var(--dk-border-color-rose-200, #fecdd3)" }}>
              <b className="text-[14px] text-ink">{r.mode}</b>
              <span className="text-[12.5px] leading-[1.5] text-[#57534e]">{r.note}</span>
              <span className={PILL} style={{ background: "#be123c", borderColor: "#be123c", color: "#fff" }}>
                Audio recorded
              </span>
            </div>
          ))}
          {NOT_RECORDED.map((r) => (
            <div key={r.mode} className={ROW} style={{ background: "var(--dk-background-color-stone-100, #f5f5f4)", borderColor: "var(--dk-border-color-line, #e7e0d6)" }}>
              <b className="text-[14px] text-ink">{r.mode}</b>
              <span className="text-[12.5px] leading-[1.5] text-[#78716c]">{r.note}</span>
              <span
                aria-disabled="true"
                className={`${PILL} cursor-not-allowed border-dashed border-stone-300 bg-stone-100 text-muted`}
              >
                Not recorded
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3.5 mb-0 text-[12px] leading-[1.55] text-[#78716c]">
          The notice both sides see: “This consultation is recorded (audio only) for quality and safety. AstroRize staff and the customer can access it; the customer can play it back inside the app only — it can&apos;t be downloaded or shared.” Chat consultations aren&apos;t recorded as audio. The customer ticks (and the astrologer sees) a chat notice before the chat starts: “This chat is saved as text for quality and safety. AstroRize staff and the customer can read it; the customer can read it later in the app only — it can&apos;t be downloaded or shared.” Chats started before this notice have none. The free Messages messenger isn&apos;t covered by it.
          {data.calls ? (
            <>
              {" "}
              Recordings are{" "}
              {data.calls.retentionDays > 0 ? `deleted after ${data.calls.retentionDays} days` : "kept until a retention period is decided"} (Config
              recording.retention_days).
            </>
          ) : null}
        </p>
      </div>
      <RecordingAccess />
      <PhoneBackupSetting />
    </>
  );
}
