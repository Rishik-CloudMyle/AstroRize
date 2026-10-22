"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import SortSelect, { FilterSelect, useUrlParam, useUrlSort } from "@/components/admin/sort-select";
import { EYEBROW, PANEL, TD, TH_SM } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api/client";
import { valueHint, valueProblem } from "@/lib/admin/config-values";
import { CONFIG_SORTS, sortRows } from "@/lib/admin/sort";
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
  const router = useRouter();
  const formId = useId();
  const actor = session.actor;

  const [selected, setSelected] = useState(initialKey);
  // Department filter, kept in the URL as ?dept=… (only departments that have keys are offered).
  const deptIds = data.facets
    .filter((x) => x.id !== "all" && data.keys.some((k) => k.domain === x.id))
    .map((x) => x.id);
  const [facetParam, setFacetParam] = useUrlParam("dept", deptIds, "all");
  const facet = facetParam as ConfigDomain | "all";
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useUrlSort(CONFIG_SORTS);
  const grouped = sort === "department";
  // Versions and the pending change of the selected key (GET /admin/config/:key).
  const [detail, setDetail] = useState<ConfigDetail | null>(initialDetail);
  const [simulated, setSimulated] = useState<string | null>(null);
  // Shown after this admin approves, until another key is picked.
  const [justApproved, setJustApproved] = useState<{ key: string; version: number } | null>(null);
  // The value typed into "Proposed value", and the problem with it (checked here, then by the API).
  const [proposed, setProposed] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cfg = data.keys.find((k) => k.key === selected) ?? data.keys[0];
  const d = detail?.key === cfg.key ? detail : null;
  const pending = d?.pending ?? null;
  const version = d?.version ?? cfg.version;
  const prevVersion = Math.max(1, version - 1);
  // The draft card previews the typed value only once it is a valid proposal.
  const typedOk = proposed.trim() !== "" && valueProblem(proposed, cfg) === null;
  const draft = pending ? pending.toValue : typedOk ? proposed.trim() : "—";
  const maker = pending?.draftedBy ?? actor;
  const stage = justApproved?.key === cfg.key ? "approved" : pending ? "submitted" : "draft";
  // Compare people, not short names: two people in a department could share one.
  const isMaker = pending
    ? pending.draftedById
      ? pending.draftedById === session.id
      : pending.draftedBy === actor
    : true;

  const f = filter.trim().toLowerCase();
  const sortedKeys = sortRows(data.keys, CONFIG_SORTS, sort);
  const visibleKeys = sortedKeys.filter(
    (k) => (facet === "all" || k.domain === facet) && (!f || k.key.toLowerCase().includes(f)),
  );
  // "Finance (5)": the number of keys in each department, whatever the text filter says.
  const facetOptions = data.facets
    .map((x) => ({ x, n: x.id === "all" ? data.keys.length : data.keys.filter((k) => k.domain === x.id).length }))
    .filter(({ n }) => n > 0)
    .map(({ x, n }) => ({ key: x.id, label: `${x.id === "all" ? "All departments" : x.label} (${n})` }));

  const select = async (key: string) => {
    setSelected(key);
    setJustApproved(null);
    setProposed("");
    setProblem(null);
    if (detail?.key === key) return;
    try {
      const res = await api.get<{ detail: ConfigDetail }>(`/admin/config/${encodeURIComponent(key)}`);
      setDetail(res.detail);
    } catch {
      say("Couldn't load this key's versions. Please try again.");
    }
  };

  const pickFacet = (id: ConfigDomain | "all") => {
    setFacetParam(id);
    // Keep the open key if it is in the department; otherwise open the department's first key.
    if (id === "all" || cfg.domain === id) return;
    const first = sortedKeys.find((k) => k.domain === id);
    if (first) void select(first.key);
  };

  // ── handlers from the prototype (cfgSimulate / cfgSubmit / cfgApprove / cfgRollback), now via the API ──
  // Shows (or hides) what changing this key does, as described for the key.
  const simulate = () => setSimulated(simulated === cfg.key ? null : cfg.key);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = valueProblem(proposed, cfg);
    setProblem(local);
    if (local || submitting) return;
    setSubmitting(true);
    try {
      // The API re-checks the range and answers in the same words, shown under the input.
      const res = await api.post<{ detail: ConfigDetail }>(`/admin/config/${encodeURIComponent(cfg.key)}/draft`, {
        value: proposed.trim(),
      });
      setDetail(res.detail);
      setProposed("");
      say(`Submitted for approval. Audited: ${actor} · config.draft.submit`);
      router.refresh();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't submit the change. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
  const reject = async () => {
    if (!pending) return;
    const res = await run(
      () => api.post<{ detail: ConfigDetail }>(`/admin/config/changes/${pending.id}/reject`),
      isMaker ? "Your draft was withdrawn. The current value stays. Audited." : "Change rejected. The current value stays. Audited.",
    );
    if (res) setDetail(res.detail);
  };
  const rollback = async () => {
    // Takes effect at once (it restores a value a second person already approved), so ask first.
    if (!window.confirm(`Roll ${cfg.key} back to the value before its latest approved change? It takes effect immediately.`)) return;
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
  const problemId = `${formId}-problem`;
  const hintId = `${formId}-hint`;
  // Department label of each key, for the group headings in the key browser and the dropdown.
  const domainLabel = (d: ConfigDomain) => data.facets.find((x) => x.id === d)?.label ?? "Other";
  // The setting dropdown, grouped like the facets in the key browser.
  const groups = data.facets
    .filter((x) => x.id !== "all")
    .map((x) => ({ label: x.label, keys: data.keys.filter((k) => k.domain === x.id) }))
    .filter((g) => g.keys.length > 0);
  const ungrouped = data.keys.filter((k) => !data.facets.some((x) => x.id === k.domain));
  const draftNote = approved
    ? "Live now"
    : stage === "submitted"
      ? `Drafted by ${maker} · awaiting a different approver`
      : typedOk
        ? "Not yet submitted"
        : "Enter a valid value above";
  const draftTone = approved
    ? { bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857" }
    : { bg: "#fffbeb", border: "#fde68a", fg: "#92400e" };
  // An approved change applies the moment it is approved.
  const effective = "On approval";

  // Only platform-wide values exist today: no per-country, segment or user overrides.
  const scopeRows = [
    { level: "Global", value: cfg.current, eff: "Current", state: "Active", bg: "#ecfdf5", fg: "#047857" },
    ...(pending
      ? [{ level: "Global", value: pending.toValue, eff: effective, state: "Awaiting approval", bg: "#eff6ff", fg: "#1e40af" }]
      : []),
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
    <div className="mt-5 grid grid-cols-1 items-start gap-[18px] md:grid-cols-[300px_minmax(0,1fr)]">
      {/* Key browser */}
      <div className={`${PANEL} p-3.5`}>
        <SortSelect options={CONFIG_SORTS} value={sort} onChange={setSort} className="mb-3 w-full" />
        <FilterSelect
          label="Department"
          icon="▦"
          options={facetOptions}
          value={facet}
          onChange={(id) => pickFacet(id as ConfigDomain | "all")}
          className="mb-3 w-full"
        />
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
        <div className="mt-3 flex flex-col gap-[3px]">
          {visibleKeys.map((k, i) => {
            const on = k.key === cfg.key;
            // Grouped by department: a heading wherever the department changes.
            const heading = grouped && (i === 0 || visibleKeys[i - 1].domain !== k.domain);
            return (
              <div key={k.key}>
                {heading && (
                  <div
                    className={`px-1 pb-1 text-[10.5px] font-bold tracking-[.08em] text-amber-800 uppercase ${i === 0 ? "pt-0" : "pt-2.5"}`}
                  >
                    {domainLabel(k.domain)}
                  </div>
                )}
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => void select(k.key)}
                  className="flex w-full items-center gap-2 rounded-[10px] border px-[11px] py-[9px] text-left"
                  style={{ borderColor: on ? "#fcd34d" : "#e7e0d6", background: on ? "#fef3c7" : "#fff" }}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate font-mono text-[11px]"
                      style={{ color: on ? "#92400e" : "#57534e" }}
                    >
                      {k.key}
                    </span>
                    {sort === "recent" && (
                      <span className="mt-0.5 block text-[10.5px] text-[#78716c]">Changed {k.changed}</span>
                    )}
                  </span>
                  {k.pending && (
                    <span
                      className="inline-flex h-[18px] flex-none items-center rounded-full bg-blue-50 px-1.5 text-[9.5px] font-extrabold text-blue-800"
                      title="A change is waiting for a second approver"
                    >
                      Pending
                    </span>
                  )}
                  {k.flagged && (
                    <span className="flex-none text-[11px]" title="Sensitive setting">
                      🔒
                    </span>
                  )}
                </button>
              </div>
            );
          })}
          {visibleKeys.length === 0 && (
            <p className="m-0 px-1 py-2 text-[12px] text-[#78716c]">No keys match this filter.</p>
          )}
        </div>
      </div>

      <div className="min-w-0">
        {/* Propose a change: pick the setting, type the value, submit it for a second approver */}
        <form onSubmit={submit} noValidate className={`${PANEL} mb-4 p-[18px]`}>
          <h2 className="mt-0 mb-3 text-[15px] font-bold">Propose a change</h2>
          {/* Narrower windows: the setting gets its own row, value and button share the next (phones: one per row). */}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]">
            <label className="min-w-0 sm:col-span-2 xl:col-span-1">
              <span className={`${EYEBROW} mb-1.5 block`}>Setting</span>
              <select
                value={cfg.key}
                onChange={(e) => void select(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-white px-3 font-mono text-[12.5px] text-ink"
              >
                {grouped ? (
                  <>
                    {groups.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.keys.map((k) => (
                          <option key={k.key} value={k.key}>
                            {k.key}
                            {k.flagged ? " 🔒" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {ungrouped.map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.key}
                      </option>
                    ))}
                  </>
                ) : (
                  // Any other sort: one list in the chosen order, as in the key browser.
                  sortedKeys.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.key}
                      {k.flagged ? " 🔒" : ""}
                    </option>
                  ))
                )}
              </select>
              <span className="mt-1 block text-[11px] text-[#78716c]">Current value {cfg.current}</span>
            </label>
            <label className="min-w-0">
              <span className={`${EYEBROW} mb-1.5 block`}>Proposed value</span>
              <input
                type="text"
                inputMode={cfg.range?.integer ? "numeric" : "decimal"}
                autoComplete="off"
                value={pending ? "" : proposed}
                placeholder={pending ? "Waiting for approval" : cfg.bounds}
                disabled={!!pending || !cfg.range}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${problemId} ${hintId}` : hintId}
                onChange={(e) => {
                  setProposed(e.target.value);
                  if (problem) setProblem(null);
                }}
                className="h-11 w-full rounded-xl border bg-white px-3 font-mono text-[14px] text-ink disabled:bg-stone-100 disabled:text-muted"
                style={{ borderColor: problem ? "#be123c" : "#e7e0d6" }}
              />
              <span id={hintId} className="mt-1 block text-[11px] text-[#78716c]">
                {pending ? "A change to this setting is already waiting for approval." : valueHint(cfg)}
              </span>
            </label>
            <div>
              <span className={`${EYEBROW} mb-1.5 block`} aria-hidden>
                &nbsp;
              </span>
              <button
                type="submit"
                disabled={!!pending || !cfg.range || submitting}
                className="h-11 rounded-xl border-0 bg-[linear-gradient(90deg,#ffd233,#ff8c1a)] px-[22px] text-[13.5px] font-bold whitespace-nowrap text-cta-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          </div>
          {problem && (
            <p
              id={problemId}
              role="alert"
              className="mt-3 mb-0 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700"
            >
              {problem}
            </p>
          )}
        </form>

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
                  🔒 Sensitive setting
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
                {pending ? "Live as soon as a different person approves" : "A second person must approve first"}
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
              <b className="text-[13px] text-blue-800">What changing it does</b>
              <p className="mt-[5px] mb-0 text-[12.5px] leading-[1.5] text-blue-900">{cfg.dryRun}</p>
            </div>
          )}

          <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={simulate} aria-expanded={simulated === cfg.key} className={ghostBtn}>
              {simulated === cfg.key ? "Hide impact" : "Show impact"}
            </button>
            {/* Only once a value has been changed through the console: there is nothing earlier before that. */}
            {version > 1 && (
              <button type="button" onClick={rollback} className={ghostBtn}>
                Roll back to v{prevVersion}
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2.5">
              {stage === "submitted" && (
                <button type="button" onClick={reject} className={`${ghostBtn} text-rose-700`}>
                  {isMaker ? "Withdraw draft" : "Reject"}
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
                  {isMaker ? "Approve — blocked, you drafted this" : "Approve"}
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
              one platform-wide value per setting · per-country or per-segment overrides aren&apos;t available
            </span>
          </div>
          <div className="overflow-x-auto mt-2.5">
            <table className="w-full border-collapse text-[13px]">
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
        </div>

        {/* Version history */}
        <div className={`${PANEL} mt-4 p-5`}>
          <h2 className="mt-0 mb-3 text-[15px] font-bold">Version history</h2>
          <div className="overflow-x-auto">
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
          </div>
          <p className="mt-[11px] mb-0 text-[11.5px] text-[#78716c]">
            A rollback creates a new version equal to the selected prior value. History is never rewritten.
          </p>
        </div>
      </div>
    </div>
  );
}
