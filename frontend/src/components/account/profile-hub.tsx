"use client";

// The Profile hub (/me) — the "Profile" tab of the phone/tablet app look, after the client's
// mobile app prototype (APP-ACC-001): who is signed in, the wallet with Recharge, rows to every
// account place, then the legal links and company line that the desktop footer carries (the app
// look has no footer). Signed out: log in / sign up and the public places.

import Image from "next/image";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { FOOTER_COLUMNS, COMPANY } from "@/lib/mock/site";
import { homeFor } from "@/lib/auth";
import { rupee } from "@/lib/format";
import { FREE_CALL_DIRECTORY, minutesLeft } from "@/lib/free-calls";
import { totalBalance, useSession } from "@/lib/session-store";
import { useAppUI } from "../app-provider";
import LogoutButton from "../logout-button";
import NotificationBell from "../notification-bell";
import AppButton, { appButtonClass } from "../mobile/button";
import AppCard from "../mobile/app-card";
import ListRow, { ListRows } from "../mobile/list-row";
import { AppPageTitle } from "../mobile/page-title";
import SectionHeader from "../mobile/section-header";
import { Skeleton } from "../mobile/skeleton";

/** "+91 XXXXX 3210" from the account's mobile number (only the last four digits are shown). */
function maskedPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `+91 XXXXX ${digits.slice(-4)}`;
}

/** The footer's "T&C" column plus "About Astrorize": every legal page stays one tap away on phones. */
const LEGAL_LINKS = [
  ...(FOOTER_COLUMNS.find((c) => c.title === "T&C")?.links ?? []),
  ...(FOOTER_COLUMNS.find((c) => c.title === "Company")?.links.filter((l) => l.label.startsWith("About")) ?? []),
];

/** Phones and tablets only: on desktop the site footer carries the same links and company line. */
function LegalAndCompany() {
  return (
    <div className="lg:hidden">
      <SectionHeader title="About & legal" variant="link" className="mt-[22px]" />
      <ListRows>
        {LEGAL_LINKS.map((l) => (
          <ListRow key={l.label} href={l.href} title={l.label} />
        ))}
      </ListRows>
      <p className="mt-6 mb-0 text-center text-[11.5px] leading-[1.5] text-app-ink-3">
        © 2026 {COMPANY.legalName} · CIN {COMPANY.cin}
        <br />
        {COMPANY.tagline}
        <br />
        {COMPANY.policyVersions}
      </p>
    </div>
  );
}

function Identity({ name, initials, line, photoUrl = null }: { name: string; initials: string; line: string | null; photoUrl?: string | null }) {
  return (
    <div className="mt-4 mb-4 flex items-center gap-3">
      <span
        aria-hidden="true"
        className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-app-tint-2 text-[22px] font-bold text-app-active"
      >
        {photoUrl ? <Image src={photoUrl} alt="" fill unoptimized sizes="64px" className="object-cover" /> : initials}
      </span>
      <div className="min-w-0">
        <b className="block truncate text-[16px] font-bold text-app-ink">{name}</b>
        {line && <span className="block truncate text-[12px] text-app-ink-3">{line}</span>}
      </div>
    </div>
  );
}

/** The customer's profile photo (GET /me/profile), or null while loading / when there is none. */
function useProfilePhoto(enabled: boolean): string | null {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .get<{ profile: { photoUrl: string | null } }>("/me/profile")
      .then((r) => !cancelled && setPhoto(r.profile.photoUrl))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? photo : null;
}

