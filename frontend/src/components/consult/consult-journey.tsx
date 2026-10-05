"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Astrologer, ConsultMode, Settlement } from "@/lib/types";
import { ApiError, api } from "@/lib/api/client";
import { clock, duration, rateFor, rupee, skillLine } from "@/lib/format";
import { sessionActions, totalBalance, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";

type Step = "phone" | "otp" | "mode" | "connecting" | "session" | "settle" | "rate";

const STEP_LABEL: Record<Step, string> = {
  phone: "Step 1 of 4 · Sign in",
  otp: "Step 2 of 4 · Verify",
  mode: "Step 3 of 4 · Choose how to talk",
  connecting: "Step 4 of 4 · Connecting",
  session: "In consultation",
  settle: "Settlement",
  rate: "Rate your consultation",
};

const MODE_CARDS: { key: ConsultMode; icon: string; title: string; body: string }[] = [
  { key: "chat", icon: "💬", title: "Chat", body: "Type back and forth. Best for a single, specific question." },
  { key: "voice", icon: "📞", title: "Voice", body: "A masked call — your number is never shown. Best for a conversation." },
  { key: "video", icon: "📹", title: "Video", body: "Face to face. Needs a stable connection on both sides." },
];

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const RESEND_SECS = 30;
const STEP_MS = 1100;

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

/** The consultation as the API placed it (POST /consultations). */
interface Placed {
  id: string;
  rate: number;
  held: number;
}
/** The meter the API sets when the astrologer picks up (POST /consultations/:id/connect). */
interface Meter {
  freeSeconds: number;
  maxSeconds: number;
}

export default function ConsultJourney({
  astrologer,
  initialMode,
  onClose,
}: {
  astrologer: Astrologer;
  initialMode: ConsultMode | null;
  onClose: () => void;
}) {
  const session = useSession();
  const router = useRouter();
  const { toast } = useAppUI();

  const [step, setStep] = useState<Step>(session.loggedIn ? "mode" : "phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(RESEND_SECS);
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ConsultMode | null>(initialMode);
  const [connectStep, setConnectStep] = useState(0);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [meter, setMeter] = useState<Meter>({ freeSeconds: 60, maxSeconds: 900 });
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const elapsedRef = useRef(0);
  const connectingRef = useRef(false);

  // Always the astrologer's own price, so it matches every other page.
  const baseRate = astrologer.price;
  const balance = totalBalance(session);
  const rate = placed?.rate ?? rateFor(baseRate, mode);
  const held = placed?.held ?? 0;
  const needed = rate * 5;
  const eligible = balance >= needed;

  // Lock page scrolling behind the full-screen flow.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // ---- Sign in (mobile number + six-digit code) ----
  async function verify(code: string) {
    setBusy(true);
    setError("");
    try {
      await sessionActions.verifyOtp(phone, code);
      setStep("mode");
    } catch (e) {
      setError(errorText(e));
      setOtp("");
    } finally {
      setBusy(false);
    }
  }

  function pressKey(key: string) {
    if (busy) return;
    if (step === "phone") {
      setError("");
      if (key === "⌫") setPhone((p) => p.slice(0, -1));
      else if (key) setPhone((p) => (p + key).slice(0, 10));
    } else if (step === "otp") {
      if (key === "⌫") setOtp((o) => o.slice(0, -1));
      else if (key && otp.length < 6) {
        const next = otp + key;
        setOtp(next);
        setError("");
        if (next.length === 6) void verify(next);
      }
    }
  }

  async function sendCode() {
    if (phone.length !== 10 || busy) return;
    setBusy(true);
    setError("");
    try {
      const sent = await sessionActions.requestOtp(phone);
      setDevCode(sent.devCode ?? "");
      setOtp("");
      setResendIn(RESEND_SECS);
      setStep("otp");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Physical keyboard works as well as the on-screen keypad.
  const pressKeyRef = useRef(pressKey);
  const sendCodeRef = useRef(sendCode);
  useEffect(() => {
    pressKeyRef.current = pressKey;
    sendCodeRef.current = sendCode;
  });
  useEffect(() => {
    if (step !== "phone" && step !== "otp") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressKeyRef.current(e.key);
      else if (e.key === "Backspace") pressKeyRef.current("⌫");
      else if (e.key === "Enter" && step === "phone") void sendCodeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Resend countdown on the OTP step.
  useEffect(() => {
    if (step !== "otp") return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step]);

  // ---- Connecting: the API checks the balance and places the hold, then the call rings ----
  async function beginConnect() {
    if (!mode || !eligible || busy) return;
    setBusy(true);
    setError("");
    setPlaced(null);
    setConnectStep(0);
    connectingRef.current = false;
    setStep("connecting");
    try {
      const { consultation } = await api.post<{ consultation: Placed }>("/consultations", {
        astrologerId: astrologer.id,
        mode: mode.toUpperCase(),
      });
      setPlaced(consultation);
      void sessionActions.refreshWallet().catch(() => {});
    } catch (e) {
      setError(errorText(e));
      setStep("mode");
    } finally {
      setBusy(false);
    }
  }

  /** The astrologer picked up: the meter starts from the server's numbers. */
  async function connect(c: Placed) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    try {
      const res = await api.post<Meter>(`/consultations/${c.id}/connect`);
      setMeter({ freeSeconds: res.freeSeconds, maxSeconds: res.maxSeconds });
      setConnectStep(3);
    } catch (e) {
      // Release the hold; nothing is charged for a consultation that never connected.
      await api.post(`/consultations/${c.id}/end`).catch(() => {});
      void sessionActions.refreshWallet().catch(() => {});
      setPlaced(null);
      setError(`${errorText(e)} You have not been charged.`);
      setStep("mode");
    }
  }

  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  });

  useEffect(() => {
    if (step !== "connecting") return;
    // Step 1 (checking the balance) waits for the API to place the consultation.
    if (connectStep === 0 && !placed) return;
    const id = setTimeout(() => {
      if (connectStep === 2) {
        if (placed) void connectRef.current(placed);
      } else if (connectStep >= 3) {
        elapsedRef.current = 0;
        setElapsed(0);
        setStep("session");
      } else {
        setConnectStep(connectStep + 1);
      }
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [step, connectStep, placed]);

  // ---- Session: metered by the second; one charge at the end, by the server clock ----
  async function finish() {
    if (!placed || ending) return;
    setEnding(true);
    try {
      const res = await api.post<{ settlement: Settlement }>(`/consultations/${placed.id}/end`);
      setSettlement(res.settlement);
      setStep("settle");
      void sessionActions.refreshWallet().catch(() => {});
    } catch (e) {
      toast(errorText(e));
    } finally {
      setEnding(false);
    }
  }

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (step !== "session") return;
    const cap = meter.maxSeconds;
    const id = setInterval(() => {
      const next = elapsedRef.current + 1;
      elapsedRef.current = next;
      setElapsed(next);
      if (next >= cap) {
        // The 15-minute cap or the held balance is used up: the API settles it.
        clearInterval(id);
        void finishRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step, meter.maxSeconds]);

  const free = meter.freeSeconds;
  const billedSoFar = Math.ceil(Math.max(0, elapsed - free) / 60);
  const remainingMins = Math.max(0, Math.floor(held / rate) - Math.ceil(elapsed / 60));
  const lowBalance = elapsed > 0 && remainingMins <= 2;

  function headerAction() {
    if (step === "session") {
      void finish();
      return;
    }
    if (step === "connecting" && placed) {
      // Cancelled before connecting: release the hold, nothing is charged.
      void api
        .post(`/consultations/${placed.id}/end`)
        .then(() => sessionActions.refreshWallet())
        .catch(() => {});
    }
    onClose();
  }

  async function submitRating() {
    if (!stars || !placed || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/consultations/${placed.id}/rating`, { stars, review: review.trim() || undefined });
      onClose();
      toast("Thank you — your rating has been recorded.");
      router.push("/wallet");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p role="alert" className="mt-3 text-center text-[13px] font-semibold text-rose-700">
      {error}
    </p>
  );

  return (
    <div className="fixed inset-0 z-[150] overflow-auto bg-cream" role="dialog" aria-modal="true" aria-label={`Consultation with ${astrologer.name}`}>
      <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-3.5 bg-ink px-4 py-3 text-line sm:px-6">
        <FlowPortrait astrologer={astrologer} size={34} />
        <div className="min-w-0">
          <b className="block text-sm text-paper">{astrologer.name}</b>
          <span className="block text-[11.5px] text-muted">{STEP_LABEL[step]}</span>
        </div>
        <button
          type="button"
          onClick={headerAction}
          className="ml-auto h-9 rounded-full border border-stone-700 bg-transparent px-[15px] text-[13px] font-bold text-line"
        >
          {step === "session" ? "End" : step === "settle" || step === "rate" ? "Close" : "Cancel"}
        </button>
      </div>

      <div className="mx-auto max-w-[520px] px-4 pb-14 pt-9 sm:px-6">
        {step === "phone" && (
          <div>
            <h1 className="font-display text-[32px] font-semibold leading-tight text-ink sm:text-4xl">
              What&apos;s your mobile number?
            </h1>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-stone-600">
              We&apos;ll text you a six-digit code. Your number is never shown to the astrologer — all calls are masked.
            </p>
            <div className="mt-6 flex items-center gap-3.5 rounded-2xl border border-line bg-white px-4 py-[18px] sm:px-5">
              <b className="text-[22px] text-stone-600">+91</b>
              <div className="flex min-w-0 flex-1 gap-[3px] sm:gap-[5px]" aria-label="Mobile number" aria-live="polite">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`flex-1 text-center text-lg font-bold tabular-nums sm:text-[21px] ${i < phone.length ? "text-ink" : "text-stone-300"}`}
                  >
                    {phone[i] ?? "·"}
                  </span>
                ))}
              </div>
            </div>
            <Keypad onPress={pressKey} />
            {errorLine}
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={phone.length !== 10 || busy}
              className={`mt-5 min-h-[54px] w-full rounded-[14px] text-base font-bold ${phone.length === 10 && !busy ? "bg-amber-500 text-ink" : "bg-amber-200 text-amber-900"}`}
            >
              {busy ? "Sending the code…" : "Send me the code"}
            </button>
            <p className="mt-3.5 text-center text-xs leading-normal text-stone-500">
              By continuing you agree to our <Link href="/terms" onClick={onClose}>Terms of Use</Link> and{" "}
              <Link href="/terms" onClick={onClose}>Privacy Policy</Link>.
            </p>
          </div>
        )}

        {step === "otp" && (
          <div>
            <h1 className="font-display text-[32px] font-semibold leading-tight text-ink sm:text-4xl">Enter the code</h1>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-stone-600">
              Sent to +91 {phone.slice(0, 5)} {phone.slice(5)}.
            </p>
            <div className="mt-6 flex gap-1.5 sm:gap-[9px]" aria-label="Six-digit code" aria-live="polite">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="grid min-h-14 flex-1 place-items-center rounded-[14px] border-2 text-2xl font-bold tabular-nums text-ink sm:min-h-16 sm:text-[26px]"
                  style={{
                    borderColor: i === otp.length ? "#d97706" : "#e7e0d6",
                    background: otp[i] ? "#fffbeb" : "#fff",
                  }}
                >
                  {otp[i] ?? ""}
                </span>
              ))}
            </div>
            {devCode && (
              <p className="mt-3 text-center text-xs text-stone-500">
                Development build — your code is <b className="font-mono text-ink">{devCode}</b>
              </p>
            )}
            <Keypad onPress={pressKey} />
            {errorLine}
            <p className="mt-[18px] text-center text-[13px] text-stone-500">
              {resendIn > 0 ? (
                <>Didn&apos;t get it? Resend in 0:{String(resendIn).padStart(2, "0")}</>
              ) : (
                <button type="button" onClick={() => void sendCode()} disabled={busy} className="font-semibold text-amber-700">
                  Resend the code
                </button>
              )}
            </p>
          </div>
        )}

        {step === "mode" && (
          <div>
            <h1 className="font-display text-[32px] font-semibold leading-tight text-ink sm:text-4xl">
              How would you like to talk?
            </h1>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-stone-600">
              Nothing is charged until the call connects, and the first minute is free.
            </p>
            <div role="radiogroup" aria-label="Consultation type" className="mt-[22px] flex flex-col gap-[11px]">
              {MODE_CARDS.map((m) => {
                const on = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setMode(m.key)}
                    className={`flex w-full items-start gap-3.5 rounded-[18px] border-2 p-4 text-left sm:p-[18px] ${on ? "border-amber-500 bg-amber-50" : "border-line bg-white"}`}
                  >
                    <span
                      className={`mt-[3px] size-[22px] shrink-0 rounded-full border-2 ${on ? "border-amber-500 bg-amber-500" : "border-stone-300 bg-white"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <b className="block text-[17px] font-bold text-ink">
                        {m.icon} {m.title}
                      </b>
                      <span className="mt-1 block text-[13px] leading-normal text-stone-600">{m.body}</span>
                    </span>
                    <b className="shrink-0 text-base tabular-nums text-plum">{rupee(rateFor(baseRate, m.key))}/min</b>
                  </button>
                );
              })}
            </div>
            {eligible ? (
              <div className="mt-[18px] rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-[13px] leading-[1.55] text-emerald-800">
                ✓ Your balance is {rupee(balance)}. You need {rupee(needed)} for five minutes at {rupee(rate)}/min — you
                are eligible.
              </div>
            ) : (
              <div className="mt-[18px] rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3.5 text-[13px] leading-[1.55] text-rose-900">
                Your balance is {rupee(balance)}. You need {rupee(needed)} for five minutes at {rupee(rate)}/min.{" "}
                <Link href="/wallet" onClick={onClose} className="font-bold">
                  Add money
                </Link>{" "}
                to continue.
              </div>
            )}
            {errorLine}
            <button
              type="button"
              onClick={() => void beginConnect()}
              disabled={!mode || !eligible || busy}
              className={`mt-[18px] min-h-14 w-full rounded-[14px] text-base font-bold ${mode && eligible ? "bg-amber-500 text-ink" : "bg-amber-200 text-amber-900"}`}
            >
              {mode ? "Start the consultation" : "Choose how to talk"}
            </button>
          </div>
        )}

        {step === "connecting" && (
          <div className="pt-5 text-center">
            <span className="relative inline-grid size-[110px] place-items-center">
              <span className="az-pulse-ring absolute inset-0 rounded-full border-2 border-amber-400" />
              <FlowPortrait astrologer={astrologer} size={96} />
            </span>
            <h1 className="mt-5 font-display text-[32px] font-semibold text-ink">Connecting you…</h1>
            <ol className="mt-[26px] flex flex-col gap-3 rounded-[18px] border border-line bg-white p-5 text-left">
              {["Checking your balance", `Placing a hold on ${rupee(placed ? held : balance)}`, `Ringing ${astrologer.name}`, "Connected"].map(
                (label, i) => (
                  <li key={label} className="flex items-center gap-3">
                    <span
                      className="grid size-[26px] shrink-0 place-items-center rounded-full text-xs font-extrabold"
                      style={{
                        background: i < connectStep ? "#047857" : i === connectStep ? "#f59e0b" : "#e7e0d6",
                        color: i <= connectStep ? "#fff" : "#a8a29e",
                      }}
                    >
                      {i < connectStep ? "✓" : i + 1}
                    </span>
                    <span
                      className="text-[14.5px]"
                      style={{ color: i <= connectStep ? "#1c1917" : "#a8a29e", fontWeight: i === connectStep ? 700 : 500 }}
                    >
                      {label}
                    </span>
                  </li>
                ),
              )}
            </ol>
            <p className="mt-4 text-[13px] leading-[1.55] text-stone-500">
              If this fails you are not charged — we&apos;ll tell you clearly.
            </p>
          </div>
        )}

        {step === "session" && (
          <div>
            <div className="rounded-[22px] bg-ink p-6 text-center text-line sm:p-7">
              <span className="inline-flex h-[26px] items-center gap-[7px] rounded-full bg-green-400/15 px-3 text-[11.5px] font-extrabold text-green-400">
                ● {MODE_CARDS.find((m) => m.key === mode)?.title ?? "Chat"} · connected
              </span>
              <div className="mt-3.5 text-[54px] font-bold leading-none tabular-nums text-paper" aria-live="off">
                {clock(elapsed)}
              </div>
              <div className="mt-2 text-[13px] text-muted">elapsed — your balance does not tick down during the session</div>
              {elapsed < free && (
                <div className="mt-4 inline-flex h-8 items-center rounded-full bg-green-400/15 px-[15px] text-[13px] font-bold text-green-400">
                  First minute is free · {free - elapsed}s left
                </div>
              )}
              <div className="mt-[22px] flex flex-wrap justify-center gap-[26px]">
                <div>
                  <div className="text-[11.5px] font-bold text-stone-500">Billed so far</div>
                  <b className="text-xl tabular-nums text-amber-300">{billedSoFar} min</b>
                </div>
                <div>
                  <div className="text-[11.5px] font-bold text-stone-500">Remaining at this rate</div>
                  <b className="text-xl tabular-nums text-amber-300">≈ {remainingMins} min</b>
                </div>
              </div>
            </div>
            {lowBalance && (
              <div className="mt-3.5 flex flex-wrap items-start gap-3 rounded-2xl border-2 border-rose-700 bg-rose-50 px-[17px] py-[15px]">
                <span className="text-base">⚠</span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm text-rose-700">Two minutes of balance left</b>
                  <span className="mt-0.5 block text-[13px] leading-normal text-rose-900">
                    Add money now and the session continues without disconnecting.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toast("Recharge opened — your consultation continues while you pay.")}
                  className="h-[38px] whitespace-nowrap rounded-[10px] bg-rose-700 px-[15px] text-[13px] font-bold text-white"
                >
                  Add money
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => void finish()}
              disabled={ending}
              className="mt-[18px] min-h-[54px] w-full rounded-[14px] bg-rose-700 text-base font-bold text-white disabled:opacity-70"
            >
              {ending ? "Ending…" : "End consultation"}
            </button>
            <p className="mt-3.5 text-center text-[12.5px] leading-[1.55] text-stone-500">
              One charge is taken after the session ends. Partial minutes round up.
            </p>
          </div>
        )}

        {step === "settle" && settlement && <SettlementView s={settlement} onContinue={() => setStep("rate")} />}

        {step === "rate" && (
          <div className="text-center">
            <span className="mx-auto mt-2 block w-fit">
              <FlowPortrait astrologer={astrologer} size={84} />
            </span>
            <h1 className="mt-4 font-display text-[32px] font-semibold text-ink">How was your consultation?</h1>
            <p className="mt-2 text-sm text-stone-600">
              {astrologer.name} · {skillLine(astrologer)}
            </p>
            <div role="radiogroup" aria-label="Rating" className="mt-[22px] flex justify-center gap-2.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onClick={() => setStars(n)}
                  className="border-0 bg-transparent p-0 text-[42px] leading-none"
                  style={{ color: n <= stars ? "#f5b301" : "#e0d6c4" }}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              placeholder="Add a review (optional)"
              aria-label="Review"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="mt-[22px] min-h-[100px] w-full resize-y rounded-[14px] border border-line bg-white p-3.5 font-[inherit] text-sm text-ink outline-none"
            />
            {errorLine}
            <button
              type="button"
              onClick={() => void submitRating()}
              disabled={!stars || busy}
              className={`mt-4 min-h-[54px] w-full rounded-[14px] text-base font-bold ${stars && !busy ? "bg-amber-500 text-ink" : "bg-amber-200 text-amber-900"}`}
            >
              Submit and see my wallet
            </button>
            <p className="mt-3 text-[12.5px] text-stone-500">
              Stars are required, the review is optional. You can defer this for up to 24 hours.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowPortrait({ astrologer, size }: { astrologer: Astrologer; size: number }) {
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-full border-2 border-gold" style={{ width: size, height: size }}>
      <Image src={astrologer.photo} alt="" fill sizes={`${size * 2}px`} className="object-cover" />
    </span>
  );
}

function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="mt-5 grid grid-cols-3 gap-2.5">
      {KEYPAD.map((key, i) =>
        key === "" ? (
          <span key={i} />
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onPress(key)}
            aria-label={key === "⌫" ? "Delete" : key}
            className="min-h-[58px] rounded-[14px] border border-line bg-white text-[21px] font-bold text-ink active:bg-amber-50"
          >
            {key}
          </button>
        ),
      )}
    </div>
  );
}

function SettlementView({ s, onContinue }: { s: Settlement; onContinue: () => void }) {
  const zero = s.billedMins === 0;
  const title = zero ? "You have not been charged" : s.reason === "exhausted" ? "Your balance ran out" : "Consultation complete";
  const lead = zero
    ? "You ended within the free first minute, so there is nothing to bill. The hold on your balance has been released in full."
    : s.reason === "exhausted"
      ? "The session ended on its own when your balance was used up. You have been billed only for the time you were connected — never more than was held."
      : "One debit, taken now that the session has ended. Your hold has been released.";

  const lines: { label: string; value: string; strong?: boolean; green?: boolean }[] = [
    { label: "Connected time", value: duration(s.elapsed) },
    { label: "Free first minute", value: "not billed", green: true },
    { label: "Billed, rounded up", value: `${s.billedMins} min` },
  ];
  if (!zero) {
    lines.push({ label: "Rate at connect", value: `${rupee(s.rate)}/min` });
    lines.push({ label: "Promotional balance used first", value: `−${rupee(s.promo)}`, green: true });
    lines.push({ label: "Service balance", value: `−${rupee(s.service)}` });
  }
  lines.push({ label: zero ? "Total charged" : "Charged once, now", value: rupee(s.total), strong: true, green: zero });

  return (
    <div>
      <div className="mx-auto grid size-[72px] place-items-center rounded-full bg-emerald-50 text-3xl text-emerald-700">✓</div>
      <h1 className="mt-[18px] text-center font-display text-[32px] font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-center text-sm leading-[1.55] text-stone-600">{lead}</p>
      {zero && (
        <div className="mt-[18px] flex items-start gap-3 rounded-2xl border-2 border-emerald-700 bg-emerald-50 px-[17px] py-[15px]">
          <span className="text-base">₹</span>
          <div className="text-[13.5px] leading-[1.55] text-emerald-800">
            <b>You have not been charged.</b> The first 60 seconds of every consultation are free, and nothing bills
            before that window closes.
          </div>
        </div>
      )}
      <div className="mt-6 rounded-[18px] border border-line bg-white p-5">
        {lines.map((l, i) => (
          <div
            key={l.label}
            className={`flex justify-between gap-3 py-[9px] text-sm ${i > 0 ? "border-t border-line-soft" : ""}`}
            style={{
              color: l.green ? "#047857" : l.strong ? "#1c1917" : "#57534e",
              fontWeight: l.strong ? 700 : l.green ? 600 : 500,
            }}
          >
            <span>{l.label}</span>
            <b className="tabular-nums">{l.value}</b>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="mt-5 min-h-[54px] w-full rounded-[14px] bg-amber-500 text-base font-bold text-ink"
      >
        Continue
      </button>
    </div>
  );
}
