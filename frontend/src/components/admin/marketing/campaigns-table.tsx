"use client";

import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { Campaign, CampaignState } from "@/lib/admin/types";

function tone(st: CampaignState): [string, string] {
  if (st === "ACTIVE") return ["#ecfdf5", "#047857"];
  if (st === "UNDER_REVIEW" || st === "SUBMITTED") return ["#eff6ff", "#1d4ed8"];
  if (st === "EXPIRED") return ["#f5f5f4", "#a8a29e"];
  return ["#f7f4ee", "#57534e"];
}

function actionLabel(st: CampaignState): string {
  if (st === "ACTIVE") return "Edit — new version";
  if (st === "DRAFT") return "Submit for approval";
  if (st === "EXPIRED") return "Duplicate";
  return "Read only";
}

const HEADS: [string, "left" | "right"][] = [
  ["ID", "left"],
  ["Campaign", "left"],
  ["Denominations", "left"],
  ["Cashback", "right"],
  ["State", "left"],
  ["", "right"],
];

export default function CampaignsTable({ campaigns }: { campaigns: Campaign[] }) {
  const { say } = useAdmin();
  const { run } = useAction();

  // From the prototype's campaignAct / campaignSubmit; submit and duplicate go to the API.
  const act = (id: string, st: CampaignState) => {
    if (st === "ACTIVE") {
      say(`${id} is live — editing spawns a new version. The running version continues until it is replaced.`);
    } else if (st === "DRAFT") {
      void run(
        () => api.post(`/admin/campaigns/${id}/submit`),
        `${id} submitted. Marketing can no longer edit it — Admin approves and activates.`,
      );
    } else if (st === "EXPIRED") {
      void run(
        () => api.post<{ id: string }>(`/admin/campaigns/${id}/duplicate`),
        (r) => `${id} duplicated as ${r.id}, a new DRAFT. Schedule and creative copied; approvals do not carry over.`,
      );
    } else {
      say(`${id} is under review — read-only for Marketing.`);
    }
  };

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {HEADS.map(([label, align], i) => (
            <th key={i} className={TH} style={{ textAlign: align }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {campaigns.map((c) => {
          const st = c.state;
          const [bg, fg] = tone(st);
          const locked = st === "UNDER_REVIEW" || st === "SUBMITTED";
          return (
            <tr key={c.id}>
              <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] text-[#57534e]`}>{c.id}</td>
              <td className={`${TD} px-2.5 py-[11px] font-bold text-ink`}>{c.name}</td>
              <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{c.denoms}</td>
              <td className={`${TD} px-2.5 py-[11px] text-right text-[#57534e] tabular-nums`}>{c.cashback}</td>
              <td className={`${TD} px-2.5 py-[11px]`}>
                <span
                  className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                  style={{ background: bg, color: fg }}
                >
                  {st}
                </span>
              </td>
              <td className={`${TD} px-2.5 py-[11px] text-right`}>
                {locked ? (
                  <span className="inline-flex h-[30px] items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 px-3 text-[11.5px] font-bold text-muted">
                    {actionLabel(st)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => act(c.id, st)}
                    className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-[#57534e]"
                  >
                    {actionLabel(st)}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
