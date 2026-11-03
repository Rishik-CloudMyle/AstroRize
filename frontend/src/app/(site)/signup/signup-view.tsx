"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { destinationFor, sessionName } from "@/components/account/auth-shell";
import {
  EMAIL_PATTERN,
  FieldError,
  PhotoPicker,
  ProfileForm,
  inputClass,
  saveProfile,
  toForm,
  validate,
  type Errors,
  type Field,
  type Form,
  type Profile,
} from "@/components/account/profile-form";
import { APP_CTA, APP_LABEL, APP_SECONDARY } from "@/components/account/app-look";
import { PHONE_BOX } from "@/components/account/login-form";
import OtpInput from "@/components/account/otp-input";
import { useAppUI } from "@/components/app-provider";
import PasswordInput from "@/components/ui/password-input";
import { ApiError, api } from "@/lib/api/client";
import { sessionActions, useSession, type AstrologerSignup } from "@/lib/session-store";
import { LANGUAGE_OPTIONS, MAX_LANGUAGES, MAX_SKILLS, SKILL_OPTIONS, passwordProblem } from "./options";

type SignupRole = "customer" | "astrologer";

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

const LABEL = `text-xs font-semibold text-stone-600 ${APP_LABEL}`;
const PHONE_PATTERN = /^[6-9]\d{9}$/;

/**
 * /signup: customers (mobile number → code → "A little about you" + "Birth details")
 * or astrologers (details → code → their application in the portal). Staff accounts
 * are created by a Super Admin, never here.
 */
