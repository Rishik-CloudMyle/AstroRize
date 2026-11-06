"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaWants } from "@/lib/media/zego-call";
import { ConsultChat, useConsultChat } from "./consult-chat";
import { useCallMedia, type CallMedia, type Speaker } from "./use-call-media";
import { RECORDING_NOTICE, RecordingBadge } from "../recording-notice";

// The consultation's own window, the same for the customer and the astrologer, one per mode:
//   chat  → a messaging window
//   voice → a voice-only call (the camera is never asked for), with a messages drawer
//   video → a video call (Video and Instant Call), with a messages drawer
// Full screen on phones; a centred stage on larger screens. Billing numbers are passed in by
// whoever opens it (the customer's meter, or the astrologer's clock).
//
// The call itself (room, devices, the other side's sound) lives outside this window
// (lib/media/call-session.ts): Minimise — or moving to another page — only closes the window; the call
// keeps running and re-opening the window shows the same streams again (no re-join, no re-publish).
//
// Billing starts only once BOTH sides have really joined: the call reports "joined"
// (POST <base>/joined) when this side is in the conversation — on a voice or video call once its
// own stream is published AND the other side's is playing; on a chat (or a call while voice/video
// isn't set up on AstroRize) as soon as the window is open. Until the server says billing started,
// the caller passes `waiting` and the window says so.
//
// `appLook` (the customer's side): below 1024px the window takes the customer mobile app's screens —
// a light Chat screen with the meter under its title bar, a light Voice screen with the big timer,
// and a full-bleed Video screen with the timer over the picture. The caller's badges, chips and
// alerts must then read on a light background below 1024px. Desktop is the same either way.

export type WindowKind = "chat" | "voice" | "video";

/** Instant Call is a voice-and-video call; otherwise the window follows the mode. */
export function windowKindOf(mode: string, instant: boolean): WindowKind {
  if (instant || mode === "video") return "video";
  return mode === "voice" ? "voice" : "chat";
}

const WANTS: Record<WindowKind, MediaWants> = {
  chat: { audio: false, video: false },
  voice: { audio: true, video: false },
  video: { audio: true, video: true },
};

export interface Peer {
  name: string;
  photo: string | null;
  initials: string;
}

/** Which look the window has below 1024px: the dark stage, or the app's light/dark call screens. */
type Look = "stage" | "light" | "dark";

