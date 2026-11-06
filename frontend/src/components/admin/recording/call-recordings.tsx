"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip, PANEL } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";

// Consultation call recordings (audio only), for the Super Admin alone: the API answers 403 to anyone
// else and the page doesn't render this for them. The audio streams from an authorised route (no
// public link); opening a player is a "listen" and is written to the audit log.

interface CallRecordingRow {
  id: string;
  ref: string;
  customer: string;
  astrologer: string;
  mode: string;
  fromLive: boolean;
  side: "CUSTOMER" | "ASTROLOGER" | "SERVER";
  take: number;
  status: "RECORDING" | "READY" | "PARTIAL" | "FAILED" | "DELETED";
  note: string | null;
  startedAt: string;
  durationSeconds: number;
  billedSeconds: number;
  bytes: number;
  playable: boolean;
  type: string;
}

interface Answer {
  recordings: CallRecordingRow[];
  next: string | null;
  total: number;
  retentionDays: number;
}

const STATUS: Record<CallRecordingRow["status"], { label: string; bg: string; fg: string }> = {
  RECORDING: { label: "Recording now", bg: "#fff1f2", fg: "#be123c" },
  READY: { label: "Ready", bg: "#ecfdf5", fg: "#047857" },
  PARTIAL: { label: "Partial", bg: "#fffbeb", fg: "#92400e" },
  FAILED: { label: "Failed", bg: "#f5f5f4", fg: "#57534e" },
  DELETED: { label: "Deleted (retention)", bg: "#f5f5f4", fg: "#57534e" },
};

function length(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
}

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One page of the list (newest first), optionally older than `before`. */
function fetchPage(q: string, before: string | null) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (before) params.set("before", before);
  return api.get<Answer>(`/admin/recordings${params.size ? `?${params}` : ""}`);
}

const LOAD_FAILED = "Couldn't load the recordings. Check your connection and try again.";

export default function CallRecordings() {
  const [rows, setRows] = useState<CallRecordingRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ total: number; retentionDays: number } | null>(null);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Callers set `loading` (and clear the error) first; the first load starts with loading on.
  const load = useCallback((q: string, before: string | null, stale: () => boolean = () => false) => {
    fetchPage(q, before).then(
      (data) => {
        if (stale()) return;
        setRows((r) => (before ? [...r, ...data.recordings] : data.recordings));
        setNext(data.next);
        setMeta({ total: data.total, retentionDays: data.retentionDays });
        setLoading(false);
      },
      (e: unknown) => {
        if (stale()) return;
        setError(e instanceof ApiError ? e.message : LOAD_FAILED);
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    let gone = false;
    load(applied, null, () => gone);
    return () => {
      gone = true;
    };
  }, [applied, load]);

  return (
    <div className={`${PANEL} mt-4 p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mt-0 mb-1 text-[16px] font-bold">Call recordings</h2>
          <p className="m-0 max-w-[72ch] text-[12.5px] leading-[1.55] text-[#78716c]">
            Audio of voice, video and Instant Call consultations (also private calls from a live). Only a Super Admin can
            see this list or listen; every listen is recorded in the audit log.{" "}
            {meta && (
              <>
                {meta.total.toLocaleString("en-IN")} {meta.total === 1 ? "recording" : "recordings"} kept ·{" "}
                {meta.retentionDays > 0 ? `deleted after ${meta.retentionDays} days` : "kept until a retention period is set (Config recording.retention_days)"}.
              </>
            )}
          </p>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(null);
            setLoading(true);
            setError("");
            setApplied(query.trim());
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Session ref, customer or astrologer"
            aria-label="Search recordings"
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink sm:w-[260px]"
          />
          <button type="submit" className="h-10 shrink-0 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Search
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="mt-3.5 mb-0 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-rose-700">
          {error}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError("");
              load(applied, null);
            }}
            className="font-bold underline"
          >
            Try again
          </button>
        </p>
      )}

      {!error && !loading && rows.length === 0 && (
        <p className="mt-3.5 mb-0 rounded-[14px] border border-dashed border-line px-4 py-5 text-center text-[13px] text-[#78716c]">
          {applied ? `No recordings match “${applied}”.` : "No calls have been recorded yet. Voice and video consultations appear here once they end."}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="m-0 mt-3.5 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => {
            const st = STATUS[r.status];
            return (
              <li key={r.id} className="rounded-[14px] border border-line bg-white px-4 py-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <b className="text-[14px] text-ink tabular-nums">{r.ref}</b>
                    <span className="ml-2 text-[12.5px] text-[#57534e]">
                      {r.mode}
                      {r.fromLive ? " · from a live" : ""}
                    </span>
                    <div className="mt-0.5 text-[12.5px] break-words text-[#57534e]">
                      {r.customer} with {r.astrologer}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#78716c] tabular-nums">
                      {r.startedAt} IST · {length(r.durationSeconds)} · {size(r.bytes)} · recorded on the {r.side.toLowerCase()}&apos;s device
                      {r.take > 1 ? ` (take ${r.take})` : ""}
                    </div>
                    {r.note && <div className="mt-0.5 text-[12px] text-[#78716c]">{r.note}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Chip bg={st.bg} fg={st.fg}>
                      {st.label}
                    </Chip>
                    {r.playable && (
                      <button
                        type="button"
                        onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
                        aria-expanded={open === r.id}
                        className="h-9 rounded-[10px] bg-amber-500 px-3.5 text-[12.5px] font-bold text-ink"
                      >
                        {open === r.id ? "Close" : "Listen"}
                      </button>
                    )}
                  </div>
                </div>
                {open === r.id && (
                  // Streams from the authorised route (Range requests for seeking); never a public link.
                  <audio
                    controls
                    autoPlay
                    preload="metadata"
                    controlsList="nodownload"
                    src={`/api/admin/recordings/${encodeURIComponent(r.id)}/audio`}
                    className="mt-2.5 w-full"
                    aria-label={`Recording of ${r.ref}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(loading || next) && (
        <div className="mt-3 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (!next) return;
              setLoading(true);
              load(applied, next);
            }}
            className="h-10 rounded-[11px] border border-line bg-white px-5 text-[13px] font-bold text-ink disabled:opacity-60"
          >
            {loading ? "Loading…" : "Show older recordings"}
          </button>
        </div>
      )}
    </div>
  );
}
