"use client";

import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { PageKey, RbacCell, RbacData } from "@/lib/admin/types";

// The access matrix: which department may open which console page and use which capability.
// The Super Admin edits it here (PUT /admin/rbac/matrix); locked cells never change, and the
// API enforces the same locks. Everyone else sees it read-only.

type Grid = boolean[][];

const onGrid = (rows: { cells: RbacCell[] }[]): Grid => rows.map((r) => r.cells.map((c) => c.on));
/** The defaults: a cell's value flipped back when it differs from its default. */
const defaultGrid = (rows: { cells: RbacCell[] }[]): Grid =>
  rows.map((r) => r.cells.map((c) => (c.isDefault ? c.on : !c.on)));

/** Readable changes between two states, in the same words as the audit log entry. */
function diffLines(data: RbacData, fromPages: Grid, toPages: Grid, fromCaps: Grid, toCaps: Grid): string[] {
  const out: string[] = [];
  data.roles.forEach((role, ri) => {
    data.pages.forEach((p, pi) => {
      if (toPages[pi][ri] !== fromPages[pi][ri])
        out.push(`${role.label}: ${toPages[pi][ri] ? "+" : "−"} ${p.label} page`);
    });
    data.capabilities.forEach((c, ci) => {
      if (toCaps[ci][ri] !== fromCaps[ci][ri]) out.push(`${role.label}: ${toCaps[ci][ri] ? "+" : "−"} ${c.key}`);
    });
  });
  return out;
}

function Mark({ on }: { on: boolean }) {
  return (
    <span className="text-[14px] font-extrabold" style={{ color: on ? "#047857" : "#d6d3d1" }}>
      {on ? "✓" : "—"}
    </span>
  );
}

/** One grid cell: a lock with its reason, a checkbox while editing, or a tick. */
function Cell({
  cell,
  value,
  editing,
  label,
  warn,
  onToggle,
}: {
  cell: RbacCell;
  value: boolean;
  editing: boolean;
  label: string;
  warn?: string | null;
  onToggle: () => void;
}) {
  const changed = editing && value !== cell.on;
  return (
    <td className={`${TD} p-2 text-center align-middle`} style={{ background: changed ? "#fef3c7" : undefined }}>
      {cell.locked ? (
        <span
          className="inline-flex items-center gap-1"
          title={`Locked — ${cell.reason}`}
          aria-label={`${label}: ${value ? "granted" : "not granted"}, locked — ${cell.reason}`}
        >
          <Mark on={value} />
          {editing && (
            <span aria-hidden className="text-[11px]">
              🔒
            </span>
          )}
        </span>
      ) : editing ? (
        <label className="inline-flex cursor-pointer flex-col items-center gap-0.5">
          <input
            type="checkbox"
            checked={value}
            onChange={onToggle}
            aria-label={label}
            className="h-[18px] w-[18px] cursor-pointer accent-amber-600"
          />
          {warn && <span className="text-[10px] leading-tight font-bold text-amber-700">{warn}</span>}
        </label>
      ) : (
        <span aria-label={`${label}: ${value ? "granted" : "not granted"}`}>
          <Mark on={value} />
          {warn && <span className="block text-[10px] leading-tight font-bold text-amber-700">{warn}</span>}
        </span>
      )}
    </td>
  );
}