export function SessionWindow({
  base,
  kind,
  active,
  peer,
  title,
  badges,
  clock,
  chips,
  alerts,
  ending,
  onEnd,
  onMinimise,
  endNote,
  appLook = false,
  waiting,
  onJoined,
}: {
  /** API path of this consultation for this side, e.g. "/consultations/ID" or "/portal/consultations/ID". */
  base: string;
  kind: WindowKind;
  /** The session is in progress (false once it has ended). */
  active: boolean;
  peer: Peer;
  /** "Video call", "Instant Call", … */
  title: string;
  badges?: ReactNode;
  /** The elapsed clock, e.g. "04:12". */
  clock: string;
  /** Cost / free time / time left. */
  chips?: ReactNode;
  /** Free-call reminder, low balance… */
  alerts?: ReactNode;
  ending: boolean;
  onEnd: () => void;
  onMinimise?: () => void;
  /** What ending now costs, shown where the devices couldn't be used. */
  endNote?: string;
  /** Below 1024px, the customer app's screens (see the note at the top). */
  appLook?: boolean;
  /** Billing hasn't started (the other side hasn't joined yet): what to tell this side. */
  waiting?: ReactNode;
  /** This side's "joined" was recorded (re-read the session: billing may have started). */
  onJoined?: () => void;
}) {
  // The call (and this side's "joined" report — see the note at the top) outlives this window.
  const media = useCallMedia({ base, wants: WANTS[kind], active, onJoined });
  // With no voice/video yet, the conversation is the chat: open it straight away on a call.
  const [drawer, setDrawer] = useState(false);
  const autoOpened = useRef(false);
  useEffect(() => {
    // Beside the stage on wide screens only; on a phone it would cover the call (the banner offers it).
    if (kind !== "chat" && media.notConfigured && !autoOpened.current && window.matchMedia("(min-width: 1024px)").matches) {
      autoOpened.current = true;
      setDrawer(true);
    }
  }, [kind, media.notConfigured]);
  const chatVisible = kind === "chat" || drawer;
  // Voice and video calls are recorded, audio only (both sides accepted the notice): the indicator
  // shows while the call is up, the notice itself until then.
  const recorded = kind !== "chat" && media.answer?.available === true && !!media.answer.recorded;
  const allBadges = (
    <>
      {recorded && media.mediaUp && <RecordingBadge />}
      {badges}
    </>
  );
  const { speaker, setSpeaker } = media;
  const chat = useConsultChat(base, true, chatVisible);
  const look: Look = !appLook ? "stage" : kind === "video" ? "dark" : "light";
  /** Classes that apply only with the app look (they are all max-lg: ones). */
  const L = (cls: string) => (appLook ? cls : "");
  /** …only on the app's light screens (Chat, Voice). */
  const LL = (cls: string) => (look === "light" ? cls : "");

  // Escape closes the drawer first; the window itself stays (ending is always a deliberate tap).
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  // Lock the page behind the window.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // On the app's Voice and Video screens the notices and alerts sit under the timer (below 1024px).
  const callScreen = appLook && kind !== "chat";
  const noticeBox = `mx-3 mt-2 rounded-xl border px-3.5 py-2.5 text-[13px] sm:mx-auto sm:w-full sm:max-w-[720px] ${L("max-lg:mx-4 max-lg:sm:w-auto")}`;
  const renderWaiting = (where: string) =>
    waiting ? (
      <div
        role="status"
        className={`${noticeBox} ${where} flex items-center gap-2.5 border-sky-300/40 bg-sky-300/10 text-sky-100 ${LL("max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:text-app-ink-2")}`}
      >
        <span className={`size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200/40 border-t-sky-100 ${LL("max-lg:border-app-line max-lg:border-t-app-selected")}`} aria-hidden="true" />
        <span>{waiting}</span>
      </div>
    ) : null;
  const renderNotice = (where: string) => {
    const box = `${noticeBox} ${where}`;
    return media.notConfigured ? (
    <div role="status" className={`${box} border-amber-300/40 bg-amber-300/10 leading-normal text-amber-100 ${LL("max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:text-app-ink-2")}`}>
      <b className={LL("max-lg:text-app-ink")}>{kind === "video" ? "Video" : "Voice"} isn&apos;t connected on AstroRize yet</b> — use the chat here. The timer and billing work as usual.
      {kind !== "chat" && !drawer && (
        <button type="button" onClick={() => setDrawer(true)} className={`ml-1.5 font-bold text-amber-300 underline ${LL("max-lg:text-app-accent")}`}>
          Open chat
        </button>
      )}
    </div>
  ) : media.offline || media.link === "reconnecting" ? (
    <div role="status" className={`${box} border-amber-300/40 bg-amber-300/10 text-amber-100 ${LL("max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:text-app-ink-2")}`}>
      <b className={LL("max-lg:text-app-ink")}>Reconnecting…</b> Your internet connection dropped. Stay on this screen.
    </div>
  ) : media.weakNetwork && media.link === "connected" ? (
    <div role="status" className={`${box} border-amber-300/40 bg-amber-300/10 text-amber-100 ${LL("max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:text-app-ink-2")}`}>
      <b className={LL("max-lg:text-app-ink")}>Weak connection.</b>{" "}
      {kind === "video" ? "The video quality is lowered automatically to keep the call going." : "The sound may break up — move closer to your Wi-Fi if you can."}
    </div>
  ) : media.answerFailed ? (
    <div role="alert" className={`${box} flex flex-wrap items-center gap-2 border-rose-300/40 bg-rose-400/10 text-rose-100 ${LL("max-lg:border-rose-200 max-lg:bg-app-error-bg max-lg:text-app-error")}`}>
      <span className="flex-1">Couldn&apos;t set up the call. Check your connection.</span>
      <button type="button" onClick={() => void media.reloadAnswer()} className={`rounded-lg bg-white/15 px-3 py-1.5 font-bold ${LL("max-lg:bg-app-surface")}`}>
        Try again
      </button>
    </div>
  ) : recorded && !media.mediaUp ? (
    <div role="note" className={`${box} border-white/15 bg-white/5 leading-normal text-stone-200 ${LL("max-lg:border-app-line max-lg:bg-app-surface max-lg:text-app-ink-2")}`}>
      <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-rose-500 align-middle" />
      {RECORDING_NOTICE}
    </div>
  ) : null;
  };

  // The app's call screens (Voice, Video): Minimise and Messages on top, then the big timer.
  const callHead =
    appLook && kind !== "chat" ? (
      <CallHead
        dark={kind === "video"}
        title={title}
        clock={clock}
        meter={
          <>
            {allBadges}
            {chips}
          </>
        }
        onMinimise={onMinimise}
        drawer={drawer}
        unread={chat.unread}
        onToggleDrawer={() => setDrawer((d) => !d)}
        waiting={!!waiting}
      >
        {renderWaiting("lg:hidden")}
        {renderNotice("lg:hidden")}
        {alerts && <div className="mx-4 mt-2 text-left lg:hidden">{alerts}</div>}
      </CallHead>
    ) : null;

  return (
    <div
      className={`fixed inset-0 z-[150] flex flex-col bg-[radial-gradient(120%_90%_at_50%_0%,#3b2a5e_0%,#1f1630_45%,#120d1c_100%)] text-line ${
        look === "dark"
          ? "max-lg:bg-none max-lg:bg-[#1c1917]"
          : look === "light"
            ? kind === "voice"
              ? "max-lg:bg-[linear-gradient(180deg,#efe7f4_0%,#f7f4ee_42%,#f7f4ee_100%)] max-lg:text-app-ink"
              : "max-lg:bg-none max-lg:bg-app-bg max-lg:text-app-ink"
            : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} with ${peer.name}`}
    >
      {/* Header: who, how long, and the way out */}
      <header className={`flex items-center gap-3 border-b border-white/10 px-3 py-2.5 sm:px-5 ${L("max-lg:hidden")}`}>
        <Avatar peer={peer} size={38} />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px] text-paper">{peer.name}</b>
          <span className="flex items-center gap-1.5 truncate text-[12px] text-stone-400">
            <span className="az-live-dot size-1.5 shrink-0 rounded-full bg-green-400" aria-hidden="true" />
            {title} · <span className="tabular-nums text-amber-200">{clock}</span>
          </span>
        </div>
        {onMinimise && (
          <button
            type="button"
            onClick={onMinimise}
            title="Keep this running and browse the site"
            className="h-9 shrink-0 rounded-full border border-white/15 px-3 text-[13px] font-bold text-stone-300 sm:px-3.5"
          >
            Minimise
          </button>
        )}
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          className="h-9 shrink-0 rounded-full bg-rose-600 px-4 text-[13px] font-bold text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {ending ? "Ending…" : "End"}
        </button>
      </header>

      {/* The app's Chat screen: title bar with End, then who and the meter (the clock on the right). */}
      {appLook && kind === "chat" && (
        <div className="shrink-0 bg-app-elev pt-[env(safe-area-inset-top)] lg:hidden">
          <div className="flex min-h-[52px] items-center justify-between gap-2 px-4 py-2">
            <b className="text-[16px] font-bold text-app-ink">{title}</b>
            <div className="flex items-center gap-2">
              {onMinimise && (
                <button
                  type="button"
                  onClick={onMinimise}
                  title="Keep this running and browse the site"
                  className="min-h-9 rounded-app-btn border border-app-line px-3 text-[13px] font-bold text-app-ink-2"
                >
                  Minimise
                </button>
              )}
              <button
                type="button"
                onClick={onEnd}
                disabled={ending}
                className="min-h-9 rounded-app-btn bg-app-error-bg px-4 text-[15px] font-bold text-app-error disabled:opacity-60"
              >
                {ending ? "Ending…" : "End"}
              </button>
            </div>
          </div>
          <div className="flex items-start justify-between gap-3 border-b border-app-line px-4 pt-1 pb-2.5">
            <div className="min-w-0">
              <b className="block truncate text-[16px] font-bold text-app-ink">{peer.name}</b>
              <div className="mt-1 flex flex-wrap gap-1">
                {allBadges}
                {chips}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <b className="block text-[18px] font-bold tracking-[.02em] text-app-ink tabular-nums" aria-label="Session time">
                {clock}
              </b>
              <span className="flex items-center justify-end gap-1 text-[11px] font-semibold text-app-success">
                <span className="az-live-dot size-1.5 rounded-full bg-app-success" aria-hidden="true" />
                {waiting ? "Waiting" : "Active"}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-wrap items-center justify-center gap-1.5 px-3 pt-2 sm:gap-2 ${L("max-lg:hidden")}`}>
        {allBadges}
        {chips}
      </div>
      {renderWaiting(callScreen ? "max-lg:hidden" : "")}
      {renderNotice(callScreen ? "max-lg:hidden" : "")}
      {alerts && <div className={`mx-3 mt-2 sm:mx-auto sm:w-full sm:max-w-[720px] ${L("max-lg:mx-4 max-lg:sm:w-auto")} ${callScreen ? "max-lg:hidden" : ""}`}>{alerts}</div>}

      <div className="relative flex min-h-0 flex-1">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {kind === "chat" ? (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-col">
              <ConsultChat chat={chat} peerName={peer.name} appLook={appLook} />
            </div>
          ) : kind === "voice" ? (
            <VoiceStage media={media} peer={peer} title={title} clock={clock} endNote={endNote} speaker={speaker} head={callHead} />
          ) : (
            <VideoStage media={media} peer={peer} title={title} endNote={endNote} head={callHead} />
          )}
        </main>

        {kind !== "chat" && drawer && (
          <aside
            aria-label="Messages"
            className={`absolute inset-x-0 bottom-0 z-10 flex h-[72%] flex-col rounded-t-[22px] border-t border-white/15 bg-[#1a1328] shadow-[0_-20px_40px_rgba(0,0,0,.4)] lg:static lg:h-auto lg:w-[360px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none ${L(
              "max-lg:rounded-t-app-modal max-lg:border-app-line max-lg:bg-app-elev max-lg:shadow-app-modal",
            )}`}
          >
            <div className={`flex items-center justify-between border-b border-white/10 px-4 py-2.5 ${L("max-lg:border-app-line")}`}>
              <b className={`text-[14px] text-paper ${L("max-lg:text-[16px] max-lg:text-app-ink")}`}>Messages</b>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className={`h-8 rounded-full px-3 text-[13px] font-bold text-stone-300 hover:bg-white/10 ${L("max-lg:text-app-accent max-lg:hover:bg-app-tint")}`}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ConsultChat chat={chat} peerName={peer.name} dense appLook={appLook} />
            </div>
          </aside>
        )}
      </div>

      {kind !== "chat" && (
        <Controls
          media={media}
          kind={kind}
          look={look}
          speaker={speaker}
          setSpeaker={setSpeaker}
          drawer={drawer}
          unread={chat.unread}
          onToggleDrawer={() => setDrawer((d) => !d)}
          onEnd={onEnd}
          ending={ending}
        />
      )}
    </div>
  );
}

function Avatar({ peer, size }: { peer: Peer; size: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-gold bg-plum text-paper"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {peer.photo ? (
        <Image src={peer.photo} alt="" fill unoptimized={!peer.photo.startsWith("/assets/")} sizes={`${size * 2}px`} className="object-cover" />
      ) : (
        <b>{peer.initials}</b>
      )}
    </span>
  );
}

/**
 * The top of the app's Voice and Video screens (below 1024px): Minimise and Messages, then
 * "Active session", the big timer and the meter (badges and chips).
 */
function CallHead({
  dark,
  title,
  clock,
  meter,
  onMinimise,
  drawer,
  unread,
  onToggleDrawer,
  waiting = false,
  children,
}: {
  dark: boolean;
  title: string;
  clock: string;
  meter: ReactNode;
  onMinimise?: () => void;
  drawer: boolean;
  unread: number;
  onToggleDrawer: () => void;
  /** Billing hasn't started yet (the other side hasn't joined). */
  waiting?: boolean;
  /** Notices and alerts, under the meter. */
  children?: ReactNode;
}) {
  const pill = dark
    ? "border-white/20 bg-black/25 text-[#f8f4ec]"
    : "border-app-line bg-app-surface text-app-ink-2";
  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-[max(10px,env(safe-area-inset-top))]">
        {onMinimise ? (
          <button
            type="button"
            onClick={onMinimise}
            title="Keep this running and browse the site"
            className={`min-h-9 rounded-app-chip border px-3.5 text-[13px] font-bold ${pill}`}
          >
            Minimise
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-pressed={drawer}
          aria-label={drawer ? "Hide messages" : unread > 0 ? `Messages, ${unread} new` : "Messages"}
          className={`relative grid size-11 place-items-center rounded-app-btn border ${pill}`}
        >
          <ChatIcon />
          {unread > 0 && (
            <span aria-hidden="true" className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-app-urgent px-1 text-[10px] leading-none font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
      <div className="mt-2 px-4 text-center">
        <div className={`inline-flex items-center gap-2 text-[12px] font-bold tracking-[.08em] uppercase ${dark ? "text-emerald-300" : "text-app-success"}`}>
          <span className={`az-live-dot size-2 rounded-full ${dark ? "bg-emerald-300" : "bg-app-success"}`} aria-hidden="true" />
          {waiting ? "Waiting to start" : "Active session"} · {title}
        </div>
        <div
          className={`mt-1 font-semibold leading-[1.05] tracking-[.04em] tabular-nums ${dark ? "text-[44px] text-[#fffdf8]" : "text-[52px] text-app-ink"}`}
          aria-label="Session time"
        >
          {clock}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1">{meter}</div>
      </div>
      {children}
    </div>
  );
}

/** Where the call stands, in words. */
function linkLabel(media: CallMedia, peerName: string, peerHere: boolean): string {
  if (media.notConfigured) return media.wants.video ? "Video isn't connected yet" : "Voice isn't connected yet";
  if (media.offline || media.link === "reconnecting") return "Reconnecting…";
  if (media.link === "failed") return "Couldn't connect";
  if (media.link === "connected") return peerHere ? "Connected" : `Waiting for ${peerName} to join…`;
  if (media.link === "connecting") return "Connecting…";
  return media.answer ? "Getting ready…" : "Setting up the call…";
}

/** The other side's sound is played by the call itself (it keeps playing while minimised); a tap when the browser blocks it. */
function SoundBlocked({ media, className = "" }: { media: CallMedia; className?: string }) {
  if (!media.audioBlocked) return null;
  return (
    <button type="button" onClick={media.resumeAudio} className={`rounded-full bg-amber-400 px-4 py-2 text-[13.5px] font-bold text-ink ${className}`}>
      Tap to turn on sound
    </button>
  );
}

const PROBLEM_TEXT: Record<string, { title: string; body: string }> = {
  denied: {
    title: "Access is blocked",
    body: "Your browser is blocking it for AstroRize. Click the camera or lock icon in the address bar (on a phone: browser settings → Site settings), choose Allow for the camera and microphone, then tap Try again.",
  },
  no_device: { title: "No device found", body: "We couldn't find a camera or microphone. Connect one (or check it's switched on), then tap Try again." },
  in_use: { title: "Device is busy", body: "Another app or tab is using your camera or microphone. Close it, then tap Try again." },
  insecure: { title: "Secure connection needed", body: "Calls only work on a secure (https) page. Reopen AstroRize from its normal address." },
  unsupported: { title: "This browser can't make calls", body: "Use a recent Chrome, Safari, Edge or Firefox to join voice and video calls." },
  unknown: { title: "Couldn't start your devices", body: "Something went wrong turning them on. Tap Try again." },
};

/** Before the browser prompt, and when it was refused: why we ask, and how to fix it. */
function DevicesCard({ media, video, peerName, endNote, light }: { media: CallMedia; video: boolean; peerName: string; endNote?: string; light: boolean }) {
  const p = media.permission;
  const problem = p !== "idle" && p !== "asking" && p !== "granted" ? PROBLEM_TEXT[p] : null;
  const what = video ? "camera and microphone" : "microphone";
  /** Light card on the app's Voice screen below 1024px. */
  const LT = (cls: string) => (light ? cls : "");
  const button = `mt-4 h-11 w-full rounded-xl bg-amber-400 text-[14.5px] font-bold text-ink ${LT("max-lg:rounded-app-btn max-lg:bg-app-primary max-lg:text-[15px]")}`;
  return (
    <div
      className={`mx-auto w-full max-w-[420px] rounded-[22px] border border-white/15 bg-white/[.06] p-5 text-center ${LT(
        "max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card",
      )}`}
    >
      <span className={`mx-auto grid size-12 place-items-center rounded-full bg-amber-400/15 text-amber-200 ${LT("max-lg:bg-app-tint-2 max-lg:text-app-accent")}`} aria-hidden="true">
        {video ? <CamIcon /> : <MicIcon />}
      </span>
      {problem ? (
        <>
          <b className={`mt-3 block text-[16px] text-paper ${LT("max-lg:text-app-ink")}`}>{problem.title}</b>
          <p className={`mt-1.5 text-[13.5px] leading-[1.55] text-stone-300 ${LT("max-lg:text-[13px] max-lg:text-app-ink-2")}`}>{problem.body}</p>
          {endNote && <p className={`mt-2 text-[12.5px] leading-normal text-stone-400 ${LT("max-lg:text-[12px] max-lg:text-app-ink-3")}`}>{endNote}</p>}
          <button type="button" onClick={() => void media.allow()} className={button}>
            Try again
          </button>
        </>
      ) : (
        <>
          <b className={`mt-3 block text-[16px] text-paper ${LT("max-lg:text-app-ink")}`}>Turn on your {what}</b>
          <p className={`mt-1.5 text-[13.5px] leading-[1.55] text-stone-300 ${LT("max-lg:text-[13px] max-lg:text-app-ink-2")}`}>
            {media.notConfigured
              ? `Check how you look before ${peerName} can see you. Video isn't connected on AstroRize yet, so this preview stays on your device — nothing is sent.`
              : video
                ? `This is a video consultation: ${peerName} will see and hear you. Your browser will ask — choose Allow.`
                : `So ${peerName} can hear you. Only the microphone is used — your camera is never turned on for a voice call.`}
          </p>
          <button type="button" onClick={() => void media.allow()} disabled={p === "asking"} className={`${button} disabled:opacity-60`}>
            {p === "asking" ? "Waiting for your browser…" : media.notConfigured ? "Check my camera" : `Allow ${what}`}
          </button>
        </>
      )}
    </div>
  );
}

