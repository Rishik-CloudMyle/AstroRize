"use client";

import { genderLabel, time12 } from "@/lib/contact";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, api } from "@/lib/api/client";
import type { LiveQueueDetail, LiveQueuePerson, LiveQueueProfile } from "@/lib/portal/types";
import Modal from "../modal";
import { Panel } from "../ui";

const NOT_SHARED = "Not shared";

/** Customer photo, or their initials when there is none. */
export function Avatar({ photoUrl, initials, size }: { photoUrl: string | null; initials: string; size: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-amber-200 bg-amber-100 font-bold text-amber-800"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {photoUrl ? (
        // Uploaded photos are served by the API as-is; no resizing needed at this size.
        <Image src={photoUrl} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

const modeLabel = (mode: "private" | "public") => (mode === "public" ? "Public" : "Private");

/**
 * "People in your queue": who asked to consult from the live room, with the profile they
 * shared. Visible only to this astrologer (the API checks the room is theirs).
 */
export default function LiveQueuePeople({ queue }: { queue: LiveQueuePerson[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);

  return (
    <Panel className="p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold max-lg:text-[16px]">People in your queue</h2>
        <span className="text-xs text-stone-500">{queue.length} waiting</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">Only you can see these profiles. Use them to prepare; don&apos;t save or share them.</p>

      {queue.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-stone-500">Nobody is waiting right now.</p>
      ) : (
        <ul className="mt-3 flex max-h-[440px] flex-col gap-2 overflow-y-auto pr-0.5">
          {queue.map((p) => {
            const name = p.profile?.name ?? `Viewer ${p.alias}`;
            const details = [
              p.profile ? (p.profile.age !== null ? `Age ${p.profile.age}` : "Age not shared") : "Profile not shared",
              p.consultMode ? `${modeLabel(p.mode)} ${p.consultMode}` : modeLabel(p.mode),
              `waiting ${p.waiting}`,
            ];
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 max-lg:rounded-app-btn">
                <Avatar photoUrl={p.profile?.photoUrl ?? null} initials={p.profile?.initials ?? "?"} size={40} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] text-ink">{name}</b>
                  <span className="block text-[11.5px] text-stone-500">{details.join(" · ")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  aria-label={`See more about ${name}`}
                  className="h-[30px] shrink-0 rounded-[9px] border border-line bg-white px-[11px] text-xs font-bold text-amber-800 max-lg:h-9 max-lg:rounded-app-btn max-lg:text-[13px]"
                >
                  See more
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Rendered on <body>: the panel's backdrop blur would otherwise trap the fixed overlay inside it. */}
      {openId && createPortal(<ProfileDialog key={openId} entryId={openId} onClose={close} />, document.body)}
    </Panel>
  );
}

/** What the profile popup shows about one person, whichever list they came from. */
export interface DialogPerson {
  alias: string;
  profile: LiveQueueProfile | null;
  badges: { label: string; tone: "amber" | "plain" | "urgent" }[];
}

const BADGE_TONE = {
  amber: "bg-amber-100 text-amber-900",
  plain: "bg-cream text-stone-600",
  urgent: "bg-orange-100 text-orange-800",
};

function ProfileDialog({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  return (
    <PersonProfileDialog
      url={`/portal/live/queue/${encodeURIComponent(entryId)}/profile`}
      read={(body) => {
        const person = (body as { person: LiveQueueDetail }).person;
        return {
          alias: person.alias,
          profile: person.profile,
          badges: [
            { label: modeLabel(person.mode), tone: "amber" },
            { label: person.status === "accepted" ? "Accepted" : `Waiting ${person.waiting}`, tone: "plain" },
          ],
        };
      }}
      note="Shared with you only because they asked to consult in your live room."
      onClose={onClose}
    />
  );
}

/**
 * Centred popup with everything a customer shared (photo, name, age, birth details…).
 * The details scroll inside the popup, so it fits a phone screen as well as a desktop.
 */
export function PersonProfileDialog({
  url,
  read,
  note,
  onClose,
  actions,
}: {
  /** API path that returns the person. */
  url: string;
  /** Turns the API's answer into what the popup shows. */
  read: (body: unknown) => DialogPerson;
  note: string;
  onClose: () => void;
  /** Buttons shown next to Close (e.g. Accept / Decline). */
  actions?: React.ReactNode;
}) {
  const [person, setPerson] = useState<DialogPerson | null>(null);
  const [error, setError] = useState("");
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get<unknown>(url)
      .then((body) => !cancelled && setPerson(readRef.current(body)))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load this profile. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const p = person?.profile ?? null;
  const rows: [string, string | null][] = p
    ? [
        ["First name", p.firstName],
        ["Last name", p.lastName],
        ["Age", p.age !== null ? `${p.age} years` : null],
        ["Gender", genderLabel(p.gender)],
        ["Date of birth", p.birthDate],
        ["Time of birth", time12(p.birthTime) || null],
        ["Place of birth", p.birthPlace],
        ["City", p.city],
        ["State", p.state],
      ]
    : [];

  return (
    <Modal onClose={onClose} labelledBy="queue-person-title" maxWidth={440}>
      {/* Never taller than the screen: the details list scrolls, the header and buttons stay put. */}
      <div className="flex max-h-[calc(100dvh-72px)] flex-col sm:max-h-[calc(100dvh-104px)]">
        {!person && !error && (
          <div aria-busy="true">
            <h2 id="queue-person-title" className="m-0 text-[18px] font-bold">
              Loading profile…
            </h2>
            <div className="mt-4 h-40 rounded-2xl bg-cream" />
          </div>
        )}

        {error && (
          <div>
            <h2 id="queue-person-title" className="m-0 text-[18px] font-bold">
              Profile unavailable
            </h2>
            <p role="alert" className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
              {error}
            </p>
          </div>
        )}

        {person && (
          <>
            <div className="flex shrink-0 items-center gap-3.5">
              <Avatar photoUrl={p?.photoUrl ?? null} initials={p?.initials ?? "?"} size={64} />
              <div className="min-w-0">
                <h2 id="queue-person-title" className="m-0 text-[18px] leading-tight font-bold break-words">
                  {p?.name ?? `Customer ${person.alias}`}
                </h2>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {person.badges.map((b) => (
                    <span key={b.label} className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-extrabold ${BADGE_TONE[b.tone]}`}>
                      {b.label}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            <div
              className="mt-4 max-h-[420px] min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white px-4"
              tabIndex={0}
              aria-label="Profile details"
            >
              {p ? (
                <dl className="m-0">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-line-soft py-[11px] last:border-b-0">
                      <dt className="shrink-0 text-[12.5px] text-stone-500">{label}</dt>
                      <dd className={`m-0 text-right text-[13.5px] break-words ${value ? "font-semibold text-ink" : "text-stone-400"}`}>
                        {value ?? NOT_SHARED}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="py-4 text-[13px] text-stone-500">This customer hasn&apos;t shared a profile.</p>
              )}
            </div>
            <p className="mt-3 shrink-0 text-[11.5px] leading-[1.45] text-stone-500">{note}</p>
          </>
        )}

        <div className="mt-4 flex shrink-0 gap-2.5">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold max-lg:rounded-app-btn max-lg:bg-transparent max-lg:text-[15px]">
            Close
          </button>
          {person && actions}
        </div>
      </div>
    </Modal>
  );
}
