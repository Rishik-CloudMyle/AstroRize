"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/session-store";

interface Mine {
  consultationId: string;
  stars: number;
  text: string;
  when: string;
}

/** The signed-in customer's own review(s) of this astrologer, with a way to delete them. Nothing shows for anyone else. */
export default function MyReview({ astrologerId }: { astrologerId: string }) {
  const session = useSession();
  const router = useRouter();
  const [mine, setMine] = useState<Mine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isCustomer = session.ready && session.loggedIn && session.role === "customer";

  useEffect(() => {
    if (!isCustomer) return;
    let alive = true;
    api
      .get<{ reviews: Mine[] }>(`/me/reviews?astrologerId=${encodeURIComponent(astrologerId)}`)
      .then((r) => alive && setMine(r.reviews))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isCustomer, astrologerId]);

  if (!isCustomer || mine.length === 0) return null;

  const remove = async (r: Mine) => {
    if (!window.confirm("Delete your review? It is removed from this astrologer's profile and their rating is updated.")) return;
    setBusy(r.consultationId);
    setError("");
    try {
      await api.delete(`/consultations/${r.consultationId}/rating`);
      setMine((list) => list.filter((x) => x.consultationId !== r.consultationId));
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete your review.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5" aria-label="Your review">
      <b className="text-[13px] text-amber-900">Your review</b>
      {mine.map((r) => (
        <div key={r.consultationId} className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13px] text-stone-700">
            <span className="font-bold text-amber-700">{"★".repeat(r.stars)}</span>
            <span className="text-stone-300">{"★".repeat(5 - r.stars)}</span>
            {r.when && <span className="ml-2 text-[11.5px] text-stone-500">{r.when}</span>}
            {r.text && <p className="mt-1 mb-0 leading-snug [overflow-wrap:anywhere]">{r.text}</p>}
          </div>
          <button
            type="button"
            disabled={busy === r.consultationId}
            onClick={() => void remove(r)}
            className="h-8 shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-bold text-rose-700 disabled:opacity-60"
          >
            {busy === r.consultationId ? "Deleting…" : "Delete"}
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="mt-2 mb-0 text-[12px] font-semibold text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