export default function ProfileHub() {
  const session = useSession();
  const { openLogin } = useAppUI();
  const photoUrl = useProfilePhoto(session.ready && session.loggedIn && session.role === "customer");

  if (!session.ready) {
    return (
      <div role="status" aria-label="Loading your profile">
        <div className="mt-4 mb-4 flex items-center gap-3">
          <Skeleton rounded="full" className="size-16" />
          <div className="flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        </div>
        <Skeleton rounded="card" className="h-[62px] w-full" />
        <div className="mt-3.5 flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} rounded="card" className="h-app-hit w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!session.loggedIn) {
    return (
      <>
        <AppCard padding="lg" className="mt-4 text-center">
          <Image src="/assets/brand/logo-mark.png" alt="" width={56} height={56} className="mx-auto size-14 object-contain" />
          <h2 className="mt-2 mb-1 font-display text-[24px] leading-tight font-semibold text-app-ink">Welcome to Astrorize</h2>
          <p className="m-0 text-[13px] leading-[1.45] text-app-ink-2">Log in to see your wallet, messages and notifications.</p>
          <AppButton block className="mt-4" onClick={() => openLogin()}>
            Log in
          </AppButton>
          <AppButton href="/signup" variant="secondary" block className="mt-2">
            Sign up
          </AppButton>
        </AppCard>
        <ListRows className="mt-3.5">
          <ListRow href="/astrologers" title="Consult an astrologer" />
          <ListRow href="/live" title="Live now" />
          <ListRow href="/free-tools" title="Kundli & free tools" />
          <ListRow href="/offers" title="Offers" />
        </ListRows>
        <LegalAndCompany />
      </>
    );
  }

  const phone = maskedPhone(session.phone);

  if (session.role !== "customer") {
    // An astrologer or a staff member browsing the public site.
    return (
      <>
        <Identity name={session.user.name} initials={session.user.initials} line={session.email || phone} />
        <AppButton href={homeFor(session.role)} block>
          {session.role === "astrologer" ? "Open my astrologer portal" : "Open the admin console"}
        </AppButton>
        <ListRows className="mt-3.5">
          <ListRow href="/free-tools" title="Kundli & free tools" />
        </ListRows>
        <LegalAndCompany />
        <LogoutButton className={`${appButtonClass({ variant: "secondary", block: true })} mt-[22px]`} />
      </>
    );
  }

  const balance = rupee(totalBalance(session));
  // The weekly free minutes (welcome campaign): shown while the customer has them (not when revoked).
  const welcome = session.role === "customer" && session.wallet.welcome?.status !== "revoked" ? session.wallet.welcome : null;
  return (
    <>
      <Identity name={session.user.name} initials={session.user.initials} line={phone ?? (session.email || null)} photoUrl={photoUrl} />

      <AppCard className="mb-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-app-ink-3">Wallet</div>
          <b className="block text-[16px] font-bold tabular-nums text-app-ink">{balance}</b>
        </div>
        {/* ?view=add opens the phone/tablet Add money screen; #add-money is the desktop card. */}
        <AppButton href="/wallet?view=add#add-money" size="sm" className="text-[15px]">
          Recharge
        </AppButton>
      </AppCard>

      <ListRows>
        <ListRow href="/wallet?view=profile#profile" title="Profile" subtitle="Name, photo and birth details" />
        <ListRow href="/wallet" title="Wallet & transactions" />
        {welcome && <ListRow href={FREE_CALL_DIRECTORY} title="Free minutes" subtitle={minutesLeft(welcome)} />}
        <ListRow href="/messages" title="Messages" />
        <NotificationBell variant="row" />
        <ListRow href="/offers" title="Offers" />
        <ListRow href="/free-tools" title="Kundli & free tools" />
        <ListRow href="/wallet?view=settings" title="Settings & data rights" />
      </ListRows>

      <LegalAndCompany />

      <LogoutButton className={`${appButtonClass({ variant: "secondary", block: true })} mt-[22px]`} />
    </>
  );
}

/** The hub's page frame: the "Profile" title pill; full width on phones and tablets, a narrow column on desktop. */
export function ProfileHubPage() {
  return (
    <div className="mx-auto w-full px-4 pt-3 pb-8 lg:max-w-[640px] lg:pt-10 lg:pb-16">
      <AppPageTitle>Profile</AppPageTitle>
      <ProfileHub />
    </div>
  );
}
