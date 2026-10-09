"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api/client";
import { homeFor } from "@/lib/auth";
import { rupee, signedRupee } from "@/lib/format";
import { DATA_RIGHTS } from "@/lib/mock/wallet";
import { sessionActions, totalBalance, useHydrated, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import ProfileSection from "./profile-section";

interface Denomination {
  amount: number;
  bonus: number;
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

  if (!hydrated || !session.ready) {
    return <div className="h-80 rounded-[22px] border border-line bg-paper" aria-busy="true" />;
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
        <h2 className="font-display text-[28px] font-semibold text-ink">No customer wallet on this account</h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-normal text-stone-600">
          You&apos;re signed in as {session.role === "astrologer" ? "an astrologer" : "Astrorize staff"}. Wallets belong to
          customer accounts.
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

  return <SignedInWallet />;
}

function SignedInWallet() {
  const session = useSession();
  const { toast } = useAppUI();
  const { wallet } = session;
  const [denominations, setDenominations] = useState<Denomination[] | null>(null);
  const [gstRate, setGstRate] = useState(0);
  const [denom, setDenom] = useState(1000);
  const [payStage, setPayStage] = useState<"idle" | "confirming" | "done">("idle");
  const [paidAmount, setPaidAmount] = useState(0);
  const [payError, setPayError] = useState("");
  const [requesting, setRequesting] = useState<string | null>(null);

  // Recharge amounts, bonuses and GST come from the API; the balance is re-read so it is current.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ denominations: Denomination[]; gstRate: number }>("/wallet/denominations")
      .then((res) => {
        if (cancelled) return;
        setDenominations(res.denominations);
        setGstRate(res.gstRate);
        setDenom((d) => (res.denominations.some((x) => x.amount === d) ? d : (res.denominations[0]?.amount ?? 0)));
      })
      .catch((e) => !cancelled && setPayError(errorText(e)));
    sessionActions.refreshWallet().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const gst = Math.round(denom * gstRate);
  const selected = denominations?.find((d) => d.amount === denom);

  async function pay() {
    if (payStage === "confirming" || !selected) return;
    setPayStage("confirming");
    setPayError("");
    toast("Opening secure checkout… confirming your payment.");
    try {
      await sessionActions.recharge(selected.amount);
      setPaidAmount(selected.amount);
      setPayStage("done");
      toast(`Payment successful. Your wallet is credited the full ${rupee(selected.amount)} talk-time value — GST was charged on top.`);
    } catch (e) {
      setPayStage("idle");
      setPayError(errorText(e));
    }
  }

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
    if (payStage === "done") setPayStage("idle");
  }

  const payLabel =
    payStage === "confirming"
      ? "Confirming payment…"
      : payStage === "done"
        ? `✓ Paid · ${rupee(paidAmount)} credited`
        : `Pay ${rupee(denom + gst)}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-[18px]">
        {/* ---------- Balance ---------- */}
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
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
        </div>

        {/* ---------- Transactions ---------- */}
        <div className="rounded-[22px] border border-line bg-paper p-4 sm:p-[22px]">
          <h2 className="mb-3.5 text-[17px] font-bold">Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {["Date", "Type", "Reference", "Bucket", "Amount"].map((h) => (
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
                    <td className="border-b border-line-soft px-2.5 py-[11px] font-semibold text-ink">{t.type}</td>
                    <td className="border-b border-line-soft px-2.5 py-[11px] tabular-nums text-stone-600">{t.ref}</td>
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
            <div className="flex flex-col gap-1.5 rounded-2xl border border-line-warm bg-card p-[15px]">
              <b className="text-sm font-bold text-ink">Grievance Officer</b>
              <span className="flex-1 text-[12.5px] leading-[1.45] text-stone-500">
                Escalate anything unresolved. Acknowledged in 24 hours, resolved within 15 days.
              </span>
              <Link
                href="/terms#grievance"
                className="inline-flex h-[34px] items-center self-start rounded-[10px] border border-line bg-white px-[13px] text-[12.5px] font-bold text-amber-700 hover:no-underline"
              >
                Contact officer
              </Link>
            </div>
          </div>
          <div className="mt-3.5 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3.5">
            <b className="text-[13.5px] text-rose-700">Delete my account</b>
            <p className="mt-[5px] text-[12.5px] leading-normal text-rose-900">
              Deleting your account is permanent. Your wallet balance ({rupee(totalBalance(session))}) will be
              forfeited, and we&apos;ll ask you to confirm with an OTP before anything is deleted. Deletion isn&apos;t
              available while a dispute is open or a legal hold applies.
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Add money ---------- */}
      <aside className="flex flex-col gap-3.5 lg:sticky lg:top-24">
        <div className="rounded-[22px] border border-line-warm bg-card p-5 shadow-[0_12px_28px_rgba(90,62,40,.09)]">
          <h2 className="mb-3 text-base font-bold">Add money</h2>
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
                  {d.bonus > 0 && (
                    <span className="mt-[5px] inline-block rounded-full bg-emerald-50 px-[7px] py-0.5 text-[10px] font-extrabold text-emerald-700">
                      +{rupee(d.bonus)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-[#f3e9d8] pt-3.5">
            {[
              { label: "Recharge", value: rupee(denom) },
              { label: denominations ? `GST ${Math.round(gstRate * 100)}%` : "GST", value: rupee(gst) },
              { label: "Total payable", value: rupee(denom + gst), strong: true },
              { label: "Wallet credit", value: rupee(denom), strong: true, green: true },
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
            onClick={() => void pay()}
            disabled={payStage === "confirming" || !selected}
            className={`mt-3.5 h-12 w-full rounded-full text-[15px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)] ${payStage === "done" ? "bg-emerald-700 text-white" : "az-cta"}`}
          >
            {payLabel}
          </button>
          {payError && (
            <p role="alert" className="mt-2.5 text-xs font-semibold text-rose-700">
              {payError}
            </p>
          )}
          <p className="mt-2.5 text-[11.5px] leading-normal text-stone-500">
            GST is charged on top of your recharge. Your wallet is credited the full {rupee(denom)} talk-time value.
          </p>
        </div>
      </aside>
    </div>
  );
}
