"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api/client";
import { homeFor } from "@/lib/auth";
import { rupee, signedRupee } from "@/lib/format";
import { DATA_RIGHTS } from "@/lib/mock/wallet";
import { sessionActions, totalBalance, useHydrated, useSession } from "@/lib/session-store";
import { useIsDesktop } from "@/lib/use-desktop";
import { useAppUI } from "../app-provider";
import { WelcomeBanner } from "../consult/free-call";
import AppButton from "../mobile/button";
import AppCard from "../mobile/app-card";
import EmptyState from "../mobile/empty-state";
import { IconWallet } from "../mobile/icons";
import { AppTopbar } from "../mobile/page-title";
import { Skeleton } from "../mobile/skeleton";
import AccountSection, { ClosedNotice, type Closed } from "./account-section";
import { BillingIssueAction, BillingIssues, canRaiseIssue } from "./billing-issue";
import ProfileSection from "./profile-section";
import { LockIcon, RAZORPAY_TRUST, payLabel, paymentPageHref, rechargeMessage, useRecharge, type Paid } from "./use-recharge";
import CustomAmountField, { type CustomAmount, isCustomAmount, pickedDenomination } from "./custom-amount";
import MobileWallet, { type Denomination } from "./wallet-mobile";

const CLOSED_KEY = "astrorize.accountClosed";

function readClosed(): Closed | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(CLOSED_KEY);
    return raw ? (JSON.parse(raw) as Closed) : null;
  } catch {
    return null;
  }
}

function writeClosed(closed: Closed | null) {
  try {
    if (closed?.kind === "deleted") window.sessionStorage.setItem(CLOSED_KEY, JSON.stringify(closed));
    else window.sessionStorage.removeItem(CLOSED_KEY);
  } catch {
    // Storage blocked (private mode): the note just won't survive a refresh.
  }
}

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";

/**
 * Wallet is for signed-in customers only. Logged out, it shows a sign-in
 * prompt instead of anyone's balance (the prototype showed data either way).
 */
