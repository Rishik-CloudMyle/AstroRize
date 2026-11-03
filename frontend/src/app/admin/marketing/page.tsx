import AccessDenied from "@/components/admin/access-denied";
import CampaignsTable from "@/components/admin/marketing/campaigns-table";
import CopyCheck from "@/components/admin/marketing/copy-check";
import { PageTitle, PANEL } from "@/components/admin/ui";
import { allowed } from "@/lib/admin/guard";
import { getMarketing } from "@/lib/admin/api";

export const metadata = { title: "Marketing" };


export default async function MarketingPage() {
  if (!(await allowed("marketing"))) return <AccessDenied />;
  const data = await getMarketing();

  return (
    <div>
      <PageTitle
        title="Marketing"
        sub="Campaign offers customers claim, the gift catalogue and a copy check. Approval and activation are done by an Admin, not by Marketing."
      />

      <div className="relative mt-[18px] flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-[18px] py-3.5">
        <span className="text-[16px]">🔒</span>
        <div className="flex-1">
          <b className="block text-[14px] text-blue-800">Marketing can never publish</b>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-blue-900">
            Marketing submits campaigns; an Admin approves them, which makes them live. A campaign above the{" "}
            {data.maxDiscountPct}% limit can&apos;t be submitted or approved
            {data.floorMode === "reject"
              ? `, nor one above ${data.floorCapPct}% (the ${data.floorPct}% cashback floor)`
              : `; above ${data.floorCapPct}% it applies as ${data.floorCapPct}% (the ${data.floorPct}% cashback floor)`}
            . A bonus credit can be at most ₹{data.bonusMax}.
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-[18px] py-3.5">
        <span className="text-[16px] text-amber-800">ⓘ</span>
        <span className="flex-1 text-[13px] leading-[1.5] text-amber-900">
          <b>Claim first, then use.</b> Customers are told about a live offer in their notifications and claim it on the Offers
          page. A claimed cashback is added at their next recharge, a discount at their next consultation (AstroRize pays it —
          the astrologer still earns on the full price), and a bonus credit straight away. Legacy campaigns are listed only.
        </span>
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-[16px] font-bold">Campaign flow</h2>
          <span className="text-[12px] text-[#78716c]">
            {data.activeCampaigns.length ? `Live: ${data.activeCampaigns.join(", ")}` : "No campaign is live"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.flow.map((f) => (
            <div key={f.state} className="min-w-0 rounded-[12px] bg-cream px-3 py-2.5">
              <span
                className="block h-[5px] rounded-full"
                style={{ background: f.state === "ACTIVE" ? "#047857" : f.state === "EXPIRED" ? "#d6d3d1" : "#f59e0b" }}
              />
              <b className="mt-[7px] block truncate text-[10.5px] tracking-[.04em] text-[#57534e]">{f.state}</b>
              <span className="block text-[20px] font-bold text-ink tabular-nums">{f.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-[18px]`}>
        <CampaignsTable campaigns={data.campaigns} limits={data} />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Gift catalogue</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
            The gifts customers can send in live rooms. A gift priced at the {data.giftCap} cap shows AT CAP.
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

        <CopyCheck />
      </div>
    </div>
  );
}
