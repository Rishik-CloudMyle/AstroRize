"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { useAdmin } from "@/components/admin/admin-provider";
import { PKG_DURATIONS, type PkgDuration } from "@/lib/fixed-sessions";

interface FixedSessionsConfigData {
  durations: number[];
  discounts: Record<number, number>;
}

export default function FixedSessionsConfigCard() {
  const { session, say } = useAdmin();
  const [discounts, setDiscounts] = useState<Record<number, number>>({
    5: 5,
    10: 10,
    15: 15,
    30: 20,
    45: 25,
    60: 30,
  });
  const [sampleRate, setSampleRate] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<FixedSessionsConfigData>("/admin/config/fixed-sessions")
      .then((data) => {
        if (!cancelled && data.discounts) {
          setDiscounts((prev) => ({ ...prev, ...data.discounts }));
        }
      })
      .catch(() => {
        // Fallback to default
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (mins: number, val: number) => {
    const clamped = Math.min(50, Math.max(0, isNaN(val) ? 0 : val));
    setDiscounts((prev) => ({ ...prev, [mins]: clamped }));
    setSavedMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      await api.put("/admin/config/fixed-sessions", { discounts });
      setSavedMsg("Fixed session pricing & discounts saved successfully!");
      say("Fixed Session discounts updated");
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : "Failed to save fixed session discounts";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-[20px] border border-amber-300/80 bg-paper p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-900 mb-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5 text-amber-700">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
            Operational Control
          </div>
          <h2 className="text-lg font-bold text-ink">Fixed Session Pricing & Savings</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Customize platform-wide package discount percentages for each duration tier (starts from 5 & 10 min).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-stone-500">Preview at ₹/min:</label>
          <input
            type="number"
            min="5"
            max="200"
            value={sampleRate}
            onChange={(e) => setSampleRate(Math.max(1, Number(e.target.value)))}
            className="h-8 w-18 rounded-lg border border-line bg-white px-2 text-center text-xs font-bold text-ink"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-stone-500">Loading fixed session configuration...</div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PKG_DURATIONS.map((mins) => {
              const disc = discounts[mins] ?? 0;
              const original = sampleRate * mins;
              const savings = Math.trunc((original * disc) / 100);
              const finalPrice = original - savings;

              return (
                <div
                  key={mins}
                  className="flex flex-col rounded-xl border border-line bg-stone-50/70 p-3 text-center transition hover:border-amber-400"
                >
                  <span className="text-sm font-extrabold text-ink">{mins} min</span>
                  <div className="mt-2 flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={disc}
                      onChange={(e) => handleChange(mins, Number(e.target.value))}
                      className="h-8 w-14 rounded-lg border border-line bg-white text-center text-sm font-bold text-amber-900 focus:border-amber-500 focus:outline-hidden"
                    />
                    <span className="text-xs font-bold text-stone-500">% off</span>
                  </div>

                  {/* Real-time simulation preview */}
                  <div className="mt-2.5 border-t border-line/60 pt-2 text-[11px] text-stone-500">
                    <div>Price: <b className="text-ink">₹{finalPrice}</b></div>
                    <div>Original: <s>₹{original}</s></div>
                    <div className="font-semibold text-emerald-700">Save ₹{savings}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
            <span className="text-xs text-stone-500">
              * Savings apply to both Audio Call and Chat fixed sessions. Discount range: 0% to 50%.
            </span>

            <div className="flex items-center gap-3">
              {savedMsg && (
                <span className="text-xs font-bold text-emerald-700 animate-in fade-in">
                  ✓ {savedMsg}
                </span>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="h-9 rounded-full bg-amber-500 px-5 text-xs font-bold text-ink shadow-xs hover:bg-amber-400 disabled:bg-stone-300 transition"
              >
                {saving ? "Saving..." : "Save Pricing Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
