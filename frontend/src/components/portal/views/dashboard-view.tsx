"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { instantRate, ratingLabel, rupee } from "@/lib/portal/format";
import { blockedReason, isActive } from "@/lib/portal/status";
import type { Dashboard, Presence, ScheduleItem } from "@/lib/portal/types";
import Modal from "../modal";
import BookingDialog from "./booking-dialog";
import FreeCallsCard from "./free-calls-card";
import IntroVideoCard from "./intro-video-card";
import PriceCard from "./price-card";
import { useAccount, useErrorToast, usePresence, useToast } from "../portal-provider";
import { APP_CARD, Panel } from "../ui";

const SCHEDULE_STYLE: Record<ScheduleItem["kind"], { chip: string; bg: string; border: string; chipBg: string; chipFg: string }> = {
  open: { chip: "Open", bg: "#f7f4ee", border: "#e7e0d6", chipBg: "#ecfdf5", chipFg: "#047857" },
  booked: { chip: "Booked", bg: "#fffbeb", border: "#fde68a", chipBg: "#f59e0b", chipFg: "#1c1917" },
  live: { chip: "Live", bg: "#fff7ed", border: "#fed7aa", chipBg: "#ea580c", chipFg: "#fff" },
};

const PRESENCE_LABEL: Record<Presence, string> = {
  on: "Online — taking requests",
  busy: "Online — in a consultation",
  live: "Online — live now",
  off: "Offline — go online",
};

const outlineButton =
  "h-10 w-full rounded-xl border border-line bg-white text-[13.5px] font-bold text-ink grid place-items-center hover:no-underline hover:text-ink max-lg:h-app-hit max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-transparent max-lg:text-[15px]";

