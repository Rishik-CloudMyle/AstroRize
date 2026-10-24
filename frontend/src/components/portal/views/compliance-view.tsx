"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { Compliance, ComplianceNotice, Permission } from "@/lib/portal/types";
import Modal from "../modal";
import { useErrorToast, useToast } from "../portal-provider";
import { M_LABEL, M_PRIMARY, M_SECONDARY, PageHeader, Panel, Th, tdClass } from "../ui";

const PERMISSION: Record<Permission, { label: string; color: string }> = {
  yes: { label: "Yes", color: "#047857" },
  no: { label: "No", color: "#be123c" },
  read: { label: "Read only", color: "#b45309" },
};

function Cell({ value }: { value: Permission }) {
  const p = PERMISSION[value];
  return (
    <td className={`${tdClass} font-semibold`} style={{ color: p.color }}>
      {p.label}
    </td>
  );
}

function RespondModal({ notice, onClose }: { notice: ComplianceNotice; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; respondBy: string }>(`/portal/compliance/${notice.id}/respond`, { text });
      onClose();
      toast(`Response sent for notice ${notice.id}. You can update it until ${res.respondBy}.`);
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="respond-title" maxWidth={520}>
      <h2 id="respond-title" className="m-0 text-[18px] font-bold">
        Respond to notice {notice.id}
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
        Give your written account of what happened. Mention session references and any notes that support it.
      </p>
      <label htmlFor="respond-text" className={`mt-4 mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
        Your response
      </label>
      <textarea
        id="respond-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={5000}
        className="min-h-[140px] w-full resize-y rounded-xl border border-line bg-white px-3.5 py-[13px] text-[13.5px] leading-[1.55] text-ink outline-none max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:px-4 max-lg:text-[16px] max-lg:focus:border-app-selected"
      />
      <div className="mt-5 flex gap-2.5">
        <button type="button" onClick={onClose} className={`h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold ${M_SECONDARY}`}>
          Cancel
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className={`az-cta h-11 flex-1 rounded-xl text-sm font-bold shadow-none disabled:opacity-60 max-lg:bg-none ${M_PRIMARY}`}
        >
          Send response
        </button>
      </div>
    </Modal>
  );
}

export default function ComplianceView({ data }: { data: Compliance }) {
  const toast = useToast();
  const [responding, setResponding] = useState(false);
  const n = data.notice;

  return (
    <div>
      <PageHeader title="Compliance" subtitle="You always know what you can still do, and how to answer." />

      {!n ? (
        <Panel className="mt-5 p-[18px] sm:p-[22px] max-lg:mt-3.5">
          <b className="text-[17px] max-lg:text-[16px]">No compliance notices</b>
          <p className="mt-1 text-[13px] leading-[1.55] text-stone-500">
            If our team ever needs your account of a session, the notice and your response window appear here.
          </p>
        </Panel>
      ) : (
      <Panel className="mt-5 p-[18px] sm:p-[22px] max-lg:mt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <b className="text-[17px] max-lg:text-[16px]">Notice {n.id}</b>
            <span className="inline-flex h-6 items-center rounded-full bg-rose-50 px-2.5 text-[11.5px] font-bold text-rose-700">
              {n.category}
            </span>
          </div>
          {n.status === "OPEN" ? (
            <span className="inline-flex h-7 items-center rounded-full bg-urgent px-3 text-[12.5px] font-extrabold text-white">
              Respond in {n.respondIn}
            </span>
          ) : (
            <span className="inline-flex h-7 items-center rounded-full bg-emerald-50 px-3 text-[12.5px] font-extrabold text-emerald-700">
              {n.status === "RESPONDED" ? "Response sent" : "Decision made"}
            </span>
          )}
        </div>
        <ol className="mt-[18px] grid grid-cols-2 gap-x-2.5 gap-y-3.5 sm:flex sm:gap-2.5">
          {data.steps.map((c) => (
            <li key={c.label} className="min-w-0 flex-1">
              <span className="block h-1 rounded-full" style={{ background: c.reached ? "#f59e0b" : "#e7e0d6" }} />
              <b className="mt-2 block text-[12.5px] font-bold" style={{ color: c.reached ? "#1c1917" : "#a8a29e" }}>
                {c.label}
              </b>
              <span className="mt-px block text-[11.5px] text-stone-400">{c.when}</span>
            </li>
          ))}
        </ol>
        <p className="mt-[18px] max-w-[74ch] text-[13.5px] leading-[1.6] text-stone-600">{n.summary}</p>
        {n.response && (
          <div className="mt-3.5 max-w-[74ch] rounded-[14px] border border-line bg-cream px-[15px] py-[13px] max-lg:rounded-app-btn max-lg:p-3">
            <b className="text-[12.5px] text-stone-600">Your response</b>
            <p className="mt-1 text-[13px] leading-[1.55] whitespace-pre-line text-stone-600">{n.response}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2.5 max-lg:flex-col max-lg:gap-2">
          {n.status !== "DECIDED" && (
            <button
              type="button"
              onClick={() => setResponding(true)}
              className={`az-cta h-[46px] rounded-xl px-[22px] text-[14.5px] font-bold shadow-none max-lg:bg-none ${M_PRIMARY}`}
            >
              {n.status === "RESPONDED" ? "Update your response" : "Respond with evidence"}
            </button>
          )}
          <button
            type="button"
            onClick={() => toast(`Notice ${n.id} opened — what was observed and what is requested.`)}
            className={`h-[46px] rounded-xl border border-line bg-white px-5 text-[14.5px] font-bold ${M_SECONDARY}`}
          >
            View full notice
          </button>
        </div>
      </Panel>
      )}

      <Panel warm className="relative mt-4 p-[18px] sm:p-[22px] max-lg:mt-[22px]" mobile="plain">
        <h2 className="m-0 mb-1 text-base font-bold">What each state allows</h2>
        <p className="mb-3.5 text-[12.5px] text-stone-500">What you can still do in each account state.</p>
        {/* Phones and tablets: one card per account state. */}
        <ul className="m-0 flex list-none flex-col gap-2 p-0 lg:hidden">
          {data.scopes.map((r) => (
            <li key={r.state} className="rounded-app-card border border-app-line bg-app-surface p-3 shadow-app-card">
              <b className="block text-[14px] text-app-ink">{r.state}</b>
              <dl className="m-0 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                {(
                  [
                    ["New sessions", r.newSessions],
                    ["Go live", r.goLive],
                    ["Earnings", r.earnings],
                    ["Respond to compliance", r.respond],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[12px] text-app-ink-3">{label}</dt>
                    <dd className="m-0 font-semibold" style={{ color: PERMISSION[value].color }}>
                      {PERMISSION[value].label}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto max-lg:hidden">
          <table className="w-full min-w-[600px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                <Th>State</Th>
                <Th>New sessions</Th>
                <Th>Go live</Th>
                <Th>Earnings</Th>
                <Th>Respond to compliance</Th>
              </tr>
            </thead>
            <tbody>
              {data.scopes.map((r) => (
                <tr key={r.state}>
                  <td className={`${tdClass} font-bold text-ink`}>{r.state}</td>
                  <Cell value={r.newSessions} />
                  <Cell value={r.goLive} />
                  <Cell value={r.earnings} />
                  <Cell value={r.respond} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-4 max-lg:mt-3 max-lg:gap-3">
        <Panel className="p-5">
          <h2 className="m-0 mb-1.5 text-base font-bold">Voluntary exit</h2>
          <p className="text-[13px] leading-[1.55] text-stone-600">
            Pending payouts and open tickets are settled before your account closes. A multi-step confirmation states every
            consequence before anything is irreversible.
          </p>
          <button
            type="button"
            onClick={() => toast("Voluntary exit started. Pending payouts and open tickets settle before closure.")}
            className="mt-3.5 h-[42px] rounded-xl border border-rose-200 bg-white px-[18px] text-[13.5px] font-bold text-rose-700 max-lg:h-app-hit max-lg:w-full max-lg:rounded-app-btn max-lg:border-0 max-lg:bg-app-error-bg max-lg:text-[15px] max-lg:text-app-error"
          >
            Start exit process
          </button>
        </Panel>
        <Panel className="p-5">
          <h2 className="m-0 mb-1.5 text-base font-bold">Reapply</h2>
          <p className="text-[13px] leading-[1.55] text-stone-600">
            Available in {data.reapplyInDays} days. Reapplying starts a fresh application record — nothing carries over from
            the previous one.
          </p>
          <button
            type="button"
            onClick={() => toast(`Reapply becomes available in ${data.reapplyInDays} days, as a fresh application record.`)}
            className="mt-3.5 h-[42px] rounded-xl border border-dashed border-stone-300 bg-stone-100 px-[18px] text-[13.5px] font-bold text-stone-400 max-lg:h-app-hit max-lg:w-full max-lg:rounded-app-btn max-lg:text-[15px]"
          >
            Available in {data.reapplyInDays} days
          </button>
        </Panel>
      </div>

      {responding && n && <RespondModal notice={n} onClose={() => setResponding(false)} />}
    </div>
  );
}
