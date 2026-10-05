import Link from "next/link";
import AccessDenied from "@/components/admin/access-denied";
import { AvailabilityCard, ChannelChart, TrendChart } from "@/components/admin/overview/charts";
import LiveNow from "@/components/admin/overview/live-now";
import SearchBox from "@/components/admin/overview/search-box";
import { KpiCard, PANEL } from "@/components/admin/ui";
import { canAccess } from "@/lib/admin/access";
import { getOverview, getSession, pageOfHref } from "@/lib/admin/api";
import { PAGE_HREF } from "@/lib/admin/constants";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await getSession();
  if (!canAccess(session, "overview")) return <AccessDenied />;

  const data = await getOverview();
  const worklist = data.worklist.filter((w) => {
    const key = pageOfHref(w.href, PAGE_HREF);
    return !key || canAccess(session, key);
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-display text-[36px] font-semibold">Operations overview</h1>
          <p className="mt-1 mb-0 text-[13px] text-[#78716c]">{data.dateLine}</p>
        </div>
        <SearchBox />
      </div>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {data.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <LiveNow initial={data.live} />

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4">
        <TrendChart card={data.dau} gradientId="azDau" />
        <TrendChart card={data.stickiness} gradientId="azStick" />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
        <ChannelChart days={data.channels} />
        <AvailabilityCard slices={data.availability} registered={data.registered} />
      </div>

      {data.trialBalance && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-rose-700 bg-rose-50 px-[18px] py-3.5">
          <span className="text-[17px]">⚖</span>
          <div className="flex-1">
            <b className="block text-[14px] text-rose-700">{data.trialBalance.title}</b>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-rose-900">{data.trialBalance.body}</span>
          </div>
          {canAccess(session, "finance") && (
            <Link
              href={PAGE_HREF.finance}
              className="inline-flex h-[38px] items-center rounded-[10px] bg-rose-700 px-[15px] text-[13px] font-bold text-white hover:text-white hover:no-underline"
            >
              Drill down
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] items-start gap-4">
        <div className={`${PANEL} p-5`}>
          <h2 className="mt-0 mb-3 text-[16px] font-bold">Work waiting on you</h2>
          <div className="flex flex-col gap-2">
            {worklist.map((w) => (
              <Link
                key={w.title}
                href={w.href}
                className="flex w-full items-center gap-[11px] rounded-xl border px-[13px] py-[11px] text-left hover:no-underline"
                style={{ borderColor: w.border, background: w.bg }}
              >
                <span
                  className="grid h-[26px] w-[26px] flex-[0_0_26px] place-items-center rounded-lg text-[12px] font-extrabold"
                  style={{ background: w.icoBg, color: w.icoFg }}
                >
                  {w.ico}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] text-ink">{w.title}</b>
                  <em className="mt-px block text-[11.5px] text-[#78716c] not-italic">{w.sub}</em>
                </span>
                <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: w.ageFg }}>
                  {w.age}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className={`${PANEL} relative p-5`}>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Recent privileged actions</h2>
          <p className="mt-0 mb-3 text-[12px] text-[#78716c]">Every privileged action is recorded in the audit log.</p>
          <div className="flex flex-col gap-2.5">
            {data.recentAudit.map((a) => (
              <div
                key={a.time + a.action + a.object}
                className="flex items-start gap-2.5 border-b border-line-soft pb-2.5"
              >
                <span className="pt-0.5 font-mono text-[10.5px] whitespace-nowrap text-muted">{a.time}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[12.5px] text-ink">{a.action}</b>
                  <em className="mt-px block text-[11.5px] text-[#78716c] not-italic">
                    {a.who} · {a.object}
                  </em>
                </span>
                {a.breakGlass && (
                  <span className="inline-flex h-5 flex-none items-center rounded-full bg-rose-50 px-2 text-[9.5px] font-extrabold text-rose-700">
                    BREAK-GLASS
                  </span>
                )}
              </div>
            ))}
          </div>
          {canAccess(session, "audit") && (
            <Link
              href={PAGE_HREF.audit}
              className="mt-3 flex h-[38px] w-full items-center justify-center rounded-[10px] border border-line bg-white text-[13px] font-bold text-ink hover:text-ink hover:no-underline"
            >
              Open audit log
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
