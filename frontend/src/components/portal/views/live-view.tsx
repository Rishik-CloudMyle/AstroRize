"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { rupee } from "@/lib/portal/format";
import type { LiveRequest, LiveRoom, Presence } from "@/lib/portal/types";
import Modal from "../modal";
import { useErrorToast, usePortalState, usePresence, useToast } from "../portal-provider";
import { PageHeader, Panel } from "../ui";
import { GiftStack } from "../../live/gift-burst";
import { LiveFeedOverlay, plannedLabel } from "../../live/live-feed";
import { LiveGiftsPanel, useLiveFeed } from "./live-activity";
import LiveAnnouncements from "./live-announcements";
import LiveDetailsForm, { type LiveDetails } from "./live-details-form";
import LiveQueuePeople from "./live-queue-people";

const MOD_ACTIONS = ["Mute 5m", "Mute 15m", "Mute 60m", "Block from room", "Delete message"];

function modMessage(label: string): string {
  if (label === "Delete message") return "Message removed from the transcript. The action is audited.";
  if (label === "Block from room") return "Blocked — room-scoped only. The viewer sees a respectful blocked state.";
  return `${label} applied, room-scoped. The duration is shown to the muted viewer.`;
}

const MAX_POLL_OPTIONS = 6;
/** How often the console re-reads the queue and announcements while open. */
const REFRESH_MS = 15_000;

export default function LiveView({ data }: { data: LiveRoom | null }) {
  if (!data) {
    return (
      <div>
        <PageHeader title="Live controls" subtitle="One room per astrologer. No Fixed Session or Emergency consults from a live room." />
        <Panel className="mt-5 p-5">
          <b className="text-[15px]">You don&apos;t have a live room yet</b>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-stone-500">
            Once our team sets up your room, its controls, consult queue and polls appear here.
          </p>
        </Panel>
      </div>
    );
  }
  return <LiveConsole data={data} />;
}