export default function WalletView() {
  const hydrated = useHydrated();
  const session = useSession();
  const { openLogin } = useAppUI();
  // Phones and tablets get the app-look screens (wallet-mobile.tsx); desktop keeps this layout.
  const desktop = useIsDesktop();
  // After "Deactivate" or "Delete my account": the note that replaces the wallet. A deletion's
  // refund reference is kept for this tab, so a refresh doesn't lose it.
  const [closed, setClosedState] = useState<Closed | null>(readClosed);
  // A note restored after a reload belongs to an account that is already signed out (deleted),
  // so anyone signed in now gets their own wallet.
  const [sawLogout, setSawLogout] = useState(() => readClosed() !== null);
  const setClosed = (next: Closed | null) => {
    setClosedState(next);
    writeClosed(next);
    // The note replaces the whole page; start it at the top, not where the account boxes were.
    if (next) window.scrollTo({ top: 0 });
  };
  // Signed out after closing, then someone signs in again: show their wallet.
  if (closed && session.ready && !session.loggedIn && !sawLogout) setSawLogout(true);
  if (closed && session.loggedIn && sawLogout) {
    setSawLogout(false);
    setClosed(null);
  }

  if (!hydrated || !session.ready) {
    return (
      <>
        <div className="h-80 rounded-[22px] border border-line bg-paper max-lg:hidden" aria-busy="true" />
        <div className="lg:hidden" aria-busy="true">
          <AppTopbar title="Wallet" />
          <div className="px-4 pt-3">
            <Skeleton rounded="card" className="h-[190px] w-full" />
            <Skeleton rounded="card" className="mt-3.5 h-app-hit w-full" />
          </div>
        </div>
      </>
    );
  }

  if (!desktop) {
    if (closed) {
      return (
        <div className="px-4 pt-4 pb-8">
          <ClosedNotice
            closed={closed}
            onLogin={() => {
              setClosed(null);
              openLogin();
            }}
          />
        </div>
      );
    }
    if (!session.loggedIn || session.role !== "customer") {
      const customer = !session.loggedIn;
      return (
        <>
          <AppTopbar title="Wallet" />
          <div className="px-4 pt-3 pb-8">
            <AppCard padding="lg">
              <EmptyState
                icon={<IconWallet />}
                title={customer ? "Log in to see your wallet" : "Wallets are for customer accounts"}
                body={
                  customer
                    ? "Your balance and transactions are private to your account. New here? Logging in with your mobile number creates your account."
                    : session.role === "astrologer"
                      ? "Your earnings and availability are in your astrologer portal."
                      : "Your tools are in the admin console."
                }
                action={
                  customer ? (
                    <AppButton onClick={() => openLogin()} className="min-w-[160px]">
                      Log in
                    </AppButton>
                  ) : (
                    <AppButton href={homeFor(session.role)}>
                      {session.role === "astrologer" ? "Open my portal" : "Open the admin console"}
                    </AppButton>
                  )
                }
              />
            </AppCard>
          </div>
        </>
      );
    }
  }

  if (closed) {
    return (
      <ClosedNotice
        closed={closed}
        onLogin={() => {
          setClosed(null);
          openLogin();
        }}
      />
    );
  }

  if (!session.loggedIn) {
    return (
      <div className="mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl">🔒</div>
        <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">Log in to see your wallet</h2>
        <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-normal text-stone-600">
          Your balance, transactions and data rights are private to your account.
        </p>
        <button type="button" onClick={() => openLogin()} className="az-cta mt-6 h-12 rounded-full px-8 text-[15px] font-bold">
          Log in
        </button>
        <p className="mt-4 text-[12.5px] text-stone-500">
          New here? Logging in with your mobile number creates your account.
        </p>
      </div>
    );
  }

  if (session.role !== "customer") {
    // Astrologers and staff have no customer wallet; point them back to their portal.
    return (
      <div className="mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          👋
        </div>
        <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">Wallets are for customer accounts</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-normal text-stone-600">
          You&apos;re signed in as {session.role === "astrologer" ? "an astrologer account" : "an AstroRize staff account"}, so
          there&apos;s no balance to show here — recharges and consultations happen on customer accounts.{" "}
          {session.role === "astrologer" ? "Your earnings and availability are in your portal." : "Your tools are in the admin console."}
        </p>
        <Link
          href={homeFor(session.role)}
          className="az-cta mt-6 inline-flex h-12 items-center rounded-full px-8 text-[15px] font-bold hover:text-cta-ink hover:no-underline"
        >
          {session.role === "astrologer" ? "Open the astrologer portal" : "Open the admin console"}
        </Link>
      </div>
    );
  }

  return <SignedInWallet onClosed={setClosed} />;
}

