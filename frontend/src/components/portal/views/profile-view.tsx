"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { BIO_WORD_LIMIT, hasClaimWarning, wordCount } from "@/lib/portal/bio";
import { discountLabel, ratingLabel, rupee, skillLine } from "@/lib/portal/format";
import type { ProfileData } from "@/lib/portal/types";
import { useAccount, useErrorToast, usePortalState, useToast } from "../portal-provider";
import { M_LABEL, M_SECONDARY, PageHeader, Panel } from "../ui";
import GalleryEditor from "./gallery-editor";
import IntroVideoEditor from "./intro-video-editor";

export default function ProfileView({ data }: { data: ProfileData }) {
  const { astrologer: me } = useAccount();
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  // Edits start from the latest version sent for moderation, or the published profile.
  const base = data.draft ?? data.published;
  const [bio, setBio] = usePortalState("bio", base.bio);
  const [skills, setSkills] = usePortalState("skills", base.skills);
  const [busy, setBusy] = useState(false);
  const dirty = bio !== base.bio || skills.join("|") !== base.skills.join("|");
  const pending = data.pendingChanges;

  const words = wordCount(bio);
  const lint = hasClaimWarning(bio);
  const discount = discountLabel(me.price, me.was);

  const addSkill = () => {
    const next = data.skillPool.find((p) => !skills.includes(p));
    if (!next) {
      toast("Every available skill is already on your profile.");
      return;
    }
    setSkills([...skills, next]);
  };

  const submit = async () => {
    if (!dirty) {
      toast("Nothing has changed since your last submission.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/portal/profile/submission", { bio, skills });
      toast("Submitted for moderation. Your live profile is unchanged until it is approved.");
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setBio(base.bio);
    setSkills(base.skills);
    toast(
      data.draft
        ? "Edits discarded — back to the version waiting for moderation."
        : "Draft discarded — reverted to your published profile.",
    );
  };

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your intro video and photos go live as soon as they upload. Bio and skill edits enter moderation; your live profile keeps the current text until they are approved."
      />

      {pending > 0 && (
      <div className="mt-[18px] flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-[18px] py-3.5 max-lg:mt-3.5 max-lg:gap-2.5 max-lg:rounded-app-card max-lg:p-3">
        <span className="text-base">⏳</span>
        <div className="flex-1">
          <b className="block text-sm text-amber-800">
            {pending === 1 ? "One change is pending moderation" : `${pending} changes are pending moderation`}
          </b>
          <span className="mt-0.5 block text-[13px] text-amber-900">
            Typical review time is 1 working day. Your published profile stays live and unchanged until then.
          </span>
        </div>
      </div>
      )}

      {/* Media goes live at once (no moderation), so it sits apart from the bio and skills. */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-4 max-lg:mt-3 max-lg:gap-3">
        <Panel className="p-5">
          <IntroVideoEditor url={data.introVideoUrl} poster={me.photo} name={me.name} maxMb={data.video.maxMb} maxSeconds={data.video.maxSeconds} />
        </Panel>
        <Panel className="p-5">
          <GalleryEditor photos={data.gallery} max={data.galleryLimits.max} maxMb={data.galleryLimits.maxMb} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-4 max-lg:mt-3 max-lg:gap-3">
        <Panel className="p-5">
          <h2 className="m-0 mb-3.5 text-base font-bold">Edit bio and skills</h2>
          <label htmlFor="bio" className={`mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="min-h-[110px] w-full resize-y rounded-xl border border-line bg-white px-3.5 py-[13px] text-[13.5px] leading-[1.55] text-ink outline-none max-lg:min-h-[160px] max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:px-4 max-lg:text-[16px] max-lg:focus:border-app-selected"
          />
          <div className="mt-1.5 flex justify-between gap-3 text-[11.5px] text-stone-500">
            <span>
              {words} / {BIO_WORD_LIMIT} words
            </span>
            <span className="text-right font-bold" style={{ color: lint ? "#be123c" : "#047857" }}>
              {lint ? "claims warning — remove the guarantee" : "no claims warnings"}
            </span>
          </div>

          <span className={`mt-[18px] mb-1.5 block text-xs font-semibold text-stone-600 ${M_LABEL}`}>Skills</span>
          <div className="flex flex-wrap gap-[7px]">
            {skills.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={`Remove ${k}`}
                onClick={() => setSkills(skills.filter((x) => x !== k))}
                className="inline-flex h-8 items-center gap-[7px] rounded-full border border-amber-500 bg-amber-500 pr-2.5 pl-3 text-[12.5px] font-bold text-ink max-lg:h-[34px] max-lg:border-app-selected max-lg:bg-app-tint max-lg:text-[12px] max-lg:text-app-active"
              >
                {k}
                <span className="text-sm opacity-60">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={addSkill}
              className="inline-flex h-8 items-center rounded-full border border-dashed border-stone-300 bg-white px-3 text-[12.5px] font-bold text-stone-500 max-lg:h-[34px] max-lg:border-app-line-gold max-lg:text-[12px] max-lg:text-app-accent"
            >
              ＋ Add skill
            </button>
          </div>

          <div className="mt-[18px] flex gap-2.5">
            <button type="button" onClick={discard} className={`h-[46px] flex-1 rounded-xl border border-line bg-white text-sm font-bold ${M_SECONDARY} max-lg:h-app-hit`}>
              Discard draft
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={`h-[46px] flex-1 rounded-xl text-sm font-bold max-lg:h-app-hit max-lg:rounded-app-btn max-lg:text-[15px] ${
                dirty
                  ? "bg-[linear-gradient(90deg,#ffd233,#ff8c1a)] text-cta-ink max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary"
                  : "bg-amber-200 text-amber-900"
              }`}
            >
              {dirty ? "Submit changes" : "No changes to submit"}
            </button>
          </div>
        </Panel>

        <div className="relative rounded-[20px] border border-amber-200 bg-amber-50 p-5 max-lg:rounded-app-card max-lg:border-app-tint-3 max-lg:bg-app-tint max-lg:p-4">
          <h2 className="m-0 mb-1 text-base font-bold">What customers see</h2>
          <p className="mb-3.5 text-[12.5px] text-amber-800">This is exactly how your card appears to customers on AstroRize.</p>
          <div className="az-panel rounded-[20px] border border-line-warm p-3.5 shadow-[0_8px_20px_rgba(90,62,40,.07)]">
            <div className="flex items-start gap-3">
              <span className="relative size-[72px] flex-[0_0_72px]">
                <span className="absolute -inset-[5px] rounded-full bg-[repeating-conic-gradient(from_8deg,rgba(212,160,48,.38)_0_5deg,transparent_5deg_14deg)]" />
                <span
                  role="img"
                  aria-label={me.name}
                  className="relative block size-[72px] rounded-full border-2 border-gold bg-cover bg-center shadow-[0_0_0_2px_#fff]"
                  style={{ backgroundImage: `url("${me.photo}")` }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <b className="font-name text-base font-bold text-plum">{me.name}</b>
                  <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-[#f0b429] text-[9px] font-extrabold text-white">
                    ✓
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-mauve">{skillLine(me.skills, me.years)}</div>
                <div className="mt-[7px] inline-flex items-center gap-1.5 rounded-full bg-[#f7f2ea] px-2 py-0.5">
                  <b className="text-[11px] text-plum">★ {ratingLabel(me.rating)}</b>
                  <span className="h-3 w-px bg-[#e4d9c8]" />
                  <span className="text-[11px] font-semibold text-mauve">
                    <b className="text-plum">{me.consults.toLocaleString("en-IN")}</b> consults
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f3e9d8] pt-2.5">
              <div className="flex items-baseline gap-1.5">
                {discount && me.was && <span className="text-[11px] text-[#b0a8b8] line-through">{rupee(me.was)}</span>}
                {me.price > 0 ? (
                  <>
                    <span className="text-[17px] font-bold text-plum">{rupee(me.price)}</span>
                    <span className="text-[10px] font-semibold text-mauve">/min</span>
                    {me.chatPrice !== me.price && (
                      <span className="text-[10px] font-semibold text-mauve tabular-nums">· Chat {rupee(me.chatPrice)}/min</span>
                    )}
                  </>
                ) : (
                  <span className="text-[13px] font-bold text-mauve">Rate not set yet</span>
                )}
                {discount && (
                  <span className="inline-flex h-[18px] items-center rounded-full bg-amber-100 px-1.5 text-[9px] font-extrabold text-amber-800">
                    {discount}
                  </span>
                )}
              </div>
              <span className="az-cta inline-flex h-[34px] items-center rounded-full px-3.5 shadow-none text-[12.5px] font-bold">Consult ›</span>
            </div>
          </div>
          {data.publicProfileUrl ? (
            <a
              href={data.publicProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-[12.5px] font-bold text-amber-700 max-lg:text-[13px] max-lg:font-semibold max-lg:text-app-accent"
            >
              Open the live public profile ›
            </a>
          ) : (
            <p className="mt-3 text-[12.5px] text-stone-500">Your public profile goes live once your application is approved.</p>
          )}
        </div>
      </div>
    </div>
  );
}
