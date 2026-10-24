"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { sessionActions } from "@/lib/session-store";
import AppButton from "../mobile/button";
import Modal, { CloseButton } from "../ui/modal";
import PasswordInput from "../ui/password-input";

// "Deactivate account" and "Delete my account" at the foot of Wallet & account.
// Deactivate pauses the account (signed out everywhere; logging in again re-activates it).
// Delete refunds the service balance to the original payment method, forfeits promotional
// credit and erases personal details. Rules and amounts come from the API (GET /me/account).

interface AccountStatus {
  refund: number;
  forfeited: number;
  confirmWith: ("otp" | "password")[];
  phoneHint: string | null;
  deactivateBlocked: string | null;
  deleteBlocked: string | null;
  refundTimeline: string;
}

export interface DeletedResult {
  refund: { ref: string; amount: number; method: string } | null;
  forfeited: number;
  refundTimeline: string;
}

/** What the wallet page shows once the customer has left (it is signed out by then). */
export type Closed = { kind: "paused" } | ({ kind: "deleted" } & DeletedResult);

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

const FIELD =
  "min-h-[50px] w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none focus:border-amber-500";

export default function AccountSection({
  onClosed,
  variant = "cards",
}: {
  onClosed: (closed: Closed) => void;
  /** "cards" = the desktop boxes; "app" = the phone/tablet Settings screen's buttons. */
  variant?: "cards" | "app";
}) {
  const [open, setOpen] = useState<"deactivate" | "delete" | null>(null);
  // Stable, so the dialog doesn't re-focus itself (Modal's effect depends on it) on every render.
  const close = useCallback(() => setOpen(null), []);

  const dialogs = (
    <>
      {open === "deactivate" && <DeactivateDialog onClose={close} onDone={() => onClosed({ kind: "paused" })} />}
      {open === "delete" && <DeleteDialog onClose={close} onDone={(r) => onClosed({ kind: "deleted", ...r })} />}
    </>
  );

  if (variant === "app") {
    return (
      <>
        <p className="mt-0 mb-2 text-[12px] leading-[1.45] text-app-ink-2">
          Deactivate to take a break — you&apos;re logged out everywhere and your balance stays safe; log in again any time.
        </p>
        <AppButton variant="secondary" block onClick={() => setOpen("deactivate")}>
          Deactivate account
        </AppButton>
        <p className="mt-3.5 mb-2 text-[12px] leading-[1.45] text-app-ink-2">
          Deleting is permanent. Your service balance is refunded to your original payment method; promotional credit
          can&apos;t be refunded. Not available while a dispute is open or a legal hold applies.
        </p>
        <AppButton variant="danger" block onClick={() => setOpen("delete")}>
          Delete account
        </AppButton>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
        <div className="flex flex-col rounded-[14px] border border-line bg-cream px-4 py-3.5">
          <b className="text-[13.5px] text-ink">Deactivate account</b>
          <p className="mt-[5px] flex-1 text-[12.5px] leading-normal text-stone-600">
            Take a break. You&apos;ll be logged out on every device and your wallet balance stays safe. Log in again any
            time to pick up where you left off.
          </p>
          <button
            type="button"
            onClick={() => setOpen("deactivate")}
            className="mt-3 h-[34px] self-start rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-ink"
          >
            Deactivate account
          </button>
        </div>
        <div className="flex flex-col rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3.5">
          <b className="text-[13.5px] text-rose-700">Delete my account</b>
          <p className="mt-[5px] flex-1 text-[12.5px] leading-normal text-rose-900">
            Deleting your account is permanent. Your service balance is refunded to your original payment method;
            promotional credit can&apos;t be refunded. We&apos;ll ask you to confirm before anything is deleted. Deletion
            isn&apos;t available while a dispute is open or a legal hold applies.
          </p>
          <button
            type="button"
            onClick={() => setOpen("delete")}
            className="mt-3 h-[34px] self-start rounded-[10px] border border-rose-300 bg-white px-[13px] text-[12.5px] font-bold text-rose-700"
          >
            Delete my account
          </button>
        </div>
      </div>

      {dialogs}
    </>
  );
}

/** Loads GET /me/account when a dialog opens, so the amounts shown are current. */
function useAccountStatus() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ account: AccountStatus }>("/me/account")
      .then((r) => !cancelled && setStatus(r.account))
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, []);
  return { status, error };
}

function DialogHead({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 id={id} className="m-0 font-display text-[26px] font-semibold leading-tight text-ink">
        {title}
      </h2>
      <CloseButton onClick={onClose} />
    </div>
  );
}

function Loading() {
  return <div className="mt-4 h-24 animate-pulse rounded-2xl bg-cream" aria-busy="true" />;
}

function ErrorLine({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-rose-700">
      {text}
    </p>
  ) : null;
}

function DeactivateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { status, error: loadError } = useAccountStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deactivate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/me/account/deactivate");
      // Show the "paused" note first, then drop the signed-in state (no flash of the login prompt).
      onDone();
      await sessionActions.logOut().catch(() => {});
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="deactivate-title" maxWidth={440}>
      <DialogHead id="deactivate-title" title="Deactivate your account?" onClose={onClose} />
      {!status && !loadError && <Loading />}
      <ErrorLine text={loadError} />
      {status && (
        <>
          <ul className="mt-3.5 flex list-none flex-col gap-2 p-0 text-[13.5px] leading-normal text-stone-600">
            <li>• You&apos;ll be logged out on every device straight away.</li>
            <li>• Your wallet balance, history and profile are kept exactly as they are.</li>
            <li>• Astrologers you&apos;ve talked to will see your account as paused.</li>
            <li>• To come back, just log in again with your mobile number or email — your account is active again at once.</li>
          </ul>
          {status.deactivateBlocked ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              {status.deactivateBlocked}
            </p>
          ) : (
            <>
              <ErrorLine text={error} />
              <button
                type="button"
                onClick={() => void deactivate()}
                disabled={busy}
                className="mt-5 h-12 w-full rounded-full bg-ink text-[15px] font-bold text-white disabled:opacity-60"
              >
                {busy ? "Deactivating…" : "Deactivate and log out"}
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink">
            Keep my account active
          </button>
        </>
      )}
    </Modal>
  );
}

function DeleteDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: DeletedResult) => void }) {
  const { status, error: loadError } = useAccountStatus();
  const [step, setStep] = useState<"review" | "confirm">("review");
  const [understood, setUnderstood] = useState(false);
  const [method, setMethod] = useState<"otp" | "password" | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirmMethod = method ?? status?.confirmWith[0] ?? null;

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ devCode?: string }>("/me/account/delete/code");
      setDevCode(r.devCode ?? "");
      setCode("");
      setCodeSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (confirmMethod === "otp" && code.length !== 6) return setError("Enter the six-digit code.");
    if (confirmMethod === "password" && !password) return setError("Enter your password.");
    setBusy(true);
    setError("");
    try {
      const r = await api.post<DeletedResult>("/me/account/delete", confirmMethod === "otp" ? { code } : { password });
      onDone(r);
      await sessionActions.logOut().catch(() => {});
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="delete-title" maxWidth={480}>
      <DialogHead id="delete-title" title="Delete your account?" onClose={onClose} />
      {!status && !loadError && <Loading />}
      <ErrorLine text={loadError} />
      {status && status.deleteBlocked && (
        <>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-normal text-amber-900">
            {status.deleteBlocked}
          </p>
          <button type="button" onClick={onClose} className="mt-4 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink">
            Close
          </button>
        </>
      )}
      {status && !status.deleteBlocked && step === "review" && (
        <>
          <p className="mt-2 text-[13.5px] leading-normal text-stone-600">This can&apos;t be undone. Here&apos;s exactly what happens to your money:</p>
          <div className="mt-3 rounded-2xl border border-line bg-cream px-4 py-1">
            <div className="flex items-start justify-between gap-3 border-b border-line-soft py-3">
              <div>
                <b className="block text-[13.5px] text-ink">Refunded to you</b>
                <span className="text-[12px] text-stone-500">Service balance · to your original payment method</span>
              </div>
              <b className="text-[17px] tabular-nums text-emerald-700">{rupee(status.refund)}</b>
            </div>
            <div className="flex items-start justify-between gap-3 py-3">
              <div>
                <b className="block text-[13.5px] text-ink">Forfeited</b>
                <span className="text-[12px] text-stone-500">Promotional credit · can&apos;t be refunded</span>
              </div>
              <b className="text-[17px] tabular-nums text-rose-700">{rupee(status.forfeited)}</b>
            </div>
          </div>
          {status.refund > 0 && <p className="mt-2 text-[12px] text-stone-500">{status.refundTimeline}</p>}
          <ul className="mt-3 flex list-none flex-col gap-1.5 p-0 text-[13px] leading-normal text-stone-600">
            <li>• Your name, mobile number, email, birth details and photo are erased.</li>
            <li>• Payment and consultation records are kept without your details, as tax law requires.</li>
            <li>• You&apos;ll be logged out everywhere. You can sign up again later with the same number.</li>
          </ul>
          <label className="mt-4 flex items-start gap-2.5 text-[13px] font-semibold text-ink">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-rose-700"
            />
            <span>
              I understand deletion is permanent
              {status.forfeited > 0 ? ` and my ${rupee(status.forfeited)} promotional credit will be forfeited` : ""}.
            </span>
          </label>
          <button
            type="button"
            disabled={!understood}
            onClick={() => setStep("confirm")}
            className="mt-4 h-12 w-full rounded-full bg-rose-700 text-[15px] font-bold text-white disabled:opacity-50"
          >
            Continue
          </button>
          <button type="button" onClick={onClose} className="mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink">
            Keep my account
          </button>
        </>
      )}
      {status && !status.deleteBlocked && step === "confirm" && (
        <form onSubmit={confirmDelete} noValidate>
          {confirmMethod === null && (
            <p className="mt-4 text-[13px] text-stone-600">
              We can&apos;t confirm it&apos;s you on this account. Contact support to delete it.
            </p>
          )}
          {confirmMethod === "otp" && (
            <>
              <p className="mt-2 text-[13.5px] leading-normal text-stone-600">
                To confirm it&apos;s you, we&apos;ll text a six-digit code to +91 {status.phoneHint}.
              </p>
              {!codeSent ? (
                <button type="button" onClick={() => void sendCode()} disabled={busy} className="az-cta mt-4 h-12 w-full rounded-full text-[15px] font-bold">
                  {busy ? "Sending…" : "Send code"}
                </button>
              ) : (
                <>
                  <label htmlFor="delete-code" className="mt-4 block text-xs font-semibold text-stone-600">
                    Six-digit code
                  </label>
                  <input
                    id="delete-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setError("");
                    }}
                    className="mt-1.5 min-h-[52px] w-full rounded-xl border border-line bg-white px-3 text-center text-xl font-bold tracking-[.4em] text-ink outline-none focus:border-amber-500"
                  />
                  {devCode && (
                    <p className="mt-2 text-xs text-stone-500">
                      Development build — your code is <b className="font-mono text-ink">{devCode}</b>
                    </p>
                  )}
                  <button type="button" onClick={() => void sendCode()} disabled={busy} className="mt-2 text-[13px] font-semibold text-amber-700">
                    Send a new code
                  </button>
                </>
              )}
            </>
          )}
          {confirmMethod === "password" && (
            <>
              <p className="mt-2 text-[13.5px] leading-normal text-stone-600">To confirm it&apos;s you, enter your password.</p>
              <label htmlFor="delete-password" className="mt-4 block text-xs font-semibold text-stone-600">
                Password
              </label>
              <PasswordInput
                id="delete-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                wrapperClassName="mt-1.5"
                className={FIELD}
              />
            </>
          )}
          {status.confirmWith.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setMethod(confirmMethod === "otp" ? "password" : "otp");
                setError("");
              }}
              className="mt-2 block text-[13px] font-semibold text-amber-700"
            >
              {confirmMethod === "otp" ? "Use my password instead" : "Text me a code instead"}
            </button>
          )}
          <ErrorLine text={error} />
          {confirmMethod !== null && (confirmMethod === "password" || codeSent) && (
            <button type="submit" disabled={busy} className="mt-4 h-12 w-full rounded-full bg-rose-700 text-[15px] font-bold text-white disabled:opacity-60">
              {busy ? "Deleting…" : `Delete my account${status.refund > 0 ? ` · refund ${rupee(status.refund)}` : ""}`}
            </button>
          )}
          <button type="button" onClick={onClose} className="mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink">
            Keep my account
          </button>
        </form>
      )}
    </Modal>
  );
}

