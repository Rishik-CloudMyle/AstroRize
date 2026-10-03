"use client";

import { useSyncExternalStore } from "react";
import { DEMO_USER, INITIAL_WALLET } from "./mock/wallet";
import type { Transaction, WalletState } from "./types";

// A tiny client-side store for the signed-in user and their wallet.
// There is no backend yet, so it lives in the browser (localStorage) and any
// OTP is accepted. Swap these actions for API calls when the backend exists.

export interface Session {
  loggedIn: boolean;
  phone: string;
  user: { name: string; initials: string };
  wallet: WalletState;
}

const STORAGE_KEY = "astrorize-session";

const LOGGED_OUT: Session = {
  loggedIn: false,
  phone: "",
  user: DEMO_USER,
  wallet: INITIAL_WALLET,
};

let state: Session = LOGGED_OUT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...LOGGED_OUT, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    // Storage blocked (private mode etc.) — start logged out.
  }
}

function setState(next: Session) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: the session still works for this page view.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  load();
  return state;
}

function getServerSnapshot() {
  return LOGGED_OUT;
}

/** Read the session in any client component. Re-renders when it changes. */
export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const noopSubscribe = () => () => {};

/** False during the server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function totalBalance(s: Session): number {
  return s.wallet.service + s.wallet.promo;
}

function today(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ref(prefix: string): string {
  return `${prefix}-${Math.floor(10000 + Math.random() * 89999)}`;
}

function addTransaction(wallet: WalletState, t: Omit<Transaction, "date" | "ref"> & { refPrefix: string }): Transaction[] {
  const { refPrefix, ...rest } = t;
  return [{ date: today(), ref: ref(refPrefix), ...rest }, ...wallet.transactions];
}

export const sessionActions = {
  logIn(phone: string) {
    setState({ ...getSnapshot(), loggedIn: true, phone });
  },

  logOut() {
    setState({ ...LOGGED_OUT });
  },

  /** Wallet top-up: the full amount goes to the service balance, the bonus to promotional. */
  recharge(amount: number, bonus: number) {
    const s = getSnapshot();
    let transactions = addTransaction(s.wallet, { type: "Recharge", bucket: "Service", amount, refPrefix: "PAY" });
    if (bonus > 0) {
      transactions = addTransaction(
        { ...s.wallet, transactions },
        { type: "Cashback", bucket: "Promotional", amount: bonus, refPrefix: "CMP" },
      );
    }
    setState({
      ...s,
      wallet: { ...s.wallet, service: s.wallet.service + amount, promo: s.wallet.promo + bonus, transactions },
    });
  },

  /** One debit after a consultation ends. Promotional balance is used first. */
  chargeConsultation(total: number) {
    if (total <= 0) return { promo: 0, service: 0 };
    const s = getSnapshot();
    const promo = Math.min(s.wallet.promo, total);
    const service = Math.min(s.wallet.service, total - promo);
    const bucket = promo > 0 ? `Promo ₹${promo.toLocaleString("en-IN")} + Service ₹${service.toLocaleString("en-IN")}` : "Service";
    setState({
      ...s,
      wallet: {
        ...s.wallet,
        promo: s.wallet.promo - promo,
        service: s.wallet.service - service,
        transactions: addTransaction(s.wallet, { type: "Consultation", bucket, amount: -(promo + service), refPrefix: "SES" }),
      },
    });
    return { promo, service };
  },
};
