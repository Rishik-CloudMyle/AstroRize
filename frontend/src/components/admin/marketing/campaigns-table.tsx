"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { CAMPAIGN_SORTS, sortRows } from "@/lib/admin/sort";
import type { Campaign, CampaignState, MarketingData } from "@/lib/admin/types";
import CampaignForm from "./campaign-form";

function tone(st: CampaignState): [string, string] {
  if (st === "ACTIVE") return ["#ecfdf5", "#047857"];
  if (st === "UNDER_REVIEW" || st === "SUBMITTED") return ["#eff6ff", "#1d4ed8"];
  if (st === "EXPIRED") return ["#f5f5f4", "#a8a29e"];
  return ["#f7f4ee", "#57534e"];
}

const KIND_LABEL: Record<Campaign["kind"], string> = {
  RECHARGE_CASHBACK: "Recharge cashback",
  CONSULT_DISCOUNT: "Consultation discount",
  BONUS_CREDIT: "Bonus credit",
};

const HEADS: [string, "left" | "right"][] = [
  ["ID", "left"],
  ["Campaign", "left"],
  ["Runs", "left"],
  ["Claims", "right"],
  ["State", "left"],
  ["", "right"],
];

const BTN = "h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-[#57534e] disabled:opacity-60";

type Limits = Pick<MarketingData, "maxDiscountPct" | "floorPct" | "floorMode" | "floorCapPct" | "bonusMax">;

