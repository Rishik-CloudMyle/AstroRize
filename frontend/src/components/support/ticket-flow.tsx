"use client";

import React from "react";

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
}

export function TicketApprovalFlow({
  data,
  isAdmin = false,
  className = "",
}: {
  data: TicketFlowData;
  isAdmin?: boolean;
  className?: string;
}) {
  const team = data.assignedTeam?.toLowerCase() ?? "support";
  const isSuper = team === "super";
  const isFinanceOrDept = team === "finance" || team === "compliance" || team === "marketing";
  const isSupport = team === "support";

  const isProposed =
    data.refundState === "PROPOSED" ||
    Boolean(data.proposedBy) ||
    (data.state ? data.state.includes("PROPOSED") : false);

  const isInitiated =
    data.refundState === "INITIATED" ||
    Boolean(data.approvedBy) ||
    data.state === "REFUND_INITIATED" ||
    Boolean(data.resolution);

  const isResolved =
    data.open === false ||
    isInitiated ||
    data.state === "RESOLVED" ||
    data.state === "CLOSED" ||
    Boolean(data.outcome);

  // Station 1: Support
  // Support is the entry point. Once forwarded, proposed, or resolved, it's done. If still in initial triage, it's active.
  const step1Done = !isSupport || isProposed || isResolved || isSuper || isFinanceOrDept;
  const step1Status: "done" | "active" | "pending" = step1Done ? "done" : "active";

  // Station 2: Finance / Department
  // If a remedy is proposed, or if approved/resolved, this step is done.
  // If the ticket is currently allotted to finance/dept and open without a proposal, it's active.
  // Otherwise pending.
  const step2Done = isProposed || isInitiated || (isResolved && !isSupport);
  const step2Active = !step2Done && isFinanceOrDept && (data.open ?? true);
  const step2Status: "done" | "active" | "pending" = step2Done ? "done" : step2Active ? "active" : "pending";

  // Station 3: Admin
  // If final approval is granted or ticket is resolved, it's done.
  // If awaiting approval (proposed) or currently allotted to Super Admin, it's active.
  // Otherwise pending.
  const step3Done = isResolved || isInitiated;
  const step3Active = !step3Done && (isProposed || isSuper) && (data.open ?? true);
  const step3Status: "done" | "active" | "pending" = step3Done ? "done" : step3Active ? "active" : "pending";

  // Station 2 title/role
  const deptLabel =
    team === "compliance"
      ? "Compliance"
      : team === "marketing"
        ? "Marketing"
        : "Finance";

  // Content for each step
  const steps = [
    {
      key: "support",
      name: isAdmin ? "Support" : "Support team",
      role: "Intake & Triage",
      status: step1Status,
      detail:
        step1Status === "done"
          ? "Allotted on ticket creation · Intake triaged"
          : "Allotted on ticket creation · Currently investigating",
      badge: step1Status === "done" ? "Triaged" : "Allotted (Active)",
    },
    {
      key: "finance",
      name: isAdmin ? deptLabel : `${deptLabel} team`,
      role: "Review & Remedy Proposal",
      status: step2Status,
      detail:
        data.proposedBy
          ? `Remedy proposed by ${data.proposedBy}`
          : step2Status === "done"
            ? `Reviewed by ${deptLabel} team`
            : step2Status === "active"
              ? `Allotted to ${deptLabel} team · Investigation in progress`
              : `Pending allotment to ${deptLabel}`,
      badge:
        step2Status === "done"
          ? data.proposedBy
            ? "Proposal submitted"
            : "Reviewed"
          : step2Status === "active"
            ? "Allotted (Active)"
            : "Pending",
    },
    {
      key: "admin",
      name: isAdmin ? "Admin (Super Admin)" : "Admin team",
      role: "Final Decision & Approval",
      status: step3Status,
      detail:
        data.approvedBy
          ? `Approved by ${data.approvedBy}`
          : data.outcome
            ? `${data.outcome.label ?? "Resolved"}${data.outcome.by ? ` by ${data.outcome.by}` : ""}`
            : step3Status === "done"
              ? "Final resolution approved and closed"
              : step3Status === "active"
                ? "Allotted to Admin · Awaiting second-person approval"
                : "Pending final review & decision",
      badge:
        step3Status === "done"
          ? data.approvedBy
            ? "Approved"
            : "Resolved"
          : step3Status === "active"
            ? "Awaiting approval"
            : "Pending",
    },
  ];

  return (
    <div
      className={`rounded-2xl border border-line bg-cream p-4 max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card ${className}`}
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-line-warm/70 pb-2.5">
        <div>
          <span className="block text-[11px] font-extrabold tracking-[.08em] text-stone-500 uppercase max-lg:text-app-ink-3">
            Allotment &amp; Approval Flow
          </span>
          <p className="mt-0.5 mb-0 text-[12px] text-stone-600 max-lg:text-app-ink-2">
            Sequential assignment trail for this ticket
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-xs border border-line-warm max-lg:border-app-line max-lg:bg-app-bg max-lg:text-app-active">
          <span>Support</span>
          <span className="text-amber-500">↓</span>
          <span>Finance</span>
          <span className="text-amber-500">↓</span>
          <span>Admin</span>
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

