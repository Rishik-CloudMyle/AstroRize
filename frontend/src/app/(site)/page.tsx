import Link from "next/link";
import FeaturedCard from "@/components/astrologer/featured-card";
import LiveBand from "@/components/home/live-band";
import AppHome from "@/components/home/app-home";
import AvailableNow from "@/components/home/available-now";
import HeroSky, { ShootingStars, Sparkles } from "@/components/home/hero-sky";
import { consultationLabel } from "@/components/home/review-text";
import Voices from "@/components/home/voices";
import LiveRoomCard from "@/components/live-room-card";
import ToolCard from "@/components/tool-card";
import { STEPS, TRUST_STRIP } from "@/lib/mock/home";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/mock/site";
import { getTools } from "@/lib/tools";
import { getAstrologers, getFeaturedReviews, getLiveRooms } from "./data";

export default async function HomePage() {
  const [{ astrologers, total }, liveRooms, tools, reviews] = await Promise.all([getAstrologers(), getLiveRooms(), getTools(), getFeaturedReviews()]);
  // Real published reviews only: the newest three as cards, any others rotate in "In their words".
  const testimonials = reviews.slice(0, 3);
  const voices = reviews.slice(3);
  const featured = astrologers.slice(0, 3);
  const rooms = liveRooms
    .map((room) => ({ room, host: astrologers.find((a) => a.id === room.astrologerId) }))
    .filter((r): r is { room: typeof r.room; host: NonNullable<typeof r.host> } => Boolean(r.host));

  return (
    <>
    {/* Phones and tablets: the app's Home screen. */}
    <div className="lg:hidden">
      <AppHome astrologers={astrologers} rooms={rooms} tools={tools} reviews={reviews} />
    </div>
    <div className="max-lg:hidden">
      {/* ---------- Hero ----------
          Wide screens (1440px+): text | who is available | wheel. Laptops: the available list sits
          under the text, beside the wheel. Tablets and phones: text, list, wheel, one under another. */}
      <section className="relative overflow-hidden border-b border-line-warm bg-[radial-gradient(ellipse_at_74%_50%,#fff9ea_0%,#fdf0d3_45%,#f8e2b4_100%)]">
        <Sparkles className="absolute inset-0" />
        <ShootingStars className="absolute inset-0 size-full" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-x-12 gap-y-8 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-7 lg:pb-9 lg:pt-8 min-[90rem]:grid-cols-[minmax(0,1fr)_272px_auto] min-[90rem]:gap-x-9 min-[90rem]:pb-10 min-[90rem]:pt-10">
          <div className="az-rise min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end min-[90rem]:self-center">
            <div className="az-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-amber-800">
              Verified Vedic guidance
            </div>
            <h1
              data-sky-avoid
              className="mt-[18px] text-balance font-display text-[42px] font-semibold leading-[1.02] tracking-[-.02em] text-ink sm:text-[52px] lg:mt-4 lg:text-[56px] min-[90rem]:text-[54px]"
            >
              Talk To A Verified Astrologer, Today
            </h1>
            <p data-sky-avoid className="mt-[18px] max-w-[44ch] text-pretty text-base leading-normal text-stone-600 sm:text-[17px] lg:mt-4">
              Pay by the minute. Masked calls, so your number stays private. Wallet money is held, never nibbled — you see
              one charge, after the session ends.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3 lg:mt-6">
              <Link
                href="/astrologers"
                className="az-cta inline-flex h-[52px] items-center rounded-full px-[26px] text-base font-bold shadow-[0_8px_20px_rgba(255,140,26,.32)] hover:text-cta-ink hover:no-underline"
              >
                Consult an astrologer
              </Link>
              <Link
                href="/live"
                className="inline-flex h-[52px] items-center gap-2 rounded-full border border-amber-900/20 bg-paper/90 px-[22px] text-[15px] font-bold text-ink hover:text-ink hover:no-underline"
              >
                <span className="size-2 rounded-full bg-urgent" />
                Watch live now
              </Link>
            </div>
            <div className="mt-[22px] flex flex-wrap items-center gap-2.5 lg:mt-5">
              <StoreBadge href={APP_STORE_URL} small="Download on the" big="App Store" icon={<AppleIcon />} iconSize="text-[19px]" />
              <StoreBadge href={PLAY_STORE_URL} small="Get it on" big="Google Play" icon="▶" iconSize="text-[17px]" />
            </div>
          </div>

          <AvailableNow
            initial={astrologers.map(({ id, slug, name, photo, availability, skills, years, price }) => ({ id, slug, name, photo, availability, skills, years, price }))}
            initialTotal={total}
            className="az-rise az-d2 lg:col-start-1 lg:row-start-2 lg:self-start min-[90rem]:col-start-2 min-[90rem]:row-start-1 min-[90rem]:self-center"
          />

          {/* The real sky as a framed dial — sized by the screen's height too, so the hero fits the first view. */}
          <HeroSky className="az-rise az-d3 mx-auto w-[min(84vw,340px)] min-w-0 sm:w-[380px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mr-2 lg:w-[clamp(340px,calc(100svh-330px),460px)] lg:pt-2 min-[90rem]:col-start-3 min-[90rem]:row-span-1 min-[90rem]:mr-0 min-[90rem]:w-[clamp(360px,calc(100svh-400px),430px)]" />
        </div>
      </section>

      <LiveBand />

      {/* ---------- Trust strip ---------- */}
      <section className="border-b border-line bg-paper">
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-3 px-4 py-[18px] sm:grid-cols-2 sm:px-6 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
          {TRUST_STRIP.map((t) => (
            <div key={t.title} className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-amber-100 text-sm text-amber-800">
                {t.icon}
              </span>
              <div className="min-w-0">
                <b className="block text-[13px] font-bold text-ink">{t.title}</b>
                <span className="text-[11.5px] text-stone-500">{t.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {voices.length > 0 && <Voices reviews={voices} />}

      {/* ---------- Featured astrologers (hidden until there are astrologers to feature) ---------- */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-card text-[10px] font-semibold tracking-[.04em] text-[#9a93a8]">HAND-PICKED FOR YOU</div>
              <h2 className="mt-[3px] font-name text-[28px] font-bold tracking-[-.02em] text-plum sm:text-[32px]">
                Featured astrologers
              </h2>
              <p className="mt-[5px] max-w-[46ch] text-[13px] text-[#8b8498]">
                Ranked by verified consultations and repeat customers — never by how much they pay us.
              </p>
            </div>
            <Link
              href="/astrologers"
              className="inline-flex h-9 items-center rounded-full border border-[#f0d9a8] bg-white px-4 text-[13.5px] font-bold text-ink hover:text-ink hover:no-underline"
            >
              Browse all →
            </Link>
          </div>
          <div className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(min(290px,100%),1fr))] gap-3.5">
            {featured.map((a) => (
              <FeaturedCard key={a.id} astrologer={a} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Live now ---------- */}
      {rooms.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-4 pt-[52px] sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[22px] font-bold text-ink">Live now</h2>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-urgent px-2.5 text-[11px] font-extrabold tracking-[.06em] text-white">
                ● LIVE
              </span>
            </div>
            <Link
              href="/live"
              className="inline-flex h-[34px] items-center rounded-full border border-[#f0d9a8] bg-white px-3.5 text-[13px] font-semibold text-ink hover:text-ink hover:no-underline"
            >
              All live rooms →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3.5">
            {rooms.map(({ room, host }) => (
              <LiveRoomCard key={room.id} room={room} host={host} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Free tools ---------- */}
      <section className="mx-auto max-w-[1240px] px-4 pt-[52px] sm:px-6">
        <h2 className="mb-1 text-[22px] font-bold text-ink">Free tools</h2>
        <p className="mb-4 text-[13px] text-stone-500">Every result gets a shareable link. Kundli needs a free account.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {tools.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-[1240px] px-4 pt-[52px] sm:px-6">
        <div className="rounded-3xl border border-line-warm bg-paper p-5 sm:p-[34px]">
          <h2 className="mb-1 font-display text-[32px] font-semibold text-ink">How it works</h2>
          <p className="text-[13.5px] text-stone-500">Three steps. Money moves once, at the end.</p>
          <div className="mt-[26px] grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
            {STEPS.map((s) => (
              <div key={s.n} className="border-l-2 border-amber-200 pl-4">
                <div className="font-display text-[38px] font-semibold leading-none text-amber-500">{s.n}</div>
                <b className="mt-1.5 block text-base font-bold text-ink">{s.title}</b>
                <p className="mt-1.5 text-[13.5px] leading-normal text-stone-600">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3.5">
            <span className="text-base leading-[1.2]">🔒</span>
            <div className="text-[13px] leading-normal text-amber-900">
              <b>Your balance never ticks down mid-session.</b> We hold your available balance when the call connects,
              meter the time, and take one single debit after it ends. The first 60 seconds are free.
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Testimonials ---------- */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-4 pt-[52px] sm:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[22px] font-bold text-ink">What customers say</h2>
            <span className="inline-flex h-[22px] items-center rounded-full bg-emerald-50 px-[9px] text-[11px] font-bold text-emerald-700">
              ✓ Verified consultations only
            </span>
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3.5">
            {testimonials.map((t) => (
              <figure
                key={t.id}
                className="flex min-w-0 flex-col rounded-[20px] border border-line-warm bg-card p-5 shadow-[0_8px_20px_rgba(90,62,40,.06)]"
              >
                <div className="text-sm tracking-[2px] text-[#f5b301]" role="img" aria-label={`${t.stars} out of 5 stars`}>
                  {"★".repeat(t.stars)}
                  <span className="text-[#e7dcc6]">{"★".repeat(5 - t.stars)}</span>
                </div>
                <blockquote className="mt-2.5 line-clamp-6 break-words font-display text-xl font-medium leading-[1.35] text-ink">
                  “{t.text}”
                </blockquote>
                <figcaption className="mt-auto pt-3 text-xs text-mauve">
                  {t.customerName} · {consultationLabel(t)} with{" "}
                  <Link href={`/astrologer/${t.astrologerSlug}`} className="font-semibold text-mauve underline-offset-2 hover:text-plum">
                    {t.astrologerName}
                  </Link>{" "}
                  · <span className="whitespace-nowrap">{t.date}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      <div className="pb-16" />
    </div>
    </>
  );
}

function StoreBadge({
  href,
  small,
  big,
  icon,
  iconSize,
}: {
  href: string;
  small: string;
  big: string;
  icon: React.ReactNode;
  iconSize: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex h-11 items-center gap-[9px] rounded-xl bg-ink px-4 text-[13px] font-semibold text-paper hover:text-paper hover:no-underline"
    >
      <span className={`${iconSize} leading-none`} aria-hidden="true">
        {icon}
      </span>
      <span className="flex flex-col leading-[1.1]">
        <span className="text-[9px] opacity-70">{small}</span>
        <b className="text-[13px]">{big}</b>
      </span>
    </a>
  );
}

function AppleIcon() {
  return (
    <svg width="17" height="19" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.5 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4zM11.6 3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
    </svg>
  );
}
