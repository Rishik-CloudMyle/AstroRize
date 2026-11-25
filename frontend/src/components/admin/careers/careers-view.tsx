"use client";

import { useState } from "react";
import { PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

export interface Application {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  area: string;
  subject: string;
  message: string;
  resumeName: string;
  status: string;
  receivedAt: string;
}

const STATUSES: [string, string][] = [
  ["NEW", "New"],
  ["REVIEWING", "Reviewing"],
  ["FORWARDED", "Forwarded"],
  ["SHORTLISTED", "Shortlisted"],
  ["REJECTED", "Rejected"],
];

/** HR's list of applications from the website's Careers form: read, download the resume, set the status. */
export default function CareersView({ initial }: { initial: Application[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setError("");
    try {
      await api.patch(`/admin/careers/${id}`, { status });
      setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update that application.");
    }
  }

  if (rows.length === 0) return <p className={`${PANEL} p-6 text-[14px] text-[#78716c]`}>No applications yet. They appear here when someone sends the Careers form.</p>;

  return (
    <div className="grid gap-3">
      {error && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
      {rows.map((a) => (
        <article key={a.id} className={`${PANEL} p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-[15.5px] font-bold text-ink">{a.subject}</h2>
              <p className="mt-0.5 mb-0 text-[12.5px] text-[#78716c]">
                {a.name} · {a.area} · {a.receivedAt}
              </p>
              <p className="mt-0.5 mb-0 text-[12.5px] text-[#78716c]">
                <a href={`mailto:${a.email}`}>{a.email}</a>
                {a.phone ? ` · ${a.phone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Status of ${a.name}'s application`}
                value={a.status}
                onChange={(e) => setStatus(a.id, e.target.value)}
                className="h-9 rounded-lg border border-line bg-white px-2 text-[13px] font-semibold text-ink"
              >
                {STATUSES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <a
                href={`/api/admin/careers/${a.id}/resume`}
                className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-[13px] font-bold text-ink hover:no-underline"
              >
                Download resume
              </a>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="mt-2 text-[12.5px] font-bold text-amber-800">
            {open === a.id ? "Hide message" : "Read message"}
          </button>
          {open === a.id && <p className="mt-1.5 mb-0 whitespace-pre-wrap text-[13.5px] leading-relaxed text-stone-700">{a.message}</p>}
        </article>
      ))}
    </div>
  );
}
