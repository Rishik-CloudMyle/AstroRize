"use client";

import Image from "next/image";
import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import { SUSPENSION } from "@/components/admin/lifecycle/stages";
import ReasonDialog from "@/components/admin/reason-dialog";
import { EYEBROW, PANEL } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { SuspensionLevel, SuspensionsData } from "@/lib/admin/types";

// Account suspensions (Compliance). Suspending or making a suspension stricter needs
// "astrologer.suspend"; lifting or easing one needs "astrologer.restore". Every change asks for a
// written reason, which is kept in the audit log.

const LEVEL_TEXT: Record<SuspensionLevel, string> = {
  none: "Lift the suspension",
  partial: "Partial suspension",
  full: "Full suspension",
};

/** What each level does, shown before confirming. */
const EFFECT: Record<SuspensionLevel, string> = {
  partial:
    "They can't take new consultations or go live, and go offline now. Their profile stays on the website and customers can still message them.",
  full: "They can't take new consultations or go live, and go offline now. Their profile is hidden from the website and customers can't message them.",
  none: "They can go online and take consultations again, and their profile is listed on the website.",
};

const SELECT = "h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] text-ink";

interface Pending {
  id: string;
  name: string;
  level: SuspensionLevel;
}

export default function Suspensions({ data }: { data: SuspensionsData }) {
  const { run } = useAction();
  const [pick, setPick] = useState("");
  const [level, setLevel] = useState<"partial" | "full">("partial");
  const [pending, setPending] = useState<Pending | null>(null);
  // The picked astrologer may have been suspended meanwhile (the list is re-read after each change).
  const picked = data.astrologers.find((a) => a.id === pick);

  const apply = async (reason: string) => {
    if (!pending) return false;
    const { id, name, level: to } = pending;
    const res = await run(
      () => api.post(`/admin/suspensions/${encodeURIComponent(id)}`, { level: to, reason }),
      to === "none"
        ? `${name}'s suspension is lifted. Audited with your reason.`
        : `${name} is now ${to === "full" ? "fully" : "partially"} suspended and offline. Audited with your reason.`,
    );
    if (res && to !== "none") setPick("");
    return !!res;
  };

  const actionBtn = "h-9 rounded-[10px] border px-3 text-[12.5px] font-bold";

  return (
    <div id="suspensions" className={`${PANEL} mt-4 scroll-mt-6 p-5`}>
      <h2 className="mt-0 mb-1 text-[16px] font-bold">Account suspensions</h2>
      <p className="mt-0 mb-4 text-[12px] leading-[1.5] text-[#78716c]">
        Partial: no new consultations or lives, still listed on the website. Full: also hidden from the website and
        from messaging. A consultation already in progress is allowed to finish. Every change needs a reason and is
        recorded in the audit log.
      </p>

      {data.canSuspend && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (picked) setPending({ id: picked.id, name: picked.name, level });
          }}
          className="mb-4 grid grid-cols-1 items-end gap-3 rounded-[14px] border border-line bg-white p-3.5 sm:grid-cols-[minmax(0,1fr)_200px_auto]"
        >
          <label className="min-w-0">
            <span className={`${EYEBROW} mb-1.5 block`}>Astrologer</span>
            <select value={picked ? pick : ""} onChange={(e) => setPick(e.target.value)} className={SELECT}>
              <option value="">{data.astrologers.length ? "Choose an astrologer" : "No active astrologer to suspend"}</option>
              {data.astrologers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={`${EYEBROW} mb-1.5 block`}>Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value === "full" ? "full" : "partial")} className={SELECT}>
              <option value="partial">Partial</option>
              <option value="full">Full</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={!picked}
            className="h-11 rounded-xl border-0 bg-rose-700 px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Suspend…
          </button>
        </form>
      )}

      {data.suspended.length === 0 ? (
        <p className="m-0 rounded-[14px] border border-dashed border-line px-4 py-5 text-center text-[13px] text-[#78716c]">
          No astrologer is suspended.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {data.suspended.map((s) => {
            const chip = SUSPENSION[s.level];
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3">
                <Image src={s.photo} alt="" width={40} height={40} className="h-10 w-10 flex-[0_0_40px] rounded-full object-cover" />
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[13.5px] text-ink">{s.name}</b>
                    {chip && (
                      <span className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold" style={{ background: chip.bg, color: chip.fg }}>
                        {chip.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 mb-0 text-[12.5px] break-words text-[#57534e]">
                    {s.reason ? `“${s.reason}”` : "No reason recorded."}
                  </p>
                  <p className="mt-0.5 mb-0 text-[11.5px] text-[#78716c]">
                    {s.since ? `Since ${s.since} IST · by ${s.by}` : "Suspended before reasons were recorded."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.level === "partial" && data.canSuspend && (
                    <button
                      type="button"
                      onClick={() => setPending({ id: s.id, name: s.name, level: "full" })}
                      className={`${actionBtn} border-rose-200 bg-white text-rose-700`}
                    >
                      Make full
                    </button>
                  )}
                  {s.level === "full" && data.canRestore && (
                    <button
                      type="button"
                      onClick={() => setPending({ id: s.id, name: s.name, level: "partial" })}
                      className={`${actionBtn} border-line bg-white text-[#57534e]`}
                    >
                      Ease to partial
                    </button>
                  )}
                  {data.canRestore && (
                    <button
                      type="button"
                      onClick={() => setPending({ id: s.id, name: s.name, level: "none" })}
                      className={`${actionBtn} border-emerald-700 bg-emerald-700 text-white`}
                    >
                      Lift suspension
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!data.canRestore && data.suspended.length > 0 && (
        <p className="mt-3 mb-0 text-[12px] text-[#78716c]">Only a Super Admin can lift or ease a suspension.</p>
      )}

      {pending && (
        <ReasonDialog
          title={`${LEVEL_TEXT[pending.level]} · ${pending.name}`}
          intro={EFFECT[pending.level]}
          label="Reason (kept in the audit log)"
          placeholder={pending.level === "none" ? "e.g. Notice CMP-2214 answered and closed" : "e.g. Shared a personal number in a live room"}
          confirm={pending.level === "none" ? "Lift suspension" : pending.level === "full" ? "Suspend fully" : "Suspend partially"}
          danger={pending.level !== "none"}
          min={10}
          max={300}
          onSubmit={apply}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
