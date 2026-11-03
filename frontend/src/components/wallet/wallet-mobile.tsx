"use client";

// Wallet & account on phones and tablets (< 1024px), in the look of the client's mobile app
// prototype: Wallet → Add money → Secure payment → the payment's own page (/wallet/payment/<id>,
// "Payment successful" / failed / pending), Transactions → Transaction,
// plus the account screens that live on this page on desktop (Profile, Settings & data rights).
// Each screen is a `?view=` of /wallet, so the phone's back button walks back through them.
// Desktop renders wallet-view.tsx's own layout instead (never both).

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { rupee, signedRupee } from "@/lib/format";
import { DATA_RIGHTS } from "@/lib/mock/wallet";
import { totalBalance, useSession } from "@/lib/session-store";
import type { Transaction } from "@/lib/types";
import { WelcomeBanner } from "../consult/free-call";
import LogoutButton from "../logout-button";
import AppButton, { appButtonClass } from "../mobile/button";
import AppCard from "../mobile/app-card";
import { Chip, ChipRow } from "../mobile/chips";
import EmptyState from "../mobile/empty-state";
import { IconWallet } from "../mobile/icons";
import ListRow, { ListRows } from "../mobile/list-row";
import { AppTopbar } from "../mobile/page-title";
import SectionHeader from "../mobile/section-header";
import { Skeleton } from "../mobile/skeleton";
import { HideTabBar } from "../mobile/tab-bar";
import AccountSection, { type Closed } from "./account-section";
import { BillingIssueAction, BillingIssues, canRaiseIssue } from "./billing-issue";
import ProfileSection from "./profile-section";
import { LockIcon, RAZORPAY_TRUST, payLabel, paymentPageHref, rechargeMessage, useRecharge } from "./use-recharge";
import CustomAmountField, { type CustomAmount, pickedDenomination } from "./custom-amount";

export interface Denomination {
  amount: number;
  bonus: number;
  /** Cashback a claimed offer adds to this amount (₹), and the offer's name. */
  cashback: number;
  cashbackFrom: string | null;
}

export type DataRight = (typeof DATA_RIGHTS)[number];

type View = "home" | "add" | "pay" | "transactions" | "tx" | "profile" | "settings";
const VIEWS: View[] = ["home", "add", "pay", "transactions", "tx", "profile", "settings"];

/** Move between this page's screens without a page load (Next keeps useSearchParams in sync). */
function go(view: View, extra: Record<string, string> = {}, replace = false) {
  const q = new URLSearchParams(view === "home" ? extra : { view, ...extra });
  const url = q.size ? `/wallet?${q}` : "/wallet";
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.scrollTo({ top: 0 });
}

export default function MobileWallet({
  denominations,
  custom,
  gstRate,
  denom,
  onPick,
  loadError,
  paymentsOn,
  onPaid,
  onClosed,
  onDataRight,
  requesting,
}: {
  denominations: Denomination[] | null;
  /** Custom amounts Finance allows (null while loading). */
  custom: CustomAmount | null;
  gstRate: number;
  denom: number;
  onPick: (amount: number) => void;
  /** Recharge amounts couldn't be loaded. */
  loadError: string;
  /** Razorpay is connected (null while loading). */
  paymentsOn: boolean | null;
  /** A recharge went through (`usedOffer`: a claimed cashback offer was part of it). */
  onPaid: (usedOffer: boolean) => void;
  onClosed: (closed: Closed) => void;
  onDataRight: (r: DataRight) => void;
  requesting: string | null;
}) {
  const params = useSearchParams();
  const raw = params.get("view") as View | null;
  const view: View = raw && VIEWS.includes(raw) ? raw : "home";
  const [chosen, setChosen] = useState(false);

  // Links from elsewhere use the desktop anchors (/wallet#add-money, /wallet#profile): open those screens.
  useEffect(() => {
    if (window.location.hash === "#add-money") go("add", {}, true);
    else if (window.location.hash === "#profile") go("profile", {}, true);
  }, []);

  // Screens that only make sense mid-flow (a refresh, or back/forward into them) start the flow again.
  useEffect(() => {
    if (view === "pay" && !chosen) go("add", {}, true);
  }, [view, chosen]);

  switch (view) {
    case "add":
      return (
        <AddMoney
          denominations={denominations}
          custom={custom}
          gstRate={gstRate}
          denom={denom}
          onPick={onPick}
          loadError={loadError}
          paymentsOn={paymentsOn}
          onProceed={() => {
            setChosen(true);
            go("pay");
          }}
        />
      );
    case "pay": {
      const selected = pickedDenomination(denominations, denom, custom);
      if (!chosen || !selected) return <ScreenSkeleton title="Secure payment" />;
      return (
        <SecurePayment selected={selected} gstRate={gstRate} onPaid={() => onPaid(selected.cashback > 0)} />
      );
    }
    case "transactions":
      return <Transactions />;
    case "tx":
      return <TransactionDetail txRef={params.get("ref") ?? ""} />;
    case "profile":
      return (
        <>
          <AppTopbar title="Profile" />
          <div className="px-4 pt-3 pb-8">
            <ProfileSection />
          </div>
        </>
      );
    case "settings":
      return <Settings onClosed={onClosed} onDataRight={onDataRight} requesting={requesting} />;
    default:
      return <WalletHome />;
  }
}

