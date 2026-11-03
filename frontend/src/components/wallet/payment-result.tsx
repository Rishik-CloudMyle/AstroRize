"use client";

// The page a wallet recharge lands on (/wallet/payment/<Razorpay order id>): paid, failed or
// still being confirmed, with the receipt. Rendered from our API on the server, so it also works
// on reload and from a link; only the customer who paid can open it. Desktop in the site's look,
// phones and tablets (< 1024px) in the app's "Payment successful" screen look.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { useOpenConsultation } from "@/lib/consultation-store";
import { sessionActions } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import AppButton from "../mobile/button";
import AppCard from "../mobile/app-card";
import { HideTabBar } from "../mobile/tab-bar";

export interface PaymentReceipt {
  orderId: string;
  /** Our receipt number (also the order's receipt at Razorpay). */
  receipt: string;
  status: "PAID" | "FAILED" | "PENDING";
  provider: string;
  amount: number;
  gst: number;
  total: number;
  bonus: number;
  cashback: number;
  cashbackFrom: string | null;
  paymentId: string | null;
  /** "UPI", "Card", "Netbanking"… and Razorpay's detail (UPI ID, "Visa · •••• 1111 · credit", the bank). */
  method: string | null;
  methodDetail: string | null;
  /** "28 Oct 2026, 17:25 IST" */
  createdAt: string;
  paidAt: string | null;
  failureReason: string | null;
  refundedAmount: number;
  ledger: { ref: string; type: string; bucket: string; amount: number }[];
}

export interface PaymentPageData {
  payment: PaymentReceipt;
  /** The wallet as it is now. */
  wallet: { service: number; promo: number };
}

/** While a payment is pending, ask Razorpay again this often, for a few minutes. */
const AUTO_CHECK_MS = 15_000;
const AUTO_CHECKS = 12;

const TITLES = { PAID: "Payment successful", FAILED: "Payment failed", PENDING: "Payment pending" } as const;

function summaryOf(p: PaymentReceipt): string {
  if (p.status === "PAID") return `${rupee(p.amount)} has been added to your AstroRize wallet.`;
  if (p.status === "FAILED") return "Nothing was charged and nothing was added to your wallet. If money did leave your account, your bank returns it automatically.";
  return "We'll confirm it automatically as soon as Razorpay does — you're never charged twice. If it doesn't go through, nothing is added and your bank returns any money taken.";
}

/** The lines of the money breakdown. */
function breakdown(p: PaymentReceipt) {
  const rows: { label: string; value: string; strong?: boolean; green?: boolean; rule?: boolean }[] = [
    { label: "Recharge", value: rupee(p.amount) },
    { label: "GST", value: rupee(p.gst) },
    { label: p.status === "PAID" ? "Total paid" : "Total", value: rupee(p.total), strong: true },
  ];
  // A failed payment adds nothing, so its credit isn't listed.
  if (p.status === "FAILED") return rows;
  const credit = p.status === "PAID" ? "" : " (once confirmed)";
  rows.push({ label: `Wallet credit · Service${credit}`, value: rupee(p.amount), strong: true, green: true, rule: true });
  if (p.bonus > 0) rows.push({ label: `Bonus · Promotional${credit}`, value: `+${rupee(p.bonus)}`, green: true });
  if (p.cashback > 0) rows.push({ label: `Cashback · ${p.cashbackFrom ?? "your offer"}${credit}`, value: `+${rupee(p.cashback)}`, green: true });
  return rows;
}

