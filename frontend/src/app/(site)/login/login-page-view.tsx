"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { destinationFor, sessionName } from "@/components/account/auth-shell";
import LoginForm, { type LoginMethod } from "@/components/account/login-form";
import { APP_CTA, APP_SECONDARY } from "@/components/account/app-look";
import { useAppUI } from "@/components/app-provider";
import { sessionActions, useSession } from "@/lib/session-store";

/** The /login page: the same sign-in as the login window, then on to `next` or the role's home. */
export default function LoginPageView({ next, initialMethod }: { next: string | null; initialMethod: LoginMethod }) {
  const session = useSession();
  const router = useRouter();
  const { toast } = useAppUI();
  /** Set once they sign in here, so the "already logged in" card doesn't flash before the redirect. */
  const [leaving, setLeaving] = useState(false);

  // Whether the visitor was already signed in when the page loaded (decided once the session is known).
  const [arrivedSignedIn, setArrivedSignedIn] = useState<boolean | null>(null);
  if (session.ready && arrivedSignedIn === null) setArrivedSignedIn(session.loggedIn);

  if (!session.ready) return <div className="h-[420px] rounded-2xl bg-cream max-lg:bg-transparent" aria-busy="true" />;

  // Just signed in here: say so while the next page opens (it can take a few seconds the first
  // time in development), rather than showing an empty sign-in form that looks like it failed.
  if (leaving || (session.loggedIn && arrivedSignedIn === false)) {
    return (
      <div role="status" aria-live="polite">
        <h1 className="m-0 font-display text-[27px] font-semibold text-ink">You&rsquo;re signed in</h1>
        <p className="mt-1 text-[13.5px] text-stone-600">Taking you to AstroRize…</p>
        <Link
          href={destinationFor(session.role, next)}
          className={`az-cta mt-5 flex h-[50px] items-center justify-center rounded-full text-[15px] font-bold hover:text-cta-ink hover:no-underline ${APP_CTA}`}
        >
          Continue
        </Link>
      </div>
    );
  }

  if (session.loggedIn) {
    return (
      <div>
        <h1 className="m-0 font-display text-[27px] font-semibold text-ink">You&rsquo;re logged in</h1>
        <p className="mt-1 text-[13.5px] text-stone-600">
          Signed in as <b className="text-ink">{sessionName(session)}</b>.
        </p>
        <Link
          href={destinationFor(session.role, next)}
          className={`az-cta mt-5 flex h-[50px] items-center justify-center rounded-full text-[15px] font-bold hover:text-cta-ink hover:no-underline ${APP_CTA}`}
        >
          {session.role === "astrologer" ? "Open the astrologer portal" : session.role === "admin" ? "Open the admin console" : "Continue"}
        </Link>
        <button
          type="button"
          onClick={() => void sessionActions.logOut()}
          className={`mt-2.5 h-11 w-full rounded-full border border-line bg-white text-[14px] font-bold text-ink ${APP_SECONDARY}`}
        >
          Log out and use another account
        </button>
      </div>
    );
  }

  return (
    <LoginForm
      headingId="login-page-title"
      headingLevel="h1"
      initialMethod={initialMethod}
      onSignedIn={(user) => {
        setLeaving(true);
        const to = destinationFor(user.role, next);
        // A re-activated account already got its "Welcome back — active again" note.
        if (user.role === "customer" && user.created) toast("Welcome to AstroRize! Add your details any time from Wallet & account.");
        else if (user.role === "customer" && !user.reactivated) toast(`Welcome back${user.name && user.name !== "AstroRize customer" ? `, ${user.name.split(" ")[0]}` : ""}.`);
        router.push(to);
      }}
      onGuest={() => router.push(destinationFor("customer", next))}
    />
  );
}