/** Replaces the wallet once the customer has deactivated or deleted their account. */
export function ClosedNotice({ closed, onLogin }: { closed: Closed; onLogin: () => void }) {
  if (closed.kind === "paused") {
    return (
      <div className="mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          ☾
        </div>
        <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">Your account is paused</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-normal text-stone-600">
          You&apos;ve been logged out on every device. Your wallet balance and history are safe — log in again whenever
          you&apos;re ready and your account is active straight away.
        </p>
        <button type="button" onClick={onLogin} className="az-cta mt-6 h-12 rounded-full px-8 text-[15px] font-bold">
          Log in
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[560px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-2xl text-emerald-700" aria-hidden="true">
        ✓
      </div>
      <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">Your account has been deleted</h2>
      <p className="mx-auto mt-2 max-w-[44ch] text-sm leading-normal text-stone-600">
        Your personal details have been erased and you&apos;ve been logged out everywhere. Thank you for being with Astrorize.
      </p>
      {closed.refund ? (
        <div className="mx-auto mt-5 max-w-[400px] rounded-2xl border border-line bg-cream px-4 py-3.5 text-left text-[13.5px]">
          <div className="flex justify-between gap-3 py-1">
            <span className="text-stone-500">Refund reference</span>
            <b className="font-mono text-ink">{closed.refund.ref}</b>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-stone-500">Amount</span>
            <b className="tabular-nums text-emerald-700">{rupee(closed.refund.amount)}</b>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-stone-500">To</span>
            <b className="text-right text-ink">Your original payment method</b>
          </div>
          {closed.forfeited > 0 && (
            <div className="flex justify-between gap-3 py-1">
              <span className="text-stone-500">Promotional credit forfeited</span>
              <b className="tabular-nums text-stone-600">{rupee(closed.forfeited)}</b>
            </div>
          )}
          <p className="mt-2 mb-0 text-[12.5px] leading-normal text-stone-600">
            {closed.refundTimeline} Keep the reference in case you need to ask us about it.
          </p>
        </div>
      ) : (
        <p className="mx-auto mt-4 max-w-[44ch] text-[13px] text-stone-500">
          There was no paid balance to refund
          {closed.forfeited > 0 ? `; ${rupee(closed.forfeited)} of promotional credit was forfeited` : ""}.
        </p>
      )}
    </div>
  );
}
