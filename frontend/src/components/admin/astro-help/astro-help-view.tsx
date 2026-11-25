"use client";

import { useCallback, useEffect, useState } from "react";
import { AgeChip, AgeLegend, edgeColor, oldestFirst } from "@/components/admin/finance/age-chip";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

interface Row {
  id: string;
  ref: string;
  astrologer: string;
  topic: string;
  team: string;
  teamLabel: string;
  subject: string;
  state: "OPEN" | "WAITING" | "RESOLVED";
  raisedAt: string;
  raisedIso: string;
  updatedAt: string;
  needsReply: boolean;
}
interface Line {
  id: string;
  mine: boolean;
  who: string;
  text: string;
  at: string;
}

const STATE: Record<Row["state"], string> = { OPEN: "Open", WAITING: "Waiting for astrologer", RESOLVED: "Resolved" };
const TEAMS: [string, string][] = [["hr", "HR"], ["finance", "Finance"], ["compliance", "Compliance"], ["super", "Admin"]];
const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** Issues astrologers raised from their portal Help page: the team replies, forwards or resolves. Oldest open first, in red/yellow/green. */
export default function AstroHelpView({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const r = await api.get<{ issues: Row[] }>("/admin/astro-help");
    setRows(r.issues);
  }, []);

  const openIssue = useCallback(async (id: string) => {
    setOpen(id);
    setError("");
    setText("");
    try {
      setLines((await api.get<{ messages: Line[] }>(`/admin/astro-help/${id}`)).messages);
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("issue");
    if (id) void Promise.resolve().then(() => openIssue(id));
  }, [openIssue]);

  async function act(path: string, body: unknown) {
    if (!open) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/admin/astro-help/${open}/${path}`, body);
      setText("");
      await Promise.all([openIssue(open), reload()]);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const active = oldestFirst(rows.filter((r) => r.state !== "RESOLVED"), (r) => r.raisedIso);
  const done = rows.filter((r) => r.state === "RESOLVED");
  const current = rows.find((r) => r.id === open);

  return (
    <div className="grid gap-4">
      <div className={`${PANEL} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[16px] font-bold">Waiting for an answer</h2>
          <span className="text-[12.5px] font-bold text-[#b45309]">{active.length ? `${active.length} open` : "Nothing waiting"}</span>
        </div>
        {active.length > 0 && <AgeLegend />}
        {active.length === 0 ? (
          <p className="mt-3 mb-0 text-[13px] text-[#78716c]">No open astrologer issues.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr>{["Waiting", "Issue", "Astrologer", "With", "Status", ""].map((h) => <th key={h} className={TH} style={{ textAlign: "left" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.id} className={open === r.id ? "bg-amber-50" : ""}>
                    <td className={`${TD} px-2.5 py-[11px] whitespace-nowrap`} style={{ boxShadow: `inset 4px 0 0 ${edgeColor(r.raisedIso)}` }}><AgeChip at={r.raisedIso} /></td>
                    <td className={`${TD} px-2.5 py-[11px]`}>
                      <b className="block text-ink">{r.subject}</b>
                      <span className="text-[11.5px] text-[#78716c]">{r.ref} · {r.topic}</span>
                    </td>
                    <td className={`${TD} px-2.5 py-[11px] text-ink`}>{r.astrologer}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-[#57534e]`}>{r.teamLabel}</td>
                    <td className={`${TD} px-2.5 py-[11px] whitespace-nowrap text-[#57534e]`}>{r.needsReply ? <b className="text-[#be123c]">Needs a reply</b> : STATE[r.state]}</td>
                    <td className={`${TD} px-2.5 py-[11px] text-right`}>
                      <button type="button" onClick={() => void openIssue(r.id)} className="h-[30px] rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold text-ink">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className={`${PANEL} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-[16px] font-bold">{current?.subject ?? "Issue"}</h2>
              <p className="mt-0.5 mb-0 text-[12px] text-[#78716c]">{current ? `${current.ref} · ${current.astrologer} · ${current.topic} · raised ${current.raisedAt}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-bold text-[#57534e]" htmlFor="fwd">Forward to</label>
              <select id="fwd" value="" disabled={busy} onChange={(e) => e.target.value && void act("forward", { team: e.target.value })} className="h-9 rounded-lg border border-line bg-white px-2 text-[13px] font-semibold text-ink">
                <option value="">Choose a team</option>
                {TEAMS.filter(([k]) => k !== current?.team).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {lines.map((l) => (
              <li key={l.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${l.mine ? "self-end bg-amber-100" : "self-start bg-stone-100"}`}>
                <b className="block text-[11.5px] text-stone-600">{l.who} · {l.at}</b>
                <span className="whitespace-pre-wrap text-ink">{l.text}</span>
              </li>
            ))}
          </ul>
          {current?.state === "RESOLVED" ? (
            <p className="mt-3 mb-0 text-[12.5px] text-[#78716c]">Resolved. The astrologer can raise a new issue if needed.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={3000} placeholder="Write your reply to the astrologer" aria-label="Reply" className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13.5px] text-ink" />
              {error && <p role="alert" className="m-0 text-[12.5px] font-semibold text-red-700">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !text.trim()} onClick={() => void act("reply", { text })} className="h-10 rounded-xl bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-60">Send reply</button>
                <button type="button" disabled={busy || !text.trim()} onClick={() => void act("reply", { text, resolve: true })} className="h-10 rounded-xl bg-emerald-700 px-4 text-[13px] font-bold text-white disabled:opacity-60">Reply and resolve</button>
              </div>
            </div>
          )}
        </div>
      )}

      {done.length > 0 && (
        <div className={`${PANEL} p-5`}>
          <h2 className="m-0 text-[16px] font-bold">Resolved</h2>
          <ul className="m-0 mt-2 list-none p-0 text-[13px]">
            {done.slice(0, 30).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft py-2">
                <span><b className="text-ink">{r.subject}</b> <span className="text-[#78716c]">· {r.astrologer} · {r.ref}</span></span>
                <button type="button" onClick={() => void openIssue(r.id)} className="text-[12px] font-bold text-amber-800">View</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
