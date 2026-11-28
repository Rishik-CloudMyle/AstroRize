"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

type Access = { support: boolean; compliance: boolean };
const ROLES: { key: keyof Access; label: string }[] = [
  { key: "support", label: "Support" },
  { key: "compliance", label: "Compliance" },
];

/** Super Admin only: who else may listen to call recordings. */
export default function RecordingAccess() {
  const { session, say } = useAdmin();
  const router = useRouter();
  const isSuper = session.capabilities.includes("rbac.edit");
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSuper) return;
    api
      .get<{ access: Access }>("/admin/recordings/access")
      .then((r) => setAccess(r.access))
      .catch(() => {});
  }, [isSuper]);
  if (!isSuper || !access) return null;

  const toggle = async (key: keyof Access, label: string) => {
    const on = !access[key];
    if (!window.confirm(on ? `Let the ${label} team list and listen to call recordings?` : `Remove the ${label} team's access to call recordings?`)) return;
    setBusy(true);
    try {
      const r = await api.put<{ access: Access }>("/admin/recordings/access", { ...access, [key]: on });
      setAccess(r.access);
      say(`${label} ${on ? "can now" : "can no longer"} listen to call recordings. Audited.`);
      router.refresh();
    } catch (e) {
      say(e instanceof ApiError ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <h2 className="m-0 text-[16px] font-bold">Who can listen to call recordings</h2>
      <p className="mt-1 mb-3 text-[12.5px] text-[#57534e]">A Super Admin always can. Give or remove access for these teams at any time; every change and every playback is written to the audit log.</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ROLES.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-2.5">
            <b className="min-w-0 flex-1 text-[14px] text-ink">{r.label}</b>
            <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${access[r.key] ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>{access[r.key] ? "Can listen" : "No access"}</span>
            <button type="button" disabled={busy} onClick={() => void toggle(r.key, r.label)} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-ink disabled:opacity-60">
              {access[r.key] ? "Remove access" : "Give access"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
