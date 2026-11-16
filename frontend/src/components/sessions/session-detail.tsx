"use client";

// One paid consultation (/me/consultations/<id>): who, how, when, how long, how much, and its record —
// the in-app audio player for a voice / video / Instant Call, or the read-only transcript of a chat.
// The player and the transcript sit inside <ProtectedContent> (watermark, privacy blur, no print/copy).
// Never shows the session reference: a session is identified by astrologer + date/time + mode + amount.
// After the prototype's Consultation details / Recording screens (APP-ORD-002, APP-ORD-004).

import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import AppButton from "../mobile/button";
import AppCard from "../mobile/app-card";
import EmptyState from "../mobile/empty-state";
import { AppTopbar } from "../mobile/page-title";
import { Skeleton } from "../mobile/skeleton";
import ProtectedContent from "./protected-content";
import RecordingPlayer from "./recording-player";
import { SessionAvatar } from "./sessions-list";
import { MODE_LABEL, minutesLabel, sessionWhen, type SessionDetail } from "./session-types";
import Transcript from "./transcript";

/** Said on the recording screen so the customer knows who can hear it (client wording pending approval). */
const ACCESS_NOTE = "AstroRize staff and you can access this recording. You can play it back here, inside the app — it can't be downloaded or shared.";

function Notice({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <AppCard padding="lg">
      <b className="block text-[14px] text-app-ink">{title}</b>
      <p className="mt-1.5 mb-0 text-[13px] leading-[1.5] text-app-ink-2">{children}</p>
      {action}
    </AppCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13.3px]">
      <span className="text-app-ink-2">{label}</span>
      <b className="text-right font-semibold text-app-ink tabular-nums">{value}</b>
    </div>
  );
}

function RecordingSection({ s, name, phone }: { s: SessionDetail; name: string; phone: string }) {
  const r = s.recording;
  if (r.state === "ready" || r.state === "partial") {
    return (
      <>
        <ProtectedContent name={name} phone={phone}>
          <div className="p-3">
            <RecordingPlayer sessionId={s.id} parts={r.parts} astrologer={s.astrologer} />
          </div>
        </ProtectedContent>
        <p className="mt-2 mb-0 text-[12px] leading-[1.5] text-app-ink-3">{ACCESS_NOTE}</p>
      </>
    );
  }
  const help = (
    <AppButton href="/support" variant="secondary" block className="mt-3">
      Contact support
    </AppButton>
  );
  switch (r.state) {
    case "processing":
      return (
        <Notice title="Preparing your recording">
          This usually takes a few minutes after the consultation ends. Check back here shortly — it will appear on this page when it&apos;s ready.
        </Notice>
      );
    case "unavailable":
      return (
        <Notice title="Recording unavailable" action={help}>
          A recording isn&apos;t available for this consultation. If you expected one, contact support and mention the astrologer, date and time shown above.
        </Notice>
      );
    case "deleted":
      return <Notice title="Recording deleted">This recording was deleted after the period it is kept for.</Notice>;
    case "off":
      return <Notice title="Recordings aren't available right now">Playback is switched off for the moment. Please check back later.</Notice>;
    default:
      return <Notice title="Not recorded">This consultation wasn&apos;t recorded. Only voice, video and Instant Calls placed after recording began are recorded.</Notice>;
  }
}

export default function SessionDetailView({ id }: { id: string }) {
  const session = useSession();
  const { openLogin } = useAppUI();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);
  const customer = session.ready && session.loggedIn && session.role === "customer";

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    api
      .get<{ session: SessionDetail }>(`/my-sessions/${encodeURIComponent(id)}`)
      .then((r) => !cancelled && setData(r.session))
      .catch((e) => !cancelled && setError({ message: e instanceof ApiError ? e.message : "We couldn't load this consultation. Check your connection and try again.", missing: e instanceof ApiError && e.status === 404 }));
    return () => {
      cancelled = true;
    };
  }, [customer, id]);

  const name = session.ready && session.loggedIn ? session.user.name : "";
  const phone = session.ready && session.loggedIn ? session.phone : "";
  const audio = data ? data.mode !== "chat" : false;

  let body: React.ReactNode;
  if (!session.ready) {
    body = <Skeleton rounded="card" className="mt-4 h-40 w-full" />;
  } else if (!customer) {
    body = (
      <EmptyState
        title="Log in to see this consultation"
        action={
          <AppButton onClick={() => openLogin()} className="mt-3">
            Log in
          </AppButton>
        }
      />
    );
  } else if (error) {
    body = (
      <EmptyState
        role="status"
        title={error.missing ? "We couldn't find that consultation" : "We couldn't load this consultation"}
        body={error.missing ? "It may belong to another account, or it was a free-minutes session." : error.message}
        action={
          <AppButton href="/me/consultations" variant="secondary" className="mt-3">
            Back to my consultations
          </AppButton>
        }
      />
    );
  } else if (!data) {
    body = (
      <div role="status" aria-label="Loading this consultation" className="mt-4">
        <Skeleton className="h-11 w-2/3" />
        <Skeleton rounded="card" className="mt-3 h-28 w-full" />
        <Skeleton rounded="card" className="mt-3 h-56 w-full" />
      </div>
    );
  } else {
    body = (
      <>
        <div className="mt-4 mb-3 flex items-center gap-3">
          <SessionAvatar a={data.astrologer} size={52} />
          <div className="min-w-0">
            <b className="block truncate font-name text-[17px] font-bold text-app-ink">{data.astrologer.name}</b>
            <span className="block text-[12.5px] text-app-ink-2">
              {MODE_LABEL[data.mode]}
              {data.fixed ? " · Fixed session" : ""} · {sessionWhen(data.at)}
            </span>
          </div>
        </div>

        <AppCard className="mb-4 divide-y divide-app-line px-3.5">
          <Fact label="Duration" value={minutesLabel(data.durationSeconds)} />
          <Fact label="Amount paid" value={rupee(data.amount)} />
        </AppCard>

        {audio ? (
          <section aria-label="Recording">
            <h2 className="mt-0 mb-2 text-[14px] font-bold text-app-ink">Recording</h2>
            <RecordingSection s={data} name={name} phone={phone} />
          </section>
        ) : null}

        {data.transcript.available ? (
          <section aria-label={audio ? "Messages during the call" : "Chat transcript"} className={audio ? "mt-5" : ""}>
            <h2 className="mt-0 mb-2 text-[14px] font-bold text-app-ink">{audio ? "Messages during the call" : "Chat transcript"}</h2>
            <ProtectedContent name={name} phone={phone} noSelect className="rounded-app-card border border-app-line bg-app-surface">
              <Transcript lines={data.messages} astrologerName={data.astrologer.name} />
            </ProtectedContent>
          </section>
        ) : !audio ? (
          <Notice title="No transcript">
            {data.recording.state === "off"
              ? "Transcripts aren't available right now. Please check back later."
              : "No messages were sent in this chat, so there is nothing to show."}
          </Notice>
        ) : null}

        <AppButton href="/support" variant="ghost" block className="mt-4">
          Help with this consultation
        </AppButton>
      </>
    );
  }

  return (
    <div className="mx-auto w-full px-4 pt-3 pb-10 lg:max-w-[640px] lg:pt-10 lg:pb-16">
      <AppTopbar title="Consultation" backHref="/me/consultations" />
      {body}
    </div>
  );
}
