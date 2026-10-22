"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { rupee } from "@/lib/format";
import { offersChanged, type Offer } from "@/lib/offers";
import { sessionActions, useHydrated, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";

const KIND: Record<Offer["kind"], { label: string; icon: string; applies: string }> = {
  RECHARGE_CASHBACK: { label: "Recharge cashback", icon: "₹", applies: "at your next recharge" },
  CONSULT_DISCOUNT: { label: "Consultation discount", icon: "%", applies: "to your next consultation" },
  BONUS_CREDIT: { label: "Bonus credit", icon: "🎁", applies: "straight away" },
};

/** The headline figure: "10% cashback", "20% off", "₹50 bonus". */
function headline(o: Offer): string {
  if (o.kind === "BONUS_CREDIT") return `${rupee(o.flatAmount ?? 0)} bonus`;
  if (o.kind === "CONSULT_DISCOUNT") return `${o.percent ?? 0}% off`;
  return `${o.percent ?? 0}% cashback`;
}

/** The small print, one line each. */
function terms(o: Offer): string[] {
  const t: string[] = [];
  if (o.kind === "RECHARGE_CASHBACK") {
    t.push(o.minRecharge ? `On recharges of ${rupee(o.minRecharge)} or more` : "On any recharge");
    if (o.maxBenefit) t.push(`Up to ${rupee(o.maxBenefit)} cashback per recharge`);
    t.push("Cashback is promotional credit, used before your service balance");
  } else if (o.kind === "CONSULT_DISCOUNT") {
    t.push("Off the per-minute price of Chat, Voice and Video consultations");
    t.push("Not with a free call or Instant Call");
  } else {
    t.push("Added to your promotional balance when you claim it");
  }
  if (o.kind !== "BONUS_CREDIT") {
    t.push(`Use within ${o.claimValidDays} ${o.claimValidDays === 1 ? "day" : "days"} of claiming${o.usesPerCustomer > 1 ? ` · ${o.usesPerCustomer} uses` : ""}`);
  }
  if (o.audience === "NEW") t.push("For new customers (before your first paid consultation)");
  if (o.ends && o.open) t.push(`Claim by ${o.ends}`);
  return t;
}

export default function OffersView() {
  const hydrated = useHydrated();
  const session = useSession();
  const { openLogin, toast } = useAppUI();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState<string | null>(null);
  // Re-read when the person signs in or out (their claims come with the list).
  const who = session.ready ? (session.loggedIn ? `${session.role}:${session.email || session.phone}` : "visitor") : "";

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ offers: Offer[] }>("/offers");
      setOffers(r.offers);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't load the offers. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    if (!who) return;
    let cancelled = false;
    api
      .get<{ offers: Offer[] }>("/offers")
      .then((r) => {
        if (cancelled) return;
        setOffers(r.offers);
        setError("");
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "We couldn't load the offers. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, [who]);

  // Opened from a notification (/offers#CMP-17): bring that offer into view once the list is there.
  useEffect(() => {
    if (!offers?.length) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [offers]);

  async function claim(o: Offer) {
    if (claiming) return;
    setClaiming(o.id);
    try {
      const r = await api.post<{ credited: number; claim: { expires: string } }>(`/offers/${encodeURIComponent(o.id)}/claim`);
      if (r.credited > 0) {
        toast(`${rupee(r.credited)} bonus credit added to your promotional balance.`);
        void sessionActions.refreshWallet().catch(() => {});
      } else {
        toast(`Claimed. It applies automatically ${KIND[o.kind].applies} until ${r.claim.expires}.`);
      }
      offersChanged();
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't claim the offer. Try again.");
      await load();
    } finally {
      setClaiming(null);
    }
  }

  if (!hydrated || (!offers && !error)) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[300px] animate-pulse rounded-[22px] border border-line bg-paper" />
        ))}
      </div>
    );
  }

  if (error && !offers) {
    return (
      <div className="mx-auto max-w-[520px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <p className="text-sm text-stone-600">{error}</p>
        <button type="button" onClick={() => void load()} className="az-cta mt-5 h-11 rounded-full px-6 text-sm font-bold">
          Try again
        </button>
      </div>
    );
  }

  const staff = session.loggedIn && session.role !== "customer";

  if (!offers?.length) {
    return (
      <div className="mx-auto max-w-[560px] rounded-3xl border border-line bg-paper px-6 py-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          ✦
        </div>
        <h2 className="mt-4 font-display text-[28px] font-semibold text-ink">No offers right now</h2>
        <p className="mx-auto mt-2 max-w-[44ch] text-sm leading-normal text-stone-600">
          {session.loggedIn && !staff
            ? "We'll tell you in your notifications as soon as there's a new one."
            : "New offers appear here. Log in and we'll tell you in your notifications when there's one."}
        </p>
        <Link
          href="/astrologers"
          className="az-cta mt-6 inline-flex h-12 items-center rounded-full px-8 text-[15px] font-bold hover:text-cta-ink hover:no-underline"
        >
          Consult an astrologer
        </Link>
      </div>
    );
  }

  return (
    <>
      {staff && (
        <p className="mb-4 rounded-2xl border border-line bg-paper px-4 py-3 text-[13px] text-stone-600">
          You&apos;re signed in with {session.role === "astrologer" ? "an astrologer" : "a staff"} account. Offers are claimed by
          customer accounts.
        </p>
      )}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => {
          const k = KIND[o.kind];
          const claimed = o.claim?.status === "ACTIVE";
          return (
            <li
              key={o.id}
              id={o.id}
              className={`flex min-w-0 scroll-mt-28 flex-col rounded-[22px] border bg-card p-5 shadow-[0_12px_28px_rgba(90,62,40,.07)] ${claimed ? "border-emerald-300" : "border-line-warm"}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-[15px] font-extrabold text-amber-800"
                >
                  {k.icon}
                </span>
                <span className="min-w-0 text-[11.5px] font-bold uppercase tracking-[.08em] text-amber-800">{k.label}</span>
              </div>
              <div className="mt-3 font-display text-[34px] font-semibold leading-none text-ink">{headline(o)}</div>
              <h2 className="mt-2 break-words text-[16px] font-bold text-ink">{o.name}</h2>
              {o.description && <p className="mt-1 break-words text-[13.5px] leading-normal text-stone-600">{o.description}</p>}
              <ul className="mt-3 flex flex-1 flex-col gap-1 text-[12.5px] leading-snug text-stone-500">
                {terms(o).map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span aria-hidden="true" className="text-amber-600">
                      ·
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <OfferAction
                  offer={o}
                  loggedIn={session.loggedIn}
                  staff={staff}
                  busy={claiming === o.id}
                  disabled={claiming !== null}
                  onClaim={() => void claim(o)}
                  onLogin={() => openLogin()}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function OfferAction({
  offer: o,
  loggedIn,
  staff,
  busy,
  disabled,
  onClaim,
  onLogin,
}: {
  offer: Offer;
  loggedIn: boolean;
  staff: boolean;
  busy: boolean;
  disabled: boolean;
  onClaim: () => void;
  onLogin: () => void;
}) {
  const c = o.claim;
  if (c?.status === "ACTIVE") {
    const where = o.kind === "CONSULT_DISCOUNT" ? "consultation" : "recharge";
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] leading-normal text-emerald-900">
        <b className="block text-emerald-800">✓ Claimed</b>
        Applies automatically at your next {where} until {c.expires}
        {c.usesLeft > 1 ? ` · ${c.usesLeft} uses left` : ""}.{" "}
        <Link
          href={o.kind === "CONSULT_DISCOUNT" ? "/astrologers?availability=Available" : "/wallet#add-money"}
          className="font-bold text-emerald-800 underline"
        >
          {o.kind === "CONSULT_DISCOUNT" ? "Find an astrologer" : "Recharge now"}
        </Link>
      </div>
    );
  }
  if (c?.status === "USED") {
    return (
      <div className="rounded-2xl border border-line bg-white px-3.5 py-3 text-[13px] font-semibold text-stone-600">
        {o.kind === "BONUS_CREDIT" ? `✓ ${rupee(o.flatAmount ?? 0)} added to your promotional balance` : "✓ Used — thank you"}
      </div>
    );
  }
  if (c?.status === "EXPIRED") {
    return <div className="rounded-2xl border border-line bg-white px-3.5 py-3 text-[13px] font-semibold text-stone-500">This claim has expired.</div>;
  }
  if (!loggedIn) {
    return (
      <button type="button" onClick={onLogin} className="h-12 w-full rounded-full border border-ink bg-ink text-[14.5px] font-bold text-amber-300">
        Log in to claim
      </button>
    );
  }
  if (staff) return <p className="text-[12.5px] text-stone-500">For customer accounts.</p>;
  if (!o.eligible) {
    return (
      <p className="rounded-2xl border border-line bg-white px-3.5 py-3 text-[13px] text-stone-500">
        This offer is for new customers, before their first paid consultation.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onClaim}
      disabled={disabled}
      className="az-cta h-12 w-full rounded-full text-[15px] font-bold shadow-[0_6px_16px_rgba(255,140,26,.28)] disabled:opacity-60"
    >
      {busy ? "Claiming…" : "Claim offer"}
    </button>
  );
}
