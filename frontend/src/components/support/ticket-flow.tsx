"use client";

import React from "react";
import ApprovalTrail from "@/components/admin/support/approval-trail";
import type { TicketFlow } from "@/lib/admin/types";

export interface TicketFlowData {
  assignedTeam?: string; // "support" | "finance" | "compliance" | "marketing" | "super"
  teamLabel?: string;
  state?: string; // "INVESTIGATING", "REFUND_PROPOSED", "REFUND_INITIATED", "RESOLVED", "CLOSED", etc.
  refundState?: string; // "NONE", "PROPOSED", "INITIATED"
  proposedBy?: string | null;
  approvedBy?: string | null;
  resolution?: string | null;
  outcome?: { label?: string | null; by?: string | null; on?: string | null; note?: string | null } | null;
  open?: boolean;
  /** The teams this issue really goes through (team names only) and where it is now. */
  path?: { key: string; label: string; status: "done" | "current" | "upcoming" | "notneeded" }[];
}

export function TicketApprovalFlow({
  data,
  className = "",
  flow,
}: {
  data: TicketFlowData;
  isAdmin?: boolean;
  className?: string;
  /** Staff: the audited flow (who, when, what per step) from the API. Customers get the state-based view below. */
  flow?: TicketFlow;
}) {
  if (flow) return <ApprovalTrail flow={flow} className={className} />;
  const open = data.open ?? true;
  // Only the teams this issue needs: Support first, then the team its kind of issue belongs with.
  const team = data.assignedTeam?.toLowerCase() ?? "support";
  const path =
    data.path && data.path.length > 0
      ? data.path
      : [
          { key: "support", label: "Support team", status: team === "support" && open ? ("current" as const) : ("done" as const) },
          ...(team === "support" ? [] : [{ key: team, label: data.teamLabel ?? "Team", status: open ? ("current" as const) : ("done" as const) }]),
        ];
  const ROLE: Record<string, string> = {
    support: "Intake & triage",
    finance: "Payments & refunds",
    compliance: "Safety & conduct",
    marketing: "Offers & promotions",
    super: "Final decision",
  };
  const steps = path.map((p, i) => {
    const status: "done" | "active" | "pending" = p.status === "current" ? "active" : p.status === "done" ? "done" : "pending";
    const last = i === path.length - 1;
    return {
      key: p.key,
      name: p.label,
      role: ROLE[p.key] ?? "Review",
      status,
      detail:
        status === "active"
          ? p.key === "support"
            ? "We're looking into your issue"
            : `With our ${p.label} now`
          : status === "done"
            ? !open && last && data.outcome?.label
              ? data.outcome.label
              : "Done"
            : "Comes next, if needed",
      badge: status === "done" ? "Done" : status === "active" ? "With them now" : "Next",
    };
  });

  return (
    <div
      className={`rounded-2xl border border-line bg-cream p-4 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card ${className}`}
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-line-warm/70 pb-2.5">
        <div>
          <span className="block text-[11px] font-extrabold tracking-[.08em] text-stone-500 uppercase max-lg:text-app-ink-3">
            Where your issue goes
          </span>
          <p className="mt-0.5 mb-0 text-[12px] text-stone-600 max-lg:text-app-ink-2">
            Only the teams your issue needs
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-xs border border-line-warm max-lg:border-app-line max-lg:bg-app-bg max-lg:text-app-active">
          {path.map((p, i) => (
            <React.Fragment key={p.key}>
              {i > 0 && <span className="text-amber-500">↓</span>}
              <span>{p.label.replace(/ team$/, "")}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        {steps.map((s, idx) => {
          const isDone = s.status === "done";
          const isActive = s.status === "active";
          const isPending = s.status === "pending";

          return (
            <React.Fragment key={s.key}>
              <div
                className={`relative flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                  isDone
                    ? "border-emerald-200 bg-white/95 text-ink shadow-xs max-lg:border-emerald-200/80"
                    : isActive
                      ? "border-amber-400 bg-amber-50/90 text-ink shadow-sm ring-1 ring-amber-300/50 max-lg:bg-app-tint"
                      : "border-line/60 bg-white/50 text-stone-500 max-lg:bg-app-surface/60 max-lg:border-app-line/60"
                }`}
              >
                {/* Step indicator circle */}
                <div
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                    isDone
                      ? "bg-emerald-600 text-white shadow-xs"
                      : isActive
                        ? "bg-amber-500 text-ink animate-pulse shadow-xs"
                        : "border border-stone-300 bg-stone-100 text-stone-400"
                  }`}
                >
                  {isDone ? "✓" : idx + 1}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <b
                        className={`text-[13.5px] max-lg:text-[13px] ${
                          isActive
                            ? "text-amber-950 font-extrabold max-lg:text-app-active"
                            : isDone
                              ? "text-ink font-bold max-lg:text-app-ink"
                              : "text-stone-500 font-semibold max-lg:text-app-ink-3"
                        }`}
                      >
                        {s.name}
                      </b>
                      <span className="text-[11px] text-stone-400 max-lg:text-app-ink-3">· {s.role}</span>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        isDone
                          ? "bg-emerald-100 text-emerald-800"
                          : isActive
                            ? "bg-amber-200 text-amber-900 ring-1 ring-amber-300"
                            : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {s.badge}
                    </span>
                  </div>
                  <p
                    className={`mt-1 mb-0 text-[12px] leading-relaxed max-lg:text-[11.5px] ${
                      isActive ? "text-amber-900 font-medium max-lg:text-app-ink" : isDone ? "text-stone-600 max-lg:text-app-ink-2" : "text-stone-400 max-lg:text-app-ink-3"
                    }`}
                  >
                    {s.detail}
                  </p>
                </div>
              </div>

              {/* Down Arrow connector between steps */}
              {idx < steps.length - 1 && (
                <div className="flex items-center justify-center py-1 text-amber-600 max-lg:text-app-active">
                  <div className="flex flex-col items-center">
                    <div className={`h-1.5 w-0.5 ${isDone ? "bg-emerald-400" : "bg-amber-300"}`} />
                    <svg
                      className={`size-4.5 ${isDone ? "text-emerald-600" : "text-amber-500"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                    <div className={`h-1.5 w-0.5 ${steps[idx + 1].status === "done" ? "bg-emerald-400" : steps[idx + 1].status === "active" ? "bg-amber-300" : "bg-stone-200"}`} />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

