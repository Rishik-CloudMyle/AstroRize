"use client";

import Link from "next/link";
import { useHydrated, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import KundliChart from "./kundli-chart";

// The Kundli is for signed-in customers. Everyone else sees the two chart frames, empty
// (no houses, planets or degrees), with a prompt to log in.

export type KundliAccess = "checking" | "customer" | "guest" | "other";

export function useKundliAccess(): KundliAccess {
  const hydrated = useHydrated();
  const session = useSession();
  if (!hydrated || !session.ready) return "checking";
  if (!session.loggedIn) return "guest";
  return session.role === "customer" ? "customer" : "other";
}

export default function KundliLocked({ access }: { access: Exclude<KundliAccess, "customer"> }) {
  const { openLogin } = useAppUI();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
      {(["north", "south"] as const).map((style) => (
        <figure key={style} className="m-0">
          <div className="mx-auto aspect-square w-full max-w-[260px] opacity-90 drop-shadow-[0_8px_18px_rgba(120,72,10,.12)]">
            <KundliChart style={style} empty />
          </div>
          <figcaption className="mt-2 text-center text-xs font-semibold text-stone-500">
            {style === "north" ? "North chart" : "South chart"}
          </figcaption>
        </figure>
      ))}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center md:text-left" aria-live="polite">
        {access === "checking" ? (
          <div className="h-[132px]" aria-busy="true" />
        ) : access === "other" ? (
          <>
            <h3 className="m-0 font-display text-[24px] font-semibold text-ink">Kundli is for customer accounts</h3>
            <p className="mt-2 text-[13.5px] leading-normal text-stone-600">
              You&apos;re signed in with an astrologer or staff account. Log in with a customer account to see your Kundli.
            </p>
          </>
        ) : (
          <>
            <h3 className="m-0 font-display text-[24px] font-semibold text-ink">Log in to see your Kundli</h3>
            <p className="mt-2 text-[13.5px] leading-normal text-stone-600">
              Your birth chart is private to your account. It&apos;s free — log in or create an account to see your houses,
              planets and degrees.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5 md:justify-start">
              <button type="button" onClick={() => openLogin()} className="az-cta h-11 rounded-full px-6 text-[14.5px] font-bold">
                Log in
              </button>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center rounded-full border border-line bg-white px-6 text-[14.5px] font-bold text-ink hover:text-ink hover:no-underline"
              >
                Sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