/** "Good morning" / "Good afternoon" / "Good evening" for the current time in India. */
function greetingNow() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardView({ data }: { data: Dashboard }) {
  const { astrologer: me, status } = useAccount();
  const [presence, setPresence] = usePresence();
  const online = presence !== "off";
  const router = useRouter();
  const toast = useToast();
  const showError = useErrorToast();
  const [busy, setBusy] = useState(false);
  const mult = me.instantMultiplier;
  const [pendingMult, setPendingMult] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const canGoOnline = isActive(status);
  const bounds = data.multiplierOptions.length
    ? `${Math.min(...data.multiplierOptions)}×–${Math.max(...data.multiplierOptions)}×`
    : "1.5×–4×";

  const toggleOnline = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const wasLive = presence === "live";
      const res = await api.patch<{ online: boolean; presence: Presence }>("/portal/presence", { online: !online });
      setPresence(res.presence);
      toast(
        res.online
          ? "You're online. Customers can consult you now — keep the portal open to stay online."
          : wasLive
            ? "You're offline. Your live room has ended."
            : "You're offline. Customers can't start new consultations with you.",
      );
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const kpis = [
    { label: "Today's earnings", value: rupee(data.todayEarnings), delta: data.earningsDelta, deltaFg: "#047857" },
    {
      label: "Sessions",
      value: String(data.sessions),
      delta:
        (data.emergencySessions > 0 ? `${data.emergencySessions} emergency` : "no emergency calls") +
        // Welcome campaign: free calls left today (AstroRize pays for the free minutes).
        (data.freeCalls?.enabled
          ? ` · ${data.freeCalls.remaining} of ${data.freeCalls.limit} free calls left ${data.freeCalls.period === "week" ? "this week" : "today"}`
          : ""),
      deltaFg: data.emergencySessions > 0 ? "#c2410c" : "#78716c",
    },
    { label: "Gifts", value: rupee(data.gifts), delta: "your share of today's gifts", deltaFg: "#78716c" },
    { label: "Rating", value: ratingLabel(me.rating), delta: `${me.consults.toLocaleString("en-IN")} verified consults`, deltaFg: "#78716c" },
  ];

  const confirmMultiplier = async () => {
    if (pendingMult === null || busy) return;
    setBusy(true);
    try {
      const res = await api.patch<{ instantMultiplier: number; instantRate: number }>("/portal/multiplier", {
        multiplier: pendingMult,
      });
      setPendingMult(null);
      toast(
        `Emergency multiplier set to ${res.instantMultiplier}× — ${rupee(res.instantRate)}/min. Finance and Operations have been notified.`,
      );
      router.refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* The server and browser can straddle an hour boundary, so allow the text to differ on hydration. */}
          <h1 suppressHydrationWarning className="m-0 font-display text-[34px] font-semibold text-ink min-[420px]:text-[38px] max-lg:text-[28px]! max-lg:leading-[1.1]">
            {greetingNow()}, {me.greeting}
          </h1>
          <p className="mt-1 text-[13.5px] text-stone-500 max-lg:text-[12px] max-lg:text-app-ink-3">{data.dateLine}</p>
        </div>
        <div className="flex items-center gap-2.5 max-lg:w-full">
          {canGoOnline ? (
            <button
              type="button"
              onClick={toggleOnline}
              disabled={busy}
              aria-pressed={online}
              className={`inline-flex h-11 items-center gap-2 rounded-full border px-[18px] text-sm font-bold max-lg:w-full max-lg:justify-center max-lg:text-[14px] ${
                online ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-white text-stone-500"
              }`}
            >
              <span className="size-[9px] rounded-full bg-current" />
              {PRESENCE_LABEL[presence]}
            </button>
          ) : (
            <div className="inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-stone-300 bg-stone-100 px-[18px] text-sm font-bold text-stone-400 max-lg:w-full max-lg:justify-center max-lg:text-center max-lg:h-auto max-lg:min-h-11 max-lg:py-2">
              ⃠ {blockedReason(status)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-[22px] grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] max-lg:mt-4 max-lg:gap-2">
        {kpis.map((k) => (
          <div key={k.label} className={`az-panel rounded-[18px] border border-line px-[18px] py-4 ${APP_CARD} max-lg:p-3`}>
            <div className="text-[11px] font-bold tracking-[.08em] text-stone-500 uppercase max-lg:text-[12px] max-lg:font-normal max-lg:tracking-normal max-lg:text-app-ink-3 max-lg:normal-case">{k.label}</div>
            <b className="mt-[5px] block text-[26px] font-bold text-ink tabular-nums max-lg:mt-0.5 max-lg:text-[20px]">{k.value}</b>
            <span className="text-[11.5px] font-semibold max-lg:block max-lg:text-[11.5px] max-lg:leading-[1.35]" style={{ color: k.deltaFg }}>
              {k.delta}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-4 max-lg:mt-3 max-lg:gap-3">
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-2.5">
            <h2 className="m-0 text-base font-bold">Today&apos;s schedule</h2>
            <Link href="/portal/availability" className="text-[12.5px] font-bold text-amber-700 max-lg:text-[13px] max-lg:font-semibold max-lg:text-app-accent">
              Open calendar ›
            </Link>
          </div>
          <div className="mt-3.5 flex flex-col gap-2">
            {data.schedule.length === 0 && (
              <p className="rounded-[14px] border border-line bg-cream px-[13px] py-[11px] text-[13px] text-stone-500">
                Nothing scheduled today.{" "}
                <Link href="/portal/availability" className="font-bold text-amber-700">
                  Add availability ›
                </Link>
              </p>
            )}
            {data.schedule.map((s, i) => {
              const st = SCHEDULE_STYLE[s.kind];
              const row =
                "flex w-full items-center gap-3 rounded-[14px] border px-[13px] py-[11px] text-left hover:no-underline hover:brightness-[.98] max-lg:min-h-app-hit max-lg:rounded-app-btn max-lg:px-3 max-lg:py-2.5";
              const body = (
                <>
                  <b className="flex-none text-[13px] text-ink tabular-nums min-[480px]:w-[104px] min-[480px]:flex-[0_0_104px]">{s.time}</b>
                  <span className="min-w-0 flex-1 text-[13px] text-stone-600">{s.what}</span>
                  <span
                    className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold"
                    style={{ background: st.chipBg, color: st.chipFg }}
                  >
                    {st.chip}
                  </span>
                </>
              );
              const style = { background: st.bg, borderColor: st.border };
              // Every row opens something: a booking shows who booked it, an open slot the
              // calendar, the live room the Live page.
              if (s.kind === "booked" && s.id && s.customer) {
                const id = s.id;
                return (
                  <button key={id} type="button" onClick={() => setBookingId(id)} className={row} style={style} aria-label={`${s.time}: ${s.what} — view booking`}>
                    {body}
                  </button>
                );
              }
              return (
                <Link key={`${s.time}-${i}`} href={s.kind === "live" ? "/portal/live" : "/portal/availability"} className={row} style={style}>
                  {body}
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel className="relative p-5">
          <h2 className="m-0 mb-1 text-base font-bold">Emergency &amp; Instant Call</h2>
          <p className="mb-3.5 text-[12.5px] text-stone-500">First-come, first-served. No queue, no waitlist, no hold.</p>
          <div className="flex items-center justify-between rounded-[14px] border border-orange-200 bg-orange-50 px-3.5 py-3">
            <div>
              <div className="text-xs font-semibold text-orange-800">Current rate</div>
              <b className="text-[20px] text-orange-700 tabular-nums">
                {me.price > 0 ? `${rupee(instantRate(me.price, mult))}/min` : "Not set yet"}
              </b>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-orange-800">Multiplier</div>
              <b className="text-[20px] text-orange-700">{mult}×</b>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Emergency multiplier">
            {data.multiplierOptions.map((m) => {
              const on = m === mult;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (!on) setPendingMult(m);
                  }}
                  className={`h-[34px] rounded-full border px-[15px] text-[13px] font-bold max-lg:h-10 max-lg:min-w-12 ${
                    on ? "border-urgent bg-urgent text-white" : "border-line bg-white text-stone-600"
                  }`}
                >
                  {m}×
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11.5px] leading-[1.5] text-stone-500">
            Bounds {bounds}. Saving a change opens a confirmation and notifies Finance and Operations. The toggle cannot be
            switched off during an active emergency session.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-4 max-lg:mt-3 max-lg:gap-3">
        <PriceCard pricing={data.pricing} />
        <FreeCallsCard freeCalls={data.freeCalls} />
        <IntroVideoCard url={data.introVideoUrl} />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] items-start gap-4 max-lg:mt-3 max-lg:gap-3">
        <Panel className="p-5">
          <h2 className="m-0 mb-1 text-base font-bold">Recent earnings</h2>
          <p className="mb-3.5 text-[12.5px] text-stone-500">Last 10 days · your share only</p>
          <div className="flex h-[90px] items-end gap-[5px]" aria-hidden="true">
            {data.earningsBars.map((h, i) => (
              <span
                key={i}
                className="min-w-0 flex-1 rounded-t-[4px]"
                style={{ height: `${h}%`, background: h > 80 ? "#f59e0b" : "#fde68a" }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-stone-400">
            <span>{data.earningsFrom}</span>
            <span>{data.earningsTo}</span>
          </div>
          <Link href="/portal/earnings" className={`mt-3 ${outlineButton}`}>
            Open statement
          </Link>
        </Panel>

        <Panel className="p-5">
          <h2 className="m-0 mb-3.5 text-base font-bold">Training &amp; compliance</h2>
          <div className="flex flex-col gap-2.5">
            {data.training.map((t) => (
              <div key={t.label} className="flex items-center gap-[11px]">
                <span
                  className={`grid size-[22px] flex-[0_0_22px] place-items-center rounded-full text-[11px] font-extrabold ${
                    t.done ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {t.done ? "✓" : "!"}
                </span>
                <span className={`min-w-0 flex-1 text-[13.5px] text-ink ${t.done ? "font-medium" : "font-bold"}`}>{t.label}</span>
                <span className={`text-[11.5px] font-bold ${t.done ? "text-emerald-700" : "text-rose-700"}`}>{t.due}</span>
              </div>
            ))}
          </div>
          <Link href="/portal/compliance" className={`mt-3.5 ${outlineButton}`}>
            Open compliance
          </Link>
        </Panel>

        <Panel className="p-5">
          <h2 className="m-0 mb-3.5 text-base font-bold">Recent reviews</h2>
          {data.reviews.length > 0 ? (
            <div className="flex flex-col gap-3">
              {data.reviews.map((r) => (
                <div key={r.when + r.text}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tracking-[1px] text-[#f5b301]" aria-label={`${r.stars} out of 5 stars`}>
                      {"★".repeat(r.stars) + "☆".repeat(5 - r.stars)}
                    </span>
                    <span className="ml-auto text-[11.5px] text-stone-400">{r.when}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-[1.5] text-stone-600">{r.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[14px] border border-dashed border-stone-300 bg-cream p-4">
              <b className="text-[13.5px] text-stone-600">Trust Profile Building</b>
              <p className="mt-[5px] text-[12.5px] leading-[1.5] text-stone-500">
                Verified consultations and genuine customer feedback will build this profile over time. Reviews appear
                publicly once you have enough of them.
              </p>
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-stone-400">Read-only. Reviews cannot be replied to or removed from the portal.</p>
        </Panel>
      </div>

      {bookingId && <BookingDialog slotId={bookingId} onClose={() => setBookingId(null)} />}
      {pendingMult !== null && (
        <Modal onClose={() => setPendingMult(null)} labelledBy="mult-title">
          <h2 id="mult-title" className="m-0 text-[18px] font-bold">
            Change Emergency multiplier?
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-stone-600">
            Your Emergency &amp; Instant Call rate changes from{" "}
            <b className="text-ink">
              {rupee(instantRate(me.price, mult))}/min ({mult}×)
            </b>{" "}
            to{" "}
            <b className="text-orange-700">
              {rupee(instantRate(me.price, pendingMult))}/min ({pendingMult}×)
            </b>
            . Finance and Operations are notified when you save.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setPendingMult(null)}
              className="h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold max-lg:rounded-app-btn max-lg:bg-transparent max-lg:text-[15px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmMultiplier}
              disabled={busy}
              className="h-11 flex-1 rounded-xl bg-urgent text-sm font-bold text-white disabled:opacity-60 max-lg:rounded-app-btn max-lg:text-[15px]"
            >
              Confirm change
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
