import type { Metadata } from "next";
import { Portrait, RecognitionBadge, VerifiedTick } from "@/components/astrologer/parts";
import ProfileActions from "@/components/astrologer/profile-actions";
import Breadcrumbs from "@/components/breadcrumbs";
import { languageLine, ratingLabel, skillLine, trustJourney, trustMetrics } from "@/lib/format";
import { getAstrologer } from "../../data";

// Rendered on each request from the API; an unknown slug shows the not-found page.

export async function generateMetadata(props: PageProps<"/astrologer/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const a = await getAstrologer(slug);
  return {
    title: `${a.name} — ${a.skills.join(" & ")} astrologer`,
    description: a.about,
  };
}

export default async function AstrologerPage(props: PageProps<"/astrologer/[slug]">) {
  const { slug } = await props.params;
  const a = await getAstrologer(slug);

  const totalRatings = a.ratingDistribution.reduce((x, y) => x + y, 0) || 1;
  const journey = trustJourney(a);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 sm:px-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Astrologers", href: "/astrologers" }, { label: a.name }]} className="mb-3.5" />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-7">
        <div className="min-w-0">
          {/* ---------- Intro ---------- */}
          <div className="rounded-3xl border border-line-warm bg-card p-5 shadow-[0_8px_20px_rgba(90,62,40,.06)] sm:p-6">
            <div className="flex flex-wrap items-start gap-5">
              <Portrait astrologer={a} size={104} rays ring={3} priority />
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-name text-[26px] font-bold tracking-[-.02em] text-plum sm:text-[30px]">{a.name}</h1>
                  <VerifiedTick size={18} />
                  <RecognitionBadge astrologer={a} large />
                </div>
                <div className="mt-1.5 text-sm text-stone-600">{skillLine(a)}</div>
                <div className="mt-[3px] text-[13px] text-mauve">{languageLine(a)}</div>
                <p className="mt-3 max-w-[58ch] text-pretty text-[14.5px] leading-[1.55] text-stone-600">{a.about}</p>
              </div>
            </div>
          </div>

          {/* ---------- Trust profile ---------- */}
          <section className="mt-[18px] rounded-3xl border border-line bg-paper p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">Trust profile</h2>
              <span className="text-[11.5px] text-stone-500">Built from verified consultations only</span>
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
              {trustMetrics(a).map((t) => (
                <div key={t.label} className="rounded-[14px] bg-cream px-3.5 py-[13px]">
                  <div className="text-[11px] font-semibold text-stone-500">{t.label}</div>
                  <b className="mt-[3px] block text-[17px] font-bold tabular-nums sm:text-[19px]" style={{ color: t.fg }}>
                    {t.value}
                  </b>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-stone-500">Trust journey</div>
              <ol className="flex flex-wrap items-center gap-y-4">
                {journey.map((j, i) => (
                  <li key={j.label} className="flex min-w-0 items-center">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className="size-3 rounded-full"
                        style={{
                          background: j.done ? "#047857" : "#f59e0b",
                          boxShadow: `0 0 0 3px ${j.done ? "#d1fae5" : "#fef3c7"}`,
                        }}
                      />
                      <b className="whitespace-nowrap text-xs font-bold text-ink">{j.label}</b>
                      <span className="whitespace-nowrap text-[11px] text-mauve">{j.when}</span>
                    </div>
                    {i < journey.length - 1 && (
                      <span className="mx-2.5 mb-[30px] h-0.5 w-6 bg-[#e4d9c8] sm:mx-3.5 sm:w-[52px]" aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ---------- Ratings & reviews ---------- */}
          <section className="mt-[18px] rounded-3xl border border-line bg-paper p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">Ratings &amp; reviews</h2>
              <span className="inline-flex h-[22px] items-center rounded-full bg-emerald-50 px-[9px] text-[11px] font-bold text-emerald-700">
                ✓ Verified consultation only
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 sm:gap-[26px]">
              <div className="text-center">
                <div className="text-[46px] font-bold leading-none tabular-nums text-ink">{ratingLabel(a)}</div>
                <div className="mt-1 text-sm tracking-[2px] text-[#f5b301]" aria-hidden="true">
                  ★★★★★
                </div>
                <div className="mt-1 text-[11.5px] text-stone-500">{a.consults.toLocaleString("en-IN")} reviews</div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                {a.ratingDistribution.map((count, i) => {
                  const pct = Math.round((count / totalRatings) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-[22px] text-[11.5px] text-stone-500">{5 - i}★</span>
                      <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#eee7db]">
                        <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-11 text-right text-[11.5px] tabular-nums text-stone-500">
                        {count.toLocaleString("en-IN")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              {a.reviews.length === 0 && (
                <p className="border-t border-line-soft pt-3.5 text-[13.5px] text-stone-500">
                  No written reviews yet. Reviews appear here after verified consultations.
                </p>
              )}
              {a.reviews.map((r) => (
                <div key={r.name + r.when} className="border-t border-line-soft pt-3.5">
                  <div className="flex items-center gap-2">
                    <b className="text-[13.5px] font-bold text-ink">{r.name}</b>
                    <span className="text-xs tracking-[1px] text-[#f5b301]" aria-label={`${r.stars} stars`}>
                      {"★".repeat(r.stars)}
                    </span>
                    <span className="ml-auto text-[11.5px] text-mauve">{r.when}</span>
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-[1.55] text-stone-600">{r.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <ProfileActions astrologer={a} />
      </div>
    </div>
  );
}
