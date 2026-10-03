"use client";

import Link from "next/link";
import { useState } from "react";
import { sessionActions } from "@/lib/session-store";
import Modal, { CloseButton } from "../ui/modal";

/** OTP login: mobile number → six-digit code. (Mock: any code is accepted.) */
export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");

  const phoneReady = phone.length === 10;
  const otpReady = otp.length === 6;

  return (
    <Modal onClose={onClose} labelledBy="login-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="login-title" className="m-0 font-display text-[27px] font-semibold text-ink">
            {step === "phone" ? "Log in to continue" : "Enter the code"}
          </h2>
          <p className="mt-1 text-[13px] text-stone-500">
            {step === "phone"
              ? "One account everywhere — the same login works in the Astrorize app."
              : `We sent a six-digit code to +91 ${phone.slice(0, 5)} ${phone.slice(5)}.`}
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!phoneReady) return setError("Enter your 10-digit mobile number.");
            setError("");
            setStep("otp");
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
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
          <button type="submit" className="az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold">
            Send OTP
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!otpReady) return setError("Enter the six-digit code.");
            sessionActions.logIn(phone);
            onClose();
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
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
          <button type="submit" className="az-cta mt-4 h-[50px] w-full rounded-full text-[15px] font-bold">
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