function LiveConsole({ data }: { data: LiveRoom }) {
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [micOn, setMicOn] = usePortalState("liveMic", true);
  const [camOn, setCamOn] = usePortalState("liveCam", true);
  const [privateOn, setPrivateOn] = usePortalState("livePrivate", false);
  const [busy, setBusy] = useState(false);
  const [presence, setPresence] = usePresence();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [editing, setEditing] = useState(false);
  const live = data.isLive;
  const { feed, gifts: giftsShown } = useLiveFeed(live);
  // This live's details, or the last ones used (to pre-fill "Go live").
  const details: LiveDetails = {
    title: data.title,
    topic: data.topic,
    category: data.category && data.categories.includes(data.category) ? data.category : "",
    language: data.language && data.languages.includes(data.language) ? data.language : (data.languages.length === 1 ? data.languages[0] : ""),
    durationMins: data.durationMins ?? 0,
  };
  const [question, setQuestion] = useState(data.pollQuestion);
  const [options, setOptions] = useState(data.pollOptions.length ? data.pollOptions : ["", ""]);
  const rate = `${rupee(data.rate)}/min`;

  // Keep the queue (and how long people have waited) current while the console is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const goOnline = () =>
    run(async () => {
      const res = await api.patch<{ presence: Presence }>("/portal/presence", { online: true });
      setPresence(res.presence);
      toast("You're online. Add your live's details and go live when you're ready.");
    });

  const goLive = (d: LiveDetails) =>
    void run(async () => {
      await api.post("/portal/live/start", d);
      setPresence("live");
      toast("You're live. Customers on Astrorize are being told right now.");
    });

  const saveDetails = (d: LiveDetails) =>
    void run(async () => {
      const res = await api.patch<{ changed: boolean }>("/portal/live", d);
      setEditing(false);
      toast(res.changed ? "Live details updated. Viewers see them within a few seconds." : "Nothing changed.");
    });

  const endLive = () =>
    run(async () => {
      const res = await api.post<{ presence: Presence }>("/portal/live/end");
      setPresence(res.presence);
      setConfirmEnd(false);
      toast("Live ended. The room is closed and anyone still waiting has been told.");
    });

  const decide = (q: LiveRequest, decision: "accept" | "decline") =>
    run(async () => {
      await api.post(`/portal/live/requests/${q.id}/${decision}`);
      toast(
        decision === "accept"
          ? `Consult accepted at your standard rate of ${rate}. Only one active consult at a time.`
          : "Consult request rejected. The viewer returns to watching, charged ₹0.",
      );
    });

  const launchPoll = () =>
    run(async () => {
      await api.post("/portal/live/poll", { question, options: options.map((o) => o.trim()).filter(Boolean) });
      toast("Poll launched to the room. Single vote, no changes; results visible to you from launch.");
    });

  const hostControls = [
    {
      label: micOn ? "🎤 Mic on" : "🔇 Mic muted",
      bg: micOn ? "rgba(0,0,0,.45)" : "#ea580c",
      fg: "#fffdf8",
      pressed: micOn,
      click: () => {
        setMicOn(!micOn);
        toast(!micOn ? "Microphone live to the room." : "Microphone muted — viewers see a muted indicator.");
      },
    },
    {
      label: camOn ? "📹 Camera on" : "🚫 Camera off",
      bg: camOn ? "rgba(0,0,0,.45)" : "#ea580c",
      fg: "#fffdf8",
      pressed: camOn,
      click: () => {
        setCamOn(!camOn);
        toast(!camOn ? "Camera live." : "Camera off — the room falls back to your avatar and audio.");
      },
    },
    {
      label: privateOn ? "🔒 Private on" : "🔓 Private off",
      bg: privateOn ? "#fcd34d" : "rgba(0,0,0,.45)",
      fg: privateOn ? "#1c1917" : "#fffdf8",
      pressed: privateOn,
      click: () => {
        setPrivateOn(!privateOn);
        toast(
          !privateOn
            ? "Private consultation active — viewers see the banner, never the customer."
            : "Private consultation ended. The room returns to public.",
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Live controls" subtitle="One room per astrologer. No Fixed Session or Emergency consults from a live room." />

      <div className="mt-5 grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {!live && (
            <Panel warm className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-[26px] items-center rounded-full bg-stone-200 px-[11px] text-[11px] font-extrabold text-stone-600">○ NOT LIVE</span>
                <span className="text-[12.5px] text-stone-500">Customers see your room only while you&apos;re live.</span>
              </div>
              <h2 className="m-0 mt-4 mb-3 text-base font-bold">About this live</h2>
              <LiveDetailsForm idPrefix="go-live" initial={details} categories={data.categories} languages={data.languages} busy={busy} onSubmit={goLive}>
                {presence === "off" ? (
                  <>
                    <button type="button" onClick={goOnline} disabled={busy} className="h-11 rounded-xl bg-amber-500 px-5 text-[14px] font-bold text-ink">
                      Go online
                    </button>
                    <span className="text-[12.5px] text-stone-500">You&apos;re offline. Go online first, then go live.</span>
                  </>
                ) : presence === "busy" ? (
                  <p className="text-[12.5px] font-semibold text-stone-600">You&apos;re in a consultation. Finish it, then go live.</p>
                ) : (
                  <button type="submit" disabled={busy} className="h-11 rounded-xl bg-urgent px-6 text-[14px] font-bold text-white">
                    ● Go live
                  </button>
                )}
              </LiveDetailsForm>
            </Panel>
          )}
          {live && (
          <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-ink sm:aspect-video">
            <Image src={data.image} alt="" fill sizes="(min-width: 900px) 60vw, 100vw" className="object-cover" priority />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,.45)_0%,rgba(28,25,23,.08)_40%,rgba(28,25,23,.7)_100%)]" />
            <div className="absolute top-3.5 right-3.5 left-3.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold text-white">
                ● LIVE {data.elapsed}
              </span>
              <span className="inline-flex h-[26px] items-center rounded-full bg-[rgba(0,0,0,.45)] px-[11px] text-[11px] font-bold text-white">
                👁 {feed?.viewers ?? data.viewers} watching
              </span>
              <span className="inline-block h-[26px] max-w-full min-w-0 truncate rounded-full bg-[rgba(0,0,0,.45)] px-[11px] text-[11px] leading-[26px] font-bold text-white">
                {data.title || data.topic}
              </span>
              {privateOn && (
                <span className="inline-flex h-[26px] items-center rounded-full bg-amber-300 px-[11px] text-[11px] font-extrabold text-ink">
                  🔒 Private consult active
                </span>
              )}
            </div>
            <div className="absolute right-3.5 bottom-3.5 left-3.5 flex flex-col gap-2.5">
            {/* Gifts and what viewers are saying, as they see it: messages float up and fade */}
            <GiftStack gifts={giftsShown} />
            {feed && <LiveFeedOverlay lines={feed.chat} announce className="-mt-1 h-[120px]" />}
            <div className="flex flex-wrap items-center gap-2">
              {hostControls.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  aria-pressed={h.pressed}
                  onClick={h.click}
                  className="h-10 rounded-xl border border-[rgba(255,255,255,.2)] px-3 text-[13.5px] font-bold sm:px-4"
                  style={{ background: h.bg, color: h.fg }}
                >
                  {h.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                disabled={busy}
                className="ml-auto h-10 rounded-xl bg-urgent px-5 text-[13.5px] font-bold text-white"
              >
                End live
              </button>
            </div>
            </div>
          </div>
          )}

          {live && (
            <Panel className="mt-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-base font-bold [overflow-wrap:anywhere]">{data.title || data.topic}</h2>
                  {data.title && data.topic !== data.title && <p className="mt-0.5 text-[13px] text-stone-600 [overflow-wrap:anywhere]">{data.topic}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-semibold text-stone-600">
                    {data.category && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{data.category}</span>}
                    {data.language && <span className="rounded-full bg-cream px-2.5 py-1">{data.language}</span>}
                    {plannedLabel(data.durationMins) && <span className="rounded-full bg-cream px-2.5 py-1">About {plannedLabel(data.durationMins)} planned</span>}
                  </div>
                </div>
                <button type="button" onClick={() => setEditing(true)} className="h-9 rounded-[10px] border border-line bg-white px-3.5 text-[12.5px] font-bold">
                  Edit details
                </button>
              </div>
              <p className="mt-3 text-[11.5px] text-stone-500">You can change these while live — viewers see the update within a few seconds.</p>
            </Panel>
          )}

          <Panel className="relative mt-4 p-5">
            <h2 className="m-0 mb-3 text-base font-bold">Rate for this live</h2>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className="text-[11.5px] font-semibold text-stone-500">Standard rate</div>
                <b className="text-[22px] tabular-nums">{rate}</b>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] text-stone-500">
              Consults started from this room are charged at your standard rate — the same rate customers see on your profile.
            </p>
          </Panel>

          {live && (
            <div className="mt-4">
              <LiveQueuePeople queue={data.queue} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {live && (
          <Panel className="p-[18px]">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[15px] font-bold">Consult queue</h2>
              <span className="text-xs text-stone-500">{data.waiting} waiting</span>
            </div>
            <div className="mt-3 flex flex-col gap-[9px]">
              {data.requests.length === 0 && <p className="text-[12.5px] text-stone-500">No consult requests right now.</p>}
              {data.requests.map((q, i) => (
                <div
                  key={q.id}
                  className={`flex items-center gap-[9px] rounded-xl border px-3 py-2.5 ${
                    i === 0 ? "border-amber-200 bg-amber-50" : "border-line bg-white"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <b className="block text-[13px] tabular-nums">{q.alias}</b>
                    <span className="text-[11.5px] text-stone-500">
                      {q.kind === "private" ? `Private consultation · ${rate}` : "Public — on stage · consent given"}
                    </span>
                  </div>
                  {q.actionable && (
                    <>
                      <button
                        type="button"
                        onClick={() => decide(q, "decline")}
                        disabled={busy}
                        className="h-[30px] rounded-[9px] border border-line bg-white px-[11px] text-xs font-bold"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(q, "accept")}
                        disabled={busy}
                        className="h-[30px] rounded-[9px] bg-amber-500 px-[11px] text-xs font-bold text-ink"
                      >
                        Accept
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] text-stone-500">One active consult at a time.</p>
          </Panel>
          )}

          {live && <LiveGiftsPanel feed={feed} />}

          <LiveAnnouncements announcements={data.announcements} />

          {live && (
          <Panel className="p-[18px]">
            <h2 className="m-0 mb-3 text-[15px] font-bold">Moderation</h2>
            <div className="flex flex-wrap gap-[7px]">
              {MOD_ACTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toast(modMessage(label))}
                  className="h-8 rounded-full border border-line bg-white px-3 text-[12.5px] font-bold text-stone-600"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-[1.45] text-stone-500">
              Mutes and blocks are room-scoped. Deleting a message removes it from the transcript and is audited.
            </p>
          </Panel>
          )}

          <Panel className="p-[18px]">
            <h2 className="m-0 mb-1 text-[15px] font-bold">Launch a poll</h2>
            <p className="mb-3 text-xs text-stone-500">Up to six options. Single vote, no changes.</p>
            <div className="flex flex-col gap-[7px]">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                aria-label="Poll question"
                placeholder="Ask the room a question"
                maxLength={140}
                className="h-[42px] min-w-0 rounded-[11px] border border-line bg-white px-3 text-[13.5px] text-ink outline-none"
              />
              {options.map((o, i) => (
                <input
                  key={i}
                  value={o}
                  onChange={(e) => setOptions(options.map((x, n) => (n === i ? e.target.value : x)))}
                  aria-label={`Option ${i + 1}`}
                  placeholder={`Option ${i + 1}`}
                  maxLength={80}
                  className="h-[38px] min-w-0 rounded-[11px] border border-line bg-white px-3 text-[13px] text-stone-600 outline-none"
                />
              ))}
              {options.length < MAX_POLL_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setOptions([...options, ""])}
                  className="flex h-[38px] items-center rounded-[11px] border border-line bg-white px-3 text-left text-[13px] text-stone-600"
                >
                  ＋ Add option (max {MAX_POLL_OPTIONS})
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={launchPoll}
              disabled={busy}
              className="mt-3 h-[42px] w-full rounded-xl bg-amber-500 text-[13.5px] font-bold text-ink"
            >
              Launch poll
            </button>
          </Panel>
        </div>
      </div>

      {editing && live && (
        <Modal onClose={() => setEditing(false)} labelledBy="edit-live-heading" maxWidth={560}>
          <h2 id="edit-live-heading" className="m-0 mb-1 font-display text-[26px] font-semibold text-ink">
            Edit live details
          </h2>
          <p className="mb-4 text-[13px] text-stone-600">Your live keeps going. Viewers see the new details within a few seconds.</p>
          <LiveDetailsForm idPrefix="edit-live" initial={details} categories={data.categories} languages={data.languages} busy={busy} onSubmit={saveDetails}>
            <button type="button" onClick={() => setEditing(false)} className="ml-auto h-11 rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-ink">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="h-11 rounded-xl bg-amber-500 px-5 text-[14px] font-bold text-ink">
              Save changes
            </button>
          </LiveDetailsForm>
        </Modal>
      )}

      {confirmEnd && (
        <Modal onClose={() => setConfirmEnd(false)} labelledBy="end-live-title">
          <h2 id="end-live-title" className="m-0 font-display text-[26px] font-semibold text-ink">
            End this live?
          </h2>
          <p className="mt-2 text-[13.5px] leading-normal text-stone-600">
            The room closes for everyone watching
            {data.waiting > 0 ? `, and ${data.waiting === 1 ? "the 1 person" : `the ${data.waiting} people`} waiting in your consult queue leave it` : ""}. A
            consultation already in progress continues to its own end.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => setConfirmEnd(false)} className="h-11 rounded-xl border border-line bg-white px-5 text-[14px] font-bold text-ink">
              Keep going
            </button>
            <button type="button" onClick={endLive} disabled={busy} className="h-11 rounded-xl bg-urgent px-5 text-[14px] font-bold text-white">
              End live
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
