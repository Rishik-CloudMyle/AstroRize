"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { apiDelete } from "@/lib/portal/request";
import type { LiveAnnouncement } from "@/lib/portal/types";
import { useErrorToast, useToast } from "../portal-provider";
import { Panel } from "../ui";

const MAX_CHARS = 280;
/** Viewers see the newest few above the room chat. */
const SHOWN_TO_VIEWERS = 5;

/** Post short updates to the room ("Live updates"). They appear above the room chat for every viewer. */
export default function LiveAnnouncements({ announcements }: { announcements: LiveAnnouncement[] }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const trimmed = text.trim();
  const left = MAX_CHARS - text.length;

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await api.post("/portal/live/announcements", { text: trimmed });
      setText("");
      toast("Announcement posted. Viewers see it above the room chat.");
      router.refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      await apiDelete(`/portal/live/announcements/${encodeURIComponent(id)}`);
      toast("Announcement removed from the room.");
      router.refresh();
    } catch (err) {
      showError(err);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Panel className="p-[18px]">
      <h2 className="m-0 mb-1 text-[15px] font-bold">Announcements</h2>
      <p className="mb-3 text-xs text-stone-500">Shown to everyone in the room, above the chat. Contact details aren&apos;t allowed.</p>
      <form onSubmit={post}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="New announcement"
          aria-describedby="announce-count"
          placeholder="e.g. Private consults open after this segment."
          maxLength={MAX_CHARS}
          rows={3}
          className="block w-full resize-y rounded-[11px] border border-line bg-white px-3 py-2.5 text-[13.5px] leading-normal text-ink outline-none focus:border-amber-500"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span id="announce-count" className={`text-[11.5px] tabular-nums ${left <= 20 ? "font-bold text-urgent" : "text-stone-500"}`}>
            {text.length}/{MAX_CHARS}
          </span>
          <button
            type="submit"
            disabled={!trimmed || posting}
            className="h-[38px] rounded-xl bg-amber-500 px-5 text-[13.5px] font-bold text-ink disabled:bg-amber-200 disabled:text-amber-900"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>

      <div className="mt-3.5 flex flex-col gap-2">
        {announcements.length === 0 && <p className="text-[12.5px] text-stone-500">No announcements yet.</p>}
        {announcements.map((n, i) => (
          <div key={n.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-white px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13px] leading-[1.45] break-words text-ink">{n.text}</p>
              <span className="mt-1 block text-[11px] text-stone-500">
                {n.date} · {n.at}
                {i >= SHOWN_TO_VIEWERS && " · no longer shown to viewers"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void remove(n.id)}
              disabled={deleting !== null}
              aria-label={`Delete announcement: ${n.text.slice(0, 40)}`}
              className="h-[30px] shrink-0 rounded-[9px] border border-line bg-white px-[11px] text-xs font-bold text-rose-700 disabled:opacity-60"
            >
              {deleting === n.id ? "Deleting…" : "Delete"}
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