function ScreenSkeleton({ title }: { title: string }) {
  return (
    <>
      <AppTopbar title={title} />
      <div className="px-4 pt-3" aria-busy="true">
        <Skeleton rounded="card" className="h-40 w-full" />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Wallet */

function WalletHome() {
  const session = useSession();
  const { wallet } = session;
  const recent = wallet.transactions.slice(0, 3);
  return (
    <>
      <AppTopbar title="Wallet" />
      <div className="px-4 pt-3 pb-8">
        <AppCard tone="tint" padding="lg" className="bg-[linear-gradient(160deg,#fffbeb,#fdf3dc)] text-center">
          <div className="text-[12px] font-semibold tracking-[.12em] text-app-ink-2 uppercase">Available balance</div>
          <div className="mt-1 font-display text-[44px] leading-[1.05] font-semibold tabular-nums text-app-ink">
            {rupee(totalBalance(session))}
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 text-left">
            <div className="min-w-0 rounded-[14px] border border-app-tint-3 bg-app-elev px-3 py-2.5">
              <div className="text-[12px] text-app-ink-2">Service Balance</div>
              <b className="block text-[16px] tabular-nums text-app-ink">{rupee(wallet.service)}</b>
            </div>
            <div className="min-w-0 rounded-[14px] border border-app-tint-3 bg-app-elev px-3 py-2.5">
              <div className="text-[12px] text-app-ink-2">Promotional Balance</div>
              <b className="block text-[16px] tabular-nums text-app-ink">{rupee(wallet.promo)}</b>
              {wallet.promo > 0 && wallet.promoExpires && (
                <div className="text-[11.5px] text-app-ink-2">Expires {wallet.promoExpires}</div>
              )}
            </div>
          </div>
        </AppCard>
        <p className="mt-2 mb-0 text-[12px] leading-[1.45] text-app-ink-3">
          Promotional balance is used first. GST is added on top of a recharge and never reduces your credit.
        </p>

        <AppButton block className="mt-3.5" onClick={() => go("add")}>
          Add money
        </AppButton>
        <AppButton variant="secondary" block className="mt-2" onClick={() => go("transactions")}>
          View transactions
        </AppButton>

        <WelcomeBanner className="mt-3.5 rounded-app-card!" showUsedUp />

        <SectionHeader title="Recent" variant="link" className="mt-[22px]" />
        {recent.length === 0 ? (
          <AppCard>
            <EmptyState
              icon={<IconWallet />}
              title="No transactions yet"
              body="Recharges and consultations will appear here."
            />
          </AppCard>
        ) : (
          <ListRows>
            {recent.map((t) => (
              <TxRow key={t.ref} t={t} />
            ))}
          </ListRows>
        )}
        {wallet.transactions.length > 3 && (
          <AppButton variant="ghost" block className="mt-1" onClick={() => go("transactions")}>
            See all transactions
          </AppButton>
        )}

        <SectionHeader title="Account" variant="link" className="mt-[22px]" />
        <ListRows>
          <ListRow onClick={() => go("profile")} title="Profile" subtitle="Name, photo and birth details" />
          <ListRow onClick={() => go("settings")} title="Settings & data rights" subtitle="Your data, deactivate or delete" />
          <ListRow href="/offers" title="Offers" subtitle="Cashback and discounts to claim" />
        </ListRows>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Transactions */

const FILTERS = [
  { key: "recharge", label: "Recharges", test: /recharge/i },
  { key: "consult", label: "Consults", test: /consult/i },
  { key: "gift", label: "Gifts", test: /gift/i },
  { key: "refund", label: "Refunds", test: /refund/i },
  { key: "cashback", label: "Cashback", test: /cashback|bonus/i },
  { key: "expiry", label: "Expiry", test: /expir/i },
] as const;

/** "Service balance" for the plain buckets; split or referenced debits ("promo ₹17 + service ₹0") as given. */
function bucketText(bucket: string): string {
  return /^(service|promotional|promo)$/i.test(bucket.trim()) ? `${bucket.trim()} balance` : bucket;
}

function TxIcon({ credit }: { credit: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full ${credit ? "bg-app-success-bg text-app-success" : "bg-app-error-bg text-app-error"}`}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <path d={credit ? "M12 8.5v7M8.5 12h7" : "M8.5 12h7"} />
      </svg>
    </span>
  );
}

function TxRow({ t }: { t: Transaction }) {
  const credit = t.amount >= 0;
  return (
    <button
      type="button"
      onClick={() => go("tx", { ref: t.ref })}
      className="flex min-h-app-hit w-full items-center gap-3 rounded-app-card border border-app-line bg-app-surface p-3 text-left shadow-app-card active:bg-app-elev"
    >
      <TxIcon credit={credit} />
      <span className="min-w-0 flex-1">
        <b className="block text-[13.333px] leading-[1.35] break-words text-app-ink">
          {credit ? "Credit" : "Debit"} · {t.type}
        </b>
        <span className="block text-[12px] leading-[1.35] break-words text-app-ink-2">{bucketText(t.bucket)}</span>
        <span className="block text-[12px] leading-[1.35] text-app-ink-3">{t.date}</span>
      </span>
      <b className={`shrink-0 text-[13.333px] tabular-nums ${credit ? "text-app-success" : "text-app-error"}`}>{signedRupee(t.amount)}</b>
    </button>
  );
}

function Transactions() {
  const { wallet } = useSession();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"] | "all">("all");
  const all = wallet.transactions;
  // Only the filters that have something in them.
  const filters = FILTERS.filter((f) => all.some((t) => f.test.test(t.type)));
  const active = FILTERS.find((f) => f.key === filter);
  const list = active ? all.filter((t) => active.test.test(t.type)) : all;
  return (
    <>
      <AppTopbar title="Transactions" />
      <div className="px-4 pt-3 pb-8">
        <BillingIssues className="mb-5" />
        {all.length > 0 && (
          <ChipRow label="Show" className="mb-3">
            <Chip on={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Chip>
            {filters.map((f) => (
              <Chip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </Chip>
            ))}
          </ChipRow>
        )}
        {list.length === 0 ? (
          <AppCard>
            <EmptyState
              icon={<IconWallet />}
              title="No transactions yet"
              body="Recharges, consultations, gifts and refunds will appear here."
            />
          </AppCard>
        ) : (
          <ListRows>
            {list.map((t) => (
              <TxRow key={t.ref} t={t} />
            ))}
          </ListRows>
        )}
        {all.length >= 50 && (
          <p className="mt-3 mb-0 text-center text-[12px] text-app-ink-3">Showing your latest 50 transactions.</p>
        )}
      </div>
    </>
  );
}

function TransactionDetail({ txRef }: { txRef: string }) {
  const { wallet } = useSession();
  const t = wallet.transactions.find((x) => x.ref === txRef);
  return (
    <>
      <HideTabBar />
      <AppTopbar title="Transaction" />
      <div className="px-4 pt-3 pb-8">
        {!t ? (
          <AppCard>
            <EmptyState
              title="Transaction not found"
              body="It may be older than your latest 50 transactions."
              action={
                <AppButton variant="secondary" size="sm" onClick={() => go("transactions", {}, true)}>
                  All transactions
                </AppButton>
              }
            />
          </AppCard>
        ) : (
          <AppCard padding="lg">
            <div className="text-[12px] text-app-ink-3">{t.amount >= 0 ? "Credit" : "Debit"}</div>
            <div className={`mt-0.5 text-[30px] leading-tight font-semibold tabular-nums ${t.amount >= 0 ? "text-app-success" : "text-app-error"}`}>
              {signedRupee(t.amount)}
            </div>
            <b className="mt-1.5 block text-[16px] text-app-ink">{t.type}</b>
            <div className="mt-1 text-[12px] text-app-ink-2">{t.date}</div>
            <dl className="m-0 mt-3 border-t border-app-line pt-1.5 text-[13.333px]">
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="text-app-ink-2">Transaction ID</dt>
                <dd className="m-0 font-mono font-semibold [overflow-wrap:anywhere] text-app-ink">{t.ref}</dd>
              </div>
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="shrink-0 text-app-ink-2">{t.amount >= 0 ? "Credited to" : "Paid from"}</dt>
                <dd className="m-0 text-right [overflow-wrap:anywhere] text-app-ink">{bucketText(t.bucket)}</dd>
              </div>
            </dl>
          </AppCard>
        )}
        {t?.payment && (
          <AppButton href={paymentPageHref(t.payment)} variant="secondary" block className="mt-3">
            View payment receipt
          </AppButton>
        )}
        {t && canRaiseIssue(t) && <BillingIssueAction txRef={t.ref} />}
        {t && (
          <p className="mt-3 mb-0 text-[12px] leading-[1.45] text-app-ink-3">
            Keep the transaction ID handy if you need to ask us about this payment.
          </p>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Add money → pay → done */

function AddMoney({
  denominations,
  custom,
  gstRate,
  denom,
  onPick,
  loadError,
  paymentsOn,
  onProceed,
}: {
  denominations: Denomination[] | null;
  custom: CustomAmount | null;
  gstRate: number;
  denom: number;
  onPick: (amount: number) => void;
  loadError: string;
  paymentsOn: boolean | null;
  onProceed: () => void;
}) {
  const selected = pickedDenomination(denominations, denom, custom);
  const gst = Math.round(denom * gstRate);
  // A claimed cashback offer, if any recharge amount qualifies for one.
  const offer = denominations?.find((d) => d.cashback > 0);
  return (
    <>
      <HideTabBar />
      <AppTopbar title="Add money" />
      <div className="px-4 pt-3 pb-[190px]">
        {offer ? (
          <AppCard tone="tint" padding="lg">
            <div className="text-[11px] font-bold tracking-[.1em] text-app-accent uppercase">Your offer</div>
            <b className="mt-0.5 block font-display text-[22px] leading-tight font-semibold text-app-ink">{offer.cashbackFrom ?? "Cashback offer"}</b>
            <p className="mt-1.5 mb-0 text-[12px] leading-[1.45] text-app-ink-2">
              Cashback is added to your Promotional Balance after payment. Amounts that qualify show it below.
            </p>
          </AppCard>
        ) : (
          <ListRow href="/offers" title="Offers" subtitle="Claim a cashback offer before you recharge" />
        )}

        <p className="mt-3.5 mb-2.5 text-[12px] leading-[1.45] text-app-ink-2">
          Choose how much to add. GST is added only on this payment — not again on a consultation.
        </p>

        {loadError && !denominations && (
          <p role="alert" className="mb-3 text-[12.5px] font-semibold text-app-error">
            {loadError}
          </p>
        )}

        <div role="radiogroup" aria-label="Recharge amount" className="grid grid-cols-3 gap-2.5">
          {!denominations &&
            !loadError &&
            Array.from({ length: 9 }, (_, i) => <Skeleton key={i} rounded="card" className="h-[84px] w-full" />)}
          {denominations?.map((d) => {
            const on = d.amount === denom;
            const extra = d.bonus + d.cashback;
            const pct = Math.round((extra / d.amount) * 100);
            return (
              <button
                key={d.amount}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(d.amount)}
                className={`relative flex min-h-[84px] flex-col items-center justify-center overflow-hidden rounded-app-card border px-1 pt-5 pb-3 text-center ${
                  on ? "border-app-selected bg-app-tint" : "border-app-line bg-app-surface"
                }`}
              >
                {pct > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[13px] -left-[26px] w-[96px] -rotate-45 bg-app-success py-px text-center text-[8.5px] font-extrabold tracking-[.04em] text-white uppercase"
                  >
                    {pct}% extra
                  </span>
                )}
                <b className="text-[15px] tabular-nums text-app-ink">{rupee(d.amount)}</b>
                {extra > 0 && (
                  <span className="mt-1 text-[11.5px] font-bold text-app-success">
                    + {rupee(extra)} {d.cashback > 0 ? "cashback" : "bonus"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {denominations && <CustomAmountField custom={custom} denom={denom} fixed={denominations.map((d) => d.amount)} onPick={onPick} variant="app" />}
      </div>

      {/* Pinned to the bottom (no tab bar on this screen). */}
      <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-app-line bg-app-elev px-4 pt-2.5 pb-[calc(12px+var(--app-safe-bottom))] lg:hidden">
        <div className="flex items-center justify-between gap-2 text-[12px] text-app-ink-2 tabular-nums">
          <span>Recharge {rupee(denom)}</span>
          <span aria-hidden="true">+</span>
          <span>GST {rupee(gst)}</span>
          <span aria-hidden="true">=</span>
          <b className="text-app-ink">Pay {rupee(denom + gst)}</b>
        </div>
        <AppButton block className="mt-2" disabled={!selected || paymentsOn === false} onClick={onProceed}>
          {paymentsOn === false
            ? "Payments aren't connected yet"
            : !selected && denominations
              ? "Choose an amount to add"
              : `Proceed to payment · ${rupee(denom + gst)}`}
        </AppButton>
        <p className="mt-1.5 mb-0 text-[11.5px] leading-[1.4] text-app-ink-3">
          {paymentsOn === false
            ? "Recharges open as soon as our payment partner is connected. Your balance is safe."
            : `Your wallet is credited the full ${rupee(denom)}. A payment is never credited twice.`}
        </p>
      </div>
    </>
  );
}

function Rows({ rows }: { rows: { label: string; value: string; strong?: boolean; green?: boolean; rule?: boolean }[] }) {
  return (
    <dl className="m-0 text-[13.333px]">
      {rows.map((r) => (
        <div
          key={r.label}
          className={`flex justify-between gap-3 py-2 ${r.rule ? "mt-1.5 border-t border-app-line pt-3" : ""} ${r.strong ? "font-bold text-app-ink" : "text-app-ink"}`}
        >
          <dt className="min-w-0">{r.label}</dt>
          <dd className={`m-0 shrink-0 font-bold tabular-nums ${r.green ? "text-app-success" : ""}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SecurePayment({ selected, gstRate, onPaid }: { selected: Denomination; gstRate: number; onPaid: () => void }) {
  const gst = Math.round(selected.amount * gstRate);
  const total = selected.amount + gst;
  // Paid, failed or still pending: the payment's page replaces this screen (Back then returns to Add money).
  const { state, pay, check, busy } = useRecharge(useCallback(() => onPaid(), [onPaid]), "replace");
  const note = rechargeMessage(state);

  return (
    <>
      <HideTabBar />
      <AppTopbar title="Secure payment" />
      <div className="px-4 pt-5 pb-8">
        <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-app-info-bg text-app-info">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18M7 15h3" />
          </svg>
        </span>
        <h2 className="mt-4 mb-1 font-display text-[28px] leading-tight font-semibold text-app-ink">Secure checkout</h2>
        <p className="m-0 text-[12px] leading-[1.45] text-app-ink-2">
          You are paying {rupee(total)} to add {rupee(selected.amount)} to your AstroRize wallet.
        </p>
        <AppCard padding="lg" className="mt-3.5">
          <Rows
            rows={[
              { label: "Recharge", value: rupee(selected.amount) },
              { label: `GST (${Math.round(gstRate * 100)}%)`, value: rupee(gst) },
              { label: "Total payable", value: rupee(total), strong: true, rule: true },
              { label: "Wallet credit", value: rupee(selected.amount) },
              ...(selected.bonus > 0 ? [{ label: "Bonus to Promotional Balance", value: rupee(selected.bonus) }] : []),
              ...(selected.cashback > 0
                ? [{ label: `Cashback · ${selected.cashbackFrom ?? "your offer"}`, value: rupee(selected.cashback) }]
                : []),
            ]}
          />
        </AppCard>
        {note && (
          <div
            role={note.tone === "error" ? "alert" : "status"}
            className={`mt-3 rounded-app-card px-3 py-2.5 text-[12.5px] leading-[1.45] font-semibold ${
              note.tone === "error" ? "bg-app-error-bg text-app-error" : "bg-app-tint text-app-ink"
            }`}
          >
            {note.text}
          </div>
        )}
        {state.stage === "pending" ? (
          <AppButton block className="mt-3.5" onClick={() => void check()}>
            Check status
          </AppButton>
        ) : (
          <AppButton block className="mt-3.5" loading={busy} onClick={() => void pay(selected.amount)}>
            {payLabel(state, total)}
          </AppButton>
        )}
        <AppButton variant="secondary" block className="mt-2" disabled={busy} onClick={() => window.history.back()}>
          {state.stage === "pending" ? "Back" : "Cancel payment"}
        </AppButton>
        <p className="mt-3 mb-0 flex items-start justify-center gap-1.5 text-center text-[11.5px] leading-[1.45] text-app-ink-3">
          <LockIcon className="mt-px size-3.5 shrink-0" />
          <span>{RAZORPAY_TRUST}</span>
        </p>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Settings & data rights */

function Settings({
  onClosed,
  onDataRight,
  requesting,
}: {
  onClosed: (closed: Closed) => void;
  onDataRight: (r: DataRight) => void;
  requesting: string | null;
}) {
  return (
    <>
      <AppTopbar title="Settings" />
      <div className="px-4 pt-3 pb-8">
        <SectionHeader title="Your data rights" variant="link" />
        <p className="-mt-1 mb-2.5 text-[12px] leading-[1.45] text-app-ink-2">
          Digital Personal Data Protection Act, 2023 — exercisable here, no email required.
        </p>
        <ListRows>
          {DATA_RIGHTS.map((r) => (
            <ListRow
              key={r.key}
              title={r.title}
              subtitle={r.body}
              trailing={<span className="text-[12px] text-app-accent">{requesting === r.key ? "Sending…" : r.cta}</span>}
              onClick={requesting ? undefined : () => onDataRight(r)}
              chevron
            />
          ))}
        </ListRows>

        <SectionHeader title="Legal" variant="link" className="mt-[22px]" />
        <ListRows>
          <ListRow href="/terms" title="Terms & Conditions" />
          <ListRow href="/terms" title="Privacy Policy" />
          <ListRow href="/terms#money" title="Refund & Cancellation" />
        </ListRows>

        <LogoutButton className={`${appButtonClass({ variant: "secondary", block: true })} mt-[22px]`} />

        <SectionHeader title="Leave AstroRize" variant="link" className="mt-[22px]" />
        <AccountSection onClosed={onClosed} variant="app" />
      </div>
    </>
  );
}
