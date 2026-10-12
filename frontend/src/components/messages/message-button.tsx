"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { givenName, type ConversationDetail } from "@/lib/messages";
import { useSession } from "@/lib/session-store";

/**
 * "Astrologer Messenger" on a profile: for a visitor (who is asked to log in on the messages
 * page) and for a customer who may message this astrologer (any listed astrologer, or one they
 * already have a conversation with).
 */
export default function MessageButton({ slug, name }: { slug: string; name: string }) {
  const session = useSession();
  const customer = session.ready && session.loggedIn && session.role === "customer";
  const visitor = session.ready && !session.loggedIn;
  const [allowed, setAllowed] = useState<{ slug: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    api
      .get<ConversationDetail>(`/messages/${encodeURIComponent(slug)}`)
      .then((res) => !cancelled && setAllowed({ slug, ok: res.canMessage }))
      .catch(() => !cancelled && setAllowed({ slug, ok: false }));
    return () => {
      cancelled = true;
    };
  }, [customer, slug]);

  if (!visitor && (!customer || !allowed?.ok || allowed.slug !== slug)) return null;
  return (
    <div>
      <Link
        href={`/messages/${slug}`}
        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink hover:border-gold hover:no-underline"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M4 6h16v10H7l-3 3V6z" />
        </svg>
        Astrologer Messenger
      </Link>
      <p className="mt-1.5 text-center text-[11.5px] text-stone-500">A free direct message with {givenName(name)}.</p>
    </div>
  );
}