function VoiceStage({
  media,
  peer,
  title,
  clock,
  endNote,
  speaker,
  head,
}: {
  media: CallMedia;
  peer: Peer;
  title: string;
  clock: string;
  endNote?: string;
  speaker: Speaker;
  /** The app look's top (below 1024px): Minimise, Messages, the big timer. */
  head: ReactNode;
}) {
  const peerHere = !!media.remote;
  const speaking = peerHere && media.levels.peer > 8;
  const needDevices = media.available && media.permission !== "granted";
  const app = !!head;
  return (
    <div className={`flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-6 text-center ${app ? "max-lg:justify-start max-lg:gap-0 max-lg:px-0 max-lg:pt-0 max-lg:pb-2" : ""}`}>
      {head && <div className="w-full shrink-0 lg:hidden">{head}</div>}
      {needDevices ? (
        <div className={app ? "w-full max-lg:my-auto max-lg:px-4 max-lg:py-4" : "w-full"}>
          <DevicesCard media={media} video={false} peerName={peer.name} endNote={endNote} light={app} />
        </div>
      ) : (
        <>
          <div className={`relative grid size-[184px] place-items-center ${app ? "max-lg:hidden" : ""}`}>
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-full bg-amber-300/20 transition-transform duration-200 motion-reduce:transition-none ${speaking ? "scale-100 motion-safe:animate-[azHalo_1.6s_ease-in-out_infinite]" : "scale-75"}`}
            />
            <span aria-hidden="true" className={`absolute inset-4 rounded-full border-2 ${speaking ? "border-amber-300" : "border-white/15"}`} />
            <Avatar peer={peer} size={132} />
          </div>
          <div className={app ? "max-lg:hidden" : ""}>
            <b className="block font-name text-[22px] text-paper">{peer.name}</b>
            <span className="mt-1 block text-[13px] text-stone-400" aria-live="polite">
              {linkLabel(media, peer.name, peerHere)}
              {speaking && " · speaking"}
            </span>
            <div className="mt-3 text-[44px] font-bold leading-none tabular-nums text-paper" aria-hidden="true">
              {clock}
            </div>
          </div>
          {/* The app's Voice screen: the person, under the timer. */}
          {app && (
            <div className="flex flex-1 flex-col items-center justify-center px-5 pt-6 lg:hidden">
              <span
                className={`grid size-20 place-items-center rounded-full bg-[linear-gradient(165deg,#5b3d8f,#f59e0b)] p-0.5 ${speaking ? "motion-safe:animate-[azHalo_1.6s_ease-in-out_infinite]" : ""}`}
              >
                <Avatar peer={peer} size={76} />
              </span>
              <b className="mt-2.5 block text-[16px] font-bold text-app-ink">{peer.name}</b>
              <span className="mt-1 block text-[13px] text-app-ink-2" aria-live="polite">
                {title} · {linkLabel(media, peer.name, peerHere)}
                {speaking && " · speaking"}
              </span>
              <span className="mt-2.5 block text-[12px] text-app-ink-3">
                {media.micMuted ? "Microphone off" : "Microphone on"} · {speaker.off ? "Speaker off" : "Speaker on"}
              </span>
            </div>
          )}
          {media.link === "failed" && <FailedLine media={media} light={app} />}
          <SoundBlocked media={media} className="mt-3" />
        </>
      )}
    </div>
  );
}

