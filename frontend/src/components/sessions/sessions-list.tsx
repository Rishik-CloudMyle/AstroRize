"use client";

// "My consultations" (/me/consultations): the customer's own PAID sessions, newest first — who, how
// (Chat / Voice / Video / Instant), when, how long, how much, and whether a recording or transcript
// is there. Sessions paid with free minutes are never listed. After the prototype's Consultations
// screen (APP-ORD-001). Same markup on phones and desktop (a narrow column on desktop).

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import AppButton from "../mobile/button";
import { Tag } from "../mobile/chips";
import EmptyState from "../mobile/empty-state";
import { AppTopbar } from "../mobile/page-title";
import { SkeletonRows } from "../mobile/skeleton";
import { MODE_LABEL, minutesLabel, recordLabel, sessionWhen, type SessionSummary } from "./session-types";

export function SessionAvatar({ a, size = 44 }: { a: SessionSummary["astrologer"]; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-app-tint-2 text-[14px] font-bold text-app-active"
    >
      {a.photo ? <Image src={a.photo} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" /> : a.initials}
    </span>
  );
}

function Row({ s }: { s: SessionSummary }) {
  const rec = recordLabel(s);
  return (
    <li>
      <Link
        href={`/me/consultations/${encodeURIComponent(s.id)}`}
        className="flex min-h-app-hit items-center gap-3 rounded-app-card border border-app-line bg-app-surface p-3 shadow-app-card hover:no-underline focus-visible:outline-2 focus-visible:outline-app-selected"
      >
        <SessionAvatar a={s.astrologer} />
        <span className="min-w-0 flex-1">
          <b className="block truncate font-name text-[15px] font-bold text-app-ink">{s.astrologer.name}</b>
          <span className="block truncate text-[12px] text-app-ink-2">
            {MODE_LABEL[s.mode]}
            {s.fixed ? " · Fixed session" : ""} · {minutesLabel(s.durationSeconds)}
          </span>
          <span className="block truncate text-[12px] text-app-ink-3">{sessionWhen(s.at)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <b className="text-[14px] font-bold text-app-ink tabular-nums">{rupee(s.amount)}</b>
          <Tag tone={rec.tone}>{rec.text}</Tag>
        </span>
      </Link>
    </li>
  );
}

export default function SessionsList() {
  const session = useSession();
  const { openLogin } = useAppUI();
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const customer = session.ready && session.loggedIn && session.role === "customer";

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "We couldn't load your consultations. Check your connection and try again.");

  // The first page when the customer is known (and again on "Try again").
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    api
      .get<{ sessions: SessionSummary[]; next: string | null }>("/my-sessions")
      .then((r) => {
        if (cancelled) return;
        setRows(r.sessions);
        setNext(r.next);
        setError(null);
      })
      .catch((e) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
  }, [customer, attempt]);

  function loadMore(before: string) {
    setMore(true);
    api
      .get<{ sessions: SessionSummary[]; next: string | null }>(`/my-sessions?before=${encodeURIComponent(before)}`)
      .then((r) => {
        setRows((cur) => [...(cur ?? []), ...r.sessions]);
        setNext(r.next);
        setError(null);
      })
      .catch(fail)
      .finally(() => setMore(false));
  }

  return (
    <div className="mx-auto w-full px-4 pt-3 pb-8 lg:max-w-[640px] lg:pt-10 lg:pb-16">
      <AppTopbar title="My consultations" backHref="/me" />
      <p className="mt-3 mb-3 text-[12.5px] leading-[1.5] text-app-ink-2">
        Your paid sessions, newest first. Open one to play its recording or read its chat, inside the app only.
      </p>

      {!session.ready ? (
        <SkeletonRows count={5} label="Loading your consultations" />
      ) : !customer ? (
        <EmptyState
          title="Log in to see your consultations"
          body="Your paid sessions and their recordings are kept in your account."
          action={
            <AppButton onClick={() => openLogin()} className="mt-3">
              Log in
            </AppButton>
          }
        />
      ) : error && !rows ? (
        <EmptyState
          role="status"
          title="We couldn't load your consultations"
          body={error}
          action={
            <AppButton variant="secondary" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </AppButton>
          }
        />
      ) : !rows ? (
        <SkeletonRows count={5} label="Loading your consultations" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No paid consultations yet"
          body="Once you finish a paid chat, voice or video session it will appear here. Free-minute sessions are not listed."
          action={
            <AppButton href="/astrologers" className="mt-3">
              Find an astrologer
            </AppButton>
          }
        />
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Your paid consultations">
            {rows.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-3 mb-0 text-center text-[12.5px] text-app-error">
              {error}
            </p>
          )}
          {next && (
            <AppButton
              variant="secondary"
              block
              className="mt-3"
              loading={more}
              onClick={() => loadMore(next)}
            >
              Show older
            </AppButton>
          )}
        </>
      )}
    </div>
  );
}
