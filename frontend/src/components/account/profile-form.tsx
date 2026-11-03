"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { readResponse } from "@/lib/api/errors";
import { EMAIL_MESSAGE, GENDERS, formatMobile, from24h, genderLabel, isValidEmail, time12Problem, to24h, type Period } from "@/lib/contact";
import { APP_CTA, APP_INPUT, APP_LABEL, APP_SECONDARY } from "./app-look";
import { TimeOfBirthField } from "./time-of-birth";

// The customer's "A little about you" + "Birth details" form, shared by Wallet & account
// (edit profile) and sign-up. Same rules as PUT /api/me/profile.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Photos are resized in the browser before upload: small, fast, and free of camera metadata (GPS). */
const PHOTO_MAX_SIDE = 640;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  /** The mobile number the account signs in with (verified by a code); "" when there is none. */
  phone: string;
  gender: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  /** HH:MM, 24-hour */
  birthTime: string | null;
  birthPlace: string;
  city: string;
  state: string;
  photoUrl: string | null;
  initials: string;
  /** The account signs in with this email, so it can't be blanked. */
  emailRequired: boolean;
}

export type Form = {
  firstName: string;
  lastName: string;
  email: string;
  gender: string | null;
  birthDate: string;
  /** As typed, 12-hour "hh:mm" (saved as 24-hour "HH:MM" with the period). */
  birthTime: string;
  birthPeriod: Period | "";
  birthPlace: string;
  city: string;
  state: string;
};
export type Field = keyof Form;
export type Errors = Partial<Record<Field, string>>;

export function toForm(p: Profile): Form {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    gender: genderLabel(p.gender),
    birthDate: p.birthDate ?? "",
    birthTime: from24h(p.birthTime).time,
    birthPeriod: from24h(p.birthTime).period,
    birthPlace: p.birthPlace,
    city: p.city,
    state: p.state,
  };
}

/** Today as YYYY-MM-DD in the viewer's own calendar. */
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function ageFrom(dob: string, today = todayKey()): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** "14 May 1994" */
export function longDate(dob: string): string {
  const [y, m, d] = dob.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Same rules as the API, so most mistakes show before saving. */
export function validate(f: Form, emailRequired: boolean): Errors {
  const e: Errors = {};
  const first = f.firstName.trim();
  if (!first) e.firstName = "Enter your first name.";
  else if (first.length > 60) e.firstName = "First name can be up to 60 characters.";
  if (f.lastName.trim().length > 60) e.lastName = "Last name can be up to 60 characters.";
  const email = f.email.trim();
  if (!email && emailRequired) e.email = "You sign in with this email, so it can't be removed.";
  else if (email && !isValidEmail(email)) e.email = emailRequired ? EMAIL_MESSAGE : "Enter a valid email address, like name@example.com, or leave it blank.";
  if (f.birthDate) {
    const d = new Date(f.birthDate + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f.birthDate) {
      e.birthDate = "Enter a real date.";
    } else if (f.birthDate > todayKey()) e.birthDate = "Date of birth cannot be in the future.";
    else if (ageFrom(f.birthDate) > 120) e.birthDate = "Check the year — that's more than 120 years ago.";
  }
  const timeProblem = time12Problem(f.birthTime, f.birthPeriod);
  if (timeProblem) e.birthTime = timeProblem;
  for (const [k, label] of [
    ["birthPlace", "Place of birth"],
    ["city", "City"],
    ["state", "State"],
  ] as const) {
    if (f[k].trim().length > 100) e[k] = `${label} can be up to 100 characters.`;
  }
  return e;
}

/**
 * Saves the form with PUT /api/me/profile. On failure returns the message and, when the
 * API names one, the field it belongs to (a 409 is the email belonging to someone else).
 */
export async function saveProfile(form: Form): Promise<{ profile: Profile } | { error: string; field?: Field }> {
  try {
    const res = await fetch("/api/me/profile", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        gender: form.gender,
        birthDate: form.birthDate || null,
        birthTime: to24h(form.birthTime, form.birthPeriod) || null,
        birthPlace: form.birthPlace.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
      }),
    });
    const body = (await res.json().catch(() => null)) as { profile?: Profile; error?: { message?: string; field?: string } } | null;
    if (res.ok && body?.profile) return { profile: body.profile };
    const error = body?.error?.message ?? "Something went wrong. Please try again.";
    const field = (res.status === 409 ? "email" : body?.error?.field) as Field | undefined;
    return { error, field: field && field in form ? field : undefined };
  } catch {
    return { error: "Couldn't save. Check your connection and try again." };
  }
}

