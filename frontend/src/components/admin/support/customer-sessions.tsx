"use client";

import { useEffect, useState } from "react";
import { EYEBROW } from "@/components/admin/ui";
import { api } from "@/lib/api/client";

// The customer's session history next to the ticket. Customers never see session references
// (SES-…); staff use them as the key that ties a ticket, a refund or a payout line to the
// consultation in that customer's history. Read-only. GET /admin/support/:id/customer-sessions.

interface Row {
  id: string;
  ref: string;
  astrologer: string;
  mode: string;
  date: string;
  minutes: number;
  amountLabel: string;
  status: string;
  /** The session this ticket is about. */
  current: boolean;
}

interface Data {
  alias: string;
  sessions: Row[];
  note?: string;
}

export default function CustomerSessions({ ticketId }: { ticketId: string }) {
  // The result remembers which ticket it belongs to, so switching tickets never shows the previous list.
  const [state, setState] = useState<{ id: string; data: Data | null; failed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Data>(`/admin/support/${encodeURIComponent(ticketId)}/customer-sessions`)
      .then((data) => !cancelled && setState({ id: ticketId, data, failed: false }))
      .catch(() => !cancelled && setState({ id: ticketId, data: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const ready = state && state.id === ticketId ? state : null;
  return (
    <section aria-label="Customer's sessions" className="mt-[18px]">
      <div className={`${EYEBROW} mb-[9px]`}>Customer&rsquo;s sessions</div>
      {!ready ? (
        <p className="m-0 text-[12.5px] text-[#78716c]">Loading the customer&rsquo;s session history…</p>
      ) : ready.failed || !ready.data ? (
        <p role="alert" className="m-0 text-[12.5px] font-semibold text-rose-700">
          Couldn&rsquo;t load the customer&rsquo;s sessions.
        </p>
      ) : ready.data.sessions.length === 0 ? (
        <p className="m-0 text-[12.5px] text-[#78716c]">{ready.data.note ?? "This customer has no consultations yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="bg-cream text-[10.5px] font-bold tracking-[.06em] text-[#78716c] uppercase">
                {["Session", "Astrologer", "Mode", "Date", "Duration", "Amount", "Status"].map((h) => (
                  <th key={h} scope="col" className="px-2.5 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ready.data.sessions.map((s) => (
                <tr key={s.id} aria-current={s.current ? "true" : undefined} className={s.current ? "bg-amber-50" : ""}>
                  <td className="border-t border-line-soft px-2.5 py-2 font-mono font-semibold whitespace-nowrap text-ink">
                    {s.ref}
                    {s.current && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-px font-sans text-[9.5px] font-extrabold tracking-[.05em] text-ink">THIS TICKET</span>}
                  </td>
                  <td className="border-t border-line-soft px-2.5 py-2 text-ink">{s.astrologer}</td>
                  <td className="border-t border-line-soft px-2.5 py-2 whitespace-nowrap text-[#57534e]">{s.mode}</td>
                  <td className="border-t border-line-soft px-2.5 py-2 whitespace-nowrap text-[#57534e]">{s.date}</td>
                  <td className="border-t border-line-soft px-2.5 py-2 whitespace-nowrap text-[#57534e] tabular-nums">{s.minutes > 0 ? `${s.minutes} min` : "—"}</td>
                  <td className="border-t border-line-soft px-2.5 py-2 whitespace-nowrap text-ink tabular-nums">{s.amountLabel}</td>
                  <td className="border-t border-line-soft px-2.5 py-2 whitespace-nowrap text-[#57534e]">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
