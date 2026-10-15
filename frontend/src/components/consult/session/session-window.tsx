"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaWants } from "@/lib/media/zego-call";
import { ConsultChat, useConsultChat } from "./consult-chat";
import { useCallMedia, type CallMedia } from "./use-call-media";

// The consultation's own window, the same for the customer and the astrologer, one per mode:
//   chat  → a messaging window
//   voice → a voice-only call (the camera is never asked for), with a messages drawer
//   video → a video call (Video and Instant Call), with a messages drawer
// Full screen on phones; a centred stage on larger screens. Billing numbers are passed in by
// whoever opens it (the customer's meter, or the astrologer's clock).

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

/** The other side's sound on this device. */
interface Speaker {
  off: boolean;
  volume: number;
}

export interface Peer {
  name: string;
  photo: string | null;
  initials: string;
}

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
}) {
  const media = useCallMedia({ base, wants: WANTS[kind], active });
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
  const [speaker, setSpeaker] = useState<Speaker>({ off: false, volume: 1 });
  const chat = useConsultChat(base, true, chatVisible);

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

  const notice = media.notConfigured ? (
    <div role="status" className="mx-3 mt-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3.5 py-2.5 text-[13px] leading-normal text-amber-100 sm:mx-auto sm:w-full sm:max-w-[720px]">
      <b>Voice/video isn&apos;t connected on Astrorize yet</b> — use the chat here. The timer and billing work as usual.
      {kind !== "chat" && !drawer && (
        <button type="button" onClick={() => setDrawer(true)} className="ml-1.5 font-bold text-amber-300 underline">
          Open chat
        </button>
      )}
    </div>
  ) : media.offline || media.link === "reconnecting" ? (
    <div role="status" className="mx-3 mt-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3.5 py-2.5 text-[13px] text-amber-100 sm:mx-auto sm:w-full sm:max-w-[720px]">
      <b>Reconnecting…</b> Your internet connection dropped. Stay on this screen.
    </div>
  ) : media.answerFailed ? (
    <div role="alert" className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-300/40 bg-rose-400/10 px-3.5 py-2.5 text-[13px] text-rose-100 sm:mx-auto sm:w-full sm:max-w-[720px]">
      <span className="flex-1">Couldn&apos;t set up the call. Check your connection.</span>
      <button type="button" onClick={() => void media.reloadAnswer()} className="rounded-lg bg-white/15 px-3 py-1.5 font-bold">
        Try again
      </button>
    </div>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-[radial-gradient(120%_90%_at_50%_0%,#3b2a5e_0%,#1f1630_45%,#120d1c_100%)] text-line"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} with ${peer.name}`}
    >
      {/* Header: who, how long, and the way out */}
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5 sm:px-5">
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

      <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 pt-2 sm:gap-2">
        {badges}
        {chips}
      </div>
      {notice}
      {alerts && <div className="mx-3 mt-2 sm:mx-auto sm:w-full sm:max-w-[720px]">{alerts}</div>}

      <div className="relative flex min-h-0 flex-1">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {kind === "chat" ? (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-col">
              <ConsultChat chat={chat} peerName={peer.name} />
            </div>
          ) : kind === "voice" ? (
            <VoiceStage media={media} peer={peer} clock={clock} endNote={endNote} speaker={speaker} />
          ) : (
            <VideoStage media={media} peer={peer} endNote={endNote} speaker={speaker} />
          )}
        </main>

        {kind !== "chat" && drawer && (
          <aside
            aria-label="Messages"
            className="absolute inset-x-0 bottom-0 z-10 flex h-[72%] flex-col rounded-t-[22px] border-t border-white/15 bg-[#1a1328] shadow-[0_-20px_40px_rgba(0,0,0,.4)] lg:static lg:h-auto lg:w-[360px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <b className="text-[14px] text-paper">Messages</b>
              <button type="button" onClick={() => setDrawer(false)} className="h-8 rounded-full px-3 text-[13px] font-bold text-stone-300 hover:bg-white/10">
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ConsultChat chat={chat} peerName={peer.name} dense />
            </div>
          </aside>
        )}
      </div>

      {kind !== "chat" && (
        <Controls media={media} kind={kind} speaker={speaker} setSpeaker={setSpeaker} drawer={drawer} unread={chat.unread} onToggleDrawer={() => setDrawer((d) => !d)} onEnd={onEnd} ending={ending} />
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

/** Where the call stands, in words. */
function linkLabel(media: CallMedia, peerName: string, peerHere: boolean): string {
  if (media.notConfigured) return media.wants.video ? "Video isn't connected yet" : "Voice isn't connected yet";
  if (media.offline || media.link === "reconnecting") return "Reconnecting…";
  if (media.link === "failed") return "Couldn't connect";
  if (media.link === "connected") return peerHere ? "Connected" : `Waiting for ${peerName} to join…`;
  if (media.link === "connecting") return "Connecting…";
  return media.answer ? "Getting ready…" : "Setting up the call…";
}

/** Plays the other side's audio (voice calls); offers a tap when the browser blocks autoplay. */
function RemoteAudio({ stream, muted, volume }: { stream: MediaStream | null; muted: boolean; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().then(() => setBlocked(false), () => setBlocked(true));
  }, [stream]);
  useEffect(() => {
    if (ref.current) {
      ref.current.muted = muted;
      ref.current.volume = volume;
    }
  }, [muted, volume]);
  return (
    <>
      <audio ref={ref} autoPlay />
      {blocked && (
        <button
          type="button"
          onClick={() => ref.current?.play().then(() => setBlocked(false), () => {})}
          className="mt-3 rounded-full bg-amber-400 px-4 py-2 text-[13.5px] font-bold text-ink"
        >
          Tap to turn on sound
        </button>
      )}
    </>
  );
}

const PROBLEM_TEXT: Record<string, { title: string; body: string }> = {
  denied: {
    title: "Access is blocked",
    body: "Your browser is blocking it for Astrorize. Click the camera or lock icon in the address bar (on a phone: browser settings → Site settings), choose Allow for the camera and microphone, then tap Try again.",
  },
  no_device: { title: "No device found", body: "We couldn't find a camera or microphone. Connect one (or check it's switched on), then tap Try again." },
  in_use: { title: "Device is busy", body: "Another app or tab is using your camera or microphone. Close it, then tap Try again." },
  insecure: { title: "Secure connection needed", body: "Calls only work on a secure (https) page. Reopen Astrorize from its normal address." },
  unsupported: { title: "This browser can't make calls", body: "Use a recent Chrome, Safari, Edge or Firefox to join voice and video calls." },
  unknown: { title: "Couldn't start your devices", body: "Something went wrong turning them on. Tap Try again." },
};

/** Before the browser prompt, and when it was refused: why we ask, and how to fix it. */
function DevicesCard({ media, video, peerName, endNote }: { media: CallMedia; video: boolean; peerName: string; endNote?: string }) {
  const p = media.permission;
  const problem = p !== "idle" && p !== "asking" && p !== "granted" ? PROBLEM_TEXT[p] : null;
  const what = video ? "camera and microphone" : "microphone";
  return (
    <div className="mx-auto w-full max-w-[420px] rounded-[22px] border border-white/15 bg-white/[.06] p-5 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-400/15 text-amber-200" aria-hidden="true">
        {video ? <CamIcon /> : <MicIcon />}
      </span>
      {problem ? (
        <>
          <b className="mt-3 block text-[16px] text-paper">{problem.title}</b>
          <p className="mt-1.5 text-[13.5px] leading-[1.55] text-stone-300">{problem.body}</p>
          {endNote && <p className="mt-2 text-[12.5px] leading-normal text-stone-400">{endNote}</p>}
          <button type="button" onClick={() => void media.allow()} className="mt-4 h-11 w-full rounded-xl bg-amber-400 text-[14.5px] font-bold text-ink">
            Try again
          </button>
        </>
      ) : (
        <>
          <b className="mt-3 block text-[16px] text-paper">Turn on your {what}</b>
          <p className="mt-1.5 text-[13.5px] leading-[1.55] text-stone-300">
            {media.notConfigured
              ? `Check how you look before ${peerName} can see you. Video isn't connected on Astrorize yet, so this preview stays on your device — nothing is sent.`
              : video
                ? `This is a video consultation: ${peerName} will see and hear you. Your browser will ask — choose Allow.`
                : `So ${peerName} can hear you. Only the microphone is used — your camera is never turned on for a voice call.`}
          </p>
          <button
            type="button"
            onClick={() => void media.allow()}
            disabled={p === "asking"}
            className="mt-4 h-11 w-full rounded-xl bg-amber-400 text-[14.5px] font-bold text-ink disabled:opacity-60"
          >
            {p === "asking" ? "Waiting for your browser…" : media.notConfigured ? "Check my camera" : `Allow ${what}`}
          </button>
        </>
      )}
    </div>
  );
}

function VoiceStage({ media, peer, clock, endNote, speaker }: { media: CallMedia; peer: Peer; clock: string; endNote?: string; speaker: Speaker }) {
  const peerHere = !!media.remote;
  const speaking = peerHere && media.levels.peer > 8;
  const needDevices = media.available && media.permission !== "granted";
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-6 text-center">
      {needDevices ? (
        <DevicesCard media={media} video={false} peerName={peer.name} endNote={endNote} />
      ) : (
        <>
          <div className="relative grid size-[184px] place-items-center">
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-full bg-amber-300/20 transition-transform duration-200 motion-reduce:transition-none ${speaking ? "scale-100 motion-safe:animate-[azHalo_1.6s_ease-in-out_infinite]" : "scale-75"}`}
            />
            <span aria-hidden="true" className={`absolute inset-4 rounded-full border-2 ${speaking ? "border-amber-300" : "border-white/15"}`} />
            <Avatar peer={peer} size={132} />
          </div>
          <div>
            <b className="block font-name text-[22px] text-paper">{peer.name}</b>
            <span className="mt-1 block text-[13px] text-stone-400" aria-live="polite">
              {linkLabel(media, peer.name, peerHere)}
              {speaking && " · speaking"}
            </span>
            <div className="mt-3 text-[44px] font-bold leading-none tabular-nums text-paper" aria-hidden="true">
              {clock}
            </div>
          </div>
          {media.link === "failed" && <FailedLine media={media} />}
          <RemoteAudio stream={media.remote} muted={speaker.off} volume={speaker.volume} />
        </>
      )}
    </div>
  );
}

function FailedLine({ media }: { media: CallMedia }) {
  return (
    <div role="alert" className="max-w-[420px] rounded-xl border border-rose-300/40 bg-rose-400/10 px-3.5 py-2.5 text-[13px] text-rose-100">
      {media.linkProblem}
      <button type="button" onClick={media.retryJoin} className="ml-2 font-bold underline">
        Try again
      </button>
    </div>
  );
}

function VideoStage({ media, peer, endNote, speaker }: { media: CallMedia; peer: Peer; endNote?: string; speaker: Speaker }) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const peerHere = !!media.remote;
  const showPeerVideo = peerHere && !media.remoteCameraOff;

  useEffect(() => {
    const el = remoteRef.current;
    if (!el) return;
    el.srcObject = media.remote;
    if (media.remote) el.play().then(() => setBlocked(false), () => setBlocked(true));
  }, [media.remote]);
  useEffect(() => {
    if (remoteRef.current) {
      remoteRef.current.muted = speaker.off;
      remoteRef.current.volume = speaker.volume;
    }
  }, [speaker]);
  useEffect(() => {
    const el = localRef.current;
    if (el) el.srcObject = media.preview;
  }, [media.preview]);

  const needDevices = media.permission !== "granted";

  return (
    <div className="relative flex h-full min-h-0 flex-col p-0 sm:p-4">
      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col overflow-hidden bg-black/40 sm:rounded-[24px] sm:border sm:border-white/10">
        {/* The other side, large */}
        <video ref={remoteRef} autoPlay playsInline className={`absolute inset-0 size-full object-cover ${showPeerVideo ? "" : "invisible"}`} />
        {!showPeerVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-6 text-center">
            {needDevices && media.captureAllowed ? (
              <DevicesCard media={media} video peerName={peer.name} endNote={endNote} />
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
        {blocked && (
          <button
            type="button"
            onClick={() => remoteRef.current?.play().then(() => setBlocked(false), () => {})}
            className="absolute left-1/2 top-4 z-[2] -translate-x-1/2 rounded-full bg-amber-400 px-4 py-2 text-[13.5px] font-bold text-ink"
          >
            Tap to turn on sound
          </button>
        )}

        {/* Me, small and mirrored */}
        {media.preview && (
          <div className="absolute bottom-3 right-3 z-[2] aspect-[3/4] w-[96px] overflow-hidden rounded-2xl border-2 border-white/30 bg-stone-900 shadow-lg sm:w-[150px] sm:aspect-video">
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 border-t border-white/10 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:gap-3.5">
      <RoundButton label={media.micMuted ? "Unmute microphone" : "Mute microphone"} pressed={media.micMuted} disabled={!hasLocal} onClick={media.toggleMic}>
        {media.micMuted ? <MicOffIcon /> : <MicIcon />}
      </RoundButton>
      {!voice && (
        <RoundButton label={media.cameraOff ? "Turn camera on" : "Turn camera off"} pressed={media.cameraOff} disabled={!hasLocal} onClick={media.toggleCamera}>
          {media.cameraOff ? <CamOffIcon /> : <CamIcon />}
        </RoundButton>
      )}
      {!voice && media.canSwitchCamera && (
        <RoundButton label="Switch camera" disabled={!hasLocal} onClick={() => void media.switchCamera()}>
          <SwitchIcon />
        </RoundButton>
      )}
      <RoundButton
        label={speaker.off ? "Turn speaker on" : "Turn speaker off"}
        pressed={speaker.off}
        disabled={!media.remote}
        onClick={() => setSpeaker((s) => ({ ...s, off: !s.off }))}
      >
        {speaker.off ? <SpeakerOffIcon /> : <SpeakerIcon />}
      </RoundButton>
      <label className={`${media.remote ? "md:flex" : ""} hidden items-center gap-2 text-[12px] text-stone-400`}>
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
      <RoundButton label={drawer ? "Hide messages" : "Messages"} pressed={drawer} onClick={onToggleDrawer} badge={unread}>
        <ChatIcon />
      </RoundButton>
      <button
        type="button"
        onClick={onEnd}
        disabled={ending}
        aria-label="End consultation"
        className="grid size-14 place-items-center rounded-full bg-rose-600 text-white shadow-[0_10px_24px_rgba(190,18,60,.35)] hover:bg-rose-700 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="size-6 rotate-[135deg]" fill="currentColor" aria-hidden="true">
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
        </svg>
      </button>
    </div>
  );
}

function RoundButton({
  label,
  pressed,
  disabled,
  onClick,
  badge = 0,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}) {
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
      }`}
    >
      {children}
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
