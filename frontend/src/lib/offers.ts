"use client";

import { useEffect, useState } from "react";
import { api } from "./api/client";
import { useSession } from "./session-store";

// Campaign offers (/offers): customers claim them first; a claimed one then applies by itself —
// cashback at a recharge, a discount on a consultation, a bonus credit straight away.

export type OfferKind = "RECHARGE_CASHBACK" | "CONSULT_DISCOUNT" | "BONUS_CREDIT";

export interface Offer {
  id: string;
  kind: OfferKind;
  name: string;
  description: string;
  /** "10% cashback on recharges of ₹500 or more, up to ₹100" */
  summary: string;
  /** The percent that applies (cashback or discount). */
  percent: number | null;
  flatAmount: number | null;
  minRecharge: number | null;
  maxBenefit: number | null;
  /** "31 Oct 2026" — last day it can be claimed (null: until AstroRize ends it). */
  ends: string | null;
  claimValidDays: number;
  usesPerCustomer: number;
  audience: "ALL" | "NEW";
  /** False for a new-customers offer once this customer has paid for a consultation. */
  eligible: boolean;
  /** Still open to new claims. */
  open: boolean;
  claim: { status: "ACTIVE" | "USED" | "EXPIRED"; expires: string; usesLeft: number } | null;
}

export interface ConsultDiscount {
  campaignId: string;
  name: string;
  /** Percent off the per-minute price. */
  pct: number;
  /** "29 Oct 2026" */
  expires: string;
}

/** The per-minute price after a discount: rounded down, never below ₹1 (the API's rule). */
export const discountedRate = (rate: number, pct: number) => Math.max(1, Math.floor((rate * (100 - pct)) / 100));

/** Fired when the customer's claims change (claimed one, or a consultation used one). */
const CHANGED = "astrorize:offers-changed";
export const offersChanged = () => window.dispatchEvent(new Event(CHANGED));

/**
 * The consultation discount the signed-in customer has claimed and would get now, or null
 * (visitors, other roles, or none claimed). Re-read whenever claims change.
 */
export function useConsultDiscount(): ConsultDiscount | null {
  const session = useSession();
  const who = session.ready && session.loggedIn && session.role === "customer" ? session.email || session.phone || session.user.name : "";
  const [state, setState] = useState<{ who: string; discount: ConsultDiscount | null }>({ who: "", discount: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGED, bump);
    return () => window.removeEventListener(CHANGED, bump);
  }, []);

  useEffect(() => {
    if (!who) return;
    let cancelled = false;
    api
      .get<{ discount: ConsultDiscount | null }>("/offers/consult-discount")
      .then((r) => !cancelled && setState({ who, discount: r.discount }))
      .catch(() => {
        // No discount shown; the API applies (or doesn't) on its own and says so.
      });
    return () => {
      cancelled = true;
    };
  }, [who, version]);

  return who && state.who === who ? state.discount : null;
}