/** `light`: on the app's light Voice screen below 1024px. */
function FailedLine({ media, light = false }: { media: CallMedia; light?: boolean }) {
  return (
    <div
      role="alert"
      className={`max-w-[420px] rounded-xl border border-rose-300/40 bg-rose-400/10 px-3.5 py-2.5 text-[13px] text-rose-100 ${
        light ? "max-lg:mx-4 max-lg:border-rose-200 max-lg:bg-app-error-bg max-lg:text-app-error" : ""
      }`}
    >
      {media.linkProblem}
      <button type="button" onClick={media.retryJoin} className="ml-2 font-bold underline">
        Try again
      </button>
    </div>
  );
}

function VideoStage({
  media,
  peer,
  title,
  endNote,
  head,
}: {
  media: CallMedia;
  peer: Peer;
  title: string;
  endNote?: string;
  /** The app look's top (below 1024px), laid over the picture. */
  head: ReactNode;
}) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const peerHere = !!media.remote;
  const showPeerVideo = peerHere && !media.remoteCameraOff;
  const app = !!head;

  // The picture only (muted): the sound is played by the call, so it carries on while minimised.
  // Re-opening the window attaches the same stream again — nothing is re-published.
  useEffect(() => {
    const el = remoteRef.current;
    if (!el) return;
    el.srcObject = media.remote;
    if (media.remote) el.play().catch(() => {});
  }, [media.remote]);
  useEffect(() => {
    const el = localRef.current;
    if (el) el.srcObject = media.preview;
  }, [media.preview]);

  const needDevices = media.permission !== "granted";

  return (
    <div className={`relative flex h-full min-h-0 flex-col p-0 sm:p-4 ${app ? "max-lg:sm:p-0" : ""}`}>
      <div
        className={`relative mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col overflow-hidden bg-black/40 sm:rounded-[24px] sm:border sm:border-white/10 ${
          app ? "max-lg:bg-transparent max-lg:sm:rounded-none max-lg:sm:border-0" : ""
        }`}
      >
        {/* The other side, large */}
        <video ref={remoteRef} autoPlay playsInline muted className={`absolute inset-0 size-full object-cover ${showPeerVideo ? "" : "invisible"}`} />
        {!showPeerVideo && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-6 text-center ${
              app ? "max-lg:pt-[calc(env(safe-area-inset-top)+190px)] max-lg:pb-[130px]" : ""
            }`}
          >
            {needDevices && media.captureAllowed ? (
              <DevicesCard media={media} video peerName={peer.name} endNote={endNote} light={false} />
            ) : (
              <>
                <Avatar peer={peer} size={112} />
                <b className="font-name text-[20px] text-paper">{peer.name}</b>
                <span className="text-[13px] text-stone-400" aria-live="polite">
                  {peerHere && media.remoteCameraOff ? `${peer.name} turned their camera off` : linkLabel(media, peer.name, peerHere)}
                </span>
                {media.link === "failed" && <FailedLine media={media} />}
              </>
            )}
          </div>
        )}
        {/* The app's Video screen: the timer and who it is, over the top of the picture. */}
        {head && (
          <div className="absolute inset-x-0 top-0 z-[3] bg-[linear-gradient(180deg,rgba(12,11,9,.62)_0%,rgba(12,11,9,0)_100%)] pb-6 text-[#f8f4ec] lg:hidden">
            {head}
            {showPeerVideo && (
              <div className="mt-2 px-4 text-center">
                <b className="block text-[16px] font-bold text-[#fffdf8]">{peer.name}</b>
                <span className="text-[13px] text-[#d6d3d1]">
                  {title} · {linkLabel(media, peer.name, peerHere)}
                </span>
              </div>
            )}
          </div>
        )}
        <SoundBlocked
          media={media}
          className={`absolute left-1/2 top-4 z-[2] -translate-x-1/2 ${app ? "max-lg:top-auto max-lg:bottom-[140px] max-lg:z-[4]" : ""}`}
        />

        {/* Me, small and mirrored */}
        {media.preview && (
          <div
            className={`absolute bottom-3 right-3 z-[2] aspect-[3/4] w-[96px] overflow-hidden rounded-2xl border-2 border-white/30 bg-stone-900 shadow-lg sm:w-[150px] sm:aspect-video ${
              app ? "max-lg:bottom-[calc(env(safe-area-inset-bottom)+124px)] max-lg:z-[4] max-lg:rounded-xl max-lg:border max-lg:border-white/35 max-lg:sm:aspect-[3/4] max-lg:sm:w-[120px]" : ""
            }`}
          >
            <video ref={localRef} autoPlay playsInline muted className={`size-full -scale-x-100 object-cover ${media.cameraOff ? "invisible" : ""}`} />
            {media.cameraOff && <span className="absolute inset-0 grid place-items-center text-[11.5px] font-bold text-stone-300">Camera off</span>}
            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {media.notConfigured ? "Your preview" : "You"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Controls({
  media,
  kind,
  look,
  speaker,
  setSpeaker,
  drawer,
  unread,
  onToggleDrawer,
  onEnd,
  ending,
}: {
  media: CallMedia;
  kind: WindowKind;
  look: Look;
  speaker: Speaker;
  setSpeaker: (update: (s: Speaker) => Speaker) => void;
  drawer: boolean;
  unread: number;
  onToggleDrawer: () => void;
  onEnd: () => void;
  ending: boolean;
}) {
  const hasLocal = !!media.preview;
  const voice = kind === "voice";
  const app = look !== "stage";
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2.5 border-t border-white/10 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:gap-3.5 ${
        look === "light"
          ? "max-lg:flex-nowrap max-lg:gap-[18px] max-lg:border-0 max-lg:px-4 max-lg:pt-4 max-lg:pb-[max(24px,env(safe-area-inset-bottom))] max-lg:sm:gap-[18px]"
          : look === "dark"
            ? "max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[4] max-lg:flex-nowrap max-lg:gap-2.5 max-lg:border-0 max-lg:bg-[linear-gradient(0deg,rgba(12,11,9,.72)_0%,rgba(12,11,9,0)_100%)] max-lg:px-3 max-lg:pt-6 max-lg:pb-[max(24px,env(safe-area-inset-bottom))] max-lg:sm:gap-4"
            : ""
      }`}
    >
      <RoundButton look={look} short={media.micMuted ? "Unmute" : "Mute"} label={media.micMuted ? "Unmute microphone" : "Mute microphone"} pressed={media.micMuted} disabled={!hasLocal} onClick={media.toggleMic}>
        {media.micMuted ? <MicOffIcon /> : <MicIcon />}
      </RoundButton>
      {!voice && (
        <RoundButton look={look} short={media.cameraOff ? "Off" : "Camera"} label={media.cameraOff ? "Turn camera on" : "Turn camera off"} pressed={media.cameraOff} disabled={!hasLocal} onClick={media.toggleCamera}>
          {media.cameraOff ? <CamOffIcon /> : <CamIcon />}
        </RoundButton>
      )}
      {!voice && media.canSwitchCamera && (
        <RoundButton look={look} short="Flip" label="Switch camera" disabled={!hasLocal} onClick={() => void media.switchCamera()}>
          <SwitchIcon />
        </RoundButton>
      )}
      <RoundButton
        look={look}
        short="Speaker"
        label={speaker.off ? "Turn speaker on" : "Turn speaker off"}
        pressed={speaker.off}
        disabled={!media.remote}
        onClick={() => setSpeaker((s) => ({ ...s, off: !s.off }))}
      >
        {speaker.off ? <SpeakerOffIcon /> : <SpeakerIcon />}
      </RoundButton>
      <label className={`${media.remote ? "md:flex" : ""} hidden items-center gap-2 text-[12px] text-stone-400 ${app ? "max-lg:hidden" : ""}`}>
        <span className="sr-only">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={speaker.volume}
          disabled={!media.remote || speaker.off}
          onChange={(e) => setSpeaker((s) => ({ ...s, volume: Number(e.target.value) }))}
          className="w-24 accent-amber-400"
          aria-label="Volume"
        />
      </label>
      {/* With the app look, Messages sits at the top of the screen below 1024px. */}
      <span className={app ? "contents max-lg:hidden" : "contents"}>
        <RoundButton look="stage" label={drawer ? "Hide messages" : "Messages"} pressed={drawer} onClick={onToggleDrawer} badge={unread}>
          <ChatIcon />
        </RoundButton>
      </span>
      <button
        type="button"
        onClick={onEnd}
        disabled={ending}
        aria-label="End consultation"
        className={`grid size-14 place-items-center rounded-full bg-rose-600 text-white shadow-[0_10px_24px_rgba(190,18,60,.35)] hover:bg-rose-700 disabled:opacity-60 ${
          app ? "max-lg:flex max-lg:size-16 max-lg:shrink-0 max-lg:flex-col max-lg:gap-0.5 max-lg:bg-app-error max-lg:shadow-none max-lg:min-[380px]:size-[72px]" : ""
        }`}
      >
        <svg viewBox="0 0 24 24" className={`size-6 rotate-[135deg] ${app ? "max-lg:size-[26px]" : ""}`} fill="currentColor" aria-hidden="true">
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
        </svg>
        {app && (
          <span aria-hidden="true" className="text-[10px] font-bold lg:hidden">
            {ending ? "Ending…" : "End"}
          </span>
        )}
      </button>
    </div>
  );
}

