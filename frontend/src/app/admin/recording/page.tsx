import AccessDenied from "@/components/admin/access-denied";
import RetentionForm from "@/components/admin/recording/retention-form";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getRecording } from "@/lib/admin/api";
import { periodLabel } from "@/lib/admin/view";

export const metadata = { title: "Recording" };

// What is really captured today. Calls and video need a calling/streaming provider, which isn't
// connected, so those rows say so and have no controls.
const UNAVAILABLE = [
  { mode: "Voice (RTC)", note: "Voice calls aren't recorded. Needs a calling provider to be connected." },
  { mode: "Video (RTC)", note: "Video calls and live video aren't recorded. Needs a streaming provider to be connected." },
  { mode: "PSTN", note: "Phone-line calls aren't recorded. Needs a telephony provider to be connected." },
];

const ROW = "grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 rounded-[14px] border px-4 py-3.5 sm:grid-cols-[130px_minmax(0,1fr)_auto]";
const PILL = "inline-flex h-8 w-fit items-center rounded-full border px-3.5 text-[12.5px] font-bold whitespace-nowrap";

export default async function RecordingPage() {
  if (!(await allowed("recording"))) return <AccessDenied />;
  const data = await getRecording();
  const { stored, retention } = data;

  return (
    <div>
      <PageTitle
        title="Recording & retention"
        sub="What Astrorize keeps from consultations and lives, and for how long. Changes are recorded in the audit log."
      />

      <div className="mt-[18px] flex items-start gap-3 rounded-2xl border border-line bg-cream px-[18px] py-3.5">
        <span className="text-[16px]" aria-hidden="true">
          ⏺
        </span>
        <div className="flex-1">
          <b className="block text-[14px] text-ink">
            Recording provider: {data.provider.connected ? "connected" : "not connected"}
          </b>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-[#57534e]">
            No calling or streaming provider is connected yet, so no voice or video is recorded anywhere. Only written
            chat and messages are stored.
          </span>
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">What is recorded</h2>
        <div className="flex flex-col gap-[9px]">
          <div className={ROW} style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}>
            <b className="text-[14px] text-ink">Chat</b>
            <span className="text-[12.5px] leading-[1.5] text-[#57534e]">
              Live-room chat and astrologer–customer messages are stored in the database:{" "}
              <b className="tabular-nums">{stored.liveChat.toLocaleString("en-IN")}</b> live chat{" "}
              {stored.liveChat === 1 ? "message" : "messages"} and{" "}
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
          {UNAVAILABLE.map((r) => (
            <div key={r.mode} className={ROW} style={{ background: "#f5f5f4", borderColor: "#e7e0d6" }}>
              <b className="text-[14px] text-ink">{r.mode}</b>
              <span className="text-[12.5px] leading-[1.5] text-[#78716c]">{r.note}</span>
              <span
                aria-disabled="true"
                className={`${PILL} cursor-not-allowed border-dashed border-stone-300 bg-stone-100 text-muted`}
              >
                Not available
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3.5 mb-0 text-[12px] leading-[1.55] text-[#78716c]">
          Because no call is recorded, customers see no recording notice. Once a provider is connected, voice and video
          recording can be set up here per type, with its own retention period and a customer-facing notice.
        </p>
      </div>

      <RetentionForm retention={retention} lastPurge={data.lastPurge} />
    </div>
  );
}
