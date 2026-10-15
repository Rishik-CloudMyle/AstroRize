"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { ApiError, api } from "@/lib/api/client";
import type { ObserverView } from "@/lib/admin/types";

/** How often the observer view re-reads the room (the public room page uses the same pace). */
const REFRESH_MS = 4000;

type Observing = Extract<ObserverView, { status: "observing" }>;
type Ended = Exclude<ObserverView["status"], "observing">;

export const clock = (secs: number) =>
  `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

/** "42 min", "1 h 05 min" since an ISO time. */
export function sinceLabel(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

const ENDED_TEXT: Record<Ended, { title: string; body: string }> = {
  ended: {
    title: "This live has ended",
    body: "The astrologer ended the live, so there is nothing left to observe. Your observer seat was released automatically.",
  },
  expired: {
    title: "Your observer lease ran out",
    body: "Leases last 10 minutes and your seat has been freed. Join again from the list if you need to keep watching.",
  },
  released: {
    title: "You're no longer observing",
    body: "This lease was released (you left, or joined another live). Join again from the list to watch.",
  },
};

/**
 * The watch-only observer view of one public live: the same stage video the public room shows,
 * the live chat (read-only), poll, queue size and announcements, read through the admin API so
 * the observer is never counted as a viewer and can't post anything. Closes itself with a
 * clear message when the live ends or the lease runs out.
 */
export default function ObserverPanel({
  leaseId,
  astrologer,
  flagReasons,
  onClose,
  onChanged,
}: {
  leaseId: string;
  astrologer: string;
  flagReasons: string[];
  /** The panel is gone (left, or the ended message was dismissed). */
  onClose: () => void;
  /** Something changed that the monitoring list should re-read (seat freed, flag raised). */
  onChanged: () => void;
}) {
  const { say } = useAdmin();
  const [view, setView] = useState<Observing | null>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ObserverView>(`/admin/monitoring/leases/${encodeURIComponent(leaseId)}`);
      setError(null);
      if (res.status === "observing") {
        setView(res);
        setLeft(res.lease.secondsLeft);
      } else {
        setEnded(res.status);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the server. Retrying…");
    }
  }, [leaseId]);

  // Once the live ends or the lease runs out, the seat is free: let the list re-read.
  useEffect(() => {
    if (ended) onChanged();
  }, [ended, onChanged]);

  // Keep the room current while observing; stop once it has ended.
  useEffect(() => {
    if (ended) return;
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, ended]);

  // Lease countdown and the "live for" clock, ticking locally between reads. At zero the next
  // read gets "expired" from the API, which frees the seat.
  useEffect(() => {
    if (ended) return;
    const id = setInterval(() => {
      setNow(Date.now());
      setLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [ended]);

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await api.post(`/admin/monitoring/leases/${encodeURIComponent(leaseId)}/release`);
      say("You left the live. Your observer seat is free again.");
      onChanged();
      onClose();
    } catch (e) {
      say(e instanceof ApiError ? e.message : "Couldn't leave. Please try again.");
      setLeaving(false);
    }
  };

  if (ended) {
    const t = ENDED_TEXT[ended];
    return (
      <div className="az-dark relative mt-4 rounded-[18px] p-5 text-line" role="status">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/[.1] px-2.5 text-[10.5px] font-extrabold text-muted">
            ■ NOT OBSERVING
          </span>
          <span className="text-[12.5px] text-muted">{view?.room.astrologer ?? astrologer}</span>
        </div>
        <b className="mt-3 block text-[18px] text-white">{t.title}</b>
        <p className="mt-1.5 mb-0 max-w-[62ch] text-[13px] leading-[1.55] text-muted">{t.body}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-[38px] rounded-[11px] border border-white/[.18] bg-white/[.07] px-[15px] text-[12.5px] font-bold text-line"
        >
          Close
        </button>
      </div>
    );
  }

  const room = view?.room;

  return (
    <section aria-label={`Observing ${astrologer}`} className="az-dark relative mt-4 rounded-[18px] p-4 text-line sm:p-5">
      {/* Header: who, lease, actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-blue-700 px-2.5 text-[10.5px] font-extrabold whitespace-nowrap text-white">
            🛡 OBSERVING · WATCH ONLY
          </span>
          {view?.lease.breakGlass && (
            <span className="inline-flex h-6 items-center rounded-full bg-rose-700 px-2.5 text-[10.5px] font-extrabold text-white">
              ⚠ BREAK-GLASS
            </span>
          )}
          <span className="min-w-0 text-[13px] font-bold text-white">{room?.astrologer ?? astrologer}</span>
        </div>
        <div className="flex items-center gap-5">
          <div>
            <div className="text-[10.5px] font-bold tracking-[.06em] text-[#a8a29e] uppercase">Lease ends in</div>
            <b className="text-[20px] text-amber-300 tabular-nums" aria-live="off">
              {view ? clock(left) : "—"}
            </b>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!view}
              onClick={() => setFlagOpen(true)}
              className="h-[38px] rounded-[11px] border border-rose-300/50 bg-rose-500/[.15] px-[15px] text-[12.5px] font-bold text-rose-100 disabled:opacity-50"
            >
              ⚑ Flag
            </button>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void leave()}
              className="h-[38px] rounded-[11px] border border-white/[.18] bg-white/[.07] px-[15px] text-[12.5px] font-bold text-line disabled:opacity-50"
            >
              {leaving ? "Leaving…" : "Leave"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 mb-0 rounded-[10px] bg-rose-500/[.15] px-3 py-2 text-[12.5px] text-rose-100">
          {error}
        </p>
      )}

      {!room ? (
        <div role="status" className="grid h-[220px] place-items-center text-[13px] text-muted">
          Opening the live…
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <Stage room={room} now={now} />
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <Poll poll={room.poll} />
              <Announcements items={room.announcements} />
            </div>
            <p className="mt-3 mb-0 text-[11.5px] leading-[1.5] text-[#a8a29e]">
              Watch-only. You aren&apos;t counted as a viewer, can&apos;t chat or vote, and nobody in the room is told
              you are here. There are no microphone or camera controls, so you can never be seen or heard.
            </p>
          </div>
          <Chat items={room.chat} />
        </div>
      )}

      {flagOpen && room && (
        <FlagDialog
          roomId={room.id}
          astrologer={room.astrologer}
          reasons={flagReasons}
          onClose={() => setFlagOpen(false)}
          onFlagged={() => {
            setFlagOpen(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function Stage({ room, now }: { room: Observing["room"]; now: number }) {
  // ⚠ No live video for observers yet: the live audio/video provider (ZEGO) isn't connected and
  // monitors get no play-only stream. Shows the host's photo and says so — never a sample clip.
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[16px] bg-ink sm:aspect-[16/10]">
      <Image src={room.photo} alt="" fill sizes="(max-width: 640px) 100vw, 720px" className="scale-110 object-cover opacity-40 blur-md" />
      <div role="status" className="absolute inset-0 grid place-items-center px-6 text-center">
        <span className="max-w-[36ch] text-[13.5px] leading-normal font-semibold text-white/85">
          Live video isn&apos;t connected yet. The chat, poll and queue below are current.
        </span>
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,.5)_0%,rgba(28,25,23,.05)_40%,rgba(28,25,23,.7)_100%)]" />

      <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold text-white">
          ● LIVE · {sinceLabel(room.startedAt, now)}
        </span>
        <span className="inline-flex h-[26px] items-center rounded-full bg-black/45 px-[11px] text-[11px] font-bold text-white">
          👁 {room.viewers.toLocaleString("en-IN")} watching
        </span>
        <span className="inline-flex h-[26px] items-center rounded-full bg-black/45 px-[11px] text-[11px] font-bold text-white">
          {room.queue.waiting} in queue
        </span>
        <span className="ml-auto inline-flex items-center gap-[7px] rounded-full bg-black/45 py-1 pr-3 pl-[5px]">
          <span className="relative size-[26px] overflow-hidden rounded-full border-2 border-gold">
            <Image src={room.photo} alt="" fill sizes="52px" className="object-cover" />
          </span>
          <b className="text-[12.5px] text-paper">{room.astrologer}</b>
        </span>
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <span className="block rounded-xl bg-black/50 px-3 py-2 text-[13px] font-semibold break-words text-white">
          {room.topic}
        </span>
      </div>
    </div>
  );
}

function Poll({ poll }: { poll: Observing["room"]["poll"] }) {
  return (
    <div className="rounded-[14px] border border-white/[.12] bg-white/[.05] p-3.5">
      <div className="text-[10.5px] font-bold tracking-[.08em] text-[#a8a29e] uppercase">Poll</div>
      <b className="mt-1 block text-[13.5px] text-white">{poll.question}</b>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {poll.options.map((o) => (
          <div key={o.label} className="relative overflow-hidden rounded-[9px] bg-white/[.06] px-2.5 py-1.5">
            <span className="absolute inset-y-0 left-0 bg-amber-500/30" style={{ width: `${o.pct}%` }} />
            <span className="relative flex justify-between gap-2 text-[12px]">
              <span className="min-w-0 break-words">{o.label}</span>
              <b className="tabular-nums">{o.pct}%</b>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-[#a8a29e]">
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} this live
      </div>
    </div>
  );
}

function Announcements({ items }: { items: Observing["room"]["announcements"] }) {
  return (
    <div className="rounded-[14px] border border-white/[.12] bg-white/[.05] p-3.5">
      <div className="text-[10.5px] font-bold tracking-[.08em] text-[#a8a29e] uppercase">Announcements</div>
      {items.length ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {items.map((a) => (
            <li key={a.id} className="text-[12.5px] leading-[1.45] break-words">
              <span className="mr-1.5 text-[11px] text-[#a8a29e] tabular-nums">{a.at}</span>
              {a.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 mb-0 text-[12.5px] text-[#a8a29e]">No announcements in this live.</p>
      )}
    </div>
  );
}

function Chat({ items }: { items: Observing["room"]["chat"] }) {
  const box = useRef<HTMLDivElement>(null);
  const last = items.length ? items[items.length - 1].id : "";
  // Follow new messages unless the observer has scrolled up to read.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [last]);

  return (
    <div className="flex min-w-0 flex-col rounded-[14px] border border-white/[.12] bg-white/[.05]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[.1] px-3.5 py-2.5">
        <b className="text-[13px] text-white">Live chat</b>
        <span className="text-[11px] text-[#a8a29e]">Read-only</span>
      </div>
      <div
        ref={box}
        aria-live="polite"
        className="flex h-[300px] flex-col gap-2 overflow-y-auto px-3.5 py-3 lg:h-[420px]"
      >
        {items.length ? (
          items.map((c) => (
            <div
              key={c.id}
              className={`rounded-[10px] px-2.5 py-1.5 text-[12.5px] leading-[1.45] break-words ${c.contact ? "border border-rose-400/50 bg-rose-500/[.15]" : ""}`}
            >
              <span className="mr-1.5 text-[10.5px] text-[#a8a29e] tabular-nums">{c.at}</span>
              <b className="mr-1 text-amber-300">{c.who}</b>
              <span>{c.text}</span>
              {c.contact && (
                <span className="mt-1 block text-[10.5px] font-extrabold tracking-[.04em] text-rose-200 uppercase">
                  Contains contact details
                </span>
              )}
            </div>
          ))
        ) : (
          <p className="m-auto text-center text-[12.5px] text-[#a8a29e]">No chat messages in this live yet.</p>
        )}
      </div>
    </div>
  );
}

function FlagDialog({
  roomId,
  astrologer,
  reasons,
  onClose,
  onFlagged,
}: {
  roomId: string;
  astrologer: string;
  reasons: string[];
  onClose: () => void;
  onFlagged: () => void;
}) {
  const { say } = useAdmin();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setProblem("Choose what you saw.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/admin/monitoring/${encodeURIComponent(roomId)}/flag`, {
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      say(`Flagged ${astrologer}'s live · ${reason}. It shows on the monitoring list until this live ends. Audited.`);
      onFlagged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Couldn't save the flag. Please try again.");
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      title={`Flag ${astrologer}'s live`}
      subtitle="Recorded in the audit log and shown to every monitor until this live ends."
      onClose={onClose}
      width={520}
    >
      <form onSubmit={submit} noValidate>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[12.5px] font-bold text-ink">What did you see?</legend>
          <div className="flex flex-col gap-1.5">
            {reasons.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] ${reason === r ? "border-amber-500 bg-amber-50" : "border-line bg-white"}`}
              >
                <input
                  type="radio"
                  name="flag-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => {
                    setReason(r);
                    setProblem(null);
                  }}
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3.5 block">
          <span className="text-[12.5px] font-bold text-ink">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            className="mt-1.5 block w-full resize-y rounded-[10px] border border-line bg-white px-3 py-2 text-[13px] text-ink"
            placeholder="What happened, briefly"
          />
        </label>
        {problem && (
          <p role="alert" className="mt-2.5 mb-0 text-[12.5px] font-semibold text-rose-700">
            {problem}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-[#57534e]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-[11px] border-0 bg-rose-700 px-5 text-[13px] font-bold text-white disabled:opacity-60"
          >
            {saving ? "Flagging…" : "Flag this live"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
