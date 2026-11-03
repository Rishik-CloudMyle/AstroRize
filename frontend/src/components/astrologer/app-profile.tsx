"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Astrologer } from "@/lib/types";
import { RECOGNITION, percentages, rupee } from "@/lib/format";
import { bonusNote, resetWeekday } from "@/lib/free-calls";
import { useMakeGood } from "@/lib/makegood";
import { discountedRate, useConsultDiscount } from "@/lib/offers";
import { usableWelcome, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import { ConsultBlockedNote, useConsultGate } from "../consult/consult-gate";
import { ConsultFrozenNote } from "../consult/consult-lock";
import { useBelowDesktop } from "../directory/use-current-astrologers";
import MessageButton from "../messages/message-button";
import SendGiftButton from "./send-gift";
import { Segmented } from "../mobile/chips";
import EmptyState from "../mobile/empty-state";
import { AppTopbar } from "../mobile/page-title";
import { HideTabBar } from "../mobile/tab-bar";
import { AppAvailabilityBadge, AppPortrait, AppRecognition, AppVerifiedTick } from "./app-astro-card";
import IntroVideo, { IntroVideoPlaceholder } from "./intro-video";
import ProfileGallery from "./profile-gallery";
import { useFreshAstrologer } from "./use-fresh-astrologer";

// An astrologer's profile on phones and tablets (< 1024px), laid out like the client's app
// "Astrologer profile" and "Reviews" screens: identity, price and the ways to consult, Share and
// the Astrologer Messenger, photos, intro video, the trust card, about, then ratings & reviews
// (its own screen, ?reviews=1). The Consult bar stays pinned at the bottom (the tab bar is hidden
// here, as in the app). Desktop renders its own layout; this one keeps polling only while visible.

const MODE_DOT: Record<"on" | "busy" | "off", string> = { on: "bg-app-success", busy: "bg-app-error", off: "bg-[#d6d3d1]" };

export default function AppProfile({ astrologer: initial, showReviews }: { astrologer: Astrologer; showReviews: boolean }) {
  const below = useBelowDesktop();
  const a = useFreshAstrologer(initial, below);
  return (
    <div className="min-h-[60vh] bg-app-bg">
      {below && <HideTabBar />}
      {showReviews ? <ReviewsScreen astrologer={a} /> : <ProfileScreen astrologer={a} />}
    </div>
  );
}

function ProfileScreen({ astrologer: a }: { astrologer: Astrologer }) {
  const { toast } = useAppUI();
  const session = useSession();
  const gate = useConsultGate(a);
  const welcome = usableWelcome(session);
  const makeGood = useMakeGood(a.id);
  const offer = useConsultDiscount();
  const discount = makeGood ? null : offer;
  // The weekly free minutes can be used with this astrologer. Nothing is applied here: the customer
  // chooses "Use free minutes" (and a length) or "Paid call" in the consult sheet.
  const freeMinutesHere = !makeGood && !!welcome && a.freeCall;
  const ratings = a.ratingDistribution.reduce((x, y) => x + y, 0);
  const st = a.availability;
  const modeState: "on" | "busy" | "off" = st === "on" ? "on" : st === "busy" ? "busy" : "off";

  async function share() {
    const url = `${window.location.origin}/astrologer/${a.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${a.name} on AstroRize`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Profile link copied to your clipboard.");
    } catch (e) {
      // Closing the share sheet isn't an error.
      if ((e as { name?: string } | null)?.name !== "AbortError") toast("Couldn't share automatically — copy the link from the address bar.");
    }
  }

  return (
    <>
      <AppTopbar title={a.name} backLabel="Back" />
      <div className="px-4 pt-3 pb-4">
        {/* ---------- Identity ---------- */}
        <div className="flex items-start gap-3">
          <AppPortrait astrologer={a} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="m-0 min-w-0 truncate text-[16px] font-bold text-app-ink">{a.name}</h1>
              <AppVerifiedTick size={16} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <AppAvailabilityBadge astrologer={a} />
              <AppRecognition astrologer={a} />
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.45] text-app-ink-2">
              {a.years} {a.years === 1 ? "year" : "years"} · {a.languages.join(", ")}
              <br />
              {a.skills.join(" · ")}
              <br />
              {a.consults.toLocaleString("en-IN")} verified {a.consults === 1 ? "consultation" : "consultations"}
            </p>
          </div>
        </div>

        {/* ---------- Price and ways to consult ---------- */}
        <div className="mt-3.5 flex items-end justify-between gap-3">
          <div>
            <div className="text-[22px] leading-none font-bold text-app-ink tabular-nums">{rupee(a.price)}/min</div>
            {a.was && a.was > a.price && <s className="mt-1 block text-[12px] text-app-ink-3 tabular-nums">{rupee(a.was)}/min</s>}
            {a.chatPrice !== a.price && <div className="mt-1 text-[12px] font-semibold text-app-ink-2 tabular-nums">Chat {rupee(a.chatPrice)}/min</div>}
          </div>
          <ul aria-label="Ways to consult" className="flex flex-wrap justify-end gap-x-2.5 gap-y-1 text-[11px] font-bold">
            {(["Chat", "Voice", "Video"] as const).map((m) => (
              <li key={m} className={`inline-flex items-center gap-1 ${modeState === "on" ? "text-app-success" : modeState === "busy" ? "text-app-error" : "text-app-ink-3"}`}>
                {m}
                <i aria-hidden="true" className={`size-1.5 rounded-full ${MODE_DOT[modeState]}`} />
                <span className="sr-only">{modeState === "on" ? "available" : modeState === "busy" ? "busy" : "unavailable"}</span>
              </li>
            ))}
            <li className={`inline-flex items-center gap-1 ${st === "on" ? "text-app-info" : "text-app-ink-3"}`}>
              Instant
              <i aria-hidden="true" className={`size-1.5 rounded-full ${st === "on" ? "bg-app-info" : MODE_DOT[modeState]}`} />
              <span className="sr-only">{st === "on" ? "available" : "unavailable"}</span>
            </li>
          </ul>
        </div>

        {makeGood ? (
          <p className="mt-3 rounded-app-card border border-[#a7f3d0] bg-app-success-bg px-3 py-2.5 text-[12.5px] leading-[1.45] text-app-success">
            <b className="block text-[13px]">🎁 Free replacement call · {makeGood.minutes} min</b>
            We&apos;re sorry about session {makeGood.sessionRef}. Talk to {a.name} again free by Chat, Voice or Video — use it by {makeGood.validUntil}.
          </p>
        ) : freeMinutesHere ? (
          <p className="mt-3 rounded-app-card border border-[#a7f3d0] bg-app-success-bg px-3 py-2.5 text-[12.5px] leading-[1.45] text-app-success">
            <b className="block text-[13px]">
              🎁 Free minutes: {welcome.weekly.remaining} of {welcome.weekly.total} left this week{bonusNote(welcome)} · resets {resetWeekday(welcome.weekly.resetsAt)}
            </b>
            Use them here for a Chat or Voice consultation, or pay per minute — you choose when you start.
          </p>
        ) : null}
        {discount && (
          <p className="mt-2 rounded-app-card bg-app-success-bg px-3 py-2 text-[12.5px] font-semibold text-app-success">
            {discount.pct}% off applied · {rupee(discountedRate(a.price, discount.pct))}/min instead of {rupee(a.price)} — your offer “{discount.name}”
          </p>
        )}

        {gate.kind === "frozen" ? (
          <div className="mt-3">
            <ConsultFrozenNote open={gate.open} astrologerId={a.id} />
          </div>
        ) : (
          gate.kind !== "ok" && (
            <div className="mt-3">
              <ConsultBlockedNote gate={gate} astrologer={a} />
            </div>
          )
        )}

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={share}
            className="inline-flex min-h-app-hit w-full items-center justify-center gap-2 rounded-app-btn border border-app-line bg-app-surface text-[15px] font-bold text-app-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" className="size-4">
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
            </svg>
            Share
          </button>
          <MessageButton slug={a.slug} name={a.name} />
          <SendGiftButton astrologer={a} variant="app" />
        </div>

        {/* ---------- Photos and intro video ---------- */}
        <div className="mt-3">
          <ProfileGallery photos={a.gallery} name={a.name} variant="strip" />
        </div>
        {a.introVideoUrl ? (
          <IntroVideo src={a.introVideoUrl} poster={a.photo} name={a.name} preload="none" className="mt-3" heightClass="h-[200px] sm:h-[300px]" />
        ) : (
          <IntroVideoPlaceholder poster={a.photo} className="mt-3" heightClass="h-[160px] sm:h-[220px]" />
        )}

        {/* ---------- Trust card ---------- */}
        <section aria-label="Customer rating" className="mt-3 rounded-app-card border border-app-line bg-app-surface p-3.5 shadow-app-card">
          <div className="flex items-center gap-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-full border border-app-line">
              <Image src={a.photo} alt="" fill sizes="112px" className="object-cover" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <b className="truncate text-[15px] text-app-ink">{a.name}</b>
                <AppVerifiedTick />
              </div>
              <div className="truncate text-[12px] text-app-ink-2">
                {a.skills.join(" · ")} · {a.years} yrs
              </div>
              <span className="mt-1 inline-flex h-6 items-center rounded-app-chip bg-app-tint-2 px-2 text-[11px] font-bold text-app-active">
                {RECOGNITION[a.recognition].label}
              </span>
            </div>
          </div>
          <div className="mt-3 rounded-[12px] bg-[#f4f0e8] px-3 py-3 text-center">
            {a.rating === null ? (
              <>
                <b className="block text-[15px] text-app-ink">Not rated yet</b>
                <span className="mt-0.5 block text-[12px] text-app-ink-2">A rating shows after enough verified consultations.</span>
              </>
            ) : (
              <>
                <div className="font-display text-[34px] leading-none font-semibold text-app-ink">{a.rating.toFixed(1)}</div>
                <Stars value={a.rating} className="mt-1 text-[14px]" />
                <span className="mt-1 block text-[12px] text-app-ink-2">
                  Customer rating · {a.consults.toLocaleString("en-IN")} verified {a.consults === 1 ? "consultation" : "consultations"}
                </span>
              </>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            {[
              { label: "Verified consults", value: a.consults.toLocaleString("en-IN") },
              { label: "Ratings", value: ratings.toLocaleString("en-IN") },
              { label: "Experience", value: `${a.years} ${a.years === 1 ? "year" : "years"}` },
              { label: "Recognition", value: RECOGNITION[a.recognition].label },
            ].map((m) => (
              <div key={m.label} className="flex flex-col-reverse rounded-[12px] bg-[#f4f0e8] px-2.5 py-2.5">
                <dt className="text-[11px] text-app-ink-2">{m.label}</dt>
                <dd className="m-0 text-[15px] font-bold text-app-ink tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {a.about && <p className="mt-3.5 text-[14px] leading-[1.6] whitespace-pre-line text-app-ink-2">{a.about}</p>}

        <Link
          href={`/astrologer/${a.slug}?reviews=1`}
          className="mt-3.5 flex min-h-[60px] items-center justify-between gap-3 rounded-app-card border border-app-line bg-app-surface px-3.5 py-2.5 shadow-app-card hover:no-underline"
        >
          <span className="min-w-0">
            <b className="block text-[13.5px] text-app-ink">Ratings &amp; reviews</b>
            <span className="block text-[12px] text-app-ink-2">
              {a.rating === null ? "Not rated yet" : `★ ${a.rating.toFixed(1)}`} · {ratings.toLocaleString("en-IN")} {ratings === 1 ? "rating" : "ratings"}
            </span>
          </span>
          <span aria-hidden="true" className="text-[18px] text-app-ink-3">›</span>
        </Link>
      </div>

      <ConsultBar astrologer={a} freeNote={makeGood ? `Free replacement call · ${makeGood.minutes} min, or paid` : freeMinutesHere ? "Free minutes or paid — you choose" : ""} discountPct={discount?.pct ?? 0} />
    </>
  );
}

/** The pinned bottom bar: price, a one-line note, and the main action for the astrologer's state. */
/** `freeNote`: a free option here (the customer chooses it in the sheet), or "". */
function ConsultBar({ astrologer: a, freeNote, discountPct }: { astrologer: Astrologer; freeNote: string; discountPct: number }) {
  const { startConsult, resumeConsult } = useAppUI();
  const gate = useConsultGate(a);
  const base = "flex min-h-app-hit w-full items-center justify-center gap-2 rounded-app-btn text-[15px] font-bold hover:no-underline";
  const note =
    freeNote && a.availability === "on"
      ? freeNote
      : discountPct > 0
        ? `${discountPct}% off applied`
        : "First 60 seconds complimentary";

  let action: React.ReactNode;
  if (gate.kind === "frozen") {
    action = (
      <button type="button" onClick={resumeConsult} className={`${base} bg-app-primary text-app-on-primary`}>
        Return to your consultation
      </button>
    );
  } else if (gate.kind === "staff") {
    action = (
      <button type="button" disabled className={`${base} bg-[#ece8e2] text-app-ink-3`}>
        For customer accounts
      </button>
    );
  } else if (gate.kind === "live") {
    action = (
      <Link href={`/live?room=${encodeURIComponent(a.id)}`} className={`${base} bg-app-urgent text-white hover:text-white`}>
        <span aria-hidden="true" className="az-live-dot size-2 rounded-full bg-white" />
        Join Live Room
      </Link>
    );
  } else if (gate.kind === "busy" || gate.kind === "off") {
    action = (
      <button type="button" disabled className={`${base} bg-[#ece8e2] text-app-ink-3`}>
        {gate.kind === "busy" ? `In consultation${a.eta ? ` · ${a.eta}` : ""}` : "Offline right now"}
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={() => startConsult({ astrologer: a })} className={`${base} bg-app-primary text-app-on-primary`}>
        Consult
      </button>
    );
  }

  return (
    <>
      {/* Keeps the end of the page clear of the bar. */}
      <div aria-hidden="true" className="h-[calc(112px+var(--app-safe-bottom))]" />
      <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-app-line bg-app-elev px-4 pt-2.5 pb-[calc(12px+var(--app-safe-bottom))] shadow-[0_-6px_18px_rgba(28,25,23,.06)] lg:hidden">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <b className="text-[15px] text-app-ink tabular-nums">{rupee(a.price)}/min</b>
            {a.was && a.was > a.price && <s className="text-[12px] text-app-ink-3 tabular-nums">{rupee(a.was)}/min</s>}
          </span>
          <span className="min-w-0 truncate text-[12px] text-app-ink-2">{note}</span>
        </div>
        {action}
      </div>
    </>
  );
}

function Stars({ value, className = "" }: { value: number; className?: string }) {
  const n = Math.round(value);
  return (
    <span aria-hidden="true" className={`tracking-[1px] ${className}`}>
      <span className="text-[#f59e0b]">{"★".repeat(n)}</span>
      <span className="text-[#e7dcc6]">{"★".repeat(5 - n)}</span>
    </span>
  );
}

type StarFilter = "all" | "5" | "4" | "3" | "low";

function ReviewsScreen({ astrologer: a }: { astrologer: Astrologer }) {
  const [filter, setFilter] = useState<StarFilter>("all");
  const total = a.ratingDistribution.reduce((x, y) => x + y, 0);
  const pct = percentages(a.ratingDistribution);
  const shown = a.reviews.filter((r) =>
    filter === "all" ? true : filter === "low" ? r.stars <= 2 : r.stars === Number(filter),
  );

  return (
    <>
      <AppTopbar title="Reviews" subtitle={a.name} backLabel={`Back to ${a.name}`} />
      <div className="px-4 pt-3 pb-[calc(24px+var(--app-safe-bottom))]">
        <section aria-label="Rating summary" className="rounded-app-card border border-app-line bg-app-surface p-3.5 shadow-app-card">
          <div className="flex items-center gap-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-full border border-app-line">
              <Image src={a.photo} alt="" fill sizes="112px" className="object-cover" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <b className="truncate text-[15px] text-app-ink">{a.name}</b>
                <AppVerifiedTick />
              </div>
              {a.rating !== null ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-bold text-app-ink">
                  <Stars value={a.rating} className="text-[13px]" />
                  <span>★ {a.rating.toFixed(1)}</span>
                </div>
              ) : (
                <div className="mt-0.5 text-[12.5px] text-app-ink-2">Not rated yet</div>
              )}
            </div>
          </div>
          <p className="mt-3 mb-1.5 text-[12px] text-app-ink-2">
            {total.toLocaleString("en-IN")} {total === 1 ? "rating" : "ratings"} · verified consultations only
          </p>
          <ul className="flex flex-col gap-1">
            {a.ratingDistribution.map((count, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[11.5px] text-app-ink-2">
                <span className="w-3 tabular-nums">{5 - i}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e9e2d6]">
                  <span className="block h-full rounded-full bg-app-primary" style={{ width: `${pct[i] ?? 0}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums">{count.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </section>

        <Segmented<StarFilter>
          label="Show reviews with"
          className="mt-3"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "5", label: "5★" },
            { value: "4", label: "4★" },
            { value: "3", label: "3★" },
            { value: "low", label: "1–2★" },
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState
            className="mt-2"
            title={a.reviews.length === 0 ? "No written reviews yet." : "No reviews with this rating."}
            body={a.reviews.length === 0 ? "Reviews appear here after verified consultations." : undefined}
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {shown.map((r) => (
              <ReviewCard key={r.name + r.when + r.text.slice(0, 20)} review={r} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ReviewCard({ review: r }: { review: Astrologer["reviews"][number] }) {
  const [open, setOpen] = useState(false);
  const long = r.text.length > 140;
  return (
    <li className="rounded-app-card border border-app-line bg-app-surface p-3 shadow-app-card">
      <div className="flex items-center gap-2">
        <span role="img" aria-label={`${r.stars} out of 5 stars`} className="text-[12px]">
          <Stars value={r.stars} />
        </span>
        <b className="min-w-0 truncate text-[13px] text-app-ink">{r.name}</b>
      </div>
      <div className="mt-0.5 text-[12px] text-app-ink-3">{r.when} · Verified consultation</div>
      <p className={`mt-2 mb-0 text-[14px] leading-[1.5] break-words text-app-ink ${long && !open ? "line-clamp-2" : ""}`}>{r.text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1.5 min-h-8 text-[13px] font-bold text-app-accent">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </li>
  );
}
