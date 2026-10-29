"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { mobileDigits, mobileProblem } from "@/lib/contact";
import { sessionActions, type ApiUser } from "@/lib/session-store";
import PasswordInput from "../ui/password-input";
import { APP_CTA, APP_INPUT, APP_LABEL, APP_SECONDARY } from "./app-look";
import OtpInput from "./otp-input";

export type LoginMethod = "phone" | "email";

const FIELD = `min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-amber-500 ${APP_INPUT} max-lg:min-h-[50px] max-lg:border-app-line`;

/** The "+91 | number" field: the app's 50px input on phones/tablets. */
export const PHONE_BOX =
  "mt-1.5 flex min-h-[52px] items-center overflow-hidden rounded-xl border border-line bg-white max-lg:min-h-[50px] max-lg:rounded-app-input max-lg:border-app-line max-lg:bg-app-surface max-lg:focus-within:border-app-selected";

/**
 * The sign-in form used by the login window and the /login page.
 * - Mobile number → six-digit code sent by SMS: customer accounts.
 * - Email + password: the account decides the role (customer, astrologer or staff).
 */
export default function LoginForm({
  headingId,
  headingLevel = "h2",
  initialMethod = "phone",
  notice,
  closeButton,
  onSignedIn,
  onGuest,
  onLeave,
}: {
  headingId: string;
  headingLevel?: "h1" | "h2";
  initialMethod?: LoginMethod;
  /** Shown above the form, e.g. when a portal sent the visitor here to sign in. */
  notice?: string;
  /** Rendered beside the heading (the window's ✕). */
  closeButton?: React.ReactNode;
  onSignedIn: (user: ApiUser) => void;
  /** "Continue as guest": look around without an account. */
  onGuest: () => void;
  /** Called when a link inside the form opens another page (the window closes itself). */
  onLeave?: () => void;
}) {
  const [method, setMethod] = useState<LoginMethod>(initialMethod);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** Only set in development, when the API returns the code instead of texting it. */
  const [devCode, setDevCode] = useState("");

  const otpReady = otp.length === 6;
  const onOtpStep = method === "phone" && step === "otp";
  const Heading = headingLevel;

  function switchMethod(next: LoginMethod) {
    setMethod(next);
    setError("");
  }

  /** Runs an API call, showing its error message under the form. */
  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      return await task();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    const user = await run(() => sessionActions.logInWithEmail(email, password));
    if (user) onSignedIn(user);
  }

  async function sendCode() {
    const sent = await run(() => sessionActions.requestOtp(phone));
    if (!sent) return;
    setDevCode(sent.devCode ?? "");
    setOtp("");
    setStep("otp");
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
      {error}
    </p>
  );

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Heading id={headingId} className="m-0 font-display text-[27px] font-semibold text-ink max-lg:text-[30px] max-lg:leading-tight">
            {onOtpStep ? "Enter the code" : "Log in to continue"}
          </Heading>
          <p className="mt-1 text-[13px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-2">
            {onOtpStep
              ? `We sent a six-digit code to +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`
              : method === "email"
                ? "Customers, astrologers and Astrorize staff all sign in here."
                : "One account everywhere — the same login works in the Astrorize app."}
          </p>
        </div>
        {closeButton}
      </div>

      {notice && (
        <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-normal text-amber-900">
          {notice}
        </div>
      )}

      {!onOtpStep && (
        <div
          role="tablist"
          aria-label="Sign-in method"
          className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-cream p-1 max-lg:rounded-app-btn max-lg:border max-lg:border-app-line max-lg:bg-app-surface"
        >
          {(
            [
              ["phone", "Mobile number"],
              ["email", "Email"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={method === key}
              onClick={() => switchMethod(key)}
              className={`h-9 rounded-[10px] text-[13px] font-bold ${
                method === key
                  ? "bg-white text-ink shadow-[0_1px_3px_rgba(90,62,40,.15)] max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none"
                  : "text-stone-500 max-lg:text-app-ink-2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {method === "email" ? (
        <form onSubmit={submitEmail} noValidate>
          <div className="mt-[18px]">
            <label htmlFor={`${headingId}-email`} className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
              Email
            </label>
            <input
              id={`${headingId}-email`}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              className={`mt-1.5 ${FIELD}`}
            />
          </div>
          <div className="mt-3">
            <label htmlFor={`${headingId}-password`} className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
              Password
            </label>
            <PasswordInput
              id={`${headingId}-password`}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              wrapperClassName="mt-1.5"
              className={FIELD}
            />
          </div>
          {errorLine}
          <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
            Log in
          </button>
        </form>
      ) : step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const problem = mobileProblem(phone);
            if (problem) return setError(problem);
            void sendCode();
          }}
        >
          <div className="mt-[18px]">
            <label htmlFor={`${headingId}-phone`} className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
              Mobile number
            </label>
            <div className={PHONE_BOX}>
              <span className="border-r border-line px-[13px] font-bold text-stone-600 max-lg:border-app-line max-lg:text-app-ink">+91</span>
              <input
                id={`${headingId}-phone`}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43242"
                value={phone}
                onChange={(e) => {
                  setPhone(mobileDigits(e.target.value));
                  setError("");
                }}
                className="min-w-0 flex-1 border-0 bg-transparent p-3 text-base text-ink outline-none"
              />
            </div>
          </div>
          {errorLine}
          <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
            Send OTP
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!otpReady) return setError("Enter the six-digit code.");
            void run(() => sessionActions.verifyOtp(phone, otp)).then((user) => user && onSignedIn(user));
          }}
        >
          <div className="mt-[18px]">
            <label htmlFor={`${headingId}-otp`} className={`text-xs font-semibold text-stone-600 ${APP_LABEL}`}>
              Six-digit code
            </label>
            <OtpInput
              id={`${headingId}-otp`}
              value={otp}
              invalid={!!error}
              onChange={(digits) => {
                setOtp(digits);
                setError("");
              }}
              className="mt-1.5 min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-center text-xl font-bold tracking-[.4em] text-ink outline-none"
            />
          </div>
          {devCode && (
            <p className="mt-2 text-xs text-stone-500">
              Development build — your code is <b className="font-mono text-ink">{devCode}</b>
            </p>
          )}
          {errorLine}
          <button type="submit" disabled={busy} className={`az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold ${APP_CTA}`}>
            Verify and log in
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
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
              className="text-[13px] font-semibold text-amber-700 max-lg:min-h-app-hit max-lg:text-app-accent"
            >
              Resend code
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 border-t border-line-soft pt-3.5 text-center max-lg:border-app-line">
        <p className="m-0 text-[13px] text-stone-600">
          New here?{" "}
          <Link href="/signup" onClick={onLeave} className="font-bold">
            Sign up
          </Link>
        </p>
        <button
          type="button"
          onClick={onGuest}
          className={`mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink ${APP_SECONDARY} max-lg:text-[15px]`}
        >
          Continue as guest
        </button>
        <p className="mt-1.5 mb-0 text-[11.5px] text-stone-500">Look around first — no account needed to browse.</p>
      </div>

      <p className="mt-3.5 mb-0 text-center text-xs leading-normal text-stone-500">
        By continuing you agree to our{" "}
        <Link href="/terms" onClick={onLeave}>
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/terms" onClick={onLeave}>
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}
