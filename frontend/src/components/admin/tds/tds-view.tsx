"use client";

import { useCallback, useEffect, useState } from "react";
import AdminDialog from "@/components/admin/dialog";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

interface Global {
  defaultPct: number;
  noPanPct: number;
  nonResidentPct: number;
  thresholdPerPayout: number;
  thresholdPerYear: number;
}
interface Profile {
  residentialStatus: "RESIDENT" | "NON_RESIDENT";
  billingAddress: string | null;
  ratePct: number | null;
  exempt: boolean;
  thresholdPerPayout: number | null;
  note: string | null;
}
interface Astro {
  id: string;
  name: string;
  lifecycle: string;
  hasPan: boolean;
  profile: Profile;
  effectivePct: number;
  effectiveNote: string;
  thresholdPerPayout: number;
  paidThisYear: number;
  pending: boolean;
}
interface Change {
  id: string;
  scope: "GLOBAL" | "ASTROLOGER";
  scopeLabel: string;
  astrologerId: string | null;
  proposed: Record<string, unknown>;
  previous: Record<string, unknown>;
  reason: string | null;
  state: "PENDING" | "ACKNOWLEDGED" | "REJECTED";
  by: string;
  byId: string;
  at: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
interface Data {
  global: Global;
  astrologers: Astro[];
  pending: Change[];
  history: Change[];
  can: { propose: boolean; acknowledge: boolean };
  me: string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");
const field = "h-10 w-full rounded-xl border border-line bg-white px-3 text-[13.5px] text-ink";
const lab = "block text-[12.5px] font-semibold text-stone-700";
const th = "px-2.5 py-2 text-[10.5px] font-bold tracking-[.08em] uppercase text-[#78716c]";
const td = "border-t border-line-soft px-2.5 py-2.5 align-top";
const LABELS: Record<string, string> = {
  defaultPct: "Default rate",
  noPanPct: "Rate with no PAN",
  nonResidentPct: "Non-resident rate",
  thresholdPerPayout: "Per-payout threshold",
  thresholdPerYear: "Yearly threshold",
  residentialStatus: "Residential status",
  billingAddress: "Billing address",
  ratePct: "Custom rate",
  exempt: "Exempt",
  note: "Note",
};
const show = (k: string, v: unknown) => {
  if (v === null || v === undefined || v === "") return "not set";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (k.endsWith("Pct")) return `${v}%`;
  if (k.startsWith("threshold")) return v === 0 ? "none" : inr(Number(v));
  if (k === "residentialStatus") return v === "NON_RESIDENT" ? "Non-resident" : "Resident";
  return String(v);
};

/** What a proposal changes, one line per field that differs. */
function Diff({ c }: { c: Change }) {
  const keys = Object.keys(c.proposed).filter((k) => JSON.stringify(c.proposed[k]) !== JSON.stringify(c.previous[k]));
  return (
    <ul className="m-0 mt-1.5 list-none p-0 text-[12.5px] text-[#57534e]">
      {keys.map((k) => (
        <li key={k}>
          <b className="text-ink">{LABELS[k] ?? k}:</b> {show(k, c.previous[k])} → <b className="text-ink">{show(k, c.proposed[k])}</b>
        </li>
      ))}
    </ul>
  );
}

export default function TdsView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [g, setG] = useState<Global | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<Astro | null>(null);
  const [f, setF] = useState<{ residentialStatus: Profile["residentialStatus"]; billingAddress: string; ratePct: string; exempt: boolean; thresholdPerPayout: string; note: string; reason: string } | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [rejecting, setRejecting] = useState<Change | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(() => {
    api
      .get<{ tds: Data }>("/admin/tds")
      .then((r) => {
        setData(r.tds);
        setG((cur) => cur ?? r.tds.global);
        setError("");
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => load(), [load]);

  const send = async (body: object) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.post<{ applied: boolean }>("/admin/tds/propose", body);
      setMsg(r.applied ? "Saved and in force." : "Sent for acknowledgement. A Super Admin has been told, and it takes effect once they acknowledge it.");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data || !g) return error ? <p role="alert" className="mt-4 text-[13px] font-semibold text-rose-700">{error}</p> : <div className="mt-5 h-64 rounded-2xl bg-cream" aria-busy="true" />;

  const gSet = (k: keyof Global, v: string) => setG({ ...g, [k]: Math.max(0, Math.round(Number(v) || 0)) });
  const globalChanged = JSON.stringify(g) !== JSON.stringify(data.global);
  const globalPending = data.pending.some((c) => c.scope === "GLOBAL");

  const openEdit = (a: Astro) => {
    setEditing(a);
    setDialogError("");
    setF({
      residentialStatus: a.profile.residentialStatus,
      billingAddress: a.profile.billingAddress ?? "",
      ratePct: a.profile.ratePct === null ? "" : String(a.profile.ratePct),
      exempt: a.profile.exempt,
      thresholdPerPayout: a.profile.thresholdPerPayout === null ? "" : String(a.profile.thresholdPerPayout),
      note: a.profile.note ?? "",
      reason: "",
    });
  };
  const saveAstro = async (applyNow: boolean) => {
    if (!editing || !f) return;
    setDialogError("");
    setBusy(true);
    try {
      const r = await api.post<{ applied: boolean }>("/admin/tds/propose", {
        scope: "ASTROLOGER",
        astrologerId: editing.id,
        values: {
          residentialStatus: f.residentialStatus,
          billingAddress: f.billingAddress.trim() || null,
          ratePct: f.ratePct.trim() === "" ? null : Number(f.ratePct),
          exempt: f.exempt,
          thresholdPerPayout: f.thresholdPerPayout.trim() === "" ? null : Number(f.thresholdPerPayout),
          note: f.note.trim() || null,
        },
        reason: f.reason.trim() || undefined,
        applyNow,
      });
      setMsg(r.applied ? `${editing.name}'s TDS settings saved and in force.` : `Sent for acknowledgement for ${editing.name}. It takes effect once a Super Admin acknowledges it.`);
      setEditing(null);
      load();
    } catch (e) {
      setDialogError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const decide = async (c: Change, ok: boolean) => {
    setBusy(true);
    setMsg("");
    try {
      if (ok) await api.post(`/admin/tds/changes/${c.id}/acknowledge`);
      else await api.post(`/admin/tds/changes/${c.id}/reject`, { note: rejectNote.trim() || undefined });
      setRejecting(null);
      setRejectNote("");
      setMsg(ok ? "Acknowledged. It is in force for the next batch prepared." : "Rejected. Nothing changed.");
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 grid gap-4">
      {msg && <p role="status" className="m-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-800">{msg}</p>}
      {error && <p role="alert" className="m-0 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-800">{error}</p>}

      {data.pending.length > 0 && (
        <section className={`${PANEL} border-amber-300 p-5`} aria-label="Waiting for acknowledgement">
          <h2 className="m-0 text-[16px] font-bold">Waiting for a Super Admin to acknowledge</h2>
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {data.pending.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-white px-4 py-3">
                <b className="text-[13.5px]">Change to {c.scopeLabel}</b>
                <span className="block text-[12px] text-[#78716c]">Proposed by {c.by} · {c.at}{c.reason ? ` · ${c.reason}` : ""}</span>
                <Diff c={c} />
                {data.can.acknowledge ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void decide(c, true)} className="h-9 rounded-[10px] bg-emerald-600 px-4 text-[12.5px] font-bold text-white disabled:opacity-60">Acknowledge</button>
                    <button type="button" disabled={busy} onClick={() => { setRejecting(c); setRejectNote(""); }} className="h-9 rounded-[10px] border border-rose-200 bg-white px-4 text-[12.5px] font-bold text-rose-700">Reject</button>
                  </div>
                ) : (
                  <p className="mt-2 mb-0 text-[12px] font-semibold text-amber-800">Not in force yet: a Super Admin has been asked to acknowledge it.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${PANEL} p-5`} aria-label="Global TDS rules">
        <h2 className="m-0 text-[16px] font-bold">Global rules (the default for everyone)</h2>
        <p className="mt-1 mb-3 text-[12.5px] text-[#78716c]">
          Used for every astrologer unless they have their own settings below. TDS is worked out on what an astrologer is owed in a payout and shown separately on every batch and every transfer.
          A change affects batches prepared after it is acknowledged, never one already prepared.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {(
            [
              ["defaultPct", "Default rate (%)", "Resident, PAN on file"],
              ["noPanPct", "Rate with no PAN (%)", "When no PAN is on file"],
              ["nonResidentPct", "Non-resident rate (%)", "Residential status: non-resident"],
              ["thresholdPerPayout", "Per-payout threshold (₹)", "No TDS on a payout below this (0 = none)"],
              ["thresholdPerYear", "Yearly threshold (₹)", "No TDS until payouts this financial year pass this (0 = none)"],
            ] as const
          ).map(([k, label, hint]) => (
            <label key={k} className={lab}>
              {label}
              <input id={`tds-${k}`} type="number" min={0} max={k.endsWith("Pct") ? 100 : undefined} value={g[k]} disabled={!data.can.propose} onChange={(e) => gSet(k, e.target.value)} className={`${field} mt-1.5`} />
              <span className="mt-1 block text-[11px] font-normal text-stone-500">{hint}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 mb-0 text-[12px] text-[#57534e]">With no PAN and non-resident, the higher of the two rates applies.</p>
        {data.can.propose && (
          <div className="mt-3 flex flex-wrap items-end gap-2.5">
            <label className={`${lab} min-w-[220px] flex-1 sm:max-w-[360px]`}>
              Reason (optional)
              <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={`${field} mt-1.5`} />
            </label>
            {data.can.acknowledge && (
              <button type="button" disabled={busy || !globalChanged || globalPending} onClick={() => void send({ scope: "GLOBAL", values: g, reason: reason || undefined, applyNow: true }).then((ok) => ok && (setReason(""), load()))} className="h-10 rounded-xl bg-amber-500 px-5 text-[13px] font-bold text-ink disabled:opacity-50">Save now</button>
            )}
            <button type="button" disabled={busy || !globalChanged || globalPending} onClick={() => void send({ scope: "GLOBAL", values: g, reason: reason || undefined }).then((ok) => ok && (setReason(""), load()))} className="h-10 rounded-xl border border-line bg-white px-5 text-[13px] font-bold disabled:opacity-50">
              {data.can.acknowledge ? "Send for acknowledgement" : "Send for acknowledgement"}
            </button>
            {globalPending && <span className="text-[12px] font-semibold text-amber-800">A global change is already waiting.</span>}
          </div>
        )}
      </section>

      <section className={`${PANEL} p-5`} aria-label="Astrologers">
        <h2 className="m-0 text-[16px] font-bold">Each astrologer</h2>
        <p className="mt-1 mb-3 text-[12.5px] text-[#78716c]">
          The rate in force comes from their PAN (read from their payout details), their residential status, and any custom rate Finance sets. The billing address is kept for the TDS record.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left">
                <th className={th}>Astrologer</th>
                <th className={th}>Residential status</th>
                <th className={th}>PAN</th>
                <th className={th}>Billing address</th>
                <th className={`${th} text-right`}>TDS in force</th>
                <th className={`${th} text-right`}>Paid this year</th>
                <th className={th}><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {data.astrologers.map((a) => (
                <tr key={a.id}>
                  <td className={td}><b className="block">{a.name}</b>{a.pending && <span className="text-[11px] font-bold text-amber-800">Change waiting</span>}</td>
                  <td className={td}>{a.profile.residentialStatus === "NON_RESIDENT" ? "Non-resident" : "Resident"}</td>
                  <td className={td}>{a.hasPan ? <span className="font-semibold text-emerald-700">On file</span> : <span className="font-semibold text-rose-700">Missing</span>}</td>
                  <td className={`${td} max-w-[240px] [overflow-wrap:anywhere]`}>{a.profile.billingAddress ?? <span className="text-[#a8a29e]">Not added</span>}</td>
                  <td className={`${td} text-right`}>
                    <b className="tabular-nums">{a.profile.exempt ? "Exempt" : `${a.effectivePct}%`}</b>
                    <span className="block text-[11px] text-[#78716c]">{a.effectiveNote}{a.thresholdPerPayout > 0 ? ` · threshold ${inr(a.thresholdPerPayout)}` : ""}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{inr(a.paidThisYear)}</td>
                  <td className={`${td} text-right`}>
                    {data.can.propose && <button type="button" onClick={() => openEdit(a)} disabled={a.pending} className="h-8 rounded-[9px] border border-line bg-white px-3 text-[12px] font-bold disabled:opacity-50">Edit</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.history.length > 0 && (
        <section className={`${PANEL} p-5`} aria-label="History">
          <h2 className="m-0 text-[16px] font-bold">Recent decisions</h2>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {data.history.map((c) => (
              <li key={c.id} className="text-[13px]">
                <b>{c.scopeLabel}</b> · <span className={c.state === "ACKNOWLEDGED" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{c.state === "ACKNOWLEDGED" ? "Acknowledged" : "Rejected"}</span> by {c.decidedBy} · {c.decidedAt}
                <span className="block text-[12px] text-[#78716c]">Proposed by {c.by} · {c.at}{c.decisionNote ? ` · ${c.decisionNote}` : ""}</span>
                <Diff c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && f && (
        <AdminDialog
          title={`TDS settings · ${editing.name}`}
          subtitle={`In force now: ${editing.profile.exempt ? "exempt" : `${editing.effectivePct}%`} · ${editing.effectiveNote}`}
          onClose={() => setEditing(null)}
          width={600}
          footer={
            <div className="flex flex-wrap justify-end gap-2.5">
              <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold">Cancel</button>
              {data.can.acknowledge && <button type="button" disabled={busy} onClick={() => void saveAstro(true)} className="h-10 rounded-[11px] bg-amber-500 px-5 text-[13px] font-bold text-ink disabled:opacity-60">Save now</button>}
              <button type="button" disabled={busy} onClick={() => void saveAstro(false)} className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold disabled:opacity-60">Send for acknowledgement</button>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lab}>
              Residential status
              <select value={f.residentialStatus} onChange={(e) => setF({ ...f, residentialStatus: e.target.value as Profile["residentialStatus"] })} className={`${field} mt-1.5`}>
                <option value="RESIDENT">Resident</option>
                <option value="NON_RESIDENT">Non-resident</option>
              </select>
            </label>
            <div className={lab}>
              PAN
              <p className={`m-0 mt-1.5 flex h-10 items-center rounded-xl border border-line bg-stone-50 px-3 text-[13.5px] font-semibold ${editing.hasPan ? "text-emerald-700" : "text-rose-700"}`}>
                {editing.hasPan ? "On file (from their payout details)" : "Missing: the no-PAN rate applies"}
              </p>
            </div>
            <label className={`${lab} sm:col-span-2`}>
              Billing address
              <textarea value={f.billingAddress} maxLength={300} rows={2} onChange={(e) => setF({ ...f, billingAddress: e.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-white p-3 text-[13.5px]" />
            </label>
            <label className={lab}>
              Custom rate (%)
              <input type="number" min={0} max={100} value={f.ratePct} placeholder="Follow the global rules" onChange={(e) => setF({ ...f, ratePct: e.target.value })} className={`${field} mt-1.5`} />
              <span className="mt-1 block text-[11px] font-normal text-stone-500">Leave empty to follow the global rules.</span>
            </label>
            <label className={lab}>
              Per-payout threshold (₹)
              <input type="number" min={0} value={f.thresholdPerPayout} placeholder={`Global: ${inr(data.global.thresholdPerPayout)}`} onChange={(e) => setF({ ...f, thresholdPerPayout: e.target.value })} className={`${field} mt-1.5`} />
              <span className="mt-1 block text-[11px] font-normal text-stone-500">Leave empty to follow the global threshold.</span>
            </label>
            <label className="flex items-center gap-2.5 text-[13px] font-semibold sm:col-span-2">
              <input type="checkbox" checked={f.exempt} onChange={(e) => setF({ ...f, exempt: e.target.checked })} className="size-[18px] accent-amber-600" />
              Exempt from TDS (for example a lower-deduction certificate is on file)
            </label>
            <label className={`${lab} sm:col-span-2`}>
              Note (kept with the settings)
              <input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} className={`${field} mt-1.5`} />
            </label>
            <label className={`${lab} sm:col-span-2`}>
              Reason for this change (optional)
              <input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} className={`${field} mt-1.5`} />
            </label>
          </div>
          {dialogError && <p role="alert" className="mt-3 mb-0 text-[13px] font-semibold text-rose-700">{dialogError}</p>}
        </AdminDialog>
      )}

      {rejecting && (
        <AdminDialog
          title="Reject this change?"
          subtitle={`Change to ${rejecting.scopeLabel}`}
          onClose={() => setRejecting(null)}
          width={460}
          footer={
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setRejecting(null)} className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void decide(rejecting, false)} className="h-10 rounded-[11px] bg-rose-600 px-5 text-[13px] font-bold text-white disabled:opacity-60">Reject</button>
            </div>
          }
        >
          <label className={lab}>
            Why (optional, sent to {rejecting.by})
            <input value={rejectNote} maxLength={300} onChange={(e) => setRejectNote(e.target.value)} className={`${field} mt-1.5`} />
          </label>
        </AdminDialog>
      )}
    </div>
  );
}