export default function SignupView({ initialRole, next }: { initialRole: SignupRole; next: string | null }) {
  const session = useSession();
  const router = useRouter();
  const [role, setRole] = useState<SignupRole>(initialRole);
  /** True once this page signed them in, so the "already logged in" card never replaces the flow. */
  const [started, setStarted] = useState(false);

  if (!session.ready) return <div className="h-[420px] rounded-2xl bg-cream max-lg:bg-transparent" aria-busy="true" />;

  if (session.loggedIn && !started) {
    return (
      <div>
        <h1 className="m-0 font-display text-[27px] font-semibold text-ink">You already have an account</h1>
        <p className="mt-1 text-[13.5px] text-stone-600">
          You&rsquo;re logged in as <b className="text-ink">{sessionName(session)}</b>. Log out first to create a different account.
        </p>
        <Link
          href={destinationFor(session.role, next)}
          className={`az-cta mt-5 flex h-[50px] items-center justify-center rounded-full text-[15px] font-bold hover:text-cta-ink hover:no-underline ${APP_CTA}`}
        >
          Continue
        </Link>
        <button
          type="button"
          onClick={() => void sessionActions.logOut()}
          className={`mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink ${APP_SECONDARY}`}
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div>
      {!started && (
        <>
          <h1 className="m-0 font-display text-[30px] font-semibold text-ink max-lg:leading-tight">Create your account</h1>
          <p className="mt-1 mb-4 text-[13px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-2">Choose how you&rsquo;ll use AstroRize.</p>
          <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2.5">
            {(
              [
                ["customer", "I want to consult an astrologer", "Chat, call or watch live"],
                ["astrologer", "I'm an astrologer", "Apply to consult on AstroRize"],
              ] as const
            ).map(([key, label, sub]) => {
              const on = role === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRole(key)}
                  className={`flex min-h-[86px] flex-col items-start justify-start rounded-2xl border-2 p-3 text-left max-lg:rounded-app-card max-lg:border max-lg:shadow-app-card ${
                    on ? "border-amber-500 bg-amber-50 max-lg:border-app-selected max-lg:bg-app-tint" : "border-line bg-white max-lg:border-app-line max-lg:bg-app-surface"
                  }`}
                >
                  <span className="text-[13.5px] leading-[1.3] font-bold text-ink">{label}</span>
                  <span className="mt-1 text-[11.5px] leading-[1.35] text-stone-500">{sub}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {role === "customer" ? (
        <CustomerSignup next={next} onStarted={setStarted} />
      ) : (
        <AstrologerSignupForm onStarted={setStarted} />
      )}

      {!started && (
        <div className="mt-5 border-t border-line-soft pt-4 text-center max-lg:border-app-line">
          <p className="m-0 text-[13px] text-stone-600">
            Already have an account?{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold">
              Log in
            </Link>
          </p>
          <button
            type="button"
            onClick={() => router.push(destinationFor("customer", next))}
            className={`mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink ${APP_SECONDARY}`}
          >
            Continue as guest
          </button>
          <p className="mt-1.5 mb-0 text-[11.5px] text-stone-500">Look around first — no account needed to browse.</p>
          <p className="mt-3 mb-0 text-[12px] text-stone-500">AstroRize staff: ask your Super Admin for an account.</p>
          <p className="mt-3 mb-0 text-xs leading-normal text-stone-500">
            By continuing you agree to our <Link href="/terms">Terms of Use</Link> and <Link href="/terms">Privacy Policy</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Customers ───────────────────────────

function CustomerSignup({ next, onStarted }: { next: string | null; onStarted: (started: boolean) => void }) {
  const router = useRouter();
  const { toast } = useAppUI();
  const [step, setStep] = useState<"phone" | "otp" | "details">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const done = () => router.push(destinationFor("customer", next));

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!PHONE_PATTERN.test(phone)) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    setError("");
    try {
      const sent = await sessionActions.requestOtp(phone);
      setDevCode(sent.devCode ?? "");
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (otp.length !== 6) return setError("Enter the six-digit code.");
    setBusy(true);
    setError("");
    try {
      // Mark the flow as started first: the session flips to signed-in during this call.
      onStarted(true);
      const { created, user } = await sessionActions.signUpWithOtp(phone, otp);
      if (!created) {
        toast(
          user.reactivated
            ? "Welcome back — your account is active again. This number already had an AstroRize account, so we've logged you in."
            : "This number already has an AstroRize account, so we've logged you in.",
        );
        done();
        return;
      }
      setStep("details");
    } catch (err) {
      onStarted(false);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === "details") return <CustomerDetails onDone={done} />;

  return (
    <div className="mt-5">
      <h2 className="m-0 text-[17px] font-bold text-ink">{step === "otp" ? "Enter the code" : "Your mobile number"}</h2>
      <p className="mt-1 text-[13px] text-stone-500">
        {step === "otp"
          ? `We sent a six-digit code to +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`
          : "We'll text you a one-time code. No password needed."}
      </p>
      {step === "phone" ? (
        <form onSubmit={sendCode} noValidate>
          <label htmlFor="su-phone" className={`mt-3.5 block ${LABEL}`}>
            Mobile number
          </label>
          <div className={PHONE_BOX}>
            <span className="border-r border-line px-[13px] font-bold text-stone-600 max-lg:border-app-line max-lg:text-app-ink">+91</span>
            <input
              id="su-phone"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43242"
              value={phone}
              aria-invalid={!!error}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                setError("");
              }}
              className="min-w-0 flex-1 border-0 bg-transparent p-3 text-base text-ink outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
            {busy ? "Sending code…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate>
          <label htmlFor="su-otp" className={`mt-3.5 block ${LABEL}`}>
            Six-digit code
          </label>
          <OtpInput
            id="su-otp"
            value={otp}
            invalid={!!error}
            onChange={(digits) => {
              setOtp(digits);
              setError("");
            }}
            className="mt-1.5 min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-center text-xl font-bold tracking-[.4em] text-ink outline-none"
          />
          {devCode && (
            <p className="mt-2 text-xs text-stone-500">
              Development build — your code is <b className="font-mono text-ink">{devCode}</b>
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
            {busy ? "Checking…" : "Verify and continue"}
          </button>
          <div className="mt-2 flex justify-center gap-5">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError("");
              }}
              className="text-[13px] font-semibold text-amber-700 max-lg:min-h-app-hit max-lg:text-app-accent"
            >
              Change number
            </button>
            <button type="button" disabled={busy} onClick={() => void sendCode()} className="text-[13px] font-semibold text-amber-700 max-lg:min-h-app-hit max-lg:text-app-accent">
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** "A little about you" + "Birth details" right after the code, like the app. Skippable. */
function CustomerDetails({ onDone }: { onDone: () => void }) {
  const { toast } = useAppUI();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<{ password?: string; confirm?: string }>({});
  /** Password already saved (a retry after a later failure shouldn't set it twice). */
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ profile: Profile }>("/me/profile")
      .then(({ profile: p }) => {
        if (cancelled) return;
        setProfile(p);
        setForm(toForm(p));
      })
      .catch((e) => !cancelled && setLoadError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function set<K extends Field>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFormError("");
  }

  function skip() {
    toast("Welcome to AstroRize! Add your details any time from Wallet & account.");
    onDone();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !profile || saving) return;
    const found = validate(form, false);
    const pwErrors: { password?: string; confirm?: string } = {};
    if (withPassword && !passwordSaved) {
      if (!form.email.trim()) found.email = "Add your email to log in with a password.";
      else if (!EMAIL_PATTERN.test(form.email.trim())) found.email = "Enter a valid email address.";
      const problem = passwordProblem(password);
      if (problem) pwErrors.password = problem;
      else if (confirm !== password) pwErrors.confirm = "The two passwords don't match.";
    }
    setErrors(found);
    setPasswordErrors(pwErrors);
    if (Object.keys(found).length || Object.keys(pwErrors).length) {
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
      if (withPassword && !passwordSaved) {
        try {
          await sessionActions.setPassword(password);
          setPasswordSaved(true);
        } catch (err) {
          // 409: this account already has a password — nothing left to do.
          if (!(err instanceof ApiError && err.status === 409)) {
            setPasswordErrors({ password: errorText(err) });
            setFormError("Your details are saved, but the password wasn't. Fix it and press Continue again, or skip it.");
            return;
          }
        }
      }
      void sessionActions.refreshUser().catch(() => {});
      toast(`Welcome to AstroRize, ${result.profile.firstName}!`);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!profile || !form) {
    return (
      <div className="mt-2" aria-busy={!loadError}>
        <h1 className="m-0 font-display text-[30px] font-semibold text-ink max-lg:leading-tight">Welcome to AstroRize</h1>
        {loadError ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p role="alert" className="m-0 text-[13px] font-semibold text-rose-700">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => {
                setLoadError("");
                setAttempt((n) => n + 1);
              }}
              className="h-[34px] rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-ink"
            >
              Try again
            </button>
            <button type="button" onClick={skip} className="text-[13px] font-semibold text-amber-700 max-lg:min-h-app-hit max-lg:text-app-accent">
              Skip for now
            </button>
          </div>
        ) : (
          <div className="mt-3 h-64 rounded-2xl bg-cream" />
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="m-0 mb-3 font-display text-[30px] font-semibold text-ink max-lg:leading-tight">Welcome to AstroRize</h1>
      <p className="m-0 mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-800">
        ✓ Your account is ready. Tell us a little about you — or skip for now.
      </p>
      <div className="mb-4 flex justify-center">
        <PhotoPicker
          align="center"
          photoUrl={profile.photoUrl}
          initials={form.firstName.trim() ? form.firstName.trim()[0]!.toUpperCase() : ""}
          onChange={(photoUrl, message) => {
            setProfile((p) => (p ? { ...p, photoUrl } : p));
            toast(message);
          }}
        />
      </div>
      <ProfileForm
        form={form}
        errors={errors}
        formError={formError}
        saving={saving}
        emailRequired={withPassword && !passwordSaved}
        set={set}
        onSubmit={submit}
        onCancel={skip}
        submitLabel="Continue"
        cancelLabel="Skip for now"
      >
        {!passwordSaved ? (
          <div className="mt-6 rounded-2xl border border-line bg-white p-3.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={withPassword}
                onChange={(e) => {
                  setWithPassword(e.target.checked);
                  setPasswordErrors({});
                  setErrors((er) => ({ ...er, email: undefined }));
                }}
                className="mt-0.5 size-[18px] shrink-0 accent-amber-600"
              />
              <span>
                <b className="block text-[13.5px] text-ink">Also log in with email and a password (optional)</b>
                <span className="text-[12px] text-stone-500">Handy on a computer. Your mobile number keeps working too.</span>
              </span>
            </label>
            {withPassword && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="su-cpw" className={LABEL}>
                    Password
                  </label>
                  <PasswordInput
                    id="su-cpw"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordErrors({});
                      setFormError("");
                    }}
                    aria-invalid={!!passwordErrors.password}
                    aria-describedby={passwordErrors.password ? "su-cpw-err" : "su-cpw-help"}
                    wrapperClassName="mt-1.5"
                    className={inputClass(passwordErrors.password).replace("mt-1.5 ", "")}
                  />
                  {passwordErrors.password ? (
                    <FieldError id="su-cpw-err" error={passwordErrors.password} />
                  ) : (
                    <p id="su-cpw-help" className="mt-1 text-[11.5px] text-stone-500">
                      At least 8 characters, with a letter and a number.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="su-cpw2" className={LABEL}>
                    Confirm password
                  </label>
                  <PasswordInput
                    id="su-cpw2"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setPasswordErrors((p) => ({ ...p, confirm: undefined }));
                      setFormError("");
                    }}
                    aria-invalid={!!passwordErrors.confirm}
                    aria-describedby={passwordErrors.confirm ? "su-cpw2-err" : undefined}
                    wrapperClassName="mt-1.5"
                    className={inputClass(passwordErrors.confirm).replace("mt-1.5 ", "")}
                  />
                  <FieldError id="su-cpw2-err" error={passwordErrors.confirm} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-6 mb-0 text-[12.5px] font-semibold text-emerald-700">✓ Password saved — you can also log in with your email.</p>
        )}
      </ProfileForm>
    </div>
  );
}

// ─────────────────────────── Astrologers ───────────────────────────

type AstroForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
  gender: "Female" | "Male" | "none" | "";
  years: string;
  skills: string[];
  languages: string[];
};
type AstroField = keyof AstroForm;

const EMPTY_ASTRO: AstroForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirm: "",
  gender: "",
  years: "",
  skills: [],
  languages: [],
};

function validateAstro(f: AstroForm): Partial<Record<AstroField, string>> {
  const e: Partial<Record<AstroField, string>> = {};
  const name = f.name.trim();
  if (name.length < 2) e.name = "Enter your full name.";
  else if (name.length > 60) e.name = "Your name can be up to 60 characters.";
  if (!EMAIL_PATTERN.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (!PHONE_PATTERN.test(f.phone)) e.phone = "Enter a valid 10-digit mobile number.";
  const pw = passwordProblem(f.password);
  if (pw) e.password = pw;
  else if (f.confirm !== f.password) e.confirm = "The two passwords don't match.";
  if (!f.gender) e.gender = "Choose one of the options.";
  const years = Number(f.years);
  if (f.years.trim() === "" || !Number.isInteger(years)) e.years = "Enter your years of experience.";
  else if (years < 0 || years > 60) e.years = "Years of experience can be 0 to 60.";
  if (!f.skills.length) e.skills = "Choose at least one skill.";
  if (!f.languages.length) e.languages = "Choose at least one language.";
  return e;
}

function toSignup(f: AstroForm): AstrologerSignup {
  return {
    name: f.name.trim().replace(/\s+/g, " "),
    email: f.email.trim(),
    phone: f.phone,
    password: f.password,
    gender: f.gender === "Female" || f.gender === "Male" ? f.gender : null,
    years: Number(f.years),
    skills: f.skills,
    languages: f.languages,
  };
}

function AstrologerSignupForm({ onStarted }: { onStarted: (started: boolean) => void }) {
  const router = useRouter();
  const { toast } = useAppUI();
  const [form, setForm] = useState<AstroForm>(EMPTY_ASTRO);
  const [errors, setErrors] = useState<Partial<Record<AstroField, string>>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"details" | "otp">("details");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState("");
  const [otpError, setOtpError] = useState("");

  function set<K extends AstroField>(key: K, value: AstroForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFormError("");
  }

  function toggleIn(key: "skills" | "languages", value: string, max: number) {
    const list = form[key];
    if (list.includes(value)) return set(key, list.filter((v) => v !== value));
    if (list.length >= max) {
      setErrors((e) => ({ ...e, [key]: `Choose up to ${max}.` }));
      return;
    }
    set(key, [...list, value]);
  }

  /** Puts an API error on the field it is about (the API names email / number clashes). */
  function showApiError(err: unknown) {
    const message = errorText(err);
    setFormError(message);
    if (err instanceof ApiError && err.status === 409) {
      if (/email/i.test(message)) setErrors((e) => ({ ...e, email: message }));
      else if (/mobile|number/i.test(message)) setErrors((e) => ({ ...e, phone: message }));
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const found = validateAstro(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Check the highlighted fields.");
      return;
    }
    setBusy(true);
    setFormError("");
    setOtpError("");
    try {
      const sent = await sessionActions.startAstrologerSignup(toSignup(form));
      setDevCode(sent.devCode ?? "");
      setOtp("");
      setStep("otp");
    } catch (err) {
      if (step === "otp") setOtpError(errorText(err));
      else showApiError(err);
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (otp.length !== 6) return setOtpError("Enter the six-digit code.");
    setBusy(true);
    setOtpError("");
    try {
      onStarted(true);
      await sessionActions.signUpAstrologer(toSignup(form), otp);
      toast("Account created. Continue your application — it saves as you go.");
      router.push("/portal/application");
    } catch (err) {
      onStarted(false);
      if (err instanceof ApiError && err.status === 409) {
        // The email or number was taken meanwhile: back to the details to change it.
        setStep("details");
        showApiError(err);
      } else setOtpError(errorText(err));
      setBusy(false);
    }
  }

  const text = (
    key: "name" | "email" | "years",
    label: string,
    opts: Partial<React.InputHTMLAttributes<HTMLInputElement>> & { help?: string } = {},
  ) => {
    const { help, ...rest } = opts;
    return (
      <div>
        <label htmlFor={`as-${key}`} className={LABEL}>
          {label}
        </label>
        <input
          id={`as-${key}`}
          {...rest}
          value={form[key]}
          onChange={(e) => set(key, key === "years" ? e.target.value.replace(/\D/g, "").slice(0, 2) : e.target.value)}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `as-${key}-err` : help ? `as-${key}-help` : undefined}
          className={inputClass(errors[key])}
        />
        {errors[key] ? (
          <FieldError id={`as-${key}-err`} error={errors[key]} />
        ) : (
          help && (
            <p id={`as-${key}-help`} className="mt-1 text-[11.5px] leading-[1.45] text-stone-500">
              {help}
            </p>
          )
        )}
      </div>
    );
  };

  const chips = (key: "skills" | "languages", label: string, options: readonly string[], max: number) => (
    <div className="mt-3.5">
      <span id={`as-${key}-label`} className={LABEL}>
        {label} <span className="font-normal text-stone-500">({form[key].length} of up to {max})</span>
      </span>
      <div role="group" aria-labelledby={`as-${key}-label`} aria-describedby={errors[key] ? `as-${key}-err` : undefined} className="mt-1.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = form[key].includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => toggleIn(key, o, max)}
              className={`h-9 rounded-full border px-3.5 text-[13px] font-semibold ${
                on ? "border-amber-500 bg-amber-500 text-ink max-lg:border-app-primary max-lg:bg-app-primary" : "border-line bg-white text-ink max-lg:border-app-line max-lg:bg-app-surface"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      <FieldError id={`as-${key}-err`} error={errors[key]} />
    </div>
  );

  if (step === "otp") {
    return (
      <form onSubmit={create} noValidate className="mt-5">
        <h2 className="m-0 text-[17px] font-bold text-ink">Verify your mobile number</h2>
        <p className="mt-1 text-[13px] text-stone-500">
          We sent a six-digit code to +91 {form.phone.slice(0, 5)} {form.phone.slice(5)}. Customers never see this number.
        </p>
        <label htmlFor="as-otp" className={`mt-3.5 block ${LABEL}`}>
          Six-digit code
        </label>
        <OtpInput
          id="as-otp"
          value={otp}
          invalid={!!otpError}
          onChange={(digits) => {
            setOtp(digits);
            setOtpError("");
          }}
          className="mt-1.5 min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-center text-xl font-bold tracking-[.4em] text-ink outline-none"
        />
        {devCode && (
          <p className="mt-2 text-xs text-stone-500">
            Development build — your code is <b className="font-mono text-ink">{devCode}</b>
          </p>
        )}
        {otpError && (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
            {otpError}
          </p>
        )}
        <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
          {busy ? "Creating your account…" : "Verify and create account"}
        </button>
        <div className="mt-2 flex justify-center gap-5">
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setOtp("");
              setOtpError("");
            }}
            className="text-[13px] font-semibold text-amber-700 max-lg:min-h-app-hit max-lg:text-app-accent"
          >
            Edit details
          </button>
          <button type="button" disabled={busy} onClick={() => void sendCode()} className="text-[13px] font-semibold text-amber-700 max-lg:min-h-app-hit max-lg:text-app-accent">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} noValidate className="mt-5">
      <h2 className="m-0 text-[17px] font-bold text-ink">Apply as an astrologer</h2>
      <p className="mt-1 mb-3 text-[13px] text-stone-500">
        Start with the basics. Next, you&rsquo;ll finish your application in the astrologer portal — HR reviews it before your profile goes live.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {text("name", "Full name", { autoComplete: "name", maxLength: 60, placeholder: "As on your KYC document" })}
        {text("email", "Email", { type: "email", autoComplete: "email", maxLength: 254, placeholder: "you@example.com", help: "You'll log in to the portal with this email." })}
        <div>
          <label htmlFor="as-phone" className={LABEL}>
            Mobile number
          </label>
          <div
            className={`mt-1.5 flex h-12 items-center overflow-hidden rounded-xl border bg-white max-lg:h-[50px] max-lg:rounded-app-input max-lg:focus-within:border-app-selected ${
              errors.phone ? "border-rose-400" : "border-line max-lg:border-app-line"
            }`}
          >
            <span className="border-r border-line px-[13px] font-bold text-stone-600 max-lg:border-app-line max-lg:text-app-ink">+91</span>
            <input
              id="as-phone"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43242"
              value={form.phone}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "as-phone-err" : "as-phone-help"}
              onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="min-w-0 flex-1 border-0 bg-transparent p-3 text-[15px] text-ink outline-none"
            />
          </div>
          {errors.phone ? (
            <FieldError id="as-phone-err" error={errors.phone} />
          ) : (
            <p id="as-phone-help" className="mt-1 text-[11.5px] text-stone-500">
              We&rsquo;ll text a code to verify it.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="as-password" className={LABEL}>
              Password
            </label>
            <PasswordInput
              id="as-password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "as-password-err" : "as-password-help"}
              wrapperClassName="mt-1.5"
              className={inputClass(errors.password).replace("mt-1.5 ", "")}
            />
            {errors.password ? (
              <FieldError id="as-password-err" error={errors.password} />
            ) : (
              <p id="as-password-help" className="mt-1 text-[11.5px] text-stone-500">
                At least 8 characters, with a letter and a number.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="as-confirm" className={LABEL}>
              Confirm password
            </label>
            <PasswordInput
              id="as-confirm"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? "as-confirm-err" : undefined}
              wrapperClassName="mt-1.5"
              className={inputClass(errors.confirm).replace("mt-1.5 ", "")}
            />
            <FieldError id="as-confirm-err" error={errors.confirm} />
          </div>
        </div>
      </div>

      <div className="mt-3.5">
        <span id="as-gender-label" className={LABEL}>
          Gender
        </span>
        <div role="radiogroup" aria-labelledby="as-gender-label" className="mt-1.5 flex flex-wrap gap-2">
          {(
            [
              ["Female", "Female"],
              ["Male", "Male"],
              ["none", "Prefer not to say"],
            ] as const
          ).map(([value, label]) => {
            const on = form.gender === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("gender", value)}
                className={`h-10 rounded-full border px-4 text-[13.5px] font-semibold max-lg:px-3 max-lg:text-[13px] ${
                  on ? "border-amber-500 bg-amber-500 text-ink max-lg:border-app-primary max-lg:bg-app-primary" : "border-line bg-white text-ink max-lg:border-app-line max-lg:bg-app-surface"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FieldError id="as-gender-err" error={errors.gender} />
      </div>

      <div className="mt-3.5 max-w-[220px]">
        {text("years", "Years of experience", { inputMode: "numeric", placeholder: "e.g. 8", maxLength: 2 })}
      </div>

      {chips("skills", "Main skills", SKILL_OPTIONS, MAX_SKILLS)}
      {chips("languages", "Languages you consult in", LANGUAGE_OPTIONS, MAX_LANGUAGES)}

      <p className="mt-4 mb-0 text-[12px] leading-[1.5] text-stone-500">
        Your rates, photo and bio are agreed during the application. Nothing is shown to customers until HR approves your profile.
      </p>
      {formError && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
          {formError}
        </p>
      )}
      <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
