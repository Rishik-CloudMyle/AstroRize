"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { EYEBROW } from "@/components/admin/ui";
import { ApiError, api } from "@/lib/api/client";
import { byNameMatch } from "@/lib/format";
import type { MessagePerson, PersonKind } from "@/lib/admin/types";
import { KindTag, MAX_DIRECT_LENGTH, PersonAvatar } from "./parts";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");

const FIELD = "w-full rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink outline-none focus:border-amber-400";
const GROUPS: { kind: PersonKind; label: string }[] = [
  { kind: "staff", label: "Staff" },
  { kind: "astrologer", label: "Astrologers" },
  { kind: "customer", label: "Customers" },
];

/** GET /admin/messages/astrologers: an active astrologer, with their skills. */
type AstrologerPick = MessagePerson & { skills: string[] };
/** POST /admin/messages to several astrologers: one conversation each. */
interface SentConversation {
  id: string;
  created: boolean;
  person: MessagePerson;
}

/** Chosen astrologers shown one by one; more than this collapse into one "N astrologers" chip. */
const CHIP_LIMIT = 6;

/** Name, then any word of the name, then a skill or email-free match — for the astrologer list. */
function filterAstrologers(all: AstrologerPick[], q: string): AstrologerPick[] {
  const t = q.toLowerCase();
  if (!t) return all;
  const hits = all.filter((a) => a.name.toLowerCase().includes(t) || a.skills.some((s) => s.toLowerCase().includes(t)));
  return byNameMatch(hits, t, (a) => a.name);
}

/**
 * "New message": pick people (staff by department, the Astrologers list, or search staff,
 * astrologers and customers), an optional subject, and the first message. A conversation holds
 * any number of staff and at most one astrologer or customer (the API enforces the same); choosing
 * several astrologers sends the message to each in their own private conversation.
 */
