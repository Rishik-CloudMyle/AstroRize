"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/admin/admin-provider";
import ReasonDialog from "@/components/admin/reason-dialog";
import { api } from "@/lib/api/client";
import type { BlockedAccount, ContactFlag, ContactFlagShow, ContactFlagsData } from "@/lib/admin/types";

const KIND_LABEL: Record<ContactFlag["kinds"][number], string> = {
  phone: "Phone number",
  email: "Email",
  link: "Link",
  social: "Social / messaging app",
  upi: "UPI ID",
  address: "Home address",
};

const TABS: { key: ContactFlagShow; label: string }[] = [
  { key: "open", label: "To review" },
  { key: "reviewed", label: "Reviewed" },
  { key: "all", label: "All" },
];

/** Block lengths staff can pick (days); the automatic rule's length is offered first. */
const DAY_CHOICES = [1, 3, 7, 14, 30];

/** What the block dialog is doing: block someone (or extend their block), or lift it. */
type Asking = { kind: "block" | "lift"; userId: string; name: string; blockedUntil: string | null };

/**
 * Off-platform contact attempts: messages the contact filter stopped (free Messages, paid
 * consultation chat, live chat), with a masked snippet — staff never see the detail itself.
 */
export default function ContactFlags({ data }: { data: ContactFlagsData }) {
  const { run, busy } = useAction();
  // At the automatic rule's number of attempts a person is called out as a repeat offender.
  const repeatAt = data.policy.after;
  const [asking, setAsking] = useState<Asking | null>(null);
  const [days, setDays] = useState(data.policy.blockDays);
  const ask = (a: Asking) => {
    setDays(data.policy.blockDays);
    setAsking(a);
  };
  const block = (a: Asking, reason: string) =>
    run(
      () => api.post(`/admin/contact-blocks/${encodeURIComponent(a.userId)}`, { days, reason }),
      a.blockedUntil
        ? `${a.name}'s block was extended by ${days} ${days === 1 ? "day" : "days"}. They've been told. Audited.`
        : `${a.name} is blocked for ${days} ${days === 1 ? "day" : "days"}. They've been told. Audited.`,
    );
  const lift = (a: Asking, reason: string) =>
    run(() => api.post(`/admin/contact-blocks/${encodeURIComponent(a.userId)}/lift`, { reason }), `${a.name}'s block was lifted. They can use AstroRize again. Audited.`);
  const review = (f: ContactFlag) =>
    void run(() => api.post(`/admin/contact-flags/${encodeURIComponent(f.id)}/review`), "Marked reviewed. The review is in the audit log.");

  const empty =
    data.show === "open"
      ? "Nothing to review — no new contact attempts."
      : data.show === "reviewed"
        ? "No attempt has been marked reviewed yet."
        : "No contact attempts so far.";

  return (
    <div>
      <BlockedAccounts data={data} busy={busy} onAsk={ask} />
      <p className="mt-0 mb-3 text-[12px] text-[#78716c]">
        Every stopped message warns its sender. {data.policy.after} attempts within {data.policy.windowDays} days block the account for{" "}
        {data.policy.blockDays} {data.policy.blockDays === 1 ? "day" : "days"} automatically (Config console → moderation).
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Which attempts">
        {TABS.map((t) => {
          const on = t.key === data.show;
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={on}
              href={t.key === "open" ? "/admin/trust" : `/admin/trust?flags=${t.key}`}
              scroll={false}
              className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[12.5px] font-bold ${
                on ? "border-ink bg-ink text-amber-300" : "border-line bg-white text-[#57534e]"
              }`}
            >
              {t.label}
              {t.key === "open" && data.open > 0 && <span className="ml-1.5 tabular-nums">{data.open}</span>}
            </Link>
          );
        })}
        <span className="ml-auto text-[11.5px] text-[#78716c]">
          {data.total.toLocaleString("en-IN")} {data.total === 1 ? "attempt" : "attempts"} in all
        </span>
      </div>

      {data.flags.length === 0 ? (
        <p className="m-0 rounded-[14px] border border-dashed border-line px-4 py-5 text-center text-[13px] text-[#78716c]">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {data.flags.map((f) => (
            <li
              key={f.id}
              className="rounded-[14px] border border-line px-4 py-3.5"
              style={{ background: f.reviewed ? "#f7f4ee" : "#fffdf8" }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <b className="text-[13.5px] break-words">{f.who.name}</b>
                <span className="text-[11.5px] font-semibold text-[#78716c]">{f.who.side}</span>
                {f.attempts >= repeatAt ? (
                  <span className="inline-flex h-[21px] items-center rounded-full bg-rose-50 px-2 text-[10.5px] font-extrabold text-rose-700">
                    Repeat · {f.attempts} attempts
                  </span>
                ) : (
                  f.attempts > 1 && (
                    <span className="inline-flex h-[21px] items-center rounded-full bg-amber-50 px-2 text-[10.5px] font-extrabold text-amber-800">
                      {f.attempts} attempts
                    </span>
                  )
                )}
                <span className="ml-auto text-[11.5px] text-[#78716c] tabular-nums">{f.at}</span>
              </div>
              <div className="mt-1 text-[12px] text-[#57534e]">
                <b>{f.where.label}</b> · <span className="break-words">{f.where.detail}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.kinds.map((k) => (
                  <span key={k} className="inline-flex h-[21px] items-center rounded-full bg-stone-100 px-2 text-[10.5px] font-bold text-[#57534e]">
                    {KIND_LABEL[k]}
                  </span>
                ))}
              </div>
              <p className="mt-2 mb-0 text-[13px] leading-[1.5] break-words text-[#57534e]">“{f.snippet}”</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {f.who.blockedUntil && (
                  <span className="inline-flex h-[24px] items-center rounded-full bg-rose-50 px-2.5 text-[11px] font-extrabold text-rose-700">
                    Blocked until {f.who.blockedUntil}
                  </span>
                )}
                {data.canBlock && f.who.userId && !f.who.blockedUntil && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => ask({ kind: "block", userId: f.who.userId!, name: f.who.name, blockedUntil: null })}
                    className="h-[34px] rounded-[10px] border border-rose-200 bg-white px-3.5 text-[12.5px] font-bold text-rose-700 disabled:opacity-50"
                  >
                    Block account
                  </button>
                )}
                {f.reviewed ? (
                  <span className="text-[12px] font-semibold text-emerald-700">
                    Reviewed by {f.reviewed.by} · {f.reviewed.at}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => review(f)}
                    className="h-[34px] rounded-[10px] border border-line bg-white px-3.5 text-[12.5px] font-bold text-[#57534e] disabled:opacity-50"
                  >
                    Mark reviewed
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.flags.length >= data.limit && (
        <p className="mt-2 mb-0 text-[11.5px] text-[#78716c]">Showing the latest {data.limit}.</p>
      )}
      {asking && (
        <ReasonDialog
          title={asking.kind === "lift" ? `Lift the block on ${asking.name}` : asking.blockedUntil ? `Extend ${asking.name}'s block` : `Block ${asking.name}`}
          subtitle={asking.blockedUntil ? `Blocked until ${asking.blockedUntil}` : undefined}
          intro={
            asking.kind === "lift" ? (
              "The block ends now: they can message, call and join lives again at once. They're told, and your reason is kept in the audit log."
            ) : (
              <>
                <span className="block">
                  {asking.blockedUntil
                    ? "The block's end moves later by the days you pick."
                    : "They can still sign in and see their wallet and history, but can't message, chat, call, join a live chat or queue, or send gifts. An astrologer also goes offline and can't take sessions or go live."}{" "}
                  They&rsquo;re told, with your reason. It ends by itself; you can lift it at any time.
                </span>
                <label className="mt-3 flex items-center gap-2 text-[12px] font-bold text-[#57534e]">
                  {asking.blockedUntil ? "Extend by" : "Block for"}
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] text-ink"
                  >
                    {[...new Set([data.policy.blockDays, ...DAY_CHOICES])]
                      .sort((a, b) => a - b)
                      .map((d) => (
                        <option key={d} value={d}>
                          {d} {d === 1 ? "day" : "days"}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )
          }
          placeholder={asking.kind === "lift" ? "e.g. Urgent consultation needed; spoke to the customer." : "e.g. Shared a phone number again after a warning."}
          confirm={asking.kind === "lift" ? "Lift block now" : asking.blockedUntil ? "Extend block" : "Block account"}
          danger={asking.kind !== "lift"}
          onClose={() => setAsking(null)}
          onSubmit={async (reason) => !!(await (asking.kind === "lift" ? lift(asking, reason) : block(asking, reason)))}
        />
      )}
    </div>
  );
}

/** Accounts blocked now, with "Lift block now" and "Extend" for Compliance and the Super Admin. */
function BlockedAccounts({ data, busy, onAsk }: { data: ContactFlagsData; busy: boolean; onAsk: (a: Asking) => void }) {
  return (
    <section aria-labelledby="blocked-accounts" className="mb-4 rounded-[14px] border border-rose-200 bg-rose-50/40 px-4 py-3.5">
      <h3 id="blocked-accounts" className="m-0 text-[14px] font-bold text-ink">
        Blocked accounts{data.blocked.length ? ` · ${data.blocked.length}` : ""}
      </h3>
      {data.blocked.length === 0 ? (
        <p className="mt-1 mb-0 text-[12.5px] text-[#78716c]">No account is blocked right now.</p>
      ) : (
        <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
          {data.blocked.map((b: BlockedAccount) => (
            <li key={b.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-white px-3.5 py-2.5">
              <div className="min-w-[220px] flex-1">
                <b className="text-[13.5px] break-words">{b.name}</b>{" "}
                <span className="text-[11.5px] font-semibold text-[#78716c]">{b.side}</span>
                <span className="block text-[12px] text-rose-700">Blocked until {b.untilLabel}</span>
                <span className="block text-[12px] break-words text-[#57534e]">
                  {b.reason}
                  {b.since ? ` · since ${b.since}` : ""}
                  {b.by ? ` by ${b.by}` : ""} · {b.attempts} {b.attempts === 1 ? "attempt" : "attempts"} in all
                </span>
              </div>
              {data.canBlock && (
                <span className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAsk({ kind: "block", userId: b.userId, name: b.name, blockedUntil: b.untilLabel })}
                    className="h-[34px] rounded-[10px] border border-line bg-white px-3 text-[12.5px] font-bold text-[#57534e] disabled:opacity-50"
                  >
                    Extend
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAsk({ kind: "lift", userId: b.userId, name: b.name, blockedUntil: b.untilLabel })}
                    className="h-[34px] rounded-[10px] border-0 bg-emerald-700 px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    Lift block now
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
