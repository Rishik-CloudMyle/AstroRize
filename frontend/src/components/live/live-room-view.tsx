"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Astrologer, LiveGift, LiveRoom, Settlement } from "@/lib/types";
import { ApiError, api } from "@/lib/api/client";
import { reportContactAttempt } from "@/lib/contact-attempt";
import { contactBlockedNotice, findContactDetails } from "@/lib/contact-filter";
import { discountLabel, rupee } from "@/lib/format";
import { consultationActions, useOpenConsultation } from "@/lib/consultation-store";
import { useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import { recheckAvailability, useFreshAstrologer } from "../astrologer/use-fresh-astrologer";
import { ConsultBlockedNote, blockedHint, useConsultGate } from "../consult/consult-gate";
import { FROZEN_HINT } from "../consult/consult-lock";
import { IconGift, IconMore, IconPhone } from "../mobile/icons";
import { SHEET_PANEL, SHEET_SCRIM, SheetHandle } from "../mobile/sheet";
import { GiftStack, useGiftShow } from "./gift-burst";
import GiftPanel from "./gift-panel";
import { FeedAvatar, LiveFeedOverlay, liveForLabel, plannedLabel, useMinuteClock } from "./live-feed";
import { PRIVATE_TITLE, PrivateCallOverlay } from "./live-private-call";
import LiveStage from "./live-stage";
import { LIVE_ICON_BUTTON, LiveShareButton, LiveTopBar } from "./live-top-bar";

const REACTIONS = ["❤️", "🙏", "🔥", "✨", "👏"];
const REACTION_LIMIT = 5; // per 10 seconds
const REACTION_WINDOW_MS = 10_000;
/** How often the open room refreshes its poll, chat and queue. */
const REFRESH_MS = 4000;

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

interface Floating {
  id: number;
  emoji: string;
  left: number;
}

/**
 * The live room, once the viewer has joined from the preview (live-room-gate.tsx). While open
 * it refreshes every few seconds, which also keeps the viewer counted as watching.
 */
export default function LiveRoomView({ room: initialRoom, host: initialHost }: { room: LiveRoom; host: Astrologer }) {
  const { startConsult, openLiveQueue, openLogin, toast } = useAppUI();
  const session = useSession();
  // One consultation at a time: frozen while the customer has another one open.
  const frozen = !!useOpenConsultation();
  // The host's availability, kept current: a one-to-one consult is possible only when they are
  // available (not while hosting this room); astrologer and staff accounts can't consult at all.
  const host = useFreshAstrologer(initialHost);
  const gate = useConsultGate(host);
  const staff = gate.kind === "staff";
  const [room, setRoom] = useState(initialRoom);
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState(false);
  const [sent, setSent] = useState(0);
  const [floating, setFloating] = useState<Floating[]>([]);
  const [giftsOpen, setGiftsOpen] = useState(false);
  // Below 1024px the poll, queue, reactions and details live in a bottom sheet over the video.
  const [infoOpen, setInfoOpen] = useState(false);
  const infoPanel = useRef<HTMLDivElement>(null);
  const gifts = useGiftShow();
  const minute = useMinuteClock();
  const sentTimes = useRef<number[]>([]);
  const nextId = useRef(0);
  const chatBox = useRef<HTMLDivElement>(null);
  const { chat } = room;
  const voted = room.poll.myVote;
  const isCustomer = session.loggedIn && session.role === "customer";
  // Gifts already sent when the viewer joined aren't replayed; new ones play once each.
  const offerGifts = gifts.offer;
  useEffect(() => {
    offerGifts(room.gifts);
  }, [room.gifts, offerGifts]);

  const roomEnded = useCallback(() => {
    // The stage (and its live video connection) goes away; the ended state shows instead.
    setEnded(true);
    setGiftsOpen(false);
    // The host may be free for a one-to-one now; a private consultation ended with the live.
    recheckAvailability();
    void consultationActions.refresh();
  }, []);
  /** Any request to the room answering "not found" means the live has ended. */
  const endedBy = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) {
        roomEnded();
        return true;
      }
      return false;
    },
    [roomEnded],
  );

  const closeGifts = useCallback(() => setGiftsOpen(false), []);
  const playGift = gifts.play;
  const giftSent = useCallback(
    (gift: LiveGift) => {
      setGiftsOpen(false);
      playGift(gift);
      // Show "<name> sent …" in the feed now rather than at the next refresh.
      api
        .get<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(initialRoom.id)}?watching=1`)
        .then(({ room: fresh }) => setRoom(fresh))
        .catch(endedBy);
    },
    [playGift, initialRoom.id, endedBy],
  );

  function openGifts() {
    if (ended) return;
    if (!session.loggedIn) {
      openLogin({ notice: "Log in to send a gift." });
      return;
    }
    if (!isCustomer) {
      toast("Gifts are sent from customer accounts.");
      return;
    }
    setGiftsOpen((o) => !o);
  }

  // Keep the poll results, chat and queue current while the room is open, and notice at the
  // next refresh when the live ends (the room is gone, or it is a new live of the same room).
  // The signed-in state is a dependency so the queue position is re-read after logging in.
  const startedAt = initialRoom.startedAt;
  useEffect(() => {
    if (ended) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        // ?watching=1: each refresh counts this viewer as still watching.
        const { room: fresh } = await api.get<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(initialRoom.id)}?watching=1`);
        if (cancelled) return;
        if (fresh.startedAt !== startedAt) roomEnded();
        else setRoom(fresh);
      } catch (e) {
        if (!cancelled) endedBy(e);
      }
    };
    void refresh();
    const id = setInterval(refresh, REFRESH_MS);
    // Back on this tab: check straight away rather than at the next tick.
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initialRoom.id, startedAt, ended, session.loggedIn, roomEnded, endedBy]);

  // The sheet takes the focus while open; Escape closes it.
  useEffect(() => {
    if (!infoOpen) return;
    infoPanel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInfoOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoOpen]);

  // Follow new chat messages, unless the viewer has scrolled up to read.
  const lastChat = chat.length ? chat[chat.length - 1].id : "";
  useEffect(() => {
    const box = chatBox.current;
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 80) box.scrollTop = box.scrollHeight;
  }, [lastChat]);

  async function vote(optionIndex: number) {
    if (voted !== null || voting) return;
    setVoting(true);
    try {
      const { room: fresh } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(room.id)}/poll-vote`, {
        optionIndex,
      });
      setRoom(fresh);
    } catch (e) {
      if (!endedBy(e)) toast(errorText(e));
    } finally {
      setVoting(false);
    }
  }

  function sendReaction(emoji: string, now: number) {
    if (ended) return;
    sentTimes.current = sentTimes.current.filter((t) => now - t < REACTION_WINDOW_MS);
    if (sentTimes.current.length >= REACTION_LIMIT) {
      toast("Slow down a little — reactions are limited to 5 every 10 seconds.");
      return;
    }
    sentTimes.current.push(now);
    setSent((n) => n + 1);
    api.post(`/live-rooms/${encodeURIComponent(room.id)}/reactions`, { emoji }).catch((e) => {
      if (!endedBy(e)) toast(errorText(e));
    });
    const id = nextId.current++;
    setFloating((f) => [...f, { id, emoji, left: 8 + Math.random() * 20 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 1900);
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending || ended) return;
    if (!session.loggedIn) {
      openLogin({ notice: "Log in to chat in the room." });
      return;
    }
    // Public chat: no personal details at all. Said here at once; the API checks too.
    const contact = findContactDetails(text, "FREE");
    if (contact.length) {
      toast(contactBlockedNotice(contact, "FREE", "live chat"));
      reportContactAttempt("live", room.id, text);
      return;
    }
    setSending(true);
    try {
      const { message: posted } = await api.post<{ message: LiveRoom["chat"][number] }>(
        `/live-rooms/${encodeURIComponent(room.id)}/chat`,
        { text },
      );
      setRoom((r) => (r.chat.some((c) => c.id === posted.id) ? r : { ...r, chat: [...r.chat, posted] }));
      setMessage("");
    } catch (err) {
      if (!endedBy(err)) toast(errorText(err));
    } finally {
      setSending(false);
    }
  }

  function joinQueue() {
    if (!session.loggedIn) {
      openLogin({ notice: "Log in to join the consult queue." });
      return;
    }
    openLiveQueue({ roomId: room.id, astrologer: host, onJoined: setRoom });
  }

  const [leaving, setLeaving] = useState(false);
  async function leaveQueue() {
    if (leaving) return;
    setLeaving(true);
    try {
      const { room: fresh } = await api.post<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(room.id)}/queue/leave`);
      setRoom(fresh);
      toast("You've left the queue. You haven't been charged.");
    } catch (e) {
      if (!endedBy(e)) toast(errorText(e));
    } finally {
      setLeaving(false);
    }
  }

  // ---------- The customer's own private consultation ----------
  // What happened to their request is told once, when it changes: declined, not joined in time,
  // balance too low, or ended by the astrologer (with what it cost).
  const [summary, setSummary] = useState<{ title: string; body: string } | null>(null);
  const lastRequest = useRef(room.myRequest);
  const req = room.myRequest;
  useEffect(() => {
    const before = lastRequest.current;
    lastRequest.current = req;
    if (!req || !before || before.id !== req.id) return;
    if (before.consultation === req.consultation && before.status === req.status) return;
    // An offer arrived or the call started: the site-wide "consultation in progress" state follows.
    if (req.consultation === "connecting" || req.consultation === "active") void consultationActions.refresh();
    if (req.status === "declined") toast(`${host.name} couldn't take your request this time. You haven't been charged.`);
    else if (req.consultation === "cancelled" && req.reason === "balance")
      toast("Your balance no longer covers five minutes, so you were taken out of the queue. You haven't been charged.");
    else if (req.consultation === "cancelled" && req.reason === "unanswered")
      toast("You didn't join in time, so the astrologer moved on. You haven't been charged.");
    else if (req.consultation === "cancelled" && before.consultation === "active") {
      // Connected, but the conversation never started (a side didn't join in time, or the astrologer left first).
      void consultationActions.refresh();
      setSummary({
        title: "The private call couldn't start",
        body:
          req.reason === "astrologer"
            ? `${host.name} left before the call started. Nothing was charged.`
            : `You and ${host.name} couldn't both join the call in time, so it ended by itself. Nothing was charged.`,
      });
    }
    else if (req.consultation === "ended" && (before.consultation === "active" || before.consultation === "connecting")) {
      void consultationActions.refresh();
      setSummary({
        title: req.reason === "astrologer" ? `${host.name} ended the private consultation` : "Private consultation ended",
        body: req.charged > 0 ? `${rupee(req.charged)} was charged to your wallet.` : "Nothing was charged.",
      });
    }
  }, [req, host.name, toast]);

  /** The customer ended (or declined) the call themselves: say what it cost, then refresh the room. */
  const privateEnded = useCallback(
    (s: Settlement | null) => {
      lastRequest.current = null; // told here, not again by the next refresh
      if (s) {
        setSummary({
          title: "Private consultation ended",
          body: `${Math.floor(s.elapsed / 60)} min ${s.elapsed % 60} s · ${s.total > 0 ? `${rupee(s.total)} charged` : "nothing charged"}.`,
        });
      } else toast("Private consultation cancelled. You haven't been charged.");
      api
        .get<{ room: LiveRoom }>(`/live-rooms/${encodeURIComponent(initialRoom.id)}?watching=1`)
        .then(({ room: fresh }) => {
          lastRequest.current = fresh.myRequest;
          setRoom(fresh);
        })
        .catch(endedBy);
    },
    [initialRoom.id, endedBy, toast, setSummary],
  );
  const mine = room.private;
  // The live's sound: off for everyone while a private consultation is in session (server-driven,
  // so a refresh or another device agrees), and off for the customer in it while it runs.
  const silenced = room.audioPaused || mine?.status === "active";

  // ---------- Pieces shown beside the video on desktop, and in the "This live" sheet below 1024px ----------
  const details = (
    <>
      <h2 className="text-[16px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{room.title}</h2>
      {room.topic !== room.title && <p className="mt-0.5 text-[13px] text-stone-600 [overflow-wrap:anywhere]">{room.topic}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-stone-600">
        {room.category && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{room.category}</span>}
        {room.language && <span className="rounded-full bg-cream px-2.5 py-1">{room.language}</span>}
        {plannedLabel(room.durationMins) && <span className="rounded-full bg-cream px-2.5 py-1">About {plannedLabel(room.durationMins)} planned</span>}
        {!ended && liveForLabel(room.startedAt, minute) && (
          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-700">{liveForLabel(room.startedAt, minute)}</span>
        )}
      </div>
    </>
  );

  const dropNote = (
    <>
      <span className="text-[15px] leading-[1.3]">⌁</span>
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px] text-ink">If a web consultation drops</b>
        <span className="mt-[3px] block text-[12.5px] leading-normal text-stone-600">
          Billing stops and you pay only for the time you were actually connected, then the session closes. To
          carry on, start a new consultation — we&apos;ll check your balance again first.
        </span>
      </div>
    </>
  );

  const poll = (
    <>
      <div className="text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">Poll from the astrologer</div>
      <b className="mt-1.5 block text-base text-ink">{room.poll.question}</b>
      <div className="mt-3 flex flex-col gap-2">
        {room.poll.options.map((o, i) => {
          const mine = voted === i;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => void vote(i)}
              aria-pressed={mine}
              disabled={(voted !== null && !mine) || voting || ended}
              className={`relative flex h-11 w-full items-center justify-between gap-2.5 overflow-hidden rounded-xl border bg-white px-3.5 text-left disabled:cursor-default ${
                mine ? "border-amber-500" : "border-line"
              }`}
            >
              <span
                className="absolute inset-y-0 left-0 transition-colors duration-500"
                style={{
                  width: `${o.pct}%`,
                  background: voted === null ? "transparent" : mine ? "#fef3c7" : "#f7f4ee",
                }}
              />
              <span className="relative truncate text-[13.5px] font-semibold text-ink">{o.label}</span>
              <span className="relative text-[12.5px] font-bold tabular-nums text-stone-500">
                {o.pct}%
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 text-[11.5px] text-stone-500">
        One vote per viewer. Votes cannot be changed. Results are visible to the astrologer from launch.
      </div>
    </>
  );

  const announcements = (titleId: string) => (
    <>
      <b id={titleId} className="block text-[13.5px]">
        Announcements
      </b>
      <ul className="mt-2.5 flex flex-col gap-2.5" aria-live="polite">
        {room.announcements.map((a) => (
          <li key={a.id} className="rounded-[14px] border border-amber-200/70 bg-paper px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex h-5 items-center rounded-full bg-amber-500 px-2 text-[10.5px] font-extrabold uppercase tracking-[.04em] text-ink">
                Astrologer
              </span>
              <b className="text-[12.5px] text-amber-800">{host.name}</b>
              <time className="ml-auto text-[11px] tabular-nums text-stone-500">{a.at}</time>
            </div>
            <p className="mt-1.5 text-[13px] leading-[1.45] break-words text-ink">{a.text}</p>
          </li>
        ))}
      </ul>
    </>
  );

  /** One line of the room chat (the readable list beside the video, or in the sheet). */
  const chatLine = (c: LiveRoom["chat"][number]) => (
    <div key={c.id} className={`flex items-start gap-2 text-[13px] leading-[1.45] ${c.kind === "join" ? "text-[12px] text-stone-500" : ""}`}>
      <FeedAvatar photo={c.photo} initials={c.initials} size={c.kind === "join" ? 20 : 24} />
      <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b className={`font-bold ${c.kind === "join" ? "text-stone-600" : "text-amber-800"}`}>{c.who}</b>{" "}
        <span className={c.kind === "gift" ? "font-semibold text-amber-700" : c.kind === "join" ? "" : "text-stone-600"}>{c.text}</span>
      </p>
    </div>
  );

  const reactions = (
    <>
      <b className="block text-[13.5px]">Reactions</b>
      <div className="mt-3 flex flex-wrap gap-2">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={(e) => sendReaction(emoji, e.timeStamp)}
            disabled={ended}
            aria-label={`Send ${emoji}`}
            className="disabled:opacity-45 disabled:hover:translate-y-0 grid size-12 place-items-center rounded-[14px] border border-line-warm bg-card text-[22px] leading-none hover:-translate-y-0.5"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="mt-2.5 text-[11.5px] leading-[1.45] text-stone-500">
        {sent > 0 ? `Sent ${sent}. ` : ""}Up to 5 reactions every 10 seconds. They float over the video and never
        appear in the chat.
      </div>
    </>
  );

  const queue = (
    <>
      <b className="block text-[13.5px]">Queue</b>
      <div className="mt-2.5 flex items-baseline gap-2">
        {room.queue.inQueue ? (
          <>
            <span className="text-[28px] font-bold tabular-nums text-ink">#{room.queue.position}</span>
            <span className="text-[13px] text-stone-600">
              of {room.queue.waiting} waiting · room for {room.queue.capacity}
            </span>
          </>
        ) : (
          <>
            <span className="text-[28px] font-bold tabular-nums text-ink">{room.queue.waiting}</span>
            <span className="text-[13px] text-stone-600">waiting · room for {room.queue.capacity}</span>
          </>
        )}
      </div>
      <div className="mt-1.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 text-xs font-bold text-blue-700">
        ⏱ {room.queue.eta}
      </div>
      {room.queue.inQueue && req?.mode && (
        <p className="mt-2 text-[12.5px] font-semibold text-stone-600">You asked for a {PRIVATE_TITLE[req.mode].toLowerCase()}.</p>
      )}
      <p className="mt-2 text-[11.5px] leading-[1.45] text-stone-500">
        Consultations from a live are private — by chat, voice or video. The room keeps seeing the video, never you.
      </p>
      {room.queue.inQueue ? (
        <button
          type="button"
          onClick={() => void leaveQueue()}
          disabled={leaving || ended}
          className="mt-3 h-[42px] w-full rounded-xl border border-line bg-white text-[13.5px] font-bold text-stone-600"
        >
          {leaving ? "Leaving…" : "Leave the queue"}
        </button>
      ) : (
        <button
          type="button"
          onClick={joinQueue}
          disabled={ended || frozen || staff}
          title={staff ? blockedHint(gate) : frozen ? FROZEN_HINT : undefined}
          className={`mt-3 h-[42px] w-full rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink disabled:cursor-default ${frozen || staff ? "opacity-45" : ""}`}
        >
          {mine ? `🔒 In your ${PRIVATE_TITLE[mine.mode].toLowerCase()}` : staff ? "For customer accounts" : frozen ? "🔒 Consultation in progress" : "Join the consult queue"}
        </button>
      )}
    </>
  );

  const summaryNote = summary && (
    <>
      <span className="text-[15px] leading-[1.3]">🔒</span>
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px] text-ink">{summary.title}</b>
        <span className="mt-[3px] block text-[12.5px] leading-normal text-stone-600">{summary.body}</span>
      </div>
      <button type="button" onClick={() => setSummary(null)} aria-label="Dismiss" className="text-[15px] leading-none text-stone-500">
        ✕
      </button>
    </>
  );

  // The way to a one-to-one: the room's queue while the host is live here (or the private call in
  // it), otherwise a direct consultation if they are free.
  const viaQueue = gate.kind === "live" || !!mine;
  const consultLabel = viaQueue
    ? mine
      ? `🔒 In your ${PRIVATE_TITLE[mine.mode].toLowerCase()}`
      : room.queue.inQueue
        ? "✓ You're in the queue"
        : "Join the consult queue"
    : gate.kind === "frozen"
      ? "🔒 Consultation in progress"
      : gate.kind === "busy"
        ? "In a consultation"
        : gate.kind === "off"
          ? "Offline right now"
          : "Consult now";
  const consultOff = viaQueue ? room.queue.inQueue || !!mine : gate.kind !== "ok";
  const consult = () => (viaQueue ? joinQueue() : startConsult({ astrologer: host }));

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {/* ---------- Video (below 1024px: the app's full-screen live room) ---------- */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-ink sm:aspect-[16/10] max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:aspect-auto max-lg:rounded-none max-lg:bg-[#0c0a12] max-lg:sm:aspect-auto">
          {ended ? (
            // The live is over: the video is gone (not just covered), with where to go next.
            <div role="status" className="absolute inset-0 grid place-items-center px-5 text-center">
              <Image src={room.thumb} alt="" fill sizes="(min-width: 1024px) 800px, 100vw" className="object-cover opacity-25 grayscale" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(28,25,23,.35),rgba(28,25,23,.85))]" />
              <div className="absolute inset-x-0 top-0">
                <LiveTopBar name={host.name} photo={host.photo} viewers={room.viewers} ended />
              </div>
              <div className="relative flex max-w-[380px] flex-col items-center">
                <span className="relative size-[64px] overflow-hidden rounded-full border-[3px] border-gold/70 grayscale-[.4]">
                  <Image src={host.photo} alt="" fill sizes="128px" className="object-cover" />
                </span>
                <span className="mt-3 inline-flex h-[24px] items-center rounded-full bg-stone-700 px-[10px] text-[10.5px] font-extrabold tracking-[.04em] text-white">
                  ■ LIVE ENDED
                </span>
                <h2 className="mt-2.5 font-display text-[26px] font-semibold leading-tight text-paper sm:text-[30px]">This live has ended</h2>
                <p className="mt-1.5 text-[13.5px] leading-normal text-paper/80">
                  Thanks for watching {host.name}. You can consult them one-to-one, or watch another live.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {gate.kind === "ok" ? (
                    <button
                      type="button"
                      onClick={() => startConsult({ astrologer: host })}
                      className="az-cta h-11 rounded-full px-5 text-[14px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.32)] max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
                    >
                      Consult one-to-one
                    </button>
                  ) : (
                    <Link
                      href={`/astrologer/${host.slug}`}
                      className="az-cta inline-flex h-11 items-center rounded-full px-5 text-[14px] font-bold hover:text-cta-ink hover:no-underline max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
                    >
                      View profile
                    </Link>
                  )}
                  <Link
                    href="/live"
                    className="inline-flex h-11 items-center rounded-full border border-white/25 bg-white/10 px-5 text-[14px] font-bold text-paper hover:bg-white/20 hover:text-paper hover:no-underline max-lg:rounded-app-btn"
                  >
                    Other lives
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* The host's real live stream, or the poster with an honest note when live video isn't set up. */}
              <LiveStage roomId={room.id} poster={room.thumb} hostName={host.name} silenced={silenced} quiet={room.state === "private" && mine?.status !== "active"} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,25,23,.42)_0%,rgba(28,25,23,.08)_38%,rgba(28,25,23,.72)_100%)]" />

              <div className="absolute inset-x-3.5 top-3.5 flex flex-wrap items-center gap-2 max-lg:hidden">
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-urgent px-[11px] text-[11px] font-extrabold text-white">
                  ● LIVE
                </span>
                <span className="inline-flex h-[26px] items-center rounded-full bg-black/45 px-[11px] text-[11px] font-bold text-white">
                  👁 {room.viewers.toLocaleString("en-IN")} watching
                </span>
                {room.audioPaused && (
                  <span className="inline-flex h-[26px] items-center rounded-full bg-amber-300 px-[11px] text-[11px] font-extrabold text-ink">🔇 Audio paused</span>
                )}
                <span className="ml-auto inline-flex items-center gap-[7px] rounded-full bg-black/45 py-1 pl-[5px] pr-3">
                  <span className="relative size-[26px] overflow-hidden rounded-full border-2 border-gold">
                    <Image src={host.photo} alt="" fill sizes="52px" className="object-cover" />
                  </span>
                  <b className="text-[12.5px] text-paper">{host.name}</b>
                </span>
              </div>

              {/* Below 1024px: the app's top bar (back, host, LIVE NOW · watching, share, this live's sheet). */}
              <div className="absolute inset-x-0 top-0 lg:hidden">
                <LiveTopBar
                  name={host.name}
                  photo={host.photo}
                  viewers={room.viewers}
                  topic={room.title}
                  actions={
                    <>
                      <LiveShareButton title={`${host.name} is live on AstroRize`} />
                      <button
                        type="button"
                        onClick={() => setInfoOpen(true)}
                        aria-label="Poll, queue and more about this live"
                        aria-expanded={infoOpen}
                        className={LIVE_ICON_BUTTON}
                      >
                        <IconMore />
                        {room.announcements.length > 0 && (
                          <span aria-hidden="true" className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-[#0c0a12] bg-app-urgent" />
                        )}
                      </button>
                    </>
                  }
                />
                {((room.audioPaused && !mine) || summary) && (
                  <div className="flex flex-col gap-2 px-3">
                    {/* (In their own private call the call's bar sits here instead.) */}
                    {room.audioPaused && !mine && (
                      <span className="inline-flex h-[26px] w-fit items-center rounded-full bg-amber-300 px-[11px] text-[11px] font-extrabold text-ink">🔇 Audio paused</span>
                    )}
                    {summary && (
                      <div role="status" className="flex items-start gap-3 rounded-app-card border border-amber-200 bg-amber-50 px-3.5 py-3">
                        {summaryNote}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {room.state === "private" && !mine && (
                <div className="absolute left-1/2 top-1/2 w-[86%] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-amber-300/35 bg-[rgba(28,25,23,.78)] px-5 py-5 text-center sm:px-[26px]">
                  {room.audioPaused ? (
                    <>
                      <div role="status" className="text-[15px] font-bold text-amber-300">
                        Private consultation in progress — audio paused
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-normal text-paper/80">
                        {host.name}&apos;s video continues, without sound, while they consult one customer privately. The sound
                        comes back by itself when it ends. The customer is never shown or heard.
                      </p>
                    </>
                  ) : (
                    <>
                      <div role="status" className="text-[15px] font-bold text-amber-300">
                        Private consultation starting
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-normal text-paper/80">
                        {host.name} is about to consult one customer privately. While they do, the video continues without sound.
                      </p>
                    </>
                  )}
                </div>
              )}

              <PrivateCallOverlay room={room} host={host} onRoom={setRoom} onEnded={privateEnded} />

              {/* Floating reactions */}
              <div aria-hidden="true" className="pointer-events-none absolute bottom-24 right-0 h-40 w-40 max-lg:bottom-40">
                {floating.map((f) => (
                  <span key={f.id} className="az-float absolute bottom-0 text-[28px]" style={{ left: `${f.left}%` }}>
                    {f.emoji}
                  </span>
                ))}
              </div>

              <div className="absolute inset-x-3.5 bottom-3.5 flex flex-col gap-2.5 max-lg:inset-x-3 max-lg:bottom-[max(14px,env(safe-area-inset-bottom))] max-lg:gap-2">
                {/* Gifts slide in above the feed; the feed's bubbles float up and fade on their own
                    (decorative here: the Room chat list beside it is the readable one). */}
                <GiftStack gifts={gifts.shown} />
                <LiveFeedOverlay lines={chat} className="-mt-1 h-[120px] sm:h-[190px] max-lg:sm:h-[160px]" />
                {room.state === "monitor" && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-blue-700/90 px-[13px] py-2.5 text-[12.5px] font-semibold text-white">
                    <span>🛡</span>
                    <span className="flex-1">A compliance monitor has joined this live session.</span>
                  </div>
                )}
                {room.state === "degrade" && (
                  <div className="flex items-center gap-2.5 rounded-xl bg-amber-700/90 px-[13px] py-2.5 text-[12.5px] font-semibold text-white">
                    <span>⚠</span>
                    <span className="flex-1">
                      High load — chat is in slow mode (1 message per 30 s) and reactions are being sampled.
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2.5 max-lg:hidden">
                  <span className="inline-flex items-baseline gap-[7px] rounded-full bg-black/45 px-3.5 py-[7px]">
                    {host.was && host.was > host.price && (
                      <span className="text-xs text-white/65 line-through">{rupee(host.was)}</span>
                    )}
                    <b className="text-[15px] text-paper">{rupee(host.price)}/min</b>
                    {discountLabel(host.price, host.was) && (
                      <span className="text-[11px] font-bold text-amber-300">{discountLabel(host.price, host.was)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={openGifts}
                    aria-label="Send a gift"
                    aria-expanded={giftsOpen}
                    title="Send a gift"
                    className={`grid size-11 shrink-0 place-items-center rounded-full border border-white/15 text-[20px] leading-none ${giftsOpen ? "bg-amber-500" : "bg-black/45 hover:bg-black/60"}`}
                  >
                    <span aria-hidden="true">🎁</span>
                  </button>
                  <button
                    type="button"
                    disabled={consultOff}
                    title={viaQueue ? undefined : gate.kind === "frozen" ? FROZEN_HINT : blockedHint(gate)}
                    onClick={consult}
                    className={`ml-auto h-11 rounded-full px-[22px] text-[14.5px] font-bold ${
                      consultOff ? `${viaQueue ? "cursor-default" : "cursor-not-allowed"} bg-stone-300/90 text-stone-600` : "az-cta shadow-[0_6px_16px_rgba(255,140,26,.32)]"
                    }`}
                  >
                    {consultLabel}
                  </button>
                </div>

                {/* Below 1024px: "Join consult" with the rate, then the chat box and the gift button (the app's dock). */}
                <div className="flex justify-end lg:hidden">
                  <button
                    type="button"
                    disabled={consultOff}
                    title={viaQueue ? undefined : gate.kind === "frozen" ? FROZEN_HINT : blockedHint(gate)}
                    onClick={consult}
                    className={`flex max-w-[62%] flex-wrap items-center justify-end gap-x-2 gap-y-0.5 rounded-[14px] px-3 pt-2 pb-[9px] text-right ${
                      consultOff ? "bg-white/15 text-[#e7e0d6]" : "bg-app-primary text-app-on-primary"
                    }`}
                  >
                    {!consultOff && <IconPhone className="size-3.5 shrink-0" />}
                    <span className="text-[11px] font-bold tracking-[.04em] uppercase">{consultOff ? consultLabel : viaQueue ? "Join consult" : "Consult now"}</span>
                    <span className="flex w-full items-baseline justify-end gap-1.5 tabular-nums">
                      {host.was && host.was > host.price && (
                        <s className={`text-[10px] font-medium ${consultOff ? "text-white/50" : "text-app-on-primary/60"}`}>{rupee(host.was)}/min</s>
                      )}
                      <b className="text-[13px] font-bold">{rupee(host.price)}/min</b>
                    </span>
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 lg:hidden">
                  <form onSubmit={sendChat} className="flex min-h-11 items-center gap-2 rounded-full border border-white/12 bg-[rgba(12,10,18,.55)] pl-3">
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      disabled={ended}
                      placeholder="Say something…"
                      aria-label="Chat message"
                      maxLength={200}
                      enterKeyHint="send"
                      className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[14px] text-[#f8f4ec] outline-none placeholder:text-[#a8a29e]"
                    />
                    <button
                      type="submit"
                      disabled={sending || ended || !message.trim()}
                      aria-label="Send"
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-[#fde68a] disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" />
                      </svg>
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={openGifts}
                    aria-label="Send a gift"
                    aria-expanded={giftsOpen}
                    className={`grid size-11 shrink-0 place-items-center rounded-full ${giftsOpen ? "bg-app-primary text-app-on-primary" : "bg-white/10 text-[#fde68a]"}`}
                  >
                    <IconGift className="size-5" />
                  </button>
                </div>
              </div>

              {giftsOpen && <GiftPanel roomId={room.id} onClose={closeGifts} onSent={giftSent} onEnded={roomEnded} />}

              {/* Below 1024px: everything else about this live, in a bottom sheet. */}
              {infoOpen && (
                <div className={`${SHEET_SCRIM} z-[9] lg:hidden`} onClick={(e) => e.target === e.currentTarget && setInfoOpen(false)}>
                  <div ref={infoPanel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="live-info-title" className={SHEET_PANEL}>
                    <SheetHandle />
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 id="live-info-title" className="m-0 text-[18px] font-bold text-app-ink">
                        This live
                      </h2>
                      <button type="button" onClick={() => setInfoOpen(false)} className="min-h-9 rounded-app-btn px-2 text-[14px] font-bold text-app-accent">
                        Close
                      </button>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className={SHEET_CARD}>{details}</div>
                      {room.announcements.length > 0 && (
                        <section aria-labelledby="live-info-announcements" className="rounded-app-card border border-amber-200 bg-amber-50 p-3.5">
                          {announcements("live-info-announcements")}
                        </section>
                      )}
                      {staff && <ConsultBlockedNote gate={gate} astrologer={host} />}
                      <div className={SHEET_CARD}>{queue}</div>
                      <div className={SHEET_CARD}>{poll}</div>
                      <div className={SHEET_CARD}>{reactions}</div>
                      <div className={`${SHEET_CARD} flex items-start gap-3`}>{dropNote}</div>
                      <div className={SHEET_CARD}>
                        <b className="block text-[13.5px]">Room chat</b>
                        <div className="mt-3 flex flex-col gap-[9px]" role="log" aria-label="Room chat">
                          {chat.length === 0 && <p className="text-[12.5px] text-stone-500">No messages yet. Say hello to the room.</p>}
                          {chat.slice(-40).map(chatLine)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {summary && (
          <div role="status" className="mt-3.5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 max-lg:hidden">
            {summaryNote}
          </div>
        )}

        {/* ---------- This live's details (the astrologer can change them while live) ---------- */}
        <div className="mt-3.5 rounded-2xl border border-line bg-paper px-4 py-3.5 max-lg:hidden">{details}</div>

        {staff && (
          <div className="mt-3.5 max-lg:hidden">
            <ConsultBlockedNote gate={gate} astrologer={host} />
          </div>
        )}

        <div className="mt-3.5 flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5 max-lg:hidden">{dropNote}</div>

        {/* ---------- Poll ---------- */}
        <div className="relative mt-[18px] rounded-[20px] border border-line bg-paper p-5 max-lg:hidden">{poll}</div>
      </div>

      <aside className="flex flex-col gap-3.5 max-lg:hidden">
        {/* ---------- Announcements from the astrologer (newest first) ---------- */}
        {room.announcements.length > 0 && (
          <section aria-labelledby="announcements-title" className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
            {announcements("announcements-title")}
          </section>
        )}

        {/* ---------- Chat ---------- */}
        <div className="flex min-h-[340px] flex-col rounded-[20px] border border-line bg-paper p-4">
          <b className="block text-[13.5px]">Room chat</b>
          <div ref={chatBox} className="mt-3 flex max-h-[320px] flex-1 flex-col gap-[9px] overflow-y-auto" role="log" aria-live="polite" aria-label="Room chat">
            {chat.length === 0 && <p className="text-[12.5px] text-stone-500">No messages yet. Say hello to the room.</p>}
            {chat.map(chatLine)}
          </div>
          <form onSubmit={sendChat} className="mt-3 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={ended}
              placeholder={ended ? "This live has ended" : "Say something…"}
              aria-label="Chat message"
              maxLength={200}
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[13.5px] text-ink outline-none focus:border-amber-500"
            />
            <button type="submit" disabled={sending || ended} className="h-10 rounded-xl bg-amber-500 px-3.5 text-[13px] font-bold text-ink disabled:opacity-50">
              Send
            </button>
          </form>
        </div>

        {/* ---------- Reactions ---------- */}
        <div className="rounded-[20px] border border-line bg-paper p-4">{reactions}</div>

        {/* ---------- Queue ---------- */}
        <div className="rounded-[20px] border border-line bg-paper p-4">{queue}</div>
      </aside>
    </div>
  );
}

/** A card inside the "This live" sheet (below 1024px). */
const SHEET_CARD = "rounded-app-card border border-app-line bg-app-surface p-3.5 text-app-ink";
