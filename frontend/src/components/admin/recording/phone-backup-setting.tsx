"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

interface Data {
  configured: boolean;
  enabled: boolean;
}

/** The phone backup for voice calls: on or off. */
export default function PhoneBackupSetting() {
  const { say } = useAdmin();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Data>("/admin/recordings/phone")
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data) return null;

  const toggle = async () => {
    if (!window.confirm(data.enabled ? "Switch phone backup calls off?" : "Switch phone backup calls on?")) return;
    setBusy(true);
    try {
      const next = await api.put<Data>("/admin/recordings/phone", { enabled: !data.enabled });
      setData(next);
      say(`Phone backup calls switched ${next.enabled ? "on" : "off"}. Audited.`);
    } catch (e) {
      say(e instanceof ApiError ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${PANEL} mt-4 flex flex-wrap items-center gap-3 p-5`}>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[16px] font-bold">Phone backup calls</h2>
        <p className="mt-1 mb-0 text-[12.5px] text-[#57534e]">
          {data.configured
            ? "Offered to the customer when the in-app voice call can't connect. Same price per minute; both numbers stay private; recorded."
            : "The phone provider isn't set up on the server (ACEFONE_API_TOKEN, ACEFONE_CALLER_ID, ACEFONE_WEBHOOK_SECRET), so phone calls aren't offered."}
        </p>
      </div>
      <span className="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-bold text-stone-700">{!data.configured ? "Not set up" : data.enabled ? "On" : "Off"}</span>
      {data.configured && (
        <button type="button" disabled={busy} onClick={() => void toggle()} className="h-10 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-ink disabled:opacity-60">
          {data.enabled ? "Switch off" : "Switch on"}
        </button>
      )}
    </div>
  );
}
