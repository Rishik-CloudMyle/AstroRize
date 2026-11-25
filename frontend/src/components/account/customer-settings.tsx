"use client";

import Link from "next/link";
import { useState } from "react";
import AccountSection, { ClosedNotice, type Closed } from "@/components/wallet/account-section";
import LogoutButton from "@/components/logout-button";
import { useAppUI } from "@/components/app-provider";
import { ApiError, api } from "@/lib/api/client";
import { DATA_RIGHTS } from "@/lib/mock/wallet";
import { useHydrated, useSession } from "@/lib/session-store";
import ChangePassword from "./change-password";

const CARD = "rounded-2xl border border-line bg-white p-5";

/** The customer's Settings page: password, data rights, deactivate or delete, legal pages and log out. */
export default function CustomerSettings() {
  const hydrated = useHydrated();
  const session = useSession();
  const { openLogin, toast } = useAppUI();
  const [requesting, setRequesting] = useState<string | null>(null);
  const [closed, setClosed] = useState<Closed | null>(null);

  if (closed) return <ClosedNotice closed={closed} onLogin={() => openLogin()} />;
  if (!hydrated || !session.ready) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!session.loggedIn) {
    return (
      <div className={`${CARD} text-center`}>
        <p className="m-0 text-[14px] text-stone-600">Log in to see your settings.</p>
        <button type="button" onClick={() => openLogin()} className="az-cta mt-4 h-11 rounded-full px-6 text-[14px] font-bold">
          Log in
        </button>
      </div>
    );
  }

  async function requestDataRight(r: (typeof DATA_RIGHTS)[number]) {
    if (requesting) return;
    setRequesting(r.key);
    try {
      await api.post("/me/data-requests", { kind: r.key });
      toast(r.message);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setRequesting(null);
    }
  }

  return (
    <div className="grid gap-4">
      <section className={CARD}>
        <h2 className="m-0 text-[17px] font-bold">Password</h2>
        <ChangePassword className="mt-3" />
      </section>

      <section className={CARD}>
        <h2 className="mb-1 text-[17px] font-bold">Your data rights</h2>
        <p className="mb-4 text-[13px] text-stone-500">Digital Personal Data Protection Act, 2023 — exercisable here, no email required.</p>
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
                {requesting === r.key ? "Sending…" : r.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-3 text-[17px] font-bold">Your account</h2>
        <AccountSection onClosed={setClosed} />
      </section>

      <section className={CARD}>
        <h2 className="mb-2 text-[17px] font-bold">Legal</h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[14px] font-semibold">
          <li><Link href="/terms">Terms &amp; Conditions</Link></li>
          <li><Link href="/privacy">Privacy Policy</Link></li>
          <li><Link href="/terms#refund-and-cancellation-policy">Refund &amp; Cancellation</Link></li>
          <li><Link href="/data-deletion-policy">Data Deletion Policy</Link></li>
        </ul>
      </section>

      <LogoutButton className="h-12 rounded-full border border-line bg-white px-6 text-[14.5px] font-bold text-ink sm:w-fit">Log out</LogoutButton>
    </div>
  );
}
