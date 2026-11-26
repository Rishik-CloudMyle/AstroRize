"use client";

import { useCallback, useEffect, useState } from "react";
import { PANEL, TD, TH } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

interface Row {
  id: string;
  name: string;
  status: string;
  customPct: number | null;
  currentPct: number;
}
interface Data {
  standardPct: number;
  newPct: number;
  newDays: number;
  astrologers: Row[];
}

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** One standard revenue share for everyone, and an own share for the astrologers who have one. */
export default function RevenueShareView() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>("/admin/revenue-share"));
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function save(row: Row, pct: number | null) {
    setBusy(row.id);
    setError("");
    setNote("");
    try {
      await api.put(`/admin/revenue-share/${encodeURIComponent(row.id)}`, { pct });
      setDraft((d) => ({ ...d, [row.id]: "" }));
      setNote(pct === null ? `${row.name} is back on the standard share.` : `${row.name} now keeps ${pct}% of new earnings.`);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="mt-4 text-[13px] text-[#78716c]">{error || "Loading revenue shares…"}</p>;
  const rows = data.astrologers.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <h2 className="m-0 text-[16px] font-bold">Revenue share</h2>
      <p className="mt-1 mb-0 text-[12.5px] text-[#78716c]">
        Standard share: astrologers keep <b className="text-ink">{data.standardPct}%</b>
        {data.newPct !== data.standardPct && data.newDays > 0 ? ` (new astrologers keep ${data.newPct}% for their first ${data.newDays} days)` : ""}. These come from the
        earnings settings under All settings. Give an astrologer an own share below; it replaces the standard one for money earned from then on. Audited.
      </p>
      <input aria-label="Search astrologers" placeholder="Search astrologer" value={q} onChange={(e) => setQ(e.target.value)} className="mt-3 h-10 w-full max-w-[280px] rounded-xl border border-line bg-white px-3 text-[13px]" />
      {note && <p role="status" className="mt-2 mb-0 text-[13px] font-semibold text-emerald-700">{note}</p>}
      {error && <p role="alert" className="mt-2 mb-0 text-[13px] font-semibold text-red-700">{error}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr>{["Astrologer", "Status", "Keeps now", "Own share (%)", ""].map((h) => <th key={h} className={TH} style={{ textAlign: "left" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const value = draft[r.id] ?? "";
              const n = Number(value);
              const valid = value !== "" && Number.isInteger(n) && n >= 0 && n <= 100;
              return (
                <tr key={r.id}>
                  <td className={`${TD} px-2.5 py-2.5 font-semibold text-ink`}>{r.name}</td>
                  <td className={`${TD} px-2.5 py-2.5 text-[#57534e] capitalize`}>{r.status}</td>
                  <td className={`${TD} px-2.5 py-2.5 tabular-nums`}>
                    <b className="text-ink">{r.currentPct}%</b> <span className="text-[11.5px] text-[#78716c]">{r.customPct === null ? "standard" : "own share"}</span>
                  </td>
                  <td className={`${TD} px-2.5 py-2.5`}>
                    <input aria-label={`Own share for ${r.name}`} inputMode="numeric" value={value} placeholder={r.customPct === null ? "—" : String(r.customPct)} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value.replace(/\D/g, "").slice(0, 3) }))} className="h-9 w-24 rounded-lg border border-line bg-white px-2.5 text-[13px] tabular-nums" />
                  </td>
                  <td className={`${TD} px-2.5 py-2.5 text-right whitespace-nowrap`}>
                    <button type="button" disabled={!valid || busy !== null} onClick={() => void save(r, n)} className="h-9 rounded-lg bg-ink px-3 text-[12px] font-bold text-white disabled:opacity-40">Save</button>
                    {r.customPct !== null && (
                      <button type="button" disabled={busy !== null} onClick={() => void save(r, null)} className="ml-1.5 h-9 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-ink disabled:opacity-40">Use standard</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
