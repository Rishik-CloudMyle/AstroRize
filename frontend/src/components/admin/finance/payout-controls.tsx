"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import { PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { FinanceData } from "@/lib/admin/types";

interface Adjustment {
  id: string;
  ref: string;
  astrologer: string;
  date: string;
  amount: number;
  reason: string;
  batchId: string | null;
}
interface Data {
  adjustments: Adjustment[];
  astrologers: { id: string; name: string }[];
}

const FIELD = "h-10 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-[13.5px] text-ink";
const LABEL = "flex min-w-0 flex-col gap-1 text-[12px] font-bold text-stone-600";
const money = (n: number) => `${n < 0 ? "−" : "+"}₹${Math.abs(n).toLocaleString("en-IN")}`;

/** The payout schedule, and incentives / deductions that go into an astrologer's next payout. */
export default function PayoutControls({ schedule }: { schedule: FinanceData["schedule"] }) {
  const { session } = useAdmin();
  const { run, busy } = useAction();
  const canManage = session.capabilities.includes("payout.approve");
  const [day, setDay] = useState(schedule.day);
  const [cycleDays, setCycleDays] = useState(schedule.cycleDays);
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ astrologerId: "", type: "incentive", amount: "", reason: "", date: "" });

  const load = useCallback(() => {
    api
      .get<Data>("/admin/payouts/adjustments")
      .then(setData)
      .catch(() => setData({ adjustments: [], astrologers: [] }));
  }, []);
  useEffect(load, [load]);

  const amount = Number(form.amount);
  const ready = !!form.astrologerId && Number.isInteger(amount) && amount > 0 && form.reason.trim().length >= 5;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    const signedAmount = form.type === "deduction" ? -amount : amount;
    const name = data?.astrologers.find((a) => a.id === form.astrologerId)?.name ?? "";
    if (!window.confirm(`Add ${money(signedAmount)} (${form.type}) for ${name}? It joins their next payout batch.`)) return;
    const ok = await run(
      () => api.post("/admin/payouts/adjustments", { astrologerId: form.astrologerId, amount: signedAmount, reason: form.reason.trim(), ...(form.date ? { date: form.date } : {}) }),
      `${money(signedAmount)} added for ${name}. Audited.`,
    );
    if (ok) {
      setForm({ astrologerId: "", type: "incentive", amount: "", reason: "", date: "" });
      load();
    }
  };

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className={`${PANEL} p-5`}>
        <h2 className="m-0 text-[16px] font-bold">Payout schedule</h2>
        <p className="mt-1 mb-3 text-[12px] text-[#78716c]">The day payouts are due, in the month after a cycle ends.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Payout day
            <select value={day} disabled={!canManage} onChange={(e) => setDay(Number(e.target.value))} className={FIELD}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Cycle
            <select value={cycleDays} disabled={!canManage} onChange={(e) => setCycleDays(Number(e.target.value) as 15 | 30)} className={FIELD}>
              <option value={30}>Monthly</option>
              <option value={15}>Half-monthly</option>
            </select>
          </label>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={busy || (day === schedule.day && cycleDays === schedule.cycleDays)}
            onClick={() => void run(() => api.put("/admin/payouts/schedule", { day, cycleDays }), "Payout schedule saved. Audited.")}
            className="mt-3 h-10 rounded-xl border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60"
          >
            Save schedule
          </button>
        )}
      </div>

      <div className={`${PANEL} p-5`}>
        <h2 className="m-0 text-[16px] font-bold">Incentives and deductions</h2>
        <p className="mt-1 mb-3 text-[12px] text-[#78716c]">Added to the astrologer&apos;s earnings for the date given, counted for TDS and shown on their statement. Refunds are taken back automatically.</p>
        {canManage && (
          <form onSubmit={add} className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end gap-3">
            <label className={LABEL}>
              Astrologer
              <select value={form.astrologerId} onChange={(e) => setForm({ ...form, astrologerId: e.target.value })} className={FIELD}>
                <option value="">Choose…</option>
                {data?.astrologers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={FIELD}>
                <option value="incentive">Incentive (add)</option>
                <option value="deduction">Deduction (take off)</option>
              </select>
            </label>
            <label className={LABEL}>
              Amount ₹
              <input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, "").slice(0, 6) })} className={FIELD} />
            </label>
            <label className={LABEL}>
              Date (today if blank)
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={FIELD} />
            </label>
            <label className={LABEL}>
              Reason
              <input value={form.reason} maxLength={120} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={FIELD} />
            </label>
            <button type="submit" disabled={!ready || busy} className="h-10 rounded-xl border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60">
              Add
            </button>
          </form>
        )}
        {!!data?.adjustments.length && (
          <ul className="m-0 mt-3 flex max-h-[190px] list-none flex-col gap-1.5 overflow-y-auto p-0">
            {data.adjustments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-line-soft bg-white px-3 py-2 text-[12.5px]">
                <b className={`tabular-nums ${a.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(a.amount)}</b>
                <b>{a.astrologer}</b>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-[#57534e]">{a.reason}</span>
                <span className="text-[11.5px] text-[#78716c]">
                  {new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · {a.batchId ?? "next batch"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
