"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { useAdmin } from "@/components/admin/admin-provider";

interface FreeCalls {
  enabled: number;
  weeklyMinutes: number;
  dailyMinutes: number;
  monthlyMinutes: number;
  lengthMinutes: number;
  extraLengths: number[];
  chooseLength: number;
  oneTimeEnabled: number;
  oneTimeMinutes: number;
  dailyLimit: number;
  weeklyLimit: number;
  reminderSeconds: number;
}

const box = "rounded-2xl border border-line bg-paper p-4";
const txt = "h-9 w-44 rounded-lg border border-line bg-white px-2 text-center text-sm font-bold text-ink disabled:bg-stone-100 disabled:text-stone-400";
const num = "h-9 w-24 rounded-lg border border-line bg-white px-2 text-center text-sm font-bold text-ink";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-600" : "bg-stone-300"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Field({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px] text-ink">{title}</b>
        <span className="text-[12px] leading-snug text-stone-500">{hint}</span>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Everything about free minutes in one place: the weekly call, the 1-time welcome call and the limits. */
export default function FreeCallsConfigCard() {
  const { say } = useAdmin();
  const [v, setV] = useState<FreeCalls | null>(null);
  const [saved, setSaved] = useState<FreeCalls | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extrasText, setExtrasText] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<FreeCalls>("/admin/config/free-calls")
      .then((d) => {
        if (cancelled) return;
        setV(d);
        setSaved(d);
        setExtrasText(d.extraLengths.join(", "));
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load the free-call settings."));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!v || !saved) return <div className="py-8 text-center text-xs text-stone-500">{error ?? "Loading the free-call settings…"}</div>;

  const set = <K extends keyof FreeCalls>(k: K, val: number) => {
    setV({ ...v, [k]: Number.isFinite(val) ? Math.round(val) : 0 });
    setError(null);
  };
  const parseExtras = (t: string) => t.split(/[,\s]+/).filter(Boolean).map(Number);
  const withExtras = { ...v, extraLengths: parseExtras(extrasText) };
  const dirty = JSON.stringify(withExtras) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (withExtras.extraLengths.some((n) => !Number.isInteger(n))) throw new ApiError(400, "bad_request", "Write the extra lengths as whole numbers separated by commas, like 20, 30.", {});
      const res = await api.put<FreeCalls & { ok: boolean }>("/admin/config/free-calls", withExtras);
      const { ok: _ok, ...clean } = res;
      void _ok;
      setV(clean);
      setSaved(clean);
      setExtrasText(clean.extraLengths.join(", "));
      say("Free-call settings saved");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save the free-call settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 space-y-4">
      <section className={box}>
        <h2 className="text-lg font-bold text-ink">Free calls</h2>
        <p className="mt-0.5 text-xs text-stone-500">Free minutes are paid for by AstroRize; astrologers are compensated separately. Changes apply to calls requested after you save.</p>
        <div className="mt-2">
          <Field title="Free calls are on" hint="Off stops every new free call (customers keep their minutes for when it is back on).">
            <Switch on={v.enabled === 1} onChange={(x) => set("enabled", x ? 1 : 0)} label="Free calls on" />
          </Field>
        </div>
      </section>

      <section className={box}>
        <h3 className="text-[15px] font-bold text-ink">Weekly free call</h3>
        <p className="text-xs text-stone-500">What every customer gets each week (Monday to Sunday, IST).</p>
        <div className="mt-2">
          <Field title="Free minutes per customer per week" hint="The weekly pool. 0 stops weekly free calls.">
            <input type="number" min={0} max={600} value={v.weeklyMinutes} onChange={(e) => set("weeklyMinutes", Number(e.target.value))} className={num} />
            <span className="text-xs font-semibold text-stone-500">min</span>
          </Field>
          <Field title="Daily limit per customer" hint="Most free minutes one customer can use in a day (IST). 0 = no daily limit.">
            <input type="number" min={0} max={600} value={v.dailyMinutes} onChange={(e) => set("dailyMinutes", Number(e.target.value))} className={num} />
            <span className="text-xs font-semibold text-stone-500">min</span>
          </Field>
          <Field title="Monthly limit per customer" hint="Most free minutes one customer can use in a calendar month (IST). 0 = no monthly limit.">
            <input type="number" min={0} max={2400} value={v.monthlyMinutes} onChange={(e) => set("monthlyMinutes", Number(e.target.value))} className={num} />
            <span className="text-xs font-semibold text-stone-500">min</span>
          </Field>
          <Field title="Length of one free call" hint="Any whole number of minutes, 1–120 (not 5 or the welcome call's length). The whole length is taken from the weekly pool once the conversation starts.">
            <input type="number" min={1} max={120} value={v.lengthMinutes} onChange={(e) => set("lengthMinutes", Number(e.target.value))} className={num} />
            <span className="text-xs font-semibold text-stone-500">min</span>
          </Field>
          <Field title="Let customers choose the length" hint="Off: everyone gets the length above. On: customers pick from that length and the extra lengths below.">
            <Switch on={v.chooseLength === 1} onChange={(x) => set("chooseLength", x ? 1 : 0)} label="Customers choose the length" />
          </Field>
          <Field title="Extra lengths customers can choose" hint="Up to 5, separated by commas, for example 20, 30. Used only while choosing is on.">
            <input type="text" inputMode="numeric" value={extrasText} placeholder="e.g. 20, 30" disabled={v.chooseLength !== 1} onChange={(e) => { setExtrasText(e.target.value); setError(null); }} className={txt} />
            <span className="text-xs font-semibold text-stone-500">min</span>
          </Field>
        </div>
      </section>

      <section className={box}>
        <h3 className="text-[15px] font-bold text-ink">1-time welcome call (first call)</h3>
        <p className="text-xs text-stone-500">One per verified mobile number, once only. Separate from the weekly minutes.</p>
        <div className="mt-2">
          <Field title="1-time welcome call is on" hint="Off hides it everywhere; customers who haven't used it keep it for when it is back on.">
            <Switch on={v.oneTimeEnabled === 1} onChange={(x) => set("oneTimeEnabled", x ? 1 : 0)} label="1-time welcome call on" />
          </Field>
          <Field title="Length of the welcome call" hint="1–30 minutes, different from every weekly length above. Customers who already used it are not affected.">
            <input type="number" min={1} max={30} value={v.oneTimeMinutes} onChange={(e) => set("oneTimeMinutes", Number(e.target.value))} className={num} />
            <span className="text-xs font-semibold text-stone-500">min</span>
          </Field>
        </div>
      </section>

      <section className={box}>
        <h3 className="text-[15px] font-bold text-ink">Limits and reminder</h3>
        <div className="mt-2">
          <Field title="Free calls per astrologer per day" hint="The same for every astrologer who takes free calls.">
            <input type="number" min={0} max={50} value={v.dailyLimit} onChange={(e) => set("dailyLimit", Number(e.target.value))} className={num} />
          </Field>
          <Field title="Free calls per astrologer per week" hint="On top of the daily number (Monday to Sunday, IST).">
            <input type="number" min={0} max={500} value={v.weeklyLimit} onChange={(e) => set("weeklyLimit", Number(e.target.value))} className={num} />
          </Field>
          <Field title="Reminder before free time ends" hint="Customers see “continue with a paid session” this long before it ends (30–300 seconds).">
            <input type="number" min={30} max={300} value={v.reminderSeconds} onChange={(e) => set("reminderSeconds", Number(e.target.value))} className={num} />
            <span className="text-xs font-semibold text-stone-500">sec</span>
          </Field>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs font-bold text-amber-800">Unsaved changes</span>}
        <button type="button" disabled={saving || !dirty} onClick={save} className="h-10 rounded-full bg-amber-500 px-6 text-sm font-bold text-ink shadow-xs transition hover:bg-amber-400 disabled:bg-stone-300">
          {saving ? "Saving…" : "Save free-call settings"}
        </button>
      </div>
    </div>
  );
}
