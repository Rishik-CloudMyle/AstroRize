"use client";

import { useSyncExternalStore } from "react";
import { ApiError, api } from "./api/client";
import { openCheckout, type RechargeOrder } from "./razorpay-checkout";
import type { AdminRole, Role } from "./auth";
import type { WalletState, WelcomeBenefit } from "./types";

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
  /** A temporary block on the account (repeated contact sharing), while it lasts. */
  block: AccountBlock | null;
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
  /** Set by a sign-in that re-activated an account its owner had paused ("Deactivate"). */
  reactivated?: boolean;
  /** Set by a mobile sign-in that created the account (a first sign-in). */
  created?: boolean;
  /** A temporary block for repeated contact sharing, while it lasts. */
  block?: AccountBlock | null;
}

/** A temporary block: until when ("10 Nov 2026, 17:05 IST") and why. */
export interface AccountBlock {
  until: string;
  untilLabel: string;
  reason: string;
}

/** Fired on window when the API refuses something because the account is blocked (code "account_blocked"). */
export const ACCOUNT_BLOCKED_EVENT = "astrorize:account-blocked";

/** Fired on window when a sign-in re-activates a paused account; the app shows a short note. */
export const REACTIVATED_EVENT = "astrorize:reactivated";

/** Marks the user and tells the app when the sign-in re-activated a paused account. */
function withReactivation(user: ApiUser, reactivated: boolean | undefined): ApiUser {
  if (!reactivated) return user;
  window.dispatchEvent(new Event(REACTIVATED_EVENT));
  return { ...user, reactivated: true };
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
  welcome?: WelcomeBenefit | null;
}

const EMPTY_WALLET: WalletState = { service: 0, promo: 0, promoExpires: "", transactions: [], welcome: null };

const LOGGED_OUT: Session = {
  ready: false,
  loggedIn: false,
  role: "customer",
  email: "",
  phone: "",
  user: { name: "", initials: "" },
  wallet: EMPTY_WALLET,
  block: null,
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
    block: user.block ?? null,
  };
}

function toWallet(w: ApiWallet): WalletState {
  return { service: w.service, promo: w.promo, promoExpires: w.promoExpires ?? "", transactions: w.transactions, welcome: w.welcome ?? null };
}