function RoundButton({
  label,
  short,
  look = "stage",
  pressed,
  disabled,
  onClick,
  badge = 0,
  children,
}: {
  label: string;
  /** The word under the icon on the app's call screens (below 1024px). */
  short?: string;
  look?: Look;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}) {
  const app =
    look === "light"
      ? `max-lg:flex max-lg:size-16 max-lg:shrink-0 max-lg:flex-col max-lg:gap-0.5 max-lg:border-0 ${pressed ? "max-lg:bg-app-tint-2 max-lg:text-app-active" : "max-lg:bg-app-surface max-lg:text-app-ink max-lg:shadow-app-card"}`
      : look === "dark"
        ? `max-lg:flex max-lg:size-14 max-lg:shrink-0 max-lg:flex-col max-lg:gap-0.5 max-lg:border-0 max-lg:min-[400px]:size-16 ${pressed ? "max-lg:bg-amber-500/30 max-lg:text-amber-200" : "max-lg:bg-white/12 max-lg:text-[#f8f4ec]"}`
        : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`relative grid size-12 place-items-center rounded-full border transition-colors disabled:opacity-40 ${
        pressed ? "border-white bg-white text-ink" : "border-white/15 bg-white/10 text-paper hover:bg-white/20"
      } ${app}`}
    >
      {children}
      {short && look !== "stage" && (
        <span aria-hidden="true" className="text-[10px] font-bold tracking-[.02em] lg:hidden">
          {short}
        </span>
      )}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-ink">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

const icon = "size-[22px]";
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" />
    </svg>
  );
}
function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </svg>
  );
}
function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <path d="M10 6h4a2 2 0 0 1 2 2v4m0 4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M16 10l5-3v10l-3-1.8M3 3l18 18" />
    </svg>
  );
}
function SwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <path d="M4 8h12l-3-3M20 16H8l3 3" />
    </svg>
  );
}
function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}
function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} {...stroke} aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