export default function RbacMatrix({ data }: { data: RbacData }) {
  const { run, busy } = useAction();
  const savedPages = onGrid(data.pages);
  const savedCaps = onGrid(data.capabilities);
  const [editing, setEditing] = useState(false);
  const [pages, setPages] = useState<Grid>(savedPages);
  const [caps, setCaps] = useState<Grid>(savedCaps);
  const [confirm, setConfirm] = useState<"save" | "reset" | null>(null);

  // Outside edit mode the grid shows what is saved (fresh after every refresh).
  const shownPages = editing ? pages : savedPages;
  const shownCaps = editing ? caps : savedCaps;
  const changes = diffLines(data, savedPages, pages, savedCaps, caps);
  const resetChanges = diffLines(data, savedPages, defaultGrid(data.pages), savedCaps, defaultGrid(data.capabilities));
  const pageIndex = (key: PageKey) => data.pages.findIndex((p) => p.key === key);

  const toggle = (grid: Grid, set: (g: Grid) => void, row: number, col: number) =>
    set(grid.map((r, i) => (i === row ? r.map((v, j) => (j === col ? !v : v)) : r)));

  const startEdit = () => {
    setPages(savedPages);
    setCaps(savedCaps);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setPages(savedPages);
    setCaps(savedCaps);
  };

  const save = async () => {
    const body = {
      version: data.version,
      pages: Object.fromEntries(
        data.roles.map((r, ri) => [r.key, data.pages.filter((_, pi) => pages[pi][ri]).map((p) => p.key)]),
      ),
      capabilities: Object.fromEntries(
        data.capabilities.map((c, ci) => [c.key, data.roles.filter((_, ri) => caps[ci][ri]).map((r) => r.key)]),
      ),
    };
    const res = await run(
      () => api.put<{ changes: string[] }>("/admin/rbac/matrix", body),
      (r) =>
        `Access updated — ${r.changes.length} ${r.changes.length === 1 ? "change" : "changes"}, in force now. Audited as rbac.matrix.update.`,
    );
    setConfirm(null);
    if (res) setEditing(false);
  };
  const reset = async () => {
    const res = await run(
      () => api.post<{ changes: string[] }>("/admin/rbac/matrix/reset"),
      "Access reset to the defaults, in force now. Audited as rbac.matrix.reset.",
    );
    setConfirm(null);
    if (res) setEditing(false);
  };

  const btn = "h-10 rounded-[11px] px-4 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50";
  const head = (
    <tr>
      <th className={`${TH} text-left`} />
      {data.roles.map((r) => (
        <th key={r.key} className={`${TH} w-[118px] text-center`}>
          {r.label}
        </th>
      ))}
    </tr>
  );

  return (
    <>
      <div
        className={`${PANEL} mt-[18px] flex flex-wrap items-center gap-3 px-5 py-4`}
        style={editing ? { borderColor: "#f59e0b", boxShadow: "0 0 0 2px #fde68a" } : undefined}
      >
        <div className="min-w-0 flex-1">
          <b className="block text-[14px] text-ink">
            {editing ? "Editing access" : data.customised ? "Customised access" : "Default access"}
          </b>
          <span className="text-[12px] text-[#78716c]">
            {editing
              ? "Tick or untick a cell. Locked cells (🔒) can't change. Nothing changes until you save."
              : data.updatedBy
                ? `Last changed by ${data.updatedBy} · ${data.updatedAt} IST · version ${data.version}`
                : "The platform defaults have not been changed."}
            {!data.canEdit && " Read-only — only a Super Admin can change access."}
          </span>
        </div>
        {data.canEdit &&
          (editing ? (
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={cancel} className={`${btn} border border-line bg-white text-[#57534e]`}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!data.customised || busy}
                onClick={() => setConfirm("reset")}
                title={data.customised ? undefined : "Access is already at the defaults"}
                className={`${btn} border border-rose-200 bg-white text-rose-700`}
              >
                Reset to defaults
              </button>
              <button
                type="button"
                disabled={changes.length === 0 || busy}
                onClick={() => setConfirm("save")}
                className={`${btn} border-0 bg-amber-500 text-ink`}
              >
                Review &amp; save{changes.length ? ` (${changes.length})` : ""}
              </button>
            </div>
          ) : (
            <button type="button" onClick={startEdit} className={`${btn} border-0 bg-ink text-white`}>
              Edit access
            </button>
          ))}
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">Pages</h2>
        <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
          Which console pages each department can open. A page someone can&rsquo;t open is hidden from their menu and
          its data is refused by the server.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>{head}</thead>
            <tbody>
              {data.pages.map((p, pi) => (
                <tr key={p.key}>
                  <td className={`${TD} p-2.5 font-semibold text-ink`}>{p.label}</td>
                  {p.cells.map((c, ri) => (
                    <Cell
                      key={ri}
                      cell={c}
                      value={shownPages[pi][ri]}
                      editing={editing}
                      label={`${data.roles[ri].label} can open ${p.label}`}
                      onToggle={() => toggle(pages, setPages, pi, ri)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">Capabilities</h2>
        <p className="mt-0 mb-3.5 text-[12px] text-[#78716c]">
          What each department can do. A capability only works together with the page it is used on.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>{head}</thead>
            <tbody>
              {data.capabilities.map((c, ci) => {
                const pi = c.page ? pageIndex(c.page) : -1;
                const pageLabel = pi >= 0 ? data.pages[pi].label : null;
                return (
                  <tr key={c.key}>
                    <td className={`${TD} p-2.5`}>
                      <span className="block font-mono text-[11.5px] text-ink">{c.key}</span>
                      <span className="block text-[11.5px] text-[#78716c]">
                        {c.label}
                        {pageLabel ? ` · on ${pageLabel}` : " · no console action uses it yet"}
                      </span>
                    </td>
                    {c.cells.map((cell, ri) => {
                      const value = shownCaps[ci][ri];
                      // Granted, but the department can't open the page where it is used.
                      const warn = value && pi >= 0 && !shownPages[pi][ri] && !cell.locked ? `needs ${pageLabel}` : null;
                      return (
                        <Cell
                          key={ri}
                          cell={cell}
                          value={value}
                          editing={editing}
                          warn={warn}
                          label={`${data.roles[ri].label}: ${c.key}`}
                          onToggle={() => toggle(caps, setCaps, ci, ri)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${PANEL} mt-4 p-5`}>
        <h2 className="mt-0 mb-1 text-[16px] font-bold">🔒 Always enforced</h2>
        <p className="mt-0 mb-3 text-[12px] text-[#78716c]">These rules can&rsquo;t be changed here.</p>
        <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[13px] leading-[1.5] text-[#57534e]">
          <li>A Super Admin always has every page and capability.</li>
          <li>Only a Super Admin can manage the team and change this access matrix.</li>
          <li>Every department keeps the overview and read access to the audit log.</li>
          {data.separationOfDuties.map((r) => (
            <li key={r}>
              {r} <span className="text-[#78716c]">(checked per person, in every department)</span>
            </li>
          ))}
        </ul>
      </div>

      {confirm && (
        <AdminDialog
          title={confirm === "save" ? "Save access changes?" : "Reset access to the defaults?"}
          subtitle="Takes effect at once for everyone in these departments: their menu and what the server allows."
          onClose={() => setConfirm(null)}
          width={560}
          footer={
            <div className="flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className={`${btn} border border-line bg-white text-[#57534e]`}
              >
                Keep editing
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void (confirm === "save" ? save() : reset())}
                className={`${btn} border-0 ${confirm === "save" ? "bg-amber-500 text-ink" : "bg-rose-700 text-white"}`}
              >
                {busy ? "Saving…" : confirm === "save" ? "Save changes" : "Reset to defaults"}
              </button>
            </div>
          }
        >
          <p className="mt-0 mb-2.5 text-[13px] text-[#57534e]">
            {(confirm === "save" ? changes : resetChanges).length}{" "}
            {(confirm === "save" ? changes : resetChanges).length === 1 ? "change" : "changes"}, recorded in the audit
            log:
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {(confirm === "save" ? changes : resetChanges).map((line) => (
              <li
                key={line}
                className="rounded-[10px] px-3 py-2 font-mono text-[12px]"
                style={{
                  background: line.includes(": +") ? "#ecfdf5" : "#fff1f2",
                  color: line.includes(": +") ? "#047857" : "#be123c",
                }}
              >
                {line}
              </li>
            ))}
          </ul>
        </AdminDialog>
      )}
    </>
  );
}
