import { EYEBROW } from "@/components/admin/ui";
import type { FlowStepStatus, TicketFlow } from "@/lib/admin/types";

// The approval trail of a ticket as a vertical flow: Support ↓ Finance ↓ Admin. Each box says who acted,
// when and what; the box the ticket is in now is highlighted, the ones it never needs are greyed. The
// conversation and internal notes are a separate list (TicketTimeline). One column, so it reads at 390px.

const BOX: Record<FlowStepStatus, string> = {
  current: "border-amber-400 bg-amber-50 ring-2 ring-amber-200",
  done: "border-emerald-200 bg-white",
  upcoming: "border-dashed border-[#d6d3d1] bg-white",
  notneeded: "border-dashed border-[#e7e5e4] bg-[#fafaf9] opacity-60",
};
const DOT: Record<FlowStepStatus, string> = {
  current: "bg-amber-500 text-ink",
  done: "bg-emerald-600 text-white",
  upcoming: "border border-[#d6d3d1] bg-white text-[#78716c]",
  notneeded: "border border-[#e7e5e4] bg-[#f5f5f4] text-[#a8a29e]",
};
const TAG: Record<FlowStepStatus, string> = {
  current: "bg-amber-500 text-ink",
  done: "bg-emerald-100 text-emerald-800",
  upcoming: "bg-[#f5f5f4] text-[#57534e]",
  notneeded: "bg-[#f5f5f4] text-[#a8a29e]",
};
const TAG_TEXT: Record<FlowStepStatus, string> = { current: "Here now", done: "Done", upcoming: "Next", notneeded: "Not needed" };

export default function ApprovalTrail({ flow, className = "" }: { flow: TicketFlow; className?: string }) {
  return (
    <section aria-label="Approval trail" className={`rounded-2xl border border-line bg-cream p-3.5 sm:p-4 ${className}`}>
      <div className={EYEBROW}>Approval trail · Support ↓ Finance ↓ Admin</div>
      <p className="mt-1.5 mb-3 text-[13.5px] leading-snug font-bold break-words text-ink">{flow.next}</p>
      <ol className="m-0 flex list-none flex-col p-0">
        {flow.steps.map((s, i) => (
          <li key={s.key} className="flex flex-col items-stretch">
            <div className={`rounded-xl border p-3 ${BOX[s.status]}`} aria-current={s.status === "current" ? "step" : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden="true" className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${DOT[s.status]}`}>
                  {s.status === "done" ? "✓" : i + 1}
                </span>
                <b className="text-[14px] text-ink">{s.label}</b>
                <span className="min-w-0 text-[12px] text-[#78716c]">{s.note}</span>
                <span className={`ml-auto rounded-full px-2 py-px text-[10px] font-extrabold ${TAG[s.status]}`}>{TAG_TEXT[s.status]}</span>
              </div>
              {s.events.length > 0 && (
                <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0 pl-8">
                  {s.events.map((e, k) => (
                    <li key={`${e.at}-${k}`} className="text-[12.5px] leading-snug break-words text-[#44403c]">
                      <span className="font-semibold text-ink">{e.what}</span>
                      {e.self && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-px text-[10px] font-extrabold text-amber-300">Self-approved by Super Admin</span>}
                      <span className="block text-[11.5px] text-[#78716c]">
                        {e.who} · {e.when}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {i < flow.steps.length - 1 && (
              <div aria-hidden="true" className={`flex flex-col items-center py-0.5 ${flow.steps[i + 1]!.status === "notneeded" ? "text-[#d6d3d1]" : "text-amber-600"}`}>
                <span className="block h-2 w-0.5 bg-current" />
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