async function applyUser(user: ApiUser | null) {
  setState(fromUser(user));
  // The person is signed in either way: a wallet that doesn't load now loads on the next refresh
  // (failing here made a successful sign-in look failed, and the code was already used).
  if (user?.role === "customer") await sessionActions.refreshWallet().catch(() => {});
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // A refusal because the account was just blocked: re-read the person so the banner shows.
  window.addEventListener(ACCOUNT_BLOCKED_EVENT, () => void sessionActions.refreshUser().catch(() => {}));
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

/** What our API says about a recharge after asking Razorpay. */
interface RechargeAnswer {
  status: "PAID" | "FAILED" | "PENDING";
  reason?: string;
  paymentId?: string | null;
  method?: string | null;
  cashback?: number;
  wallet?: ApiWallet;
}

/** How a recharge ended. PAID: the wallet is already updated in the session. */
export type RechargeOutcome =
  | { status: "PAID"; order: RechargeOrder; paymentId: string | null; method: string | null; cashback: number }
  /** Razorpay hasn't confirmed it yet (slow UPI approval, or our check couldn't finish). */
  | { status: "PENDING"; order: RechargeOrder; message: string }
  | { status: "FAILED"; order: RechargeOrder; message: string }
  /** The customer closed the checkout without paying. */
  | { status: "CLOSED"; order: RechargeOrder };

const CHECK_LATER = "We're waiting for Razorpay to confirm this payment. Check its status in a moment — you're never charged twice.";

function outcomeOf(order: RechargeOrder, answer: RechargeAnswer): RechargeOutcome {
  if (answer.status === "PAID") {
    if (answer.wallet) setState({ ...state, wallet: toWallet(answer.wallet) });
    // `cashback`: what a claimed offer actually added (0 if its use was taken meanwhile).
    return { status: "PAID", order, paymentId: answer.paymentId ?? null, method: answer.method ?? null, cashback: answer.cashback ?? 0 };
  }
  if (answer.status === "FAILED") return { status: "FAILED", order, message: answer.reason || "The payment didn't go through." };
  return { status: "PENDING", order, message: CHECK_LATER };
}

export function totalBalance(s: Session): number {
  return s.wallet.service + s.wallet.promo;
}

/** The signed-in customer's welcome free call while it can be used, else null. */
export function usableWelcome(s: Session): WelcomeBenefit | null {
  return s.loggedIn && s.role === "customer" && s.wallet.welcome?.available ? s.wallet.welcome : null;
}

/**
 * Whether to show "Free call" on astrologers: to a customer holding an unused free call, and to
 * visitors (every new account gets one). Not once it's used, nor to astrologer or staff accounts.
 */
export function showsFreeCalls(s: Session): boolean {
  if (!s.ready) return false;
  return !s.loggedIn || !!usableWelcome(s);
}

export const sessionActions = {
  /** Step 1 of mobile sign-in. In development the API returns the code as devCode. */
  async requestOtp(phone: string) {
    return api.post<{ sent: boolean; expiresInSeconds: number; devCode?: string }>("/auth/otp/request", { phone });
  },

  /** Step 2 of mobile sign-in: always a customer account (created on first sign-in). */
  async verifyOtp(phone: string, code: string) {
    const { user, created, reactivated } = await api.post<{ user: ApiUser; created?: boolean; reactivated?: boolean }>("/auth/otp/verify", { phone, code });
    await applyUser(user);
    const signedIn = withReactivation(user, reactivated);
    return created ? { ...signedIn, created } : signedIn;
  },

  /**
   * Customer sign-up by mobile: the same code check as sign-in. `created` is false when the
   * number already had an account (they are simply signed in to it).
   */
  async signUpWithOtp(phone: string, code: string) {
    const { user, created, reactivated } = await api.post<{ user: ApiUser; created: boolean; reactivated?: boolean }>("/auth/otp/verify", { phone, code });
    await applyUser(user);
    return { user: withReactivation(user, reactivated), created };
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
    const { user, reactivated } = await api.post<{ user: ApiUser; reactivated?: boolean }>("/auth/login", { email, password });
    await applyUser(user);
    return withReactivation(user, reactivated);
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
   * Wallet top-up through Razorpay: our API creates the order, Razorpay Checkout takes the
   * payment, and our API verifies it with Razorpay before crediting the wallet (once). Closing
   * the checkout asks the API once more, in case a payment (e.g. UPI) went through meanwhile.
   * Throws (with a message to show) only when nothing was charged: the order or checkout
   * couldn't start.
   */
  async recharge(amount: number): Promise<RechargeOutcome> {
    const order = await api.post<RechargeOrder>("/wallet/recharge", { amount });
    const result = await openCheckout(order);
    if (result.kind === "paid") {
      try {
        const answer = await api.post<RechargeAnswer>(`/wallet/recharge/${order.orderId}/verify`, result.response);
        return outcomeOf(order, answer);
      } catch (e) {
        // Paid at Razorpay but not confirmed here (connection, gateway): "Check status" finds it.
        return { status: "PENDING", order, message: e instanceof ApiError ? e.message : CHECK_LATER };
      }
    }
    try {
      const answer = await api.post<RechargeAnswer>(`/wallet/recharge/${order.orderId}/status`);
      if (answer.status === "PAID") return outcomeOf(order, answer);
    } catch {
      // Couldn't ask: report what the checkout said.
    }
    return result.failure ? { status: "FAILED", order, message: result.failure } : { status: "CLOSED", order };
  },

  /** "Check status" for a recharge whose payment is still being confirmed. */
  async checkRecharge(order: RechargeOrder): Promise<RechargeOutcome> {
    const answer = await api.post<RechargeAnswer>(`/wallet/recharge/${order.orderId}/status`);
    return outcomeOf(order, answer);
  },
};
