"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import SortSelect, { useUrlSort } from "@/components/admin/sort-select";
import { EYEBROW, PANEL, TD, TH } from "@/components/admin/ui";
import { ASTROLOGER_DEFAULT_SORT, ASTROLOGER_SORTS, sortRows } from "@/lib/admin/sort";
import type { LifecycleAstrologer } from "@/lib/admin/types";
import { AstrologerDialog } from "./profile-dialogs";
import { STAGES, stageOf, SUSPENSION } from "./stages";

// Every astrologer account and where it is in the lifecycle (the Astrologer model's
// `lifecycle` and `suspension`), filtered here in the browser.

const SUSPENDED = "suspended";

const chip = (on: boolean) => ({
  borderColor: on ? "#1c1917" : "#e7e0d6",
  background: on ? "#1c1917" : "#fff",
  color: on ? "#fcd34d" : "#57534e",
});

export default function AstrologersList({ astrologers, initialOpen }: { astrologers: LifecycleAstrologer[]; initialOpen?: string }) {
  const [stage, setStage] = useState("all");
  const [sort, setSort] = useUrlSort(ASTROLOGER_SORTS, ASTROLOGER_DEFAULT_SORT);
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("all");
  // The astrologer whose full record is open in the popup.
  const [openId, setOpenId] = useState<string | null>(
    initialOpen && astrologers.some((a) => a.id === initialOpen) ? initialOpen : null,
  );

  const skills = useMemo(
    () => [...new Set(astrologers.flatMap((a) => a.skills))].sort((a, b) => a.localeCompare(b)),
    [astrologers],
  );
  // Stage chips: only stages someone is in (plus any unknown stage the API reports), in lifecycle order.
  const stageChips = useMemo(() => {
    const keys = [...new Set(astrologers.map((a) => a.lifecycle))];
    const order = (k: string) => {
      const i = STAGES.findIndex((s) => s.key === k);
      return i === -1 ? STAGES.length : i;
    };
    return keys
      .sort((a, b) => order(a) - order(b))
      .map((k) => ({ ...stageOf(k), count: astrologers.filter((a) => a.lifecycle === k).length }));
  }, [astrologers]);
  const suspendedCount = astrologers.filter((a) => a.suspension !== "none").length;

  const q = query.trim().toLowerCase();
  const rows = sortRows(astrologers, ASTROLOGER_SORTS, sort).filter(
    (a) =>
      (stage === "all" || (stage === SUSPENDED ? a.suspension !== "none" : a.lifecycle === stage)) &&
      (skill === "all" || a.skills.includes(skill)) &&
      (!q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)),
  );
  const filtered = stage !== "all" || skill !== "all" || q !== "";
  const clear = () => {
    setStage("all");
    setSkill("all");
    setQuery("");
  };

  return (
    <>
      <div className="mt-[18px] flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={stage === "all"}
          onClick={() => setStage("all")}
          className="h-[34px] rounded-full border px-3.5 text-[12.5px] font-bold"
          style={chip(stage === "all")}
        >
          All <b className="opacity-60">{astrologers.length}</b>
        </button>
        {stageChips.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={stage === s.key}
            onClick={() => setStage(s.key)}
            className="h-[34px] rounded-full border px-3.5 text-[12.5px] font-bold"
            style={chip(stage === s.key)}
          >
            {s.label} <b className="opacity-60">{s.count}</b>
          </button>
        ))}
        {suspendedCount > 0 && (
          <button
            type="button"
            aria-pressed={stage === SUSPENDED}
            onClick={() => setStage(SUSPENDED)}
            className="h-[34px] rounded-full border px-3.5 text-[12.5px] font-bold"
            style={chip(stage === SUSPENDED)}
          >
            Suspended <b className="opacity-60">{suspendedCount}</b>
          </button>
        )}
      </div>

      <div className={`${PANEL} mt-3.5 p-[18px]`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[260px] flex-1">
            <span className={`${EYEBROW} mb-1.5 block`}>Search by name</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3.5">
              <span className="text-[13px] text-muted" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or id"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </span>
          </label>
          <label className="w-[200px]">
            <span className={`${EYEBROW} mb-1.5 block`}>Skill</span>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] text-ink"
            >
              <option value="all">All skills</option>
              {skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <SortSelect options={ASTROLOGER_SORTS} value={sort} onChange={setSort} />
          <span className="ml-auto pb-3 text-[12px] font-semibold text-[#78716c]" aria-live="polite">
            Showing {rows.length} of {astrologers.length}
          </span>
          {filtered && (
            <button
              type="button"
              onClick={clear}
              className="h-11 rounded-xl border border-line bg-white px-3.5 text-[12.5px] font-bold text-[#57534e]"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {(
                  [
                    ["Astrologer", "left"],
                    ["Skills", "left"],
                    ["Stage", "left"],
                    ["Joined", "left"],
                    ["Consults", "right"],
                    ["Rating", "right"],
                    ["", "right"],
                  ] as const
                ).map(([label, align], i) => (
                  <th key={i} className={TH} style={{ textAlign: align }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const st = stageOf(a.lifecycle);
                const sus = SUSPENSION[a.suspension];
                return (
                  <tr key={a.id}>
                    <td className={`${TD} px-2.5 py-[10px]`}>
                      <div className="flex items-center gap-2.5">
                        <Image
                          src={a.photo}
                          alt=""
                          width={34}
                          height={34}
                          className="h-[34px] w-[34px] flex-[0_0_34px] rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setOpenId(a.id)}
                            aria-haspopup="dialog"
                            className="block max-w-full truncate border-0 bg-transparent p-0 text-left font-bold text-ink hover:underline"
                          >
                            {a.name}
                          </button>
                          <span className="font-mono text-[11px] text-[#78716c]">{a.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] text-[#57534e]`}>{a.skills.join(", ") || "—"}</td>
                    <td className={`${TD} px-2.5 py-[10px]`}>
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                          style={{ background: st.bg, color: st.fg }}
                        >
                          {st.label}
                        </span>
                        {sus && (
                          <span
                            className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                            style={{ background: sus.bg, color: sus.fg }}
                          >
                            {sus.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] whitespace-nowrap text-[#57534e]`}>{a.joined}</td>
                    <td className={`${TD} px-2.5 py-[10px] text-right text-[#57534e] tabular-nums`}>
                      {a.consults.toLocaleString("en-IN")}
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] text-right font-bold text-ink tabular-nums`}>
                      {a.rating != null ? (
                        `★ ${a.rating.toFixed(1)}`
                      ) : (
                        <span className="font-medium text-muted">New</span>
                      )}
                    </td>
                    <td className={`${TD} px-2.5 py-[10px] text-right whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => setOpenId(a.id)}
                        aria-haspopup="dialog"
                        aria-label={`Open profile of ${a.name}`}
                        className="mr-3.5 border-0 bg-transparent p-0 text-[12.5px] font-bold text-amber-700"
                      >
                        Open ›
                      </button>
                      {a.lifecycle === "active" && a.suspension !== "full" ? (
                        <Link
                          href={`/astrologer/${a.slug}`}
                          target="_blank"
                          className="text-[12.5px] font-bold whitespace-nowrap text-amber-700"
                        >
                          Public profile ↗
                        </Link>
                      ) : (
                        <span className="text-[12px] text-muted">Not public</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="mt-4 mb-0 text-center text-[13px] text-[#78716c]">
            {astrologers.length === 0 ? "No astrologers yet." : "No astrologers match these filters."}
          </p>
        )}
      </div>

      {openId && <AstrologerDialog key={openId} id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
