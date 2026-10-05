"use client";

import { useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { EYEBROW, PANEL, TD, TH_SM } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { draftValue } from "@/lib/admin/config-values";
import type { ConfigData, ConfigDetail, ConfigDomain } from "@/lib/admin/types";

export default function ConfigView({
  data,
  initialKey,
  initialDetail,
}: {
  data: ConfigData;
  initialKey: string;
  initialDetail: ConfigDetail | null;
}) {
  const { session, say } = useAdmin();
  const { run } = useAction();
  const actor = session.actor;

  const [selected, setSelected] = useState(initialKey);
  const [facet, setFacet] = useState<ConfigDomain | "all">("all");
  const [filter, setFilter] = useState("");
  // Versions and the pending change of the selected key (GET /admin/config/:key).
  const [detail, setDetail] = useState<ConfigDetail | null>(initialDetail);
  const [simulated, setSimulated] = useState<string | null>(null);
  // Shown after this admin approves, until another key is picked.
  const [justApproved, setJustApproved] = useState<{ key: string; version: number } | null>(null);

  const cfg = data.keys.find((k) => k.key === selected) ?? data.keys[0];
  const d = detail?.key === cfg.key ? detail : null;
  const pending = d?.pending ?? null;
  const version = d?.version ?? cfg.version;
  const prevVersion = Math.max(1, version - 1);
  const draft = pending ? pending.toValue : draftValue(cfg);
  const maker = pending?.draftedBy ?? actor;
  const stage = justApproved?.key === cfg.key ? "approved" : pending ? "submitted" : "draft";
  const financeCo = cfg.domain === "finance" || cfg.domain === "marketing";
  const isMaker = actor === maker;

  const f = filter.trim().toLowerCase();
  const visibleKeys = data.keys.filter(
    (k) => (facet === "all" || k.domain === facet) && (!f || k.key.toLowerCase().includes(f)),
  );
  const facets = data.facets
    .map((x) => ({ ...x, n: x.id === "all" ? data.keys.length : data.keys.filter((k) => k.domain === x.id).length }))
    .filter((x) => x.n > 0);

  const select = async (key: string) => {
    setSelected(key);
    setJustApproved(null);
    if (detail?.key === key) return;
    try {
      const res = await api.get<{ detail: ConfigDetail }>(`/admin/config/${encodeURIComponent(key)}`);
      setDetail(res.detail);
    } catch {
      say("Couldn't load this key's versions. Please try again.");
    }
  };

  const pickFacet = (id: ConfigDomain | "all") => {
    setFacet(id);
    const first = data.keys.find((k) => id === "all" || k.domain === id);
    if (first) void select(first.key);
  };

  // ── handlers from the prototype (cfgSimulate / cfgSubmit / cfgApprove / cfgRollback), now via the API ──
  const simulate = () => {
    setSimulated(cfg.key);
    say("Dry run complete — projected impact shown below.");
  };
  const submit = async () => {
    const res = await run(
      () => api.post<{ detail: ConfigDetail }>(`/admin/config/${encodeURIComponent(cfg.key)}/draft`, { value: draft }),
      `Submitted for approval. Audited: ${actor} · config.draft.submit`,
    );
    if (res) setDetail(res.detail);
  };
  const approve = async () => {
    if (!pending) return;
    // The API enforces maker-checker: the drafter gets "Blocked — you drafted this change…".
    const res = await run(
      () => api.post<{ detail: ConfigDetail }>(`/admin/config/changes/${pending.id}/approve`),
      (r) => `Approved by ${actor}. Version v${r.detail.version} is now live.`,
    );
    if (res) {
      setDetail(res.detail);
      setJustApproved({ key: cfg.key, version: res.detail.version });
    }
  };
  const rollback = async () => {
    const res = await run(
      () => api.post<{ detail: ConfigDetail }>(`/admin/config/${encodeURIComponent(cfg.key)}/rollback`),
      (r) => `Rolled back — v${r.detail.version} was created from the previous value. History is unchanged.`,
    );
    if (res) {
      setDetail(res.detail);
      setJustApproved(null);
      setSimulated(null);
    }
  };

  const approved = stage === "approved";
  const draftLabel = approved ? "Approved value" : stage === "submitted" ? "Submitted value" : "Draft value";
  const draftNote = approved
    ? "Live now"
    : stage === "submitted"
      ? `Drafted by ${maker} · awaiting a different approver`
      : "Not yet submitted";
  const draftTone = approved
    ? { bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857" }
    : { bg: "#fffbeb", border: "#fde68a", fg: "#92400e" };
  const effective = pending?.effective ?? "On approval";

  const inherited = { eff: "Inherited", state: "No override", bg: "#f7f4ee", fg: "#78716c" };
  const scopeRows = [
    { level: "Global", value: cfg.current, eff: "Current", state: "Active", bg: "#ecfdf5", fg: "#047857" },
    ...(pending
      ? [{ level: "Global", value: pending.toValue, eff: effective, state: "Scheduled", bg: "#eff6ff", fg: "#1e40af" }]
      : []),
    { level: "Country · IN", value: cfg.current, ...inherited },
    { level: "Segment · HNI", value: cfg.current, ...inherited },
    { level: "Object / User", value: cfg.current, ...inherited },
  ];
  const history = d?.history.length
    ? d.history.map((h) => ({
        v: h.version ?? "—",
        value: h.value,
        by: h.draftedBy,
        approver: h.approvedBy,
        when: h.when,
      }))
    : [{ v: version, value: cfg.current, by: "—", approver: "—", when: d?.since ?? "—" }];

  const ghostBtn = "h-11 rounded-xl border border-line bg-white px-[18px] text-[13.5px] font-bold";

  return (
    <div className="mt-5 grid grid-cols-[300px_minmax(0,1fr)] items-start gap-[18px]">
      {/* Key browser */}
      <div className={`${PANEL} p-3.5`}>
        <div className="flex h-9 items-center gap-2 rounded-full border border-line bg-white px-3">
          <span className="text-[13px] text-muted" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            aria-label="Filter config keys"
            placeholder="Filter config keys"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-[5px]">
          {facets.map((x) => {
            const on = facet === x.id;
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={on}
                onClick={() => pickFacet(x.id)}
                className="inline-flex h-[25px] items-center gap-[5px] rounded-full border px-[9px] text-[10.5px] font-bold"
                style={{
                  borderColor: on ? "#1c1917" : "#e7e0d6",
                  background: on ? "#1c1917" : "#fff",
                  color: on ? "#fcd34d" : "#57534e",
                }}
              >
                {x.label}
                <b className="tabular-nums opacity-60">{x.n}</b>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-col gap-[3px]">
          {visibleKeys.map((k) => {
            const on = k.key === cfg.key;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={on}
                onClick={() => void select(k.key)}
                className="flex w-full items-center gap-2 rounded-[10px] border px-[11px] py-[9px] text-left"
                style={{
                  borderColor: on ? "#fcd34d" : "#e7e0d6",
                  background: on ? "#fef3c7" : "#fff",
                }}
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px]"
                  style={{ color: on ? "#92400e" : "#57534e" }}
                >
                  {k.key}
                </span>
                {k.flagged && (
                  <span className="flex-none text-[11px]" title="Dual control + step-up MFA">
                    🔒
                  </span>
                )}
              </button>
            );
          })}
          {visibleKeys.length === 0 && (
            <p className="m-0 px-1 py-2 text-[12px] text-[#78716c]">No keys match this filter.</p>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {/* Selected key */}
        <div className={`${PANEL} relative p-[22px]`}>
          <div className="flex flex-wrap items-start justify-between gap-3.5">
            <div className="min-w-0">
              <div className="font-mono text-[14px] font-bold text-ink">{cfg.key}</div>
              <p className="mt-1.5 mb-0 max-w-[60ch] text-[13px] leading-[1.55] text-[#57534e]">{cfg.description}</p>
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {cfg.flagged && (
                <span className="inline-flex h-[26px] items-center gap-[5px] rounded-full bg-rose-50 px-[11px] text-[11px] font-extrabold text-rose-700">
                  🔒 Dual control + step-up MFA
                </span>
              )}
              {financeCo && (
                <span
                  className="inline-flex h-[26px] items-center gap-[5px] rounded-full bg-blue-50 px-[11px] text-[11px] font-extrabold text-blue-800"
                  title="Finance co-approval applies above ₹10,00,000 exposure"
                >
                  ₹ Finance co-approval
                </span>
              )}
              <span className="inline-flex h-[26px] items-center rounded-full bg-amber-100 px-[11px] text-[11px] font-bold text-amber-800">
                Scope: {cfg.scope}
              </span>
            </div>
          </div>

          <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            <div className="rounded-[14px] bg-cream p-3.5">
              <div className={EYEBROW}>Current value</div>
              <b className="mt-1 block font-mono text-[21px] text-ink">{cfg.current}</b>
              <span className="text-[11px] text-[#78716c]">
                v{version} · since {d?.since ?? "—"}
              </span>
            </div>
            <div
              className="rounded-[14px] border p-3.5"
              style={{ background: draftTone.bg, borderColor: draftTone.border }}
            >
              <div className="text-[10.5px] font-bold tracking-[.08em] uppercase" style={{ color: draftTone.fg }}>
                {draftLabel}
              </div>
              <b className="mt-1 block font-mono text-[21px]" style={{ color: draftTone.fg }}>
                {draft}
              </b>
              <span className="text-[11px]" style={{ color: draftTone.fg }}>
                {draftNote}
              </span>
            </div>
            <div className="rounded-[14px] border border-blue-200 bg-blue-50 p-3.5">
              <div className="text-[10.5px] font-bold tracking-[.08em] text-blue-800 uppercase">Effective at</div>
              <b className="mt-1 block text-[17px] text-blue-800">{effective}</b>
              <span className="text-[11px] text-blue-700">
                {pending ? "Scheduled — both values shown on the timeline" : "A second person must approve first"}
              </span>
            </div>
            <div className="rounded-[14px] bg-cream p-3.5">
              <div className={EYEBROW}>Permitted range</div>
              <b className="mt-1 block font-mono text-[17px] text-ink">{cfg.bounds}</b>
              <span className="text-[11px] text-[#78716c]">Out-of-range values are rejected</span>
            </div>
          </div>

          {simulated === cfg.key && (
            <div className="mt-4 rounded-[14px] border border-blue-200 bg-blue-50 px-4 py-3.5">
              <b className="text-[13px] text-blue-800">Dry-run preview</b>
              <p className="mt-[5px] mb-0 text-[12.5px] leading-[1.5] text-blue-900">{cfg.dryRun}</p>
            </div>
          )}

          <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={simulate} className={ghostBtn}>
              Simulate
            </button>
            <button type="button" onClick={rollback} className={ghostBtn}>
              Roll back to v{prevVersion}
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2.5">
              {stage === "draft" && (
                <button
                  type="button"
                  onClick={submit}
                  className="h-11 rounded-xl border-0 bg-[linear-gradient(90deg,#ffd233,#ff8c1a)] px-[22px] text-[13.5px] font-bold text-cta-ink"
                >
                  Submit for approval
                </button>
              )}
              {stage === "submitted" && (
                <button
                  type="button"
                  onClick={approve}
                  aria-disabled={isMaker}
                  className="h-11 rounded-xl border-0 px-[22px] text-[13.5px] font-bold"
                  style={{ background: isMaker ? "#f5f5f4" : "#047857", color: isMaker ? "#78716c" : "#fff" }}
                >
                  {isMaker ? "Approve — blocked, you drafted this" : "Approve · step-up MFA"}
                </button>
              )}
              {approved && (
                <span className="inline-flex h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-[13.5px] font-bold text-emerald-700">
                  ✓ Approved · v{justApproved?.version} live
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scope resolution */}
        <div className={`${PANEL} mt-4 p-5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h2 className="m-0 text-[15px] font-bold">Scope resolution</h2>
            <span className="text-[11.5px] font-semibold text-[#78716c]">
              global → country → segment → object → user · the narrowest override wins
            </span>
          </div>
          <table className="mt-2.5 w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Scope", "Value", "Effective", "State"].map((h) => (
                  <th key={h} className={`${TH_SM} text-left`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scopeRows.map((r, i) => (
                <tr key={i}>
                  <td className={`${TD} px-2.5 py-[9px] text-[12.5px] font-semibold text-ink`}>{r.level}</td>
                  <td className={`${TD} px-2.5 py-[9px] font-mono text-[11.5px] text-ink`}>{r.value}</td>
                  <td className={`${TD} px-2.5 py-[9px] text-[12.5px] text-[#57534e]`}>{r.eff}</td>
                  <td className={`${TD} px-2.5 py-[9px]`}>
                    <span
                      className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[10.5px] font-extrabold"
                      style={{ background: r.bg, color: r.fg }}
                    >
                      {r.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Version history */}
        <div className={`${PANEL} mt-4 p-5`}>
          <h2 className="mt-0 mb-3 text-[15px] font-bold">Version history</h2>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Version", "Value", "Drafted by", "Approved by", "When"].map((h) => (
                  <th key={h} className={`${TH_SM} text-left`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.v}-${h.when}-${h.value}`}>
                  <td className={`${TD} p-2.5 font-mono text-[11.5px] text-[#57534e]`}>v{h.v}</td>
                  <td className={`${TD} p-2.5 font-mono text-[11.5px] font-semibold text-ink`}>{h.value}</td>
                  <td className={`${TD} p-2.5 text-[#57534e]`}>{h.by}</td>
                  <td className={`${TD} p-2.5 text-[#57534e]`}>{h.approver}</td>
                  <td className={`${TD} p-2.5 text-[#78716c]`}>{h.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-[11px] mb-0 text-[11.5px] text-[#78716c]">
            A rollback creates a new version equal to the selected prior value. History is never rewritten.
          </p>
        </div>
      </div>
    </div>
  );
}
