import AccessDenied from "@/components/admin/access-denied";
import CampaignsTable from "@/components/admin/marketing/campaigns-table";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getMarketing } from "@/lib/admin/api";

export const metadata = { title: "Marketing" };

const TERMINAL = "inline-flex h-[26px] items-center rounded-full px-[11px] text-[11px] font-bold";
const FLAG = "rounded-[4px] bg-rose-50 px-1 py-px text-rose-700";

export default async function MarketingPage() {
  if (!(await allowed("marketing"))) return <AccessDenied />;
  const data = await getMarketing();

  return (
    <div>
      <PageTitle
        title="Marketing"
        sub="Build campaigns and content packs. Approval and activation are done by an Admin, not by Marketing."
      />

      <div className="relative mt-[18px] flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-[18px] py-3.5">
        <span className="text-[16px]">🔒</span>
        <div className="flex-1">
          <b className="block text-[14px] text-blue-800">Marketing can never publish</b>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-blue-900">
            Approve and Activate are Admin capabilities. Editing a live campaign spawns a new version — the running
            version continues until it is replaced.
          </span>
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[16px] font-bold">Campaign state</h2>
          <span className="text-[12px] text-[#78716c]">{data.ribbonCampaign}</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {data.ribbon.map((label, i) => {
            const active = i === data.activeIndex;
            const done = i < data.activeIndex;
            return (
              <div key={label} className="min-w-0">
                <span
                  className="block h-[5px] rounded-full"
                  style={{ background: done ? "#f59e0b" : active ? "#047857" : "#e7e0d6" }}
                />
                <b
                  className="mt-[7px] block truncate text-[10px] tracking-[.02em]"
                  style={{
                    fontWeight: active ? 800 : 600,
                    color: active ? "#047857" : done ? "#57534e" : "#a8a29e",
                  }}
                >
                  {label}
                </b>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`${TERMINAL} bg-rose-50 text-rose-700`}>REJECTED</span>
          <span className={`${TERMINAL} bg-cream text-[#57534e]`}>CANCELLED</span>
          <span className={`${TERMINAL} bg-rose-50 text-rose-700`}>⚠ EMERGENCY_STOPPED</span>
          <span className="self-center text-[11.5px] text-[#78716c]">terminal states, each showing actor and reason</span>
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-[18px]`}>
        <CampaignsTable campaigns={data.campaigns} />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Gift catalogue</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Price must stay at or below the {data.giftCap} cap. New gifts need Admin approval before they go ACTIVE.
          </p>
          <div className="flex flex-col gap-[7px]">
            {data.gifts.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-[11px] rounded-xl border px-3 py-2.5"
                style={{ background: g.bg, borderColor: g.border }}
              >
                <span className="grid h-8 w-8 flex-[0_0_32px] place-items-center rounded-[10px] bg-amber-50 text-[14px] text-amber-800">
                  {g.icon}
                </span>
                <b className="min-w-0 flex-1 text-[13.5px] text-ink">{g.name}</b>
                <span className="text-[13px] font-bold text-ink tabular-nums">{g.price}</span>
                <span
                  className="inline-flex h-[21px] items-center rounded-full px-2 text-[9.5px] font-extrabold"
                  style={{ background: g.tagBg, color: g.tagFg }}
                >
                  {g.state}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Trust content check</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            Absolute-outcome claims are blocked before submission, not after a moderator sees them.
          </p>
          <div className="rounded-xl border border-line bg-white px-[15px] py-[13px] text-[13.5px] leading-[1.55] text-[#57534e]">
            “Consult our <b className={FLAG}>guaranteed-accurate</b> astrologers and{" "}
            <b className={FLAG}>solve any problem</b> in one session.”
          </div>
          <div className="mt-3 flex items-start gap-[9px] rounded-xl border border-rose-200 bg-rose-50 px-[13px] py-[11px]">
            <span className="text-rose-700">✕</span>
            <span className="text-[12px] leading-[1.45] text-rose-900">
              <b>2 claim violations.</b> Outcome guarantees and “solve any problem” breach the trust-copy rule.
              Submission is blocked until both are resolved.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
