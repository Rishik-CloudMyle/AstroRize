import Link from "next/link";
import { KpiCard, PANEL } from "@/components/admin/ui";
import { kpi } from "@/lib/admin/view";
import { apiGet } from "@/lib/api/server";

interface HrOverview {
  kpis: {
    applicationsWaiting: number;
    overSla: number;
    newThisWeek: number;
    priceRequests: number;
    activeAstrologers: number;
    inTraining: number;
    joinedLast30Days: number;
    trainingOpen: number;
    trainingLate: number;
  };
  slaDays: number;
  stages: { label: string; count: number }[];
  astrologersByStatus: { status: string; count: number }[];
  people: { id: string; name: string; status: string; skill: string; since: string | null; trainingDone: number; trainingTotal: number; trainingLate: number }[];
  oldest: { id: string; name: string; skill: string; state: string; age: string; overSla: boolean }[];
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  training: "In training",
  docs: "Documents pending",
  draft: "Application in progress",
  suspended: "Suspended",
  paused: "Paused",
};
const status = (s: string) => STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

/** The HR department's home: recruiting and onboarding at a glance (applications, pipeline, astrologers). */
export default async function HrOverviewView({ dateLine }: { dateLine: string }) {
  const { hr } = await apiGet<{ hr: HrOverview }>("/admin/hr/overview");
  const k = hr.kpis;
  const cards = [
    kpi("Applications waiting", String(k.applicationsWaiting), `${k.overSla} over the ${hr.slaDays}-day review time`, "#be123c", k.overSla > 0),
    kpi("New this week", String(k.newThisWeek), "applications received in 7 days", "#78716c"),
    kpi("Price requests", String(k.priceRequests), "waiting for a decision", "#b45309"),
    kpi("Active astrologers", String(k.activeAstrologers), `${k.joinedLast30Days} joined in 30 days`, "#047857"),
    kpi("In training", String(k.inTraining), `${k.trainingOpen} modules open · ${k.trainingLate} overdue`, k.trainingLate ? "#be123c" : "#78716c"),
  ];
  const maxStage = Math.max(1, ...hr.stages.map((s) => s.count));
  const totalAstro = hr.astrologersByStatus.reduce((s, a) => s + a.count, 0) || 1;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-display text-[36px] font-semibold">HR overview</h1>
          <p className="mt-1 mb-0 text-[13px] text-[#78716c]">{dateLine} · recruiting and onboarding</p>
        </div>
        <Link href="/admin/lifecycle" className="inline-flex h-11 items-center rounded-xl bg-amber-500 px-5 text-[13.5px] font-bold text-ink hover:no-underline">
          Open Astrologer lifecycle
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {cards.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={`${PANEL} p-5`} aria-labelledby="hr-pipeline">
          <h2 id="hr-pipeline" className="m-0 text-[16px] font-bold">Application pipeline</h2>
          <p className="mt-1 mb-3 text-[12px] text-[#78716c]">Where every open application stands.</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {hr.stages.map((s) => (
              <li key={s.label} className="grid grid-cols-[120px_minmax(0,1fr)_28px] items-center gap-3 text-[13px]">
                <span className="text-[#57534e]">{s.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[#efe9dc]">
                  <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                </span>
                <b className="text-right tabular-nums">{s.count}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${PANEL} p-5`} aria-labelledby="hr-astros">
          <h2 id="hr-astros" className="m-0 text-[16px] font-bold">Astrologers by status</h2>
          <p className="mt-1 mb-3 text-[12px] text-[#78716c]">{totalAstro === 1 && hr.astrologersByStatus.length === 0 ? "No astrologers yet." : "Everyone on the platform."}</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {hr.astrologersByStatus.map((a) => (
              <li key={a.status} className="grid grid-cols-[150px_minmax(0,1fr)_28px] items-center gap-3 text-[13px]">
                <span className="text-[#57534e]">{status(a.status)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[#efe9dc]">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(a.count / totalAstro) * 100}%` }} />
                </span>
                <b className="text-right tabular-nums">{a.count}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={`${PANEL} mt-4 p-5`} aria-labelledby="hr-people">
        <h2 id="hr-people" className="m-0 text-[16px] font-bold">Astrologers</h2>
        <p className="mt-1 mb-3 text-[12px] text-[#78716c]">Open a group to see who is in it.</p>
        <div className="flex flex-col gap-2.5">
          {hr.astrologersByStatus.map((g, i) => {
            const members = hr.people.filter((p) => p.status === g.status);
            return (
              <details key={g.status} open={i < 2} className="rounded-xl border border-line bg-white">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-bold">
                  <span>{status(g.status)}</span>
                  <span className="text-[12px] font-semibold text-[#78716c]">{g.count} {g.count === 1 ? "person" : "people"}</span>
                </summary>
                <ul className="m-0 list-none border-t border-line-soft p-0">
                  {members.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-soft px-4 py-2.5 text-[13px] last:border-b-0">
                      <span className="min-w-0">
                        <b className="block">{p.name}</b>
                        <span className="text-[12px] text-[#78716c]">{[p.skill, p.since ? `active since ${p.since}` : ""].filter(Boolean).join(" · ")}</span>
                      </span>
                      {p.status === "training" && (
                        <span className={`text-[12px] font-semibold ${p.trainingLate ? "text-rose-700" : "text-[#57534e]"}`}>
                          Training {p.trainingDone} of {p.trainingTotal} done{p.trainingLate ? ` · ${p.trainingLate} overdue` : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>

      <section className={`${PANEL} mt-4 p-5`} aria-labelledby="hr-waiting">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="hr-waiting" className="m-0 text-[16px] font-bold">Waiting the longest</h2>
          <Link href="/admin/lifecycle" className="text-[12.5px] font-bold text-amber-700">All applications ›</Link>
        </div>
        {hr.oldest.length === 0 ? (
          <p className="mt-3 mb-0 text-center text-[13px] text-[#78716c]">No applications are waiting. New ones appear here as astrologers apply.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] tracking-[.08em] text-[#78716c] uppercase">
                  <th className="py-2 pr-3 font-bold">Applicant</th>
                  <th className="py-2 pr-3 font-bold">Primary skill</th>
                  <th className="py-2 pr-3 font-bold">Stage</th>
                  <th className="py-2 text-right font-bold">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {hr.oldest.map((a) => (
                  <tr key={a.id} className="border-t border-line-soft">
                    <td className="py-2.5 pr-3 font-semibold">{a.name}</td>
                    <td className="py-2.5 pr-3 text-[#57534e]">{a.skill}</td>
                    <td className="py-2.5 pr-3">{a.state}</td>
                    <td className={`py-2.5 text-right font-semibold tabular-nums ${a.overSla ? "text-rose-700" : "text-[#57534e]"}`}>{a.age}{a.overSla ? " · over SLA" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