function SignedInWallet({ onClosed }: { onClosed: (closed: Closed) => void }) {
  const desktop = useIsDesktop();
  const session = useSession();
  const { toast } = useAppUI();
  const { wallet } = session;
  const [denominations, setDenominations] = useState<Denomination[] | null>(null);
  const [gstRate, setGstRate] = useState(0);
  const [custom, setCustom] = useState<CustomAmount | null>(null);
  const [denom, setDenom] = useState(1000);
  // Razorpay is connected (null until the amounts load).
  const [paymentsOn, setPaymentsOn] = useState<boolean | null>(null);
  const [payError, setPayError] = useState("");
  const [requesting, setRequesting] = useState<string | null>(null);
  const addMoneyHeading = useRef<HTMLHeadingElement>(null);
  const [highlight, setHighlight] = useState(false);

  /** Bring the Add money card into view and focus it (from the balance card, or a /wallet#add-money link). */
  const showAddMoney = useCallback((smooth: boolean) => {
    const heading = addMoneyHeading.current;
    if (!heading) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("add-money")?.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "start" });
    heading.focus({ preventScroll: true });
    setHighlight(true);
  }, []);

  // Arrived from "Add money" elsewhere (consult screen, header): the page renders after the
  // sign-in check, so the browser's own jump to #add-money has already been missed.
  useEffect(() => {
    if (window.location.hash === "#add-money") showAddMoney(false);
    const onHash = () => window.location.hash === "#add-money" && showAddMoney(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [showAddMoney]);

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setHighlight(false), 1600);
    return () => clearTimeout(id);
  }, [highlight]);

  // Recharge amounts, bonuses, claimed-offer cashback and GST come from the API; the balance is re-read so it is current.
  // Read again after a payment (a claimed cashback offer may have been used up).
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ denominations: Denomination[]; gstRate: number; custom?: CustomAmount; payments?: { available: boolean } }>("/wallet/denominations")
      .then((res) => {
        if (cancelled) return;
        setDenominations(res.denominations);
        setGstRate(res.gstRate);
        setCustom(res.custom ?? null);
        setPaymentsOn(res.payments?.available ?? false);
        setDenom((d) =>
          res.denominations.some((x) => x.amount === d) || isCustomAmount(d, res.custom ?? null) ? d : (res.denominations[0]?.amount ?? 0),
        );
      })
      .catch((e) => !cancelled && setPayError(errorText(e)));
    if (loads === 0) sessionActions.refreshWallet().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loads]);

  const gst = Math.round(denom * gstRate);
  const selected = pickedDenomination(denominations, denom, custom);

  // Paid, failed or still pending: the payment's own page shows it (with the receipt).
  const recharge = useRecharge(
    useCallback((paid: Paid) => {
      if (paid.order.cashback > 0) setLoads((n) => n + 1);
    }, []),
    "push",
  );
  const payState = recharge.state;
  const payNote = rechargeMessage(payState);

  async function requestDataRight(r: (typeof DATA_RIGHTS)[number]) {
    if (requesting) return;
    setRequesting(r.key);
    try {
      await api.post("/me/data-requests", { kind: r.key });
      toast(r.message);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setRequesting(null);
    }
  }

  function pick(amount: number) {
    setDenom(amount);
    setPayError("");
    recharge.reset();
  }

  if (!desktop) {
    return (
      <Suspense fallback={null}>
        <MobileWallet
          denominations={denominations}
          custom={custom}
          gstRate={gstRate}
          denom={denom}
          onPick={pick}
          loadError={payError}
          paymentsOn={paymentsOn}
          onPaid={(usedOffer) => usedOffer && setLoads((n) => n + 1)}
          onClosed={onClosed}
          onDataRight={(r) => void requestDataRight(r)}
          requesting={requesting}
        />
      </Suspense>
    );
  }

  const buttonLabel =
    paymentsOn === false
      ? "Payments aren't connected yet"
      : payState.stage === "paid"
        ? `✓ Paid · ${rupee(payState.paid.order.amount)} credited`
        : !selected && denominations
          ? "Choose an amount to add"
          : payLabel(payState, denom + gst);

  return (
    // Phones: balance, Add money, then the rest. Wider: the rest under the balance, Add money alongside.
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-[22px]">
        {/* ---------- Balance ---------- */}
        <div className="min-w-0 rounded-[22px] border border-amber-200 bg-amber-50 p-5 sm:p-6 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[.08em] text-amber-800">Total spendable</div>
              <div className="mt-1 text-[44px] font-bold leading-[1.1] tabular-nums text-ink">{rupee(totalBalance(session))}</div>
            </div>
            <button
              type="button"
              onClick={() => sessionActions.logOut()}
              className="h-9 rounded-full border border-amber-300 bg-white/70 px-4 text-[13px] font-semibold text-amber-900"
            >
              Log out
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-7">
            <div>
              <div className="text-xs text-stone-500">Service balance</div>
              <b className="text-[17px] tabular-nums">{rupee(wallet.service)}</b>
            </div>
            <div>
              <div className="text-xs text-stone-500">Promotional · used first</div>
              <b className="text-[17px] tabular-nums">{rupee(wallet.promo)}</b>
              {wallet.promo > 0 && wallet.promoExpires && (
                <div className="text-[11px] font-semibold text-amber-700">expires {wallet.promoExpires}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => showAddMoney(true)}
            className="az-cta mt-4 h-11 rounded-full px-6 text-[14.5px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)]"
          >
            + Add money
          </button>
          <WelcomeBanner className="mt-4" showUsedUp />
        </div>

      <div className="order-last flex min-w-0 flex-col gap-[18px] lg:order-none lg:col-start-1 lg:row-start-2">

        {/* ---------- Transactions ---------- */}
        <div className="rounded-[22px] border border-line bg-paper p-4 sm:p-[22px]">
          <h2 className="mb-3.5 text-[17px] font-bold">Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {["Date", "Type", "Transaction ID", "Bucket", "Amount"].map((h) => (
                    <th
                      key={h}
                      className={`border-b-2 border-line bg-cream px-2.5 py-[9px] text-[11px] uppercase tracking-[.08em] text-stone-500 ${h === "Amount" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wallet.transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border-b border-line-soft px-2.5 py-[18px] text-center text-stone-500">
                      No transactions yet. Recharges and consultations will appear here.
                    </td>
                  </tr>
                )}
                {wallet.transactions.map((t) => (
                  <tr key={t.ref}>
                    <td className="whitespace-nowrap border-b border-line-soft px-2.5 py-[11px] text-stone-600">{t.date}</td>
                    <td className="border-b border-line-soft px-2.5 py-[11px] font-semibold text-ink">
                      {t.type}
                      {canRaiseIssue(t) && <BillingIssueAction txRef={t.ref} compact />}
                    </td>
                    <td className="border-b border-line-soft px-2.5 py-[11px] tabular-nums text-stone-600">
                      {t.payment ? (
                        <Link
                          href={paymentPageHref(t.payment)}
                          className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800"
                          aria-label={`${t.ref} — view payment`}
                        >
                          {t.ref}
                        </Link>
                      ) : (
                        t.ref
                      )}
                    </td>
                    <td className="border-b border-line-soft px-2.5 py-[11px] text-stone-600">{t.bucket}</td>
                    <td
                      className="whitespace-nowrap border-b border-line-soft px-2.5 py-[11px] text-right font-bold tabular-nums"
                      style={{ color: t.amount < 0 ? "#be123c" : "#047857" }}
                    >
                      {signedRupee(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- Billing issues raised from a consultation line (only when there are some) ---------- */}
        <BillingIssues className="rounded-[22px] border border-line bg-paper p-4 sm:p-[22px]" />

        {/* ---------- Help & support ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line bg-paper p-4 sm:p-[22px]">
          <div className="min-w-0 flex-1 basis-[240px]">
            <h2 className="mb-1 text-[17px] font-bold">Help &amp; support</h2>
            <p className="m-0 text-[13px] text-stone-500">
              A payment, refund, consultation or account problem? Raise an issue and follow our team&rsquo;s replies.
            </p>
          </div>
          <Link
            href="/support"
            className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-[13.5px] font-bold text-ink hover:border-amber-300 hover:text-ink hover:no-underline"
          >
            Help &amp; support
          </Link>
        </div>

        {/* ---------- Profile (shared only with an astrologer whose live queue the customer joins) ---------- */}
        <ProfileSection />

        {/* ---------- Data rights ---------- */}
        <div className="relative rounded-[22px] border border-line bg-paper p-4 sm:p-[22px]">
          <h2 className="mb-1 text-[17px] font-bold">Your data rights</h2>
          <p className="mb-4 text-[13px] text-stone-500">
            Digital Personal Data Protection Act, 2023 — exercisable here, no email required.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3">
            {DATA_RIGHTS.map((r) => (
              <div key={r.key} className="flex flex-col gap-1.5 rounded-2xl border border-line-warm bg-card p-[15px]">
                <b className="text-sm font-bold text-ink">{r.title}</b>
                <span className="flex-1 text-[12.5px] leading-[1.45] text-stone-500">{r.body}</span>
                <button
                  type="button"
                  onClick={() => void requestDataRight(r)}
                  disabled={requesting !== null}
                  className="h-[34px] self-start rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-ink"
                >
                  {r.cta}
                </button>
              </div>
            ))}
          </div>
          <AccountSection onClosed={onClosed} />
        </div>
      </div>

      {/* ---------- Add money ---------- */}
      <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div
          id="add-money"
          className={`scroll-mt-24 rounded-[22px] border bg-card p-5 shadow-[0_12px_28px_rgba(90,62,40,.09)] transition-[border-color,box-shadow] duration-500 ${highlight ? "border-amber-500 ring-4 ring-amber-200" : "border-line-warm"}`}
        >
          <h2 ref={addMoneyHeading} tabIndex={-1} className="mb-3 text-base font-bold outline-none">
            Add money
          </h2>
          <div role="radiogroup" aria-label="Recharge amount" className="grid grid-cols-3 gap-2">
            {!denominations &&
              Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="h-[52px] rounded-[14px] border border-line bg-white" aria-hidden="true" />
              ))}
            {denominations?.map((d) => {
              const on = d.amount === denom;
              return (
                <button
                  key={d.amount}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(d.amount)}
                  className={`rounded-[14px] border px-1.5 py-3 text-center ${on ? "border-amber-600 bg-amber-50" : "border-line bg-white"}`}
                >
                  <b className="block text-[15px] font-bold tabular-nums text-ink">{rupee(d.amount)}</b>
                  {d.bonus + d.cashback > 0 && (
                    <span className="mt-[5px] inline-block rounded-full bg-emerald-50 px-[7px] py-0.5 text-[10px] font-extrabold text-emerald-700">
                      +{rupee(d.bonus + d.cashback)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {denominations && <CustomAmountField custom={custom} denom={denom} fixed={denominations.map((d) => d.amount)} onPick={pick} />}
          <div className="mt-4 border-t border-[#f3e9d8] pt-3.5">
            {[
              { label: "Recharge", value: rupee(denom) },
              { label: denominations ? `GST ${Math.round(gstRate * 100)}%` : "GST", value: rupee(gst) },
              { label: "Total payable", value: rupee(denom + gst), strong: true },
              { label: "Wallet credit", value: rupee(denom), strong: true, green: true },
              ...(selected && selected.bonus > 0 ? [{ label: "Bonus · promotional", value: `+${rupee(selected.bonus)}`, strong: true, green: true }] : []),
              ...(selected && selected.cashback > 0
                ? [{ label: `Cashback · ${selected.cashbackFrom ?? "your offer"}`, value: `+${rupee(selected.cashback)}`, strong: true, green: true }]
                : []),
            ].map((o) => (
              <div
                key={o.label}
                className="flex justify-between gap-3 py-1.5 text-sm"
                style={{ color: o.green ? "#047857" : o.strong ? "#1c1917" : "#57534e", fontWeight: o.strong ? 700 : 500 }}
              >
                <span>{o.label}</span>
                <b className="tabular-nums">{o.value}</b>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => selected && void recharge.pay(selected.amount)}
            disabled={recharge.busy || !selected || !paymentsOn}
            className={`mt-3.5 h-12 w-full rounded-full text-[15px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)] disabled:cursor-not-allowed ${
              payState.stage === "paid" ? "bg-emerald-700 text-white" : paymentsOn === false ? "bg-stone-200 text-stone-500 shadow-none" : "az-cta"
            }`}
          >
            {buttonLabel}
          </button>
          {paymentsOn === false && (
            <p role="status" className="mt-2.5 text-xs font-semibold text-stone-600">
              Recharges open as soon as our payment partner is connected. Your balance is safe.
            </p>
          )}
          {payState.stage === "paid" && payState.paid.paymentId && (
            <p role="status" className="mt-2.5 text-xs font-semibold text-emerald-700">
              Payment ID {payState.paid.paymentId}
              {payState.paid.method ? ` · ${payState.paid.method.toUpperCase()}` : ""}
            </p>
          )}
          {payError && (
            <p role="alert" className="mt-2.5 text-xs font-semibold text-rose-700">
              {payError}
            </p>
          )}
          {payNote && (
            <div
              role={payNote.tone === "error" ? "alert" : "status"}
              className={`mt-2.5 rounded-xl px-3 py-2.5 text-xs leading-normal font-semibold ${payNote.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-900"}`}
            >
              {payNote.text}
              {payState.stage === "pending" && (
                <button
                  type="button"
                  onClick={() => void recharge.check()}
                  className="mt-2 block h-8 rounded-full border border-amber-300 bg-white px-3.5 text-[12px] font-bold text-amber-900"
                >
                  Check status
                </button>
              )}
            </div>
          )}
          <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-normal text-stone-500">
            <LockIcon className="mt-px size-3.5 shrink-0" />
            <span>{RAZORPAY_TRUST}</span>
          </p>
          {/* Under NPCI's rules a computer gets UPI as a QR code only (no "enter your UPI ID"). */}
          <p className="mt-1.5 text-[11.5px] leading-normal text-stone-500">
            Paying by UPI on a computer? Scan the QR code with any UPI app on your phone.
          </p>
          <p className="mt-2.5 text-[11.5px] leading-normal text-stone-500">
            GST is charged on top of your recharge. Your wallet is credited the full {rupee(denom)} talk-time value.
            {selected && selected.cashback > 0 && " Cashback is promotional credit from an offer you claimed."}
          </p>
          <Link href="/offers" className="mt-1.5 inline-block text-[12px] font-bold text-amber-700">
            See offers
          </Link>
        </div>
      </aside>
    </div>
  );
}