export default function CampaignsTable({ campaigns, limits }: { campaigns: Campaign[]; limits: Limits }) {
  const { session } = useAdmin();
  const { run, busy } = useAction();
  const [sort, setSort] = useUrlSort(CAMPAIGN_SORTS);
  const rows = sortRows(campaigns, CAMPAIGN_SORTS, sort);
  // Approve & activate needs campaign.approve (Super Admin by default; RBAC can grant it); the API enforces it too.
  const canApprove = session.capabilities.includes("campaign.approve");
  const canSubmit = session.capabilities.includes("campaign.submit");
  // The draft being edited (null with `editing` = a new one).
  const [editing, setEditing] = useState<{ campaign: Campaign | null } | null>(null);
  const [ending, setEnding] = useState<Campaign | null>(null);

  const submit = (c: Campaign) =>
    void run(() => api.post(`/admin/campaigns/${c.id}/submit`), `${c.id} submitted. Marketing can no longer edit it — an Admin approves and activates it.`);
  const approve = (c: Campaign) =>
    void run(
      () => api.post<{ notified: number }>(`/admin/campaigns/${c.id}/approve`),
      (r) =>
        `${c.id} approved and activated. ${r.notified ? `${r.notified} ${r.notified === 1 ? "customer was" : "customers were"} told about it.` : "Customers are told when it opens."} Audited.`,
    );
  const duplicate = (c: Campaign) =>
    void run(
      () => api.post<{ id: string }>(`/admin/campaigns/${c.id}/duplicate`),
      (r) => `${c.id} duplicated as ${r.id}, a new DRAFT. Set its dates; approvals do not carry over.`,
    );

  async function end(c: Campaign) {
    const res = await run(
      () => api.post<{ claimsEnded: number }>(`/admin/campaigns/${c.id}/expire`),
      (r) => `${c.id} ended.${r.claimsEnded ? ` ${r.claimsEnded} unused ${r.claimsEnded === 1 ? "claim" : "claims"} stopped applying.` : ""} Audited.`,
    );
    if (res) setEnding(null);
  }

  function actions(c: Campaign) {
    const st = c.state;
    const waiting = st === "UNDER_REVIEW" || st === "SUBMITTED";
    const endBtn = canSubmit && st !== "EXPIRED" && (
      <button type="button" disabled={busy} onClick={() => setEnding(c)} className={`${BTN} text-rose-700`}>
        {waiting ? "Reject" : "End"}
      </button>
    );
    if (st === "DRAFT") {
      if (!canSubmit) return <span className="text-[11.5px] font-bold text-muted">Draft</span>;
      return (
        <>
          <button type="button" disabled={busy} onClick={() => setEditing({ campaign: c })} className={BTN}>
            {c.legacy ? "Set offer" : "Edit"}
          </button>
          <button type="button" disabled={busy} onClick={() => submit(c)} className={BTN}>
            Submit for approval
          </button>
        </>
      );
    }
    if (waiting) {
      // Two-person rule: whoever submitted it can't approve it — except a Super Admin (audited as self-approved).
      const ownSubmission = c.submittedById === session.id;
      if (canApprove && ownSubmission && session.role !== "super") {
        return (
          <>
            <span className="inline-flex h-[30px] items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 px-3 text-[11.5px] font-bold text-muted">
              You submitted this — another approver activates it
            </span>
            {endBtn}
          </>
        );
      }
      return (
        <>
          {canApprove ? (
            <button type="button" disabled={busy} onClick={() => approve(c)} className="h-[30px] rounded-[9px] border-0 bg-emerald-700 px-3 text-[12px] font-bold text-white disabled:opacity-60">
              Approve &amp; activate
            </button>
          ) : (
            <span className="inline-flex h-[30px] items-center rounded-[9px] border border-dashed border-stone-300 bg-stone-100 px-3 text-[11.5px] font-bold text-muted">
              Awaiting Admin approval
            </span>
          )}
          {canApprove && endBtn}
        </>
      );
    }
    if (st === "ACTIVE") {
      return (
        <>
          <span className={`text-[12px] font-bold ${c.open ? "text-emerald-700" : "text-[#78716c]"}`}>
            {c.legacy ? "Live · not claimable" : c.open ? "Live" : "Scheduled"}
          </span>
          {endBtn}
        </>
      );
    }
    return canSubmit ? (
      <button type="button" disabled={busy} onClick={() => duplicate(c)} className={BTN}>
        Duplicate
      </button>
    ) : null;
  }

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[16px] font-bold">Campaigns</h2>
          <p className="mt-0.5 mb-0 text-[12px] text-[#78716c]">Customers claim an offer on the Offers page; it then applies by itself.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SortSelect options={CAMPAIGN_SORTS} value={sort} onChange={setSort} />
          {canSubmit && (
            <button type="button" onClick={() => setEditing({ campaign: null })} className="h-9 rounded-[10px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink">
              + New campaign
            </button>
          )}
        </div>
      </div>
      {/* Scrolls inside the card on narrow windows, never the page. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
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
            {rows.map((c) => {
              const [bg, fg] = tone(c.state);
              const clamped = c.percent !== null && c.appliedPct !== null && c.appliedPct < c.percent;
              return (
                <tr key={c.id}>
                  <td className={`${TD} px-2.5 py-[11px] align-top font-mono text-[11.5px] whitespace-nowrap text-[#57534e]`}>{c.id}</td>
                  <td className={`${TD} max-w-[340px] px-2.5 py-[11px] align-top`}>
                    <b className="block break-words text-ink">{c.name}</b>
                    <span className="mt-0.5 block text-[12px] text-[#57534e]">
                      {c.legacy ? (
                        <>
                          <span className="mr-1.5 inline-flex h-[18px] items-center rounded-full bg-stone-100 px-2 text-[10px] font-extrabold tracking-[.04em] text-stone-600">
                            LEGACY
                          </span>
                          {c.summary} · not claimable
                        </>
                      ) : (
                        <>
                          {KIND_LABEL[c.kind]} · {c.summary}
                          {c.audience === "NEW" ? " · new customers" : ""}
                          {clamped && <b className="text-amber-800"> · applies as {c.appliedPct}% (cashback floor)</b>}
                        </>
                      )}
                    </span>
                  </td>
                  <td className={`${TD} px-2.5 py-[11px] align-top text-[12px] text-[#57534e]`}>
                    {c.legacy ? "—" : (
                      <>
                        <span className="block whitespace-nowrap">{c.dates}</span>
                        {c.kind !== "BONUS_CREDIT" && (
                          <span className="block text-[11px] text-[#a8a29e]">
                            claim valid {c.claimValidDays} {c.claimValidDays === 1 ? "day" : "days"} · {c.usesPerCustomer}×
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className={`${TD} px-2.5 py-[11px] text-right align-top whitespace-nowrap text-[#57534e] tabular-nums`}>
                    {c.legacy ? "—" : `${c.claims} claimed · ${c.used} used`}
                  </td>
                  <td className={`${TD} px-2.5 py-[11px] align-top`}>
                    <span className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold" style={{ background: bg, color: fg }}>
                      {c.state}
                    </span>
                  </td>
                  <td className={`${TD} px-2.5 py-[11px] align-top`}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">{actions(c)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">No campaigns yet.</p>}

      {editing && <CampaignForm campaign={editing.campaign} limits={limits} onClose={() => setEditing(null)} />}

      {ending && (
        <AdminDialog
          title={`${ending.state === "ACTIVE" ? "End" : "Reject"} ${ending.id}?`}
          subtitle={ending.name}
          onClose={() => setEnding(null)}
          width={480}
        >
          <p className="mt-0 text-[13px] leading-normal text-[#57534e]">
            {ending.state === "ACTIVE"
              ? "Customers can no longer claim it, and claims not yet used stop applying straight away. Credit already given stays with customers."
              : "It moves to EXPIRED and never goes live. You can duplicate it later."}{" "}
            This is audited and can&apos;t be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEnding(null)} className="h-10 rounded-[10px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void end(ending)} className="h-10 rounded-[10px] border-0 bg-rose-700 px-4 text-[13px] font-bold text-white disabled:opacity-60">
              {busy ? "Working…" : ending.state === "ACTIVE" ? "End campaign" : "Yes, end it"}
            </button>
          </div>
        </AdminDialog>
      )}
      {!canSubmit && !canApprove && rows.length > 0 && (
        <p className="mt-3 mb-0 text-[12px] text-[#78716c]">Read-only for your role.</p>
      )}
    </>
  );
}
