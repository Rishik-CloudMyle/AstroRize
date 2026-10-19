"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { EYEBROW } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";
import type { MessagePerson, PersonKind } from "@/lib/admin/types";
import { KindTag, MAX_DIRECT_LENGTH, PersonAvatar } from "./parts";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");

const FIELD = "w-full rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink outline-none focus:border-amber-400";
const GROUPS: { kind: PersonKind; label: string }[] = [
  { kind: "staff", label: "Staff" },
  { kind: "astrologer", label: "Astrologers" },
  { kind: "customer", label: "Customers" },
];

/**
 * "New message": pick people (staff by department, or search staff, astrologers and customers),
 * an optional subject, and the first message. A conversation holds any number of staff and at
 * most one astrologer or customer (the API enforces the same).
 */
export default function NewMessageDialog({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) {
  const { say } = useAdmin();
  const ids = useId();
  const listId = `${ids}-people`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; people: MessagePerson[] } | null>(null);
  const [searchError, setSearchError] = useState("");
  const [chosen, setChosen] = useState<MessagePerson[]>([]);
  const [active, setActive] = useState(0);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const request = useRef(0);
  const searchBox = useRef<HTMLInputElement>(null);

  const q = query.trim();

  // People search, a moment after typing stops. An empty search lists the staff.
  useEffect(() => {
    const n = ++request.current;
    const timer = setTimeout(
      () => {
        api
          .get<{ people: MessagePerson[] }>(`/admin/messages/people?q=${encodeURIComponent(q)}`)
          .then((res) => {
            if (n !== request.current) return;
            setResults({ q, people: res.people });
            setSearchError("");
            setActive(0);
          })
          .catch((e) => n === request.current && setSearchError(errorText(e)));
      },
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [q]);

  const loading = results?.q !== q && !searchError;
  const people = results ? results.people : [];
  const chosenIds = new Set(chosen.map((p) => p.id));
  const outsider = chosen.find((p) => p.kind !== "staff");
  const blocked = (p: MessagePerson) => p.kind !== "staff" && !!outsider && outsider.id !== p.id;
  // In the order shown, for the arrow keys.
  const ordered = GROUPS.flatMap((g) => people.filter((p) => p.kind === g.kind));
  const selectable = ordered.filter((p) => !blocked(p));
  const activePerson = selectable[Math.min(active, selectable.length - 1)];

  const toggle = (p: MessagePerson) => {
    if (blocked(p)) return;
    setProblem("");
    setChosen((all) => (all.some((x) => x.id === p.id) ? all.filter((x) => x.id !== p.id) : [...all, p]));
  };

  // Quick add: everyone in a department (staff list when nothing is typed).
  const departments = q
    ? []
    : [...new Set(people.filter((p) => p.kind === "staff").map((p) => p.line))].map((line) => ({
        line,
        members: people.filter((p) => p.kind === "staff" && p.line === line),
      }));

  const submit = async () => {
    if (busy) return;
    if (!chosen.length) return setProblem("Choose at least one person to message.");
    if (!text.trim()) return setProblem("Write a message first.");
    setBusy(true);
    setProblem("");
    try {
      const res = await api.post<{ id: string; created: boolean }>("/admin/messages", {
        memberIds: chosen.map((p) => p.id),
        subject: subject.trim() || null,
        text,
      });
      say(res.created ? "Message sent." : "Sent in your existing conversation with the same people.");
      onStarted(res.id);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title="New message"
      subtitle="Colleagues in any department, astrologers or customers. Only the people you add can read it."
      onClose={onClose}
      width={640}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-ink">
            Cancel
          </button>
          <button
            type="submit"
            form={`${ids}-form`}
            disabled={busy}
            className="h-10 rounded-[11px] border-0 bg-amber-500 px-5 text-[13px] font-bold text-ink disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      }
    >
      <form
        id={`${ids}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor={`${ids}-to`} className={`${EYEBROW} mb-1.5 block`}>
            To
          </label>
          {chosen.length > 0 && (
            <ul aria-label="Chosen people" className="mb-2 flex flex-wrap gap-1.5">
              {chosen.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 py-0.5 pr-1 pl-0.5 text-[12px]">
                  <PersonAvatar person={p} size={22} />
                  <b className="text-ink">{p.name}</b>
                  <span className="text-[#78716c]">{p.kind === "staff" ? p.line : p.kind === "astrologer" ? "Astrologer" : "Customer"}</span>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    aria-label={`Remove ${p.name}`}
                    className="grid size-6 place-items-center rounded-full text-[12px] text-[#57534e] hover:bg-amber-200"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={searchBox}
            id={`${ids}-to`}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activePerson ? `${ids}-p-${activePerson.id}` : undefined}
            aria-describedby={`${ids}-to-hint`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!selectable.length) return;
                const at = Math.min(active, selectable.length - 1);
                setActive(e.key === "ArrowDown" ? (at + 1) % selectable.length : (at - 1 + selectable.length) % selectable.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (activePerson) toggle(activePerson);
              }
            }}
            autoComplete="off"
            maxLength={80}
            placeholder="Search by name, email or phone"
            className={`${FIELD} h-10`}
          />
          <p id={`${ids}-to-hint`} className="mt-1 mb-0 text-[11.5px] text-[#78716c]">
            Type two or more letters to find astrologers and customers. Add any number of staff, and one astrologer or customer.
          </p>

          {departments.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] font-bold text-[#57534e]">Add a department:</span>
              {departments.map((d) => {
                const all = d.members.every((p) => chosenIds.has(p.id));
                return (
                  <button
                    key={d.line}
                    type="button"
                    disabled={all}
                    onClick={() => {
                      setProblem("");
                      setChosen((cur) => [...cur, ...d.members.filter((p) => !cur.some((x) => x.id === p.id))]);
                    }}
                    className="h-7 rounded-full border border-line bg-white px-3 text-[11.5px] font-bold text-ink disabled:cursor-default disabled:opacity-50"
                  >
                    {d.line} ({d.members.length}){all ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-2.5 max-h-[260px] overflow-y-auto rounded-[12px] border border-line bg-white" aria-busy={loading}>
            {searchError ? (
              <p role="alert" className="m-0 px-3 py-3 text-[12.5px] text-rose-700">
                {searchError}
              </p>
            ) : !results ? (
              <p className="m-0 px-3 py-3 text-[12.5px] text-[#78716c]">Loading people…</p>
            ) : ordered.length === 0 ? (
              <p className="m-0 px-3 py-3 text-[12.5px] break-words text-[#78716c]" role="status">
                {q ? `No one matches “${q}”.` : "No other staff can receive messages yet."}
              </p>
            ) : (
              <div id={listId} role="listbox" aria-multiselectable="true" aria-label="People" className={loading ? "opacity-60" : ""}>
                {GROUPS.map((g) => {
                  const rows = people.filter((p) => p.kind === g.kind);
                  if (!rows.length) return null;
                  return (
                    <div key={g.kind} role="group" aria-labelledby={`${ids}-g-${g.kind}`}>
                      <div id={`${ids}-g-${g.kind}`} className={`${EYEBROW} sticky top-0 z-[1] bg-cream px-3 py-1.5`}>
                        {g.label}
                      </div>
                      {rows.map((p) => {
                        const on = chosenIds.has(p.id);
                        const off = blocked(p);
                        const isActive = activePerson?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            id={`${ids}-p-${p.id}`}
                            role="option"
                            aria-selected={on}
                            aria-disabled={off || undefined}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              toggle(p);
                              searchBox.current?.focus();
                            }}
                            className={`flex items-center gap-2.5 border-t border-line-soft px-3 py-2 ${
                              off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-cream"
                            } ${isActive ? "bg-amber-50 outline-2 -outline-offset-2 outline-amber-400" : ""}`}
                          >
                            <PersonAvatar person={p} size={30} />
                            <span className="min-w-0 flex-1">
                              <b className="block truncate text-[13px] text-ink">{p.name}</b>
                              <span className="block truncate text-[11.5px] text-[#78716c]">
                                {off ? "One astrologer or customer per conversation" : p.line}
                              </span>
                            </span>
                            <KindTag kind={p.kind} />
                            <span
                              aria-hidden="true"
                              className={`grid size-5 shrink-0 place-items-center rounded-[6px] border text-[12px] font-extrabold ${
                                on ? "border-amber-500 bg-amber-500 text-ink" : "border-line bg-white text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <label className="block">
          <span className={`${EYEBROW} mb-1.5 block`}>Subject (optional)</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            placeholder="e.g. Payout batch PB-2026-09-B"
            className={`${FIELD} h-10`}
          />
        </label>

        <label className="block">
          <span className={`${EYEBROW} mb-1.5 block`}>Message</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setProblem("");
            }}
            rows={4}
            maxLength={MAX_DIRECT_LENGTH}
            className={`${FIELD} resize-y py-2.5 leading-[1.5]`}
          />
          <span className="mt-1 block text-right text-[11px] text-[#78716c]">
            {text.length.toLocaleString("en-IN")} / {MAX_DIRECT_LENGTH.toLocaleString("en-IN")}
          </span>
        </label>

        {problem && (
          <p role="alert" className="m-0 rounded-[10px] bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
            {problem}
          </p>
        )}
      </form>
    </AdminDialog>
  );
}
