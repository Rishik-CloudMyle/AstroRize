"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { useAdmin } from "@/components/admin/admin-provider";

interface Pkg {
  minutes: number;
  discount: number;
}
interface FixedSessionsData {
  packages: Pkg[];
  limits: { min: number; max: number };
}

/** Fixed Session packages: add a length, change a discount or delete a length. Saved together. */
export default function FixedSessionsConfigCard() {
  const { say } = useAdmin();
  const [rows, setRows] = useState<Pkg[]>([]);
  const [saved, setSaved] = useState<Pkg[]>([]);
  const [limits, setLimits] = useState({ min: 5, max: 40 });
  const [sampleRate, setSampleRate] = useState(20);
  const [newMinutes, setNewMinutes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<FixedSessionsData>("/admin/config/fixed-sessions")
      .then((d) => {
        if (cancelled) return;
        setRows(d.packages);
        setSaved(d.packages);
        setLimits(d.limits);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load the packages."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const sorted = [...rows].sort((a, b) => a.minutes - b.minutes);

  const setDiscount = (minutes: number, value: number) => {
    setRows((r) => r.map((p) => (p.minutes === minutes ? { ...p, discount: Number.isFinite(value) ? Math.round(value) : 0 } : p)));
    setError(null);
  };

  const remove = (minutes: number) => {
    if (rows.length <= 1) {
      setError("Keep at least one package — customers need something to buy.");
      return;
    }
    if (!window.confirm(`Delete the ${minutes}-minute package? Customers will no longer see it once you save.`)) return;
    setRows((r) => r.filter((p) => p.minutes !== minutes));
    setError(null);
  };

  const add = () => {
    const minutes = Math.round(Number(newMinutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
      setError("Enter a length between 1 and 180 minutes.");
      return;
    }
    if (rows.some((p) => p.minutes === minutes)) {
      setError(`A ${minutes}-minute package already exists — change its discount instead.`);
      return;
    }
    setRows((r) => [...r, { minutes, discount: limits.min }]);
    setNewMinutes("");
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ packages: Pkg[] }>("/admin/config/fixed-sessions", { packages: rows });
      setRows(res.packages);
      setSaved(res.packages);
      say("Fixed Session packages saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the packages.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-[20px] border border-amber-300/80 bg-paper p-5 shadow-xs">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-ink">Fixed Session packages</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Add, change or delete the lengths customers can buy. Each discount must stay between {limits.min}% and {limits.max}% (the platform offer range in Config). Nothing changes for customers until you save.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-500">
          Preview at ₹/min:
          <input
            type="number"
            min={1}
            max={500}
            value={sampleRate}
            onChange={(e) => setSampleRate(Math.max(1, Number(e.target.value)))}
            className="h-8 w-18 rounded-lg border border-line bg-white px-2 text-center text-xs font-bold text-ink"
          />
        </label>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-stone-500">Loading the packages…</div>
      ) : (
        <div className="mt-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sorted.map((p) => {
              const original = sampleRate * p.minutes;
              const savings = Math.trunc((original * p.discount) / 100);
              const outOfRange = p.discount < limits.min || p.discount > limits.max;
              return (
                <li key={p.minutes} className="flex flex-col rounded-xl border border-line bg-stone-50/70 p-3 text-center transition hover:border-amber-400">
                  <span className="text-sm font-extrabold text-ink">{p.minutes} min</span>
                  <div className="mt-2 flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min={limits.min}
                      max={limits.max}
                      value={p.discount}
                      aria-label={`${p.minutes}-minute discount percent`}
                      onChange={(e) => setDiscount(p.minutes, Number(e.target.value))}
                      className={`h-8 w-14 rounded-lg border bg-white text-center text-sm font-bold text-amber-900 focus:border-amber-500 focus:outline-hidden ${outOfRange ? "border-rose-400" : "border-line"}`}
                    />
                    <span className="text-xs font-bold text-stone-500">% off</span>
                  </div>
                  <div className="mt-2.5 border-t border-line/60 pt-2 text-[11px] text-stone-500">
                    <div>
                      Price: <b className="text-ink">₹{original - savings}</b>
                    </div>
                    <div>
                      Original: <s>₹{original}</s>
                    </div>
                    <div className="font-semibold text-emerald-700">Save ₹{savings}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(p.minutes)}
                    aria-label={`Delete the ${p.minutes}-minute package`}
                    className="mt-2.5 h-8 rounded-lg border border-rose-200 bg-white text-[11.5px] font-bold text-rose-700 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3">
            <label className="text-xs font-semibold text-stone-600">
              Add a package (minutes)
              <input
                type="number"
                min={1}
                max={180}
                value={newMinutes}
                placeholder="e.g. 20"
                onChange={(e) => setNewMinutes(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                className="mt-1 block h-9 w-28 rounded-lg border border-line bg-white px-2 text-center text-sm font-bold text-ink"
              />
            </label>
            <button type="button" onClick={add} className="h-9 rounded-full border border-amber-500 bg-white px-4 text-xs font-bold text-amber-900 hover:bg-amber-100">
              + Add package
            </button>
            <span className="text-[11px] text-stone-500">It starts at {limits.min}% off; change it above, then save.</span>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
            <span className="text-xs text-stone-500">* Savings apply to both Audio Call and Chat. A package never goes below half the normal price.</span>
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs font-bold text-amber-800">Unsaved changes</span>}
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={save}
                className="h-9 rounded-full bg-amber-500 px-5 text-xs font-bold text-ink shadow-xs transition hover:bg-amber-400 disabled:bg-stone-300"
              >
                {saving ? "Saving…" : "Save packages"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
