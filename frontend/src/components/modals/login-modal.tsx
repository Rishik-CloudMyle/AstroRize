"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { homeFor } from "@/lib/auth";
import { ApiError } from "@/lib/api/client";
import { sessionActions } from "@/lib/session-store";
import Modal, { CloseButton } from "../ui/modal";

export type LoginMethod = "phone" | "email";

export interface LoginOptions {
  method?: LoginMethod;
  /** Shown above the form, e.g. when a portal sent the visitor here to sign in. */
  notice?: string;
}

/**
 * Sign-in window.
 * - Mobile number → six-digit code sent by SMS: customer accounts.
 * - Email + password: the account decides the role — astrologers open /portal,
 *   admins open /admin, everyone else stays on the website as a customer.
 */
export default function LoginModal({ onClose, options = {} }: { onClose: () => void; options?: LoginOptions }) {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod>(options.method ?? "phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** Only set in development, when the API returns the code instead of texting it. */
  const [devCode, setDevCode] = useState("");

  const phoneReady = phone.length === 10;
  const otpReady = otp.length === 6;
  const onOtpStep = method === "phone" && step === "otp";

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
    if (!user) return;
    onClose();
    if (user.role !== "customer") router.push(homeFor(user.role));
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
    <Modal onClose={onClose} labelledBy="login-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="login-title" className="m-0 font-display text-[27px] font-semibold text-ink">
            {onOtpStep ? "Enter the code" : "Log in to continue"}
          </h2>
          <p className="mt-1 text-[13px] text-stone-500">
            {onOtpStep
              ? `We sent a six-digit code to +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`
              : method === "email"
                ? "Customers, astrologers and Astrorize staff all sign in here."
                : "One account everywhere — the same login works in the Astrorize app."}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {options.notice && (
        <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-normal text-amber-900">
          {options.notice}
        </div>
      )}

      {!onOtpStep && (
        <div role="tablist" aria-label="Sign-in method" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
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
                method === key ? "bg-white text-ink shadow-[0_1px_3px_rgba(90,62,40,.15)]" : "text-stone-500"
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
            <label htmlFor="login-email" className="text-xs font-semibold text-stone-600">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              className="mt-1.5 min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-amber-500"
            />
          </div>
          <div className="mt-3">
            <label htmlFor="login-password" className="text-xs font-semibold text-stone-600">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="mt-1.5 min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-amber-500"
            />
          </div>
          {errorLine}
          <button type="submit" disabled={busy} className="az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold">
            Log in
          </button>
        </form>
      ) : step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!phoneReady) return setError("Enter your 10-digit mobile number.");
            void sendCode();
          }}
        >
          <div className="mt-[18px]">
            <label htmlFor="login-phone" className="text-xs font-semibold text-stone-600">
              Mobile number
            </label>
            <div className="mt-1.5 flex min-h-[52px] items-center overflow-hidden rounded-xl border border-line bg-white">
              <span className="border-r border-line px-[13px] font-bold text-stone-600">+91</span>
              <input
                id="login-phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43242"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
                className="min-w-0 flex-1 border-0 bg-transparent p-3 text-base text-ink outline-none"
              />
            </div>
          </div>
          {errorLine}
          <button type="submit" disabled={busy} className="az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold">
            Send OTP
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!otpReady) return setError("Enter the six-digit code.");
            void run(() => sessionActions.verifyOtp(phone, otp)).then((user) => user && onClose());
          }}
        >
          <div className="mt-[18px]">
            <label htmlFor="login-otp" className="text-xs font-semibold text-stone-600">
              Six-digit code
            </label>
            <input
              id="login-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
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
          <button type="submit" disabled={busy} className="az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold">
            Verify and log in
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setOtp("");
              setError("");
            }}
            className="mt-2 w-full text-[13px] font-semibold text-amber-700"
          >
            Change number
          </button>
        </form>
      )}

      <p className="mt-3.5 text-center text-xs leading-normal text-stone-500">
        By continuing you agree to our{" "}
        <Link href="/terms" onClick={onClose}>
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/terms" onClick={onClose}>
          Privacy Policy
        </Link>
        .
      </p>
    </Modal>
  );
}
