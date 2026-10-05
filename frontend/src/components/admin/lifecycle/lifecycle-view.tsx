"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { PANEL, TD, TH, TH_SM } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { Application, ApplicationState, LifecycleData } from "@/lib/admin/types";

const STATE_TONE: Record<ApplicationState, [string, string]> = {
  Negotiation: ["#fef3c7", "#92400e"],
  "Docs pending": ["#fff1f2", "#be123c"],
  Pricing: ["#eff6ff", "#1d4ed8"],
  Training: ["#ecfdf5", "#047857"],
  "Under review": ["#f7f4ee", "#57534e"],
  Interview: ["#f7f4ee", "#57534e"],
};

const APP_TABS = ["Profile", "Docs", "Media", "Pricing", "History"];
const APP_ACTIONS = ["Request info", "Schedule interview", "Reject", "Advance"] as const;

export default function LifecycleView({ data, initialApp }: { data: LifecycleData; initialApp?: string }) {
  const { say } = useAdmin();
  const { run } = useAction();
  const [filter, setFilter] = useState("All");
  const [openApp, setOpenApp] = useState<string | null>(
    data.applications.some((a) => a.id === initialApp) ? (initialApp as string) : null,
  );
  // "Return to negotiation" has no API yet; the created price version comes back from the API.
  const [pricingStage, setPricingStage] = useState<"pending" | "negotiation" | "approved">("pending");
  const [createdVersion, setCreatedVersion] = useState<string | null>(null);
  const nego = data.negotiation;
  const round = nego?.round ?? 0;
  const max = nego?.maxRounds ?? 0;
  const opened = data.applications.find((a) => a.id === openApp) ?? null;

  const rows = data.applications.filter(
    (a) => filter === "All" || a.state === filter || (filter === "Under review" && a.state === "Docs pending"),
  );

  /** Applicant actions quote the record version; the API refuses if someone changed it meanwhile. */
  const applicantAct = (app: Pick<Application, "id" | "version">, action: string, done: string, reason?: string) =>
    run(() => api.post(`/admin/applicants/${app.id}/${action}`, { version: app.version, reason }), done);

  // ── handlers from the prototype (setHrFilter / openAppDetail / appAction / counterOffer …) ──
  const pickFilter = (label: string) => {
    setFilter(label);
    setOpenApp(null);
  };
  const open = (id: string) => {
    setOpenApp(id);
    say(
      `Opened ${id}. If someone else changes it while you work, you will be asked to reload — nothing is overwritten.`,
    );
  };
  const appAction = async (label: (typeof APP_ACTIONS)[number]) => {
    if (!opened) return;
    if (label === "Request info") {
      const reason = window.prompt("What does the applicant need to send? (at least 10 characters)");
      if (reason === null) return;
      await applicantAct(
        opened,
        "request-info",
        "Information requested — reason recorded. The applicant sees exactly what is needed.",
        reason.trim(),
      );
    } else if (label === "Schedule interview") {
      await applicantAct(opened, "interview", "Interview scheduled. The applicant may request one reschedule.");
    } else if (label === "Reject") {
      const reason = window.prompt(`Reason for rejecting ${opened.id}:`);
      if (reason === null) return;
      const res = await applicantAct(
        opened,
        "reject",
        "Rejected with reason. Reapply becomes available after the cooling period.",
        reason.trim(),
      );
      if (res) setOpenApp(null);
    } else {
      await applicantAct(opened, "advance", "Advanced to the next stage. Recorded in the audit log.");
    }
  };
  const counterOffer = () => {
    if (!nego) return;
    const next = round + 1;
    void applicantAct(
      { id: nego.appId, version: nego.version },
      "counter",
      next >= max
        ? `Counter-offer sent · round ${max} of ${max}. This was the final round — accept or reject next.`
        : `Counter-offer sent · round ${next} of ${max}. Notes audited.`,
    );
  };
  const acceptRates = async () => {
    if (!nego) return;
    const res = await applicantAct(
      { id: nego.appId, version: nego.version },
      "accept-rates",
      "Rates accepted and sent to pricing approval.",
    );
    if (res) setPricingStage("pending");
  };
  const pricingReturn = () => {
    setPricingStage("negotiation");
    say(`Returned to negotiation. Round ${max} of ${max} opened.`);
  };
  const pricingApprove = async () => {
    if (pricingStage === "approved") return;
    const res = await run(
      () => api.post<{ version: string }>("/admin/pricing/versions"),
      (r) => `Price Version ${r.version} created — immutable. Effective ${data.pricing.effective}.`,
    );
    if (res) {
      setCreatedVersion(res.version);
      setPricingStage("approved");
    }
  };

  const left = Math.max(0, max - round);
  const capReached = round >= max;

  return (
    <>
      <div className="mt-[18px] flex flex-wrap gap-2">
        {data.filters.map((f) => {
          const on = filter === f.label;
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={on}
              onClick={() => pickFilter(f.label)}
              className="h-[34px] rounded-full border px-3.5 text-[12.5px] font-bold"
              style={{
                borderColor: on ? "#1c1917" : "#e7e0d6",
                background: on ? "#1c1917" : "#fff",
                color: on ? "#fcd34d" : "#57534e",
              }}
            >
              {f.label} <b className="opacity-60">{f.count}</b>
            </button>
          );
        })}
      </div>

      <div className={`${PANEL} relative mt-3.5 p-[18px]`}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[
                ["ID", "left"],
                ["Applicant", "left"],
                ["Primary skill", "left"],
                ["State", "left"],
                ["Age", "right"],
                ["", "right"],
              ].map(([label, align], i) => (
                <th key={i} className={TH} style={{ textAlign: align as "left" | "right" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const [bg, fg] = STATE_TONE[a.state] ?? STATE_TONE["Under review"];
              return (
                <tr key={a.id} style={{ background: a.breach ? "#fff1f2" : "transparent" }}>
                  <td className={`${TD} px-2.5 py-[11px] font-mono text-[11.5px] text-[#57534e]`}>{a.id}</td>
                  <td className={`${TD} px-2.5 py-[11px] font-bold text-ink`}>{a.name}</td>
                  <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{a.skill}</td>
                  <td className={`${TD} px-2.5 py-[11px]`}>
                    <span
                      className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                      style={{ background: bg, color: fg }}
                    >
                      {a.state}
                    </span>
                  </td>
                  <td
                    className={`${TD} px-2.5 py-[11px] text-right tabular-nums`}
                    style={{ fontWeight: a.breach ? 800 : 500, color: a.breach ? "#be123c" : "#78716c" }}
                  >
                    {a.age}
                  </td>
                  <td className={`${TD} px-2.5 py-[11px] text-right`}>
                    <button
                      type="button"
                      onClick={() => open(a.id)}
                      className="border-0 bg-transparent p-0 text-[12.5px] font-bold text-amber-700"
                    >
                      Open ›
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openApp && (
        <div className="mt-4 rounded-[18px] border-2 border-amber-500 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[17px] font-bold">Application {openApp}</h2>
            <button
              type="button"
              aria-label="Close application"
              onClick={() => setOpenApp(null)}
              className="h-8 w-8 rounded-[9px] border-0 bg-white text-[15px] text-[#57534e]"
            >
              ✕
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-[7px]">
            {APP_TABS.map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => say(`${t} tab · read-only until you advance the application.`)}
                className="h-[34px] rounded-full border px-3.5 text-[12.5px] font-bold"
                style={{
                  borderColor: i === 0 ? "#f59e0b" : "#e7e0d6",
                  background: i === 0 ? "#f59e0b" : "#fff",
                  color: i === 0 ? "#1c1917" : "#57534e",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-3.5 mb-0 max-w-[74ch] text-[13px] leading-[1.55] text-amber-900">
            If someone else changes this application while you have it open, your action is stopped and you are asked to
            reload — nothing is ever overwritten silently.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-[9px]">
            {APP_ACTIONS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => void appAction(label)}
                className="h-10 rounded-[11px] border px-4 text-[13px] font-bold"
                style={{
                  background: label === "Advance" ? "#f59e0b" : "#fff",
                  color: label === "Reject" ? "#be123c" : "#1c1917",
                  borderColor: label === "Advance" ? "#f59e0b" : label === "Reject" ? "#fecdd3" : "#e7e0d6",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
        {nego && (
          <div className={`${PANEL} relative p-5`}>
            <h2 className="mt-0 mb-1 text-[16px] font-bold">
              Negotiation · {nego.appId} {nego.applicant}
            </h2>
            <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
              Round {round} of {max}. {left} counter-offer{left === 1 ? "" : "s"} remaining.
            </p>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH_SM} text-left`}>Modality</th>
                  <th className={`${TH_SM} text-right`}>Requested</th>
                  <th className={`${TH_SM} text-right`}>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {nego.rows.map((n) => (
                  <tr key={n.mode}>
                    <td className={`${TD} p-2.5 font-semibold text-[#57534e]`}>{n.mode}</td>
                    <td className={`${TD} p-2.5 text-right text-[#78716c] tabular-nums`}>{n.requested}</td>
                    <td className={`${TD} p-2.5 text-right font-bold text-amber-700 tabular-nums`}>{n.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3.5 flex flex-wrap gap-[9px]">
              {capReached ? (
                <span className="inline-flex h-10 items-center rounded-[11px] border border-dashed border-stone-300 bg-stone-100 px-4 text-[13px] font-bold text-[#78716c]">
                  Counter-offer — round cap reached
                </span>
              ) : (
                <button
                  type="button"
                  onClick={counterOffer}
                  className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold"
                >
                  Counter-offer
                </button>
              )}
              <button
                type="button"
                onClick={() => void acceptRates()}
                className="h-10 rounded-[11px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink"
              >
                Accept &amp; send to pricing
              </button>
            </div>
          </div>
        )}

        <div className="relative rounded-[18px] border border-amber-200 bg-amber-50 p-5">
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Pricing approval</h2>
          <p className="mt-0 mb-3.5 text-[12px] text-amber-800">
            Approving creates an immutable Price Version. Corrections create a new version — nothing is edited in place.
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="text-[11px] font-bold text-amber-800">Effective date</div>
              <b className="text-[16px]">{data.pricing.effective}</b>
            </div>
            <div>
              <div className="text-[11px] font-bold text-amber-800">Approval mode</div>
              <b className="text-[16px]">{data.pricing.mode}</b>
            </div>
            <div>
              <div className="text-[11px] font-bold text-amber-800">Version to create</div>
              <b className="font-mono text-[16px]">{data.pricing.version}</b>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-[9px]">
            <button
              type="button"
              onClick={pricingReturn}
              className="h-10 rounded-[11px] border border-amber-200 bg-white px-4 text-[13px] font-bold text-amber-800"
            >
              Return to negotiation
            </button>
            {pricingStage === "approved" ? (
              <span className="inline-flex h-10 items-center rounded-[11px] border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-bold text-emerald-700">
                ✓ {createdVersion} created · immutable
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void pricingApprove()}
                className="h-10 rounded-[11px] border-0 bg-amber-500 px-[18px] text-[13px] font-bold text-ink"
              >
                Approve — step-up MFA
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
