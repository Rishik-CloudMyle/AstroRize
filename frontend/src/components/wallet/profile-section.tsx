"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { sessionActions } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import {
  PhotoPicker,
  ProfileForm,
  ageFrom,
  longDate,
  saveProfile,
  toForm,
  validate,
  type Errors,
  type Field,
  type Form,
  type Profile,
} from "../account/profile-form";

// "Your profile" on Wallet & account: the mobile app's "A little about you" and
// "Birth details" screens. Shared only with an astrologer whose live consult queue
// the customer joins. The form itself is shared with sign-up (../account/profile-form).

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

export default function ProfileSection() {
  const { toast } = useAppUI();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  async function load() {
    setLoadError("");
    try {
      const { profile: p } = await api.get<{ profile: Profile }>("/me/profile");
      setProfile(p);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ profile: Profile }>("/me/profile")
      .then(({ profile: p }) => !cancelled && setProfile(p))
      .catch((e) => !cancelled && setLoadError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Links to /wallet#profile land here once the section has loaded.
  const loaded = profile !== null;
  useEffect(() => {
    if (loaded && window.location.hash === "#profile") sectionRef.current?.scrollIntoView({ block: "start" });
  }, [loaded]);

  function startEditing() {
    if (!profile) return;
    setForm(toForm(profile));
    setErrors({});
    setFormError("");
    setJustSaved(false);
    setEditing(true);
  }

  function set<K extends Field>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFormError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !profile || saving) return;
    const found = validate(form, profile.emailRequired);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Check the highlighted fields.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const result = await saveProfile(form);
      if ("error" in result) {
        if (result.field) setErrors({ [result.field]: result.error });
        setFormError(result.error);
        return;
      }
      setProfile(result.profile);
      setEditing(false);
      setJustSaved(true);
      toast("Profile saved.");
      // The header shows the person's initials; refresh them after a name change.
      void sessionActions.refreshUser().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  const shell = "relative scroll-mt-24 rounded-[22px] border border-line bg-paper p-4 sm:p-[22px]";
  const heading = (
    <>
      <h2 className="mb-1 text-[17px] font-bold">Your profile</h2>
      <p className="mb-4 text-[13px] text-stone-500">
        Only an astrologer whose live consult queue you join sees this, to prepare for your consult.
      </p>
    </>
  );

  if (!profile) {
    return (
      <section id="profile" ref={sectionRef} className={shell} aria-busy={!loadError}>
        {heading}
        {loadError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-[13px] font-semibold text-rose-700">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="h-[34px] rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-ink"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="h-40 rounded-2xl bg-cream" />
        )}
      </section>
    );
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return (
    <section id="profile" ref={sectionRef} className={shell}>
      {heading}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <PhotoPicker
            photoUrl={profile.photoUrl}
            initials={profile.initials}
            onChange={(photoUrl, message) => {
              setProfile((p) => (p ? { ...p, photoUrl } : p));
              toast(message);
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          {editing && form ? (
            <ProfileForm
              form={form}
              errors={errors}
              formError={formError}
              saving={saving}
              emailRequired={profile.emailRequired}
              set={set}
              onSubmit={save}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <dl className="m-0 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {(
                  [
                    ["Name", fullName || null],
                    ["Gender", profile.gender],
                    ["Email", profile.email || null, true],
                    ["Date of birth", profile.birthDate ? `${longDate(profile.birthDate)} · age ${ageFrom(profile.birthDate)}` : null],
                    ["Time of birth", profile.birthTime],
                    ["Place of birth", profile.birthPlace || null, true],
                    ["City", profile.city || null],
                    ["State", profile.state || null],
                  ] as [string, string | null, boolean?][]
                ).map(([label, value, wide]) => (
                  <div key={label} className={`flex justify-between gap-4 border-b border-line-soft py-[10px] ${wide ? "sm:col-span-2" : ""}`}>
                    <dt className="shrink-0 text-[12.5px] text-stone-500">{label}</dt>
                    <dd className={`m-0 min-w-0 text-right text-[13.5px] break-words ${value ? "font-semibold text-ink" : "text-stone-400"}`}>
                      {value ?? "Not added"}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={startEditing}
                  className="h-10 rounded-full border border-line bg-white px-5 text-[13.5px] font-bold text-ink"
                >
                  {fullName ? "Edit profile" : "Add your details"}
                </button>
                {justSaved && <span className="text-[12.5px] font-semibold text-emerald-700">✓ Saved</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