/** The receipt's details, in reading order. */
function details(p: PaymentReceipt) {
  const rows: { label: string; value: string; mono?: boolean }[] = [];
  if (p.method) rows.push({ label: "Paid with", value: p.methodDetail ? `${p.method} · ${p.methodDetail}` : p.method });
  if (p.paymentId) rows.push({ label: "Payment ID", value: p.paymentId, mono: true });
  rows.push({ label: p.paidAt ? "Paid on" : "Started on", value: p.paidAt ?? p.createdAt });
  rows.push({ label: "Receipt no.", value: p.receipt, mono: true });
  rows.push({ label: "Order ID", value: p.orderId, mono: true });
  if (p.ledger.length) rows.push({ label: "Wallet transactions", value: p.ledger.map((t) => t.ref).join(", "), mono: true });
  if (p.refundedAmount > 0) rows.push({ label: "Refunded to your bank", value: rupee(p.refundedAmount) });
  return rows;
}

function StatusIcon({ status, className }: { status: PaymentReceipt["status"]; className: string }) {
  const tone = status === "PAID" ? "bg-emerald-700 max-lg:bg-app-success" : status === "FAILED" ? "bg-rose-700 max-lg:bg-app-error" : "bg-amber-500 max-lg:bg-app-primary";
  return (
    <span aria-hidden="true" className={`mx-auto grid place-items-center rounded-full text-white ${tone} ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[42%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {status === "PAID" ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : status === "FAILED" ? (
          <path d="M7 7l10 10M17 7 7 17" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4.5l3 2" />
          </>
        )}
      </svg>
    </span>
  );
}

export default function PaymentResult({ data }: { data: PaymentPageData }) {
  const { payment: p, wallet } = data;
  const router = useRouter();
  const { resumeConsult } = useAppUI();
  const open = useOpenConsultation();
  // A consultation is running (the customer browsed here from it): the way back to it.
  const inCall = !!open && open.status !== "requested";
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const checks = useRef(0);

  // Paid: the header's wallet chip shows the new balance (also when this page is opened later).
  useEffect(() => {
    if (p.status === "PAID") sessionActions.refreshWallet().catch(() => {});
  }, [p.status]);

  async function check(quiet = false) {
    if (checking) return;
    setChecking(true);
    if (!quiet) setCheckError("");
    try {
      const r = await api.post<{ status: string }>(`/wallet/recharge/${encodeURIComponent(p.orderId)}/status`);
      if (r.status !== "PENDING") router.refresh();
      else if (!quiet) setCheckError("Still waiting for Razorpay. We'll keep checking — you can leave this page.");
    } catch (e) {
      if (!quiet) setCheckError(e instanceof ApiError ? e.message : "Couldn't check right now. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  });

  // Pending: ask again every so often for a few minutes (the server also settles it on its own).
  useEffect(() => {
    if (p.status !== "PENDING") return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (++checks.current > AUTO_CHECKS) return clearInterval(timer);
      void checkRef.current(true);
    }, AUTO_CHECK_MS);
    return () => clearInterval(timer);
  }, [p.status]);

  const title = TITLES[p.status];
  const summary = summaryOf(p);
  const money = breakdown(p);
  const info = details(p);

  return (
    <>
      {/* ---------- Desktop ---------- */}
      <div className="mx-auto max-w-[760px] max-lg:hidden">
        <div className="rounded-[22px] border border-line-warm bg-card p-8 shadow-[0_12px_28px_rgba(90,62,40,.09)]">
          <div className="text-center">
            <StatusIcon status={p.status} className="size-[76px]" />
            <h1 role="status" className="mt-4 font-display text-[40px] leading-tight font-semibold text-ink">
              {title}
            </h1>
            <p className="mx-auto mt-1.5 max-w-[56ch] text-[14.5px] leading-normal text-stone-600">{summary}</p>
            {p.failureReason && (
              <p className="mx-auto mt-2 max-w-[56ch] rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700">Reason: {p.failureReason}</p>
            )}
          </div>

          <div className={`mt-7 grid gap-[18px] ${p.status === "PAID" ? "grid-cols-[minmax(0,1fr)_260px]" : "grid-cols-1"}`}>
            <div className="rounded-[18px] border border-line bg-paper p-5">
              <h2 className="mb-2 text-[15px] font-bold text-ink">Amount</h2>
              {money.map((r) => (
                <div
                  key={r.label}
                  className={`flex justify-between gap-3 py-1.5 text-sm ${r.rule ? "mt-1.5 border-t border-[#f3e9d8] pt-3" : ""}`}
                  style={{ color: r.green ? "#047857" : r.strong ? "#1c1917" : "#57534e", fontWeight: r.strong ? 700 : 500 }}
                >
                  <span>{r.label}</span>
                  <b className="tabular-nums">{r.value}</b>
                </div>
              ))}
            </div>
            {p.status === "PAID" && (
              <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-5">
                <div className="text-xs font-bold uppercase tracking-[.08em] text-amber-800">Wallet balance now</div>
                <div className="mt-1 text-[34px] leading-[1.1] font-bold tabular-nums text-ink">{rupee(wallet.service + wallet.promo)}</div>
                <div className="mt-3 flex flex-col gap-2 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-stone-500">Service balance</span>
                    <b className="tabular-nums">{rupee(wallet.service)}</b>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-stone-500">Promotional balance</span>
                    <b className="tabular-nums">{rupee(wallet.promo)}</b>
                  </div>
                </div>
              </div>
            )}
          </div>

          <dl className="m-0 mt-[18px] rounded-[18px] border border-line bg-paper px-5 py-3 text-[13.5px]">
            {info.map((r, i) => (
              <div key={r.label} className={`flex justify-between gap-4 py-2 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                <dt className="shrink-0 text-stone-500">{r.label}</dt>
                <dd className={`m-0 text-right font-semibold [overflow-wrap:anywhere] text-ink ${r.mono ? "font-mono text-[12.5px]" : ""}`}>{r.value}</dd>
              </div>
            ))}
          </dl>

          {checkError && (
            <p role="status" className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-900">
              {checkError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {inCall && (
              <button type="button" onClick={resumeConsult} className="h-12 rounded-full bg-ink px-6 text-[15px] font-bold text-paper">
                Back to your call
              </button>
            )}
            {p.status === "PENDING" && (
              <button
                type="button"
                onClick={() => void check()}
                disabled={checking}
                className="az-cta h-12 rounded-full px-7 text-[15px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)] disabled:cursor-wait"
              >
                {checking ? "Checking…" : "Check status"}
              </button>
            )}
            {p.status === "FAILED" && (
              <Link
                href="/wallet#add-money"
                className="az-cta inline-flex h-12 items-center rounded-full px-7 text-[15px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)]"
              >
                Try again
              </Link>
            )}
            <Link
              href="/wallet"
              className={
                p.status === "PAID" && !inCall
                  ? "az-cta inline-flex h-12 items-center rounded-full px-7 text-[15px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)]"
                  : "inline-flex h-12 items-center rounded-full border border-line bg-white px-6 text-[15px] font-bold text-ink"
              }
            >
              Go to wallet
            </Link>
            {p.status === "PAID" && (
              <Link href="/astrologers" className="inline-flex h-12 items-center rounded-full border border-line bg-white px-6 text-[15px] font-bold text-ink">
                Consult an astrologer
              </Link>
            )}
          </div>
          <p className="mt-5 text-center text-[12px] leading-normal text-stone-500">
            GST is charged on top of your recharge and never reduces your wallet credit. Keep the {p.paymentId ? "payment ID" : "receipt number"} handy if you
            need to ask us about this payment.
          </p>
        </div>
      </div>

      {/* ---------- Phones and tablets: the app's "Payment successful" screen ---------- */}
      <div className="lg:hidden">
        <HideTabBar />
        <div className="bg-app-elev px-4 pt-2.5 pb-3">
          <h1 className="m-0 text-[16px] font-bold text-app-ink">{title}</h1>
        </div>
        <div className="px-4 pt-6 pb-8">
          <div className="text-center">
            <StatusIcon status={p.status} className="size-[88px]" />
            <p role="status" className="mt-4 mb-0 font-display text-[28px] leading-tight font-semibold text-app-ink">
              {title}
            </p>
            <p className="mx-auto mt-1.5 mb-0 max-w-[44ch] text-[12.5px] leading-[1.45] text-app-ink-2">{summary}</p>
            {p.failureReason && (
              <p className="mx-auto mt-2.5 mb-0 rounded-app-card bg-app-error-bg px-3 py-2 text-[12.5px] leading-[1.45] font-semibold text-app-error">
                Reason: {p.failureReason}
              </p>
            )}
          </div>

          <AppCard padding="lg" className="mt-4">
            <MobileRows
              rows={
                p.status === "PAID"
                  ? [
                      { label: "Amount added", value: rupee(p.amount) },
                      ...(p.bonus + p.cashback > 0
                        ? [{ label: p.cashback > 0 ? "Bonus / cashback" : "Bonus", value: `+ ${rupee(p.bonus + p.cashback)}`, green: true }]
                        : []),
                      { label: "Wallet balance now", value: rupee(wallet.service + wallet.promo), strong: true, rule: true },
                      { label: "Service Balance", value: rupee(wallet.service) },
                      { label: "Promotional Balance", value: rupee(wallet.promo) },
                    ]
                  : money
              }
            />
          </AppCard>

          <AppCard padding="lg" className="mt-3">
            <h2 className="m-0 mb-1 text-[13.333px] font-bold text-app-ink">Payment details</h2>
            <MobileRows
              rows={[
                ...(p.status === "PAID" ? [{ label: "You paid", value: `${rupee(p.total)} incl. ${rupee(p.gst)} GST` }] : []),
                ...info,
              ]}
            />
          </AppCard>

          {checkError && (
            <p role="status" className="mt-3 mb-0 rounded-app-card bg-app-tint px-3 py-2.5 text-[12.5px] leading-[1.45] font-semibold text-app-ink">
              {checkError}
            </p>
          )}

          {p.status !== "FAILED" && (
            <p className="mx-auto mt-3 mb-0 max-w-[44ch] text-center text-[12px] leading-[1.45] text-app-ink-3">
              Wallet credit is the recharge amount — GST paid with it never reduces it.
              {p.bonus + p.cashback > 0 && " Bonus and cashback go to your Promotional Balance."}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {inCall && (
              <AppButton block onClick={resumeConsult}>
                Back to your call
              </AppButton>
            )}
            {p.status === "PENDING" && (
              <AppButton block loading={checking} onClick={() => void check()}>
                Check status
              </AppButton>
            )}
            {p.status === "FAILED" && (
              <AppButton href="/wallet?view=add" block>
                Try again
              </AppButton>
            )}
            <AppButton href="/wallet" block variant={p.status === "PAID" && !inCall ? "primary" : "secondary"}>
              {p.status === "PAID" ? "View wallet" : "Go to wallet"}
            </AppButton>
            {p.status === "PAID" && (
              <AppButton href="/astrologers" block variant="secondary">
                Consult an astrologer
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function MobileRows({ rows }: { rows: { label: string; value: string; strong?: boolean; green?: boolean; rule?: boolean; mono?: boolean }[] }) {
  return (
    <dl className="m-0 text-[13.333px]">
      {rows.map((r) => (
        <div
          key={r.label}
          className={`flex justify-between gap-3 py-1.5 ${r.rule ? "mt-1.5 border-t border-app-line pt-3" : ""} ${r.strong ? "font-bold" : ""}`}
        >
          <dt className="shrink-0 text-app-ink">{r.label}</dt>
          <dd
            className={`m-0 text-right font-semibold [overflow-wrap:anywhere] tabular-nums ${r.green ? "text-app-success" : "text-app-ink"} ${r.mono ? "font-mono text-[12px]" : ""}`}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
