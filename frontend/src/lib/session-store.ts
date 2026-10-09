"use client";

import { useSyncExternalStore } from "react";
import { api } from "./api/client";
import type { AdminRole, Role } from "./auth";
import type { WalletState } from "./types";

// A tiny client-side store for the signed-in person and their wallet.
// The Node API is the source of truth: it sets the httpOnly session cookie on
// sign-in, and this store just mirrors /api/auth/me and /api/wallet so the
// header, wallet page and consult journey can re-render when they change.

export interface Session {
  /** False until the first /api/auth/me answer arrives. */
  ready: boolean;
  loggedIn: boolean;
  role: Role;
  email: string;
  adminRole?: AdminRole;
  astrologerId?: string;
  phone: string;
  user: { name: string; initials: string };
  wallet: WalletState;
}

/** The person as /api/auth/me and the sign-in endpoints describe them. */
export interface ApiUser {
  id: string;
  name: string;
  initials: string;
  email: string | null;
  phone: string | null;
  role: Role;
  adminRole?: AdminRole;
  astrologerId?: string;
  astrologerSlug?: string;
}

/** What an astrologer gives when signing up (POST /api/auth/signup/astrologer). */
export interface AstrologerSignup {
  name: string;
  email: string;
  phone: string;
  password: string;
  gender: "Female" | "Male" | null;
  years: number;
  skills: string[];
  languages: string[];
}

interface ApiWallet {
  service: number;
  promo: number;
  held: number;
  promoExpires: string | null;
  transactions: WalletState["transactions"];
}

const EMPTY_WALLET: WalletState = { service: 0, promo: 0, promoExpires: "", transactions: [] };

const LOGGED_OUT: Session = {
  ready: false,
  loggedIn: false,
  role: "customer",
  email: "",
  phone: "",
  user: { name: "", initials: "" },
  wallet: EMPTY_WALLET,
};

let state: Session = LOGGED_OUT;
let started = false;
const listeners = new Set<() => void>();

function setState(next: Session) {
  state = next;
  listeners.forEach((l) => l());
}

function fromUser(user: ApiUser | null): Session {
  if (!user) return { ...LOGGED_OUT, ready: true };
  return {
    ready: true,
    loggedIn: true,
    role: user.role,
    email: user.email ?? "",
    adminRole: user.adminRole,
    astrologerId: user.astrologerId,
    phone: user.phone ?? "",
    user: { name: user.name, initials: user.initials },
    wallet: EMPTY_WALLET,
  };
}

function toWallet(w: ApiWallet): WalletState {
  return { service: w.service, promo: w.promo, promoExpires: w.promoExpires ?? "", transactions: w.transactions };
}

async function applyUser(user: ApiUser | null) {
  setState(fromUser(user));
  if (user?.role === "customer") await sessionActions.refreshWallet();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  api
    .get<{ user: ApiUser | null }>("/auth/me")
    .then(({ user }) => applyUser(user))
    .catch(() => setState({ ...LOGGED_OUT, ready: true }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  start();
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

export const sessionActions = {
  /** Step 1 of mobile sign-in. In development the API returns the code as devCode. */
  async requestOtp(phone: string) {
    return api.post<{ sent: boolean; expiresInSeconds: number; devCode?: string }>("/auth/otp/request", { phone });
  },

  /** Step 2 of mobile sign-in: always a customer account (created on first sign-in). */
  async verifyOtp(phone: string, code: string) {
    const { user } = await api.post<{ user: ApiUser }>("/auth/otp/verify", { phone, code });
    await applyUser(user);
    return user;
  },

  /**
   * Customer sign-up by mobile: the same code check as sign-in. `created` is false when the
   * number already had an account (they are simply signed in to it).
   */
  async signUpWithOtp(phone: string, code: string) {
    const { user, created } = await api.post<{ user: ApiUser; created: boolean }>("/auth/otp/verify", { phone, code });
    await applyUser(user);
    return { user, created };
  },

  /** Lets a signed-in customer without a password add one, so they can also log in with their email. */
  async setPassword(password: string) {
    await api.post("/auth/password", { password });
  },

  /** Astrologer sign-up, step 1: checks the details and texts a code to their mobile number. */
  async startAstrologerSignup(details: AstrologerSignup) {
    return api.post<{ sent: boolean; expiresInSeconds: number; devCode?: string }>("/auth/signup/astrologer/start", details);
  },

  /** Astrologer sign-up, step 2: creates the account (application in draft) and signs them in. */
  async signUpAstrologer(details: AstrologerSignup, code: string) {
    const { user } = await api.post<{ user: ApiUser }>("/auth/signup/astrologer", { ...details, code });
    await applyUser(user);
    return user;
  },

  /** Email sign-in: the account decides the role (customer, astrologer or admin). */
  async logInWithEmail(email: string, password: string) {
    const { user } = await api.post<{ user: ApiUser }>("/auth/login", { email, password });
    await applyUser(user);
    return user;
  },

  async logOut() {
    try {
      await api.post("/auth/logout");
    } finally {
      setState({ ...LOGGED_OUT, ready: true });
    }
  },

  /** Re-reads the signed-in person (e.g. after they edit their name) without touching the wallet. */
  async refreshUser() {
    const { user } = await api.get<{ user: ApiUser | null }>("/auth/me");
    if (!user) return setState({ ...LOGGED_OUT, ready: true });
    const next = fromUser(user);
    setState({ ...next, wallet: state.wallet });
  },

  async refreshWallet() {
    const { wallet } = await api.get<{ wallet: ApiWallet }>("/wallet");
    setState({ ...state, wallet: toWallet(wallet) });
    return state.wallet;
  },

  /**
   * Wallet top-up. Creates a payment order, then confirms it. With the real gateway the
   * checkout window sits between the two calls; until its keys exist the API uses a
   * stand-in provider that confirms straight away.
   */
  async recharge(amount: number) {
    const order = await api.post<{ orderId: string; amount: number; gst: number; bonus: number; total: number }>("/wallet/recharge", { amount });
    await api.post(`/wallet/recharge/${order.orderId}/confirm`);
    await sessionActions.refreshWallet();
    return order;
  },
};
