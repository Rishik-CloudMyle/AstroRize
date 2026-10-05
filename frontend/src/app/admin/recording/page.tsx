import AccessDenied from "@/components/admin/access-denied";
import RecordingToggle from "@/components/admin/recording/recording-toggle";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getRecording } from "@/lib/admin/api";
import type { RecordingModality } from "@/lib/admin/types";

export const metadata = { title: "Recording" };

// Row and toggle styles per status, from the prototype's recModalities.
const STATUS: Record<RecordingModality["status"], { label: string; bg: string; border: string; toggle: string }> = {
  enabled: {
    label: "Enabled",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    toggle: "border-solid border-emerald-700 bg-emerald-700 text-white",
  },
  blocked: {
    label: "Blocked — checklist",
    bg: "#f5f5f4",
    border: "#e7e0d6",
    toggle: "border-dashed border-stone-300 bg-stone-100 text-muted",
  },
  disabled: {
    label: "Disabled",
    bg: "#fffdf8",
    border: "#e7e0d6",
    toggle: "border-solid border-line bg-white text-[#78716c]",
  },
};

export default async function RecordingPage() {
  if (!(await allowed("recording"))) return <AccessDenied />;
  const data = await getRecording();

  return (
    <div>
      <PageTitle
        title="Recording & retention"
        sub="Set per consultation type, double-audited, and limited to what the recording provider can actually deliver."
      />

      {!data.checklist.complete && (
        <div className="mt-[18px] flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-[18px] py-3.5">
          <span className="text-[16px]">📋</span>
          <div className="flex-1">
            <b className="block text-[14px] text-amber-800">{data.checklist.title}</b>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-amber-900">{data.checklist.body}</span>
          </div>
        </div>
      )}

      <div className={`${PANEL} mt-4 p-5`}>
        <h2 className="mt-0 mb-3.5 text-[16px] font-bold">Per-modality recording</h2>
        <div className="flex flex-col gap-[9px]">
          {data.modalities.map((r) => {
            const s = STATUS[r.status];
            return (
              <div
                key={r.mode}
                className="grid grid-cols-[120px_minmax(0,1fr)_auto_auto] items-center gap-4 rounded-[14px] border px-4 py-3.5"
                style={{ background: s.bg, borderColor: s.border }}
              >
                <b className="text-[14px] text-ink">{r.mode}</b>
                <span className="text-[12.5px] text-[#78716c]">{r.note}</span>
                <span className="text-[12.5px] font-bold whitespace-nowrap text-[#57534e]">
                  Retention {r.retention}
                </span>
                <RecordingToggle
                  modality={r}
                  label={s.label}
                  className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[12.5px] font-bold whitespace-nowrap ${s.toggle}`}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3.5 mb-0 text-[12px] leading-[1.55] text-[#78716c]">
          Where recording is enabled, the customer-facing notice — banner plus icon — becomes active at session start
          for that modality. Where it is off, customers see no recording notice. Toggling requires dual audit and
          step-up MFA.
        </p>
      </div>
    </div>
  );
}