/** Decodes the chosen file and re-encodes it as a JPEG of at most `maxSide` px (PHOTO_MAX_SIDE by default). */
export async function preparePhoto(file: File, maxSide = PHOTO_MAX_SIDE): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't a photo we can use. Choose a JPEG, PNG or WebP image.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't prepare this photo. Try another one.");
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Your browser couldn't prepare this photo. Try another one.");
  return blob;
}

/** Uploads a prepared photo (POST /api/me/photo) and returns its new URL. */
export async function uploadPhoto(blob: Blob): Promise<string> {
  const res = await fetch("/api/me/photo", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "image/jpeg", accept: "application/json" },
    body: blob,
  });
  const { photoUrl } = await readResponse<{ photoUrl: string }>(res);
  return photoUrl;
}

export const inputClass = (error?: string) =>
  `mt-1.5 h-12 w-full min-w-0 rounded-xl border bg-white px-3.5 text-[15px] text-ink outline-none focus:border-amber-500 ${APP_INPUT} ${
    error ? "border-rose-400" : "border-line max-lg:border-app-line"
  }`;

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1 text-xs font-semibold text-rose-700">
      {error}
    </p>
  );
}

export function ProfileForm({
  form,
  errors,
  formError,
  saving,
  emailRequired,
  phone = "",
  set,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  emailHelp,
  children,
}: {
  form: Form;
  errors: Errors;
  formError: string;
  saving: boolean;
  emailRequired: boolean;
  /** The account's verified sign-in mobile number, shown read-only (it can't be changed here). */
  phone?: string;
  set: <K extends Field>(key: K, value: Form[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  emailHelp?: string;
  /** Extra fields shown after the birth details, before the buttons. */
  children?: React.ReactNode;
}) {
  const today = todayKey();
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;

  const text = (
    key: Exclude<Field, "gender" | "birthTime" | "birthPeriod">,
    label: string,
    { help, format, ...opts }: Partial<React.InputHTMLAttributes<HTMLInputElement>> & { help?: string; format?: (v: string) => string } = {},
  ) => (
    <div>
      <label htmlFor={`pf-${key}`} className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
        {label}
      </label>
      <input
        id={`pf-${key}`}
        {...opts}
        value={form[key]}
        onChange={(e) => set(key, format ? format(e.target.value) : e.target.value)}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `pf-${key}-err` : help ? `pf-${key}-help` : undefined}
        className={inputClass(errors[key])}
      />
      {errors[key] ? (
        <FieldError id={`pf-${key}-err`} error={errors[key]} />
      ) : (
        help && (
          <p id={`pf-${key}-help`} className="mt-1 text-[11.5px] leading-[1.45] text-stone-500">
            {help}
          </p>
        )
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <h3 className="m-0 font-display text-[24px] font-semibold text-ink">A little about you</h3>
      <p className="mt-0.5 mb-3 text-[12.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-2">First name is enough. Skip the rest — paid consults stay available.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("firstName", "First name", { autoComplete: "given-name", maxLength: 60, required: true })}
        {text("lastName", "Last name (optional)", { autoComplete: "family-name", maxLength: 60 })}
        {phone && (
          <div className="sm:col-span-2">
            <span id="pf-phone-label" className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
              Mobile number
            </span>
            <div
              aria-labelledby="pf-phone-label"
              className="mt-1.5 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-cream px-3.5 text-[15px] text-ink max-lg:min-h-[50px] max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-bg max-lg:text-[16px]"
            >
              <span className="font-semibold tabular-nums">{formatMobile(phone)}</span>
              <VerifiedTag />
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-stone-500">You log in with this number. To use a different number, contact support.</p>
          </div>
        )}
        <div className="sm:col-span-2">
          {text("email", emailRequired ? "Email" : "Email (optional)", {
            type: "email",
            autoComplete: "email",
            placeholder: "name@email.com",
            maxLength: 254,
            help: emailHelp,
          })}
        </div>
      </div>
      <div className="mt-3.5">
        <span id="pf-gender-label" className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
          Gender (optional)
        </span>
        <div role="radiogroup" aria-labelledby="pf-gender-label" className="mt-1.5 flex flex-wrap gap-2">
          {GENDERS.map((g) => {
            const on = form.gender === g;
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={on}
                // Tapping the chosen option again clears it (gender is optional).
                onClick={() => set("gender", on ? null : g)}
                className={`h-10 rounded-full border px-4 text-[13.5px] font-semibold max-lg:px-3 max-lg:text-[13px] ${
                  on
                    ? "border-amber-500 bg-amber-500 text-ink max-lg:border-app-primary max-lg:bg-app-primary"
                    : "border-line bg-white text-ink max-lg:border-app-line max-lg:bg-app-surface"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      <h3 className="mt-6 mb-0 font-display text-[24px] font-semibold text-ink">Birth details</h3>
      <p className="mt-0.5 mb-3 text-[12.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-2">
        Used for Kundli and matchmaking. Skip if you prefer to add this later — paid consults stay available.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("birthDate", "Date of birth", { type: "date", min: oldest, max: today })}
        <div>
          <label htmlFor="pf-birthTime" className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
            Time of birth
          </label>
          <TimeOfBirthField
            id="pf-birthTime"
            time={form.birthTime}
            period={form.birthPeriod}
            onTime={(t) => set("birthTime", t)}
            onPeriod={(p) => set("birthPeriod", p)}
            invalid={!!errors.birthTime}
            describedBy={errors.birthTime ? "pf-birthTime-err" : "pf-birthTime-help"}
            periodLabel="Time of birth: AM or PM"
            inputClassName={inputClass(errors.birthTime).replace("mt-1.5 ", "")}
          />
          {errors.birthTime ? (
            <FieldError id="pf-birthTime-err" error={errors.birthTime} />
          ) : (
            <p id="pf-birthTime-help" className="mt-1 text-[11.5px] leading-[1.45] text-stone-500">
              {to24h(form.birthTime, form.birthPeriod)
                ? `Saved as ${form.birthTime.padStart(5, "0")} ${form.birthPeriod}.`
                : "Type hh:mm and choose AM or PM. We will not invent a time if you leave this blank."}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">{text("birthPlace", "Place of birth", { placeholder: "Locality or town", maxLength: 100 })}</div>
        {text("city", "City", { autoComplete: "address-level2", maxLength: 100 })}
        {text("state", "State", { autoComplete: "address-level1", maxLength: 100 })}
      </div>

      {children}

      {formError && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
          {formError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2.5 max-lg:flex-col max-lg:gap-2">
        <button type="submit" disabled={saving} className={`az-cta h-12 min-w-[140px] rounded-full px-7 text-[15px] font-bold ${APP_CTA}`}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`h-12 rounded-full border border-line bg-white px-6 text-[14.5px] font-bold text-ink ${APP_SECONDARY}`}
        >
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}

/** The small green "Verified" tag beside a confirmed contact detail. */
export function VerifiedTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-bold text-emerald-800 ring-1 ring-emerald-200">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
      Verified
    </span>
  );
}

/**
 * Round profile photo: tap to choose a new one (resized, then uploaded straight away),
 * with "Remove photo" under it once there is one.
 */
export function PhotoPicker({
  photoUrl,
  initials,
  onChange,
  align = "responsive",
}: {
  photoUrl: string | null;
  initials: string;
  /** Called with the new URL (or null when removed); `message` is a short confirmation. */
  onChange: (photoUrl: string | null, message: string) => void;
  /** "center" keeps it centred at every width (sign-up); "responsive" moves it left from sm up. */
  align?: "center" | "responsive";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the local preview once it is replaced.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function choose(file: File) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const blob = await preparePhoto(file);
      setPreview(URL.createObjectURL(blob));
      onChange(await uploadPhoto(blob), "Photo updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the photo. Try again.");
    } finally {
      setPreview(null);
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/me/photo", { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json" } });
      await readResponse(res);
      onChange(null, "Photo removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const src = preview ?? photoUrl;
  const side = align === "center" ? "items-center text-center" : "items-center text-center sm:items-start sm:text-left";
  return (
    <div className={`flex flex-col gap-2 ${side}`}>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
        aria-label={photoUrl ? "Change your photo" : "Add a photo"}
        className="relative grid size-[88px] place-items-center overflow-hidden rounded-full border-2 border-gold bg-amber-100 text-[30px] font-bold text-amber-800 max-lg:border-0 max-lg:bg-app-tint-2 max-lg:text-app-active"
      >
        {src ? <Image src={src} alt="" fill unoptimized sizes="88px" className="object-cover" /> : initials || "+"}
        {busy && <span className="absolute inset-0 grid place-items-center bg-[rgba(28,25,23,.45)] text-xs font-bold text-white">Saving</span>}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void choose(file);
        }}
      />
      <span className="text-[12px] text-stone-500">Tap photo to update</span>
      {photoUrl && !busy && (
        <button type="button" onClick={() => void remove()} className="text-[12px] font-semibold text-rose-700">
          Remove photo
        </button>
      )}
      {error && (
        <p role="alert" className="max-w-[220px] text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