export default function NewMessageDialog({
  onClose,
  onStarted,
  onSentMany,
}: {
  onClose: () => void;
  onStarted: (id: string) => void;
  /** After a message went to several astrologers (the inbox has new conversations). */
  onSentMany?: () => void;
}) {
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
  // The "Astrologers" department: every active astrologer, loaded once when first opened.
  const [mode, setMode] = useState<"people" | "astrologers">("people");
  const [astrologers, setAstrologers] = useState<AstrologerPick[] | null>(null);
  const [astrologersError, setAstrologersError] = useState("");
  const [sent, setSent] = useState<SentConversation[] | null>(null);

  const q = query.trim();
  const inAstrologers = mode === "astrologers";

  const fetchAstrologers = useCallback(() => {
    api
      .get<{ astrologers: AstrologerPick[] }>("/admin/messages/astrologers")
      .then((res) => {
        setAstrologers(res.astrologers);
        setAstrologersError("");
      })
      .catch((e) => setAstrologersError(errorText(e)));
  }, []);
  const loadAstrologers = () => {
    setAstrologersError("");
    fetchAstrologers();
  };
  // At once: its size shows on the department button.
  useEffect(fetchAstrologers, [fetchAstrologers]);

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

  const loading = inAstrologers ? !astrologers && !astrologersError : results?.q !== q && !searchError;
  const people = results ? results.people : [];
  const shownAstrologers = inAstrologers && astrologers ? filterAstrologers(astrologers, q) : [];
  const chosenIds = new Set(chosen.map((p) => p.id));
  const customer = chosen.find((p) => p.kind === "customer");
  const chosenAstrologers = chosen.filter((p) => p.kind === "astrologer");
  const chosenStaff = chosen.filter((p) => p.kind === "staff");
  const many = chosenAstrologers.length > 1;
  // One customer per conversation, alone; astrologers may be several (each gets their own conversation).
  const blocked = (p: MessagePerson) =>
    p.kind === "customer" ? chosen.some((x) => x.kind !== "staff" && x.id !== p.id) : p.kind === "astrologer" && !!customer;
  const blockedWhy = (p: MessagePerson) =>
    p.kind === "customer" ? "One customer per conversation, without astrologers" : "Can't be added to a conversation with a customer";
  // In the order shown, for the arrow keys.
  const ordered = inAstrologers ? shownAstrologers : GROUPS.flatMap((g) => people.filter((p) => p.kind === g.kind));
  const selectable = ordered.filter((p) => !blocked(p));
  const activePerson = selectable[Math.min(active, selectable.length - 1)];

  const toggle = (p: MessagePerson) => {
    if (blocked(p)) return;
    setProblem("");
    setChosen((all) => (all.some((x) => x.id === p.id) ? all.filter((x) => x.id !== p.id) : [...all, p]));
  };

  // Quick add: everyone in a department (staff list when nothing is typed).
  const departments =
    q || inAstrologers
    ? []
    : [...new Set(people.filter((p) => p.kind === "staff").map((p) => p.line))].map((line) => ({
        line,
        members: people.filter((p) => p.kind === "staff" && p.line === line),
      }));

  const openAstrologers = (on: boolean) => {
    setMode(on ? "astrologers" : "people");
    setQuery("");
    setActive(0);
    if (on && astrologersError) loadAstrologers();
    searchBox.current?.focus();
  };

  // "Choose all shown" in the Astrologers list (honours the search), or clear them again.
  const allShownChosen = shownAstrologers.length > 0 && shownAstrologers.every((a) => chosenIds.has(a.id));
  const chooseAllShown = () => {
    setProblem("");
    if (allShownChosen) {
      const shown = new Set(shownAstrologers.map((a) => a.id));
      setChosen((cur) => cur.filter((p) => !shown.has(p.id)));
    } else {
      setChosen((cur) => [...cur, ...shownAstrologers.filter((a) => !cur.some((x) => x.id === a.id))]);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (!chosen.length) return setProblem("Choose at least one person to message.");
    if (!text.trim()) return setProblem("Write a message first.");
    setBusy(true);
    setProblem("");
    try {
      const res = await api.post<{ id: string; created: boolean; conversations?: SentConversation[] }>("/admin/messages", {
        memberIds: chosen.map((p) => p.id),
        subject: subject.trim() || null,
        text,
      });
      if (res.conversations) {
        setSent(res.conversations);
        onSentMany?.();
        return;
      }
      say(res.created ? "Message sent." : "Sent in your existing conversation with the same people.");
      onStarted(res.id);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    const fresh = sent.filter((c) => c.created).length;
    return (
      <AdminDialog
        title="Message sent"
        onClose={onClose}
        width={560}
        footer={
          <div className="flex items-center justify-end">
            <button type="button" onClick={onClose} className="h-10 rounded-[11px] border-0 bg-amber-500 px-5 text-[13px] font-bold text-ink">
              Done
            </button>
          </div>
        }
      >
        <div role="status" className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <b className="block text-[14px] text-emerald-900">
            Sent to {sent.length} astrologers — {sent.length} conversations
          </b>
          <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-emerald-900">
            Each astrologer has it in their own private conversation and can&apos;t see the others or their replies.
            {fresh < sent.length && ` ${sent.length - fresh} continued an earlier conversation with the same people.`}
          </span>
        </div>
        <ul aria-label="Conversations" className="mt-3 mb-0 list-none divide-y divide-line-soft rounded-[12px] border border-line bg-white p-0">
          {sent.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onStarted(c.id)} className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-cream">
                <PersonAvatar person={c.person} size={30} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] text-ink">{c.person.name}</b>
                  <span className="block text-[11.5px] text-[#78716c]">{c.created ? "New conversation" : "Earlier conversation continued"}</span>
                </span>
                <span className="shrink-0 text-[12px] font-bold text-amber-800">Open ›</span>
              </button>
            </li>
          ))}
        </ul>
      </AdminDialog>
    );
  }

  // Many chosen astrologers collapse into one chip.
  const collapse = chosenAstrologers.length > CHIP_LIMIT;
  const chips = collapse ? chosen.filter((p) => p.kind !== "astrologer") : chosen;
  const pick = (p: MessagePerson) => {
    toggle(p);
    searchBox.current?.focus();
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
            {busy ? "Sending…" : many ? `Send to ${chosenAstrologers.length} astrologers` : "Send"}
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
              {chips.map((p) => (
                <li key={p.id} className="flex max-w-full items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 py-0.5 pr-1 pl-0.5 text-[12px]">
                  <PersonAvatar person={p} size={22} />
                  <b className="truncate text-ink">{p.name}</b>
                  <span className="shrink-0 text-[#78716c]">{p.kind === "staff" ? p.line : p.kind === "astrologer" ? "Astrologer" : "Customer"}</span>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    aria-label={`Remove ${p.name}`}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] text-[#57534e] hover:bg-amber-200"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {collapse && (
                <li className="flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 py-0.5 pr-1 pl-2.5 text-[12px]">
                  <b className="text-ink">{chosenAstrologers.length} astrologers</b>
                  <button
                    type="button"
                    onClick={() => setChosen((cur) => cur.filter((p) => p.kind !== "astrologer"))}
                    aria-label={`Remove all ${chosenAstrologers.length} astrologers`}
                    className="grid size-6 place-items-center rounded-full text-[12px] text-[#57534e] hover:bg-violet-100"
                  >
                    ✕
                  </button>
                </li>
              )}
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
            placeholder={inAstrologers ? "Search astrologers by name or skill" : "Search by name, email or phone"}
            className={`${FIELD} h-10`}
          />
          <p id={`${ids}-to-hint`} className="mt-1 mb-0 text-[11.5px] text-[#78716c]">
            {inAstrologers
              ? "Every astrologer live on Astrorize. Choose one or several — each gets the message in their own private conversation."
              : "Type to find astrologers and customers. Add any number of staff, plus one customer or one or more astrologers."}
          </p>

          {!q && !inAstrologers && (
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
              <button
                type="button"
                disabled={!!customer}
                title={customer ? "Astrologers can't join a conversation with a customer" : undefined}
                onClick={() => openAstrologers(true)}
                className="h-7 rounded-full border border-violet-300 bg-violet-50 px-3 text-[11.5px] font-bold text-violet-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Astrologers{astrologers ? ` (${astrologers.length})` : ""}
                {chosenAstrologers.length > 0 ? ` · ${chosenAstrologers.length} chosen` : ""} ›
              </button>
            </div>
          )}

          {inAstrologers && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button type="button" onClick={() => openAstrologers(false)} className="h-7 rounded-full border border-line bg-white px-3 text-[11.5px] font-bold text-ink">
                ‹ All people
              </button>
              <span className="min-w-0 flex-1 text-[11.5px] font-bold text-[#57534e]">
                {astrologers ? (q ? `${shownAstrologers.length} of ${astrologers.length} astrologers` : `${astrologers.length} active astrologers`) : "Astrologers"}
                {chosenAstrologers.length > 0 && ` · ${chosenAstrologers.length} chosen`}
              </span>
              {shownAstrologers.length > 1 && !customer && (
                <button type="button" onClick={chooseAllShown} className="h-7 rounded-full border border-line bg-white px-3 text-[11.5px] font-bold text-ink">
                  {allShownChosen ? "Clear shown" : `Choose all ${shownAstrologers.length}${q ? " shown" : ""}`}
                </button>
              )}
            </div>
          )}

          <div className="mt-2.5 max-h-[260px] overflow-y-auto rounded-[12px] border border-line bg-white" aria-busy={loading}>
            {inAstrologers ? (
              astrologersError ? (
                <p role="alert" className="m-0 px-3 py-3 text-[12.5px] text-rose-700">
                  {astrologersError}{" "}
                  <button type="button" onClick={loadAstrologers} className="font-bold text-amber-800 underline">
                    Try again
                  </button>
                </p>
              ) : !astrologers ? (
                <p className="m-0 px-3 py-3 text-[12.5px] text-[#78716c]">Loading astrologers…</p>
              ) : shownAstrologers.length === 0 ? (
                <p className="m-0 px-3 py-3 text-[12.5px] break-words text-[#78716c]" role="status">
                  {q ? `No astrologer matches “${q}”.` : "No astrologers are active on Astrorize yet."}
                </p>
              ) : (
                <div id={listId} role="listbox" aria-multiselectable="true" aria-label="Astrologers">
                  {shownAstrologers.map((p) => (
                    <PersonOption
                      key={p.id}
                      id={`${ids}-p-${p.id}`}
                      person={p}
                      line={p.skills.length ? p.skills.join(" · ") : "Astrologer"}
                      on={chosenIds.has(p.id)}
                      off={blocked(p)}
                      offLine={blockedWhy(p)}
                      isActive={activePerson?.id === p.id}
                      onPick={() => pick(p)}
                    />
                  ))}
                </div>
              )
            ) : searchError ? (
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
                      {rows.map((p) => (
                        <PersonOption
                          key={p.id}
                          id={`${ids}-p-${p.id}`}
                          person={p}
                          line={p.line}
                          on={chosenIds.has(p.id)}
                          off={blocked(p)}
                          offLine={blockedWhy(p)}
                          isActive={activePerson?.id === p.id}
                          onPick={() => pick(p)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {many && (
          <p role="status" className="m-0 rounded-[10px] border border-violet-200 bg-violet-50 px-3 py-2 text-[12.5px] leading-[1.5] text-violet-950">
            <b>{chosenAstrologers.length} separate conversations.</b> Each astrologer gets this message privately and can&apos;t see the others or their
            replies.
            {chosenStaff.length > 0 &&
              ` ${chosenStaff.length === 1 ? "The colleague you added joins" : `The ${chosenStaff.length} colleagues you added join`} every one.`}
          </p>
        )}

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

/** One row of the people / astrologers list: avatar, name, a short line, kind and a tick. */
function PersonOption({
  id,
  person,
  line,
  on,
  off,
  offLine,
  isActive,
  onPick,
}: {
  id: string;
  person: MessagePerson;
  line: string;
  on: boolean;
  off: boolean;
  offLine: string;
  isActive: boolean;
  onPick: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={on}
      aria-disabled={off || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className={`flex items-center gap-2.5 border-t border-line-soft px-3 py-2 ${off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-cream"} ${
        isActive ? "bg-amber-50 outline-2 -outline-offset-2 outline-amber-400" : ""
      }`}
    >
      <PersonAvatar person={person} size={30} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13px] text-ink">{person.name}</b>
        <span className="block truncate text-[11.5px] text-[#78716c]">{off ? offLine : line}</span>
      </span>
      <KindTag kind={person.kind} />
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
}
