"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAction, useAdmin } from "@/components/admin/admin-provider";
import AdminDialog from "@/components/admin/dialog";
import { EYEBROW, TD, TH_SM } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api/client";
import type { ApplicationDetail, AstrologerDetail } from "@/lib/admin/types";
import { DecideButtons, HistoryLine } from "./price-requests";
import { stageOf, stateTone, SUSPENSION } from "./stages";

// The lifecycle page's profile popups: one astrologer's full record, and one application
// with its negotiation, audit trail and the applicant actions.

const PRESENCE: Record<string, { label: string; fg: string }> = {
  on: { label: "Available", fg: "#047857" },
  busy: { label: "In a consultation", fg: "#be123c" },
  live: { label: "Hosting a live room", fg: "#b45309" },
  off: { label: "Offline", fg: "#78716c" },
};

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-full px-[9px] text-[11px] font-bold whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/** A labelled fact in the popup's grid. */
function Fact({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[12px] bg-cream px-3.5 py-2.5 ${wide ? "col-span-full" : ""}`}>
      <div className={EYEBROW}>{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold break-words text-ink">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mt-0 mb-2.5 text-[14px] font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Loading / error body shared by both popups. */
function LoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error)
    return (
      <p className="m-0 py-10 text-center text-[13px] text-[#78716c]" role="status">
        Loading…
      </p>
    );
  return (
    <div className="py-8 text-center" role="alert">
      <p className="m-0 text-[13px] font-semibold text-rose-700">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold"
      >
        Try again
      </button>
    </div>
  );
}

/** GET a record when the popup opens, with loading and error states and a reload function. */
function useRecord<T>(path: string, pick: (res: never) => T) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(pick((await api.get(path)) as never));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this record. Please try again.");
    }
    // `pick` is a pure field accessor; the path decides what is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    // Fetch on open: the state updates happen after the request, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  return { data, error, load };
}

// ── Astrologer ──

export function AstrologerDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const {
    data: a,
    error,
    load,
  } = useRecord<AstrologerDetail>(
    `/admin/lifecycle/astrologers/${encodeURIComponent(id)}`,
    (r: { astrologer: AstrologerDetail }) => r.astrologer,
  );
  const st = a ? stageOf(a.lifecycle) : null;
  const sus = a ? SUSPENSION[a.suspension] : undefined;
  const presence = a ? (PRESENCE[a.presence] ?? PRESENCE.off) : null;
  const isPublic = a ? a.lifecycle === "active" && a.suspension !== "full" : false;
  // Suspensions are managed on the Live monitoring page (Compliance).
  const { session } = useAdmin();
  const canManageSuspension = session.pages.includes("compliance");

  return (
    <AdminDialog
      title={a?.name ?? "Astrologer"}
      subtitle={<span className="font-mono">{id}</span>}
      onClose={onClose}
      width={840}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {a && canManageSuspension && a.lifecycle === "active" && (
            <Link
              href="/admin/monitoring#suspensions"
              className="mr-auto inline-flex h-10 items-center text-[13px] font-bold text-rose-700 hover:no-underline"
            >
              {a.suspension === "none" ? "Suspend on Live monitoring ›" : "Manage suspension ›"}
            </Link>
          )}
          {a &&
            (isPublic ? (
              <Link
                href={`/astrologer/${a.slug}`}
                target="_blank"
                className="inline-flex h-10 items-center rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-amber-700 hover:no-underline"
              >
                Public profile ↗
              </Link>
            ) : (
              <span className="text-[12px] text-muted">Not on the public site</span>
            ))}
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[11px] border-0 bg-ink px-5 text-[13px] font-bold text-white"
          >
            Close
          </button>
        </div>
      }
    >
      {!a || !st || !presence ? (
        <LoadState error={error} onRetry={() => void load()} />
      ) : (
        <>
          <div className="flex items-start gap-4">
            <Image
              src={a.photo}
              alt=""
              width={88}
              height={88}
              className="h-[88px] w-[88px] flex-[0_0_88px] rounded-[18px] object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                <Pill bg={st.bg} fg={st.fg}>
                  {st.label}
                </Pill>
                {sus ? (
                  <Pill bg={sus.bg} fg={sus.fg}>
                    {sus.label}
                  </Pill>
                ) : (
                  <Pill bg="#ecfdf5" fg="#047857">
                    Not suspended
                  </Pill>
                )}
                <Pill bg="#fef3c7" fg="#92400e">
                  {a.recognition[0].toUpperCase() + a.recognition.slice(1)}
                </Pill>
                <span
                  className="inline-flex h-[22px] items-center gap-1.5 text-[11.5px] font-bold"
                  style={{ color: presence.fg }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: presence.fg }} />
                  {presence.label}
                </span>
              </div>
              <p className="mt-2.5 mb-0 text-[13px] leading-[1.55] text-[#57534e]">{a.about}</p>
            </div>
          </div>

          <Section title="Profile">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Fact label="Skills">{a.skills.join(", ") || "—"}</Fact>
              <Fact label="Languages">{a.languages.join(", ") || "—"}</Fact>
              <Fact label="Experience">
                {a.years} {a.years === 1 ? "year" : "years"}
              </Fact>
              <Fact label="Joined">{a.joined}</Fact>
              <Fact label="Gender">{a.gender ?? "—"}</Fact>
              <Fact label="Rating">
                {a.rating != null ? (
                  <>
                    ★ {a.rating.toFixed(1)}{" "}
                    <span className="font-medium text-[#78716c]">
                      · {a.ratings.toLocaleString("en-IN")} ratings · {a.reviews} published{" "}
                      {a.reviews === 1 ? "review" : "reviews"}
                    </span>
                  </>
                ) : (
                  "New — no rating yet"
                )}
              </Fact>
            </div>
          </Section>

          <MediaSection id={a.id} name={a.name} introVideoUrl={a.introVideoUrl} gallery={a.gallery} onSaved={() => void load()} />

          <Section title="Consultations">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Fact label="Lifetime (public figure)">{a.consults.toLocaleString("en-IN")}</Fact>
              <Fact label="Last 30 days">
                {a.month.consultations.toLocaleString("en-IN")}{" "}
                <span className="font-medium text-[#78716c]">
                  · {a.month.minutes.toLocaleString("en-IN")} min · {a.month.billed} billed
                </span>
              </Fact>
              <Fact label="Last consultation">{a.lastConsultation ?? "None yet"}</Fact>
            </div>
          </Section>

          <Section title="Price">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={`${TH_SM} text-left`}>Mode</th>
                    <th className={`${TH_SM} text-right`}>Per minute</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Voice", a.price.voice],
                      ["Video", a.price.video],
                      [`Instant Call (×${a.price.multiplier})`, a.price.instant],
                    ] as const
                  ).map(([mode, rate]) => (
                    <tr key={mode}>
                      <td className={`${TD} px-2.5 py-2 font-semibold text-[#57534e]`}>{mode}</td>
                      <td className={`${TD} px-2.5 py-2 text-right font-bold text-ink tabular-nums`}>{rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {a.price.was && (
              <p className="mt-2 mb-0 text-[12px] text-[#78716c]">
                Shown struck through on the public profile: was {a.price.was}
                /min.
              </p>
            )}
            <p className="mt-2 mb-0 text-[12px] text-[#78716c]">
              {a.price.changedAt
                ? `Last changed on ${a.price.changedAt} (the astrologer's own change).`
                : "Not changed by the astrologer yet — this is the price set at onboarding."}
            </p>
            {a.price.pending && (
              <div className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50 p-3.5">
                <b className="block text-[13.5px] text-ink">
                  Increase waiting: {a.price.voice} → ₹{a.price.pending.to.toLocaleString("en-IN")}/min
                </b>
                <span className="mt-0.5 block text-[12px] text-amber-900">
                  Requested {a.price.pending.requestedOn}. Customers keep paying {a.price.voice}/min until it&apos;s approved.
                </span>
                <div className="mt-2.5">
                  <DecideButtons
                    change={a.price.pending}
                    name={a.name}
                    current={a.price.value}
                    problem={null}
                    onDone={() => void load()}
                  />
                </div>
              </div>
            )}
            {a.price.history.length > 0 && (
              <div className="mt-3">
                <div className={EYEBROW}>Price changes and requests</div>
                <ul className="m-0 mt-1 list-none p-0">
                  {a.price.history.map((h) => (
                    <HistoryLine key={h.id} c={h} />
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Contact and account">
            {a.contact ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Fact label="Email">{a.contact.email ?? "—"}</Fact>
                <Fact label="Phone">{a.contact.phone ?? "—"}</Fact>
                <Fact label="Last portal sign-in">{a.contact.lastSignIn ?? "Never"}</Fact>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[#78716c]">No portal account is linked to this astrologer yet.</p>
            )}
          </Section>

          <FreeCallsSection id={a.id} name={a.name} freeCalls={a.freeCalls} onSaved={() => void load()} />

          <Section title="Work">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Fact label="Live room">
                {a.live ? (a.live.isLive ? `Live now · ${a.live.topic}` : "Not live") : "No live room"}
              </Fact>
              <Fact label="Training">
                {a.training ? `${a.training.done} of ${a.training.total} modules done` : "No modules assigned"}
              </Fact>
              <Fact label="Application form">
                {a.application ? `Step ${a.application.step} · last saved ${a.application.savedAt}` : "None"}
              </Fact>
              <Fact label="Open compliance notices">{a.openNotices}</Fact>
            </div>
          </Section>
        </>
      )}
    </AdminDialog>
  );
}

/**
 * The intro video and gallery photos on the public profile. Astrologers publish them without
 * review; staff can take down anything inappropriate (the file is deleted and the action audited).
 */
function MediaSection({
  id,
  name,
  introVideoUrl,
  gallery,
  onSaved,
}: {
  id: string;
  name: string;
  introVideoUrl: string | null;
  gallery: string[];
  onSaved: () => void;
}) {
  const { run, busy } = useAction();

  const takeDown = async (url: string, what: string) => {
    const reason = window.prompt(`Remove this ${what} from ${name}'s public profile? It is deleted for good and the action is audited.

Reason (optional):`, "");
    if (reason === null) return;
    const res = await run(
      () => api.post(`/admin/lifecycle/astrologers/${encodeURIComponent(id)}/media/remove`, { url, reason: reason.trim() || undefined }),
      `${what[0]!.toUpperCase() + what.slice(1)} removed from ${name}'s profile.`,
      false,
    );
    if (res) onSaved();
  };

  const removeBtn =
    "h-8 rounded-[9px] border border-rose-200 bg-white px-2.5 text-[12px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50";

  return (
    <Section title="Intro video and photos">
      <p className="mt-0 mb-2.5 text-[12px] text-[#78716c]">
        Published by the astrologer straight from their portal, without review. Remove anything inappropriate.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[12px] bg-cream p-2.5">
          <div className={EYEBROW}>Intro video</div>
          {introVideoUrl ? (
            <>
              <video src={introVideoUrl} controls preload="metadata" playsInline className="mt-1.5 aspect-video w-full rounded-[10px] bg-ink" />
              <button type="button" disabled={busy} onClick={() => void takeDown(introVideoUrl, "intro video")} className={`${removeBtn} mt-2`}>
                Remove video
              </button>
            </>
          ) : (
            <p className="mt-1 mb-0 text-[13px] text-[#78716c]">None uploaded.</p>
          )}
        </div>
        <div className="min-w-0 rounded-[12px] bg-cream p-2.5">
          <div className={EYEBROW}>Gallery · {gallery.length} {gallery.length === 1 ? "photo" : "photos"}</div>
          {gallery.length ? (
            <ul className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
              {gallery.map((url, i) => (
                <li key={url} className="min-w-0">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="relative block aspect-[4/3] overflow-hidden rounded-[10px] bg-white">
                    <Image src={url} alt={`Gallery photo ${i + 1}`} fill unoptimized sizes="140px" className="object-cover" />
                  </a>
                  <button type="button" disabled={busy} onClick={() => void takeDown(url, "photo")} className={`${removeBtn} mt-1.5 w-full`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 mb-0 text-[13px] text-[#78716c]">None uploaded.</p>
          )}
        </div>
      </div>
    </Section>
  );
}

/**
 * Welcome campaign for one astrologer (HR): take part in free calls or not, and their own daily
 * limit (blank = the campaign default). Each change is saved straight away and audited.
 */
function FreeCallsSection({
  id,
  name,
  freeCalls: f,
  onSaved,
}: {
  id: string;
  name: string;
  freeCalls: AstrologerDetail["freeCalls"];
  onSaved: () => void;
}) {
  const { run, busy } = useAction();
  const savedPeriod = f.period === "week" ? "WEEK" : "DAY";
  const [limit, setLimit] = useState(f.ownLimit === null ? "" : String(f.ownLimit));
  const [period, setPeriod] = useState<"DAY" | "WEEK">(savedPeriod);
  const [error, setError] = useState<string | null>(null);
  const savedLimit = f.ownLimit === null ? "" : String(f.ownLimit);
  const max = period === "WEEK" ? f.maxPerWeek : f.maxPerDay;
  const per = period === "WEEK" ? "week" : "day";
  const path = `/admin/lifecycle/astrologers/${encodeURIComponent(id)}/free-calls`;

  const toggle = async () => {
    const res = await run(
      () => api.patch(path, { enabled: !f.optedIn }),
      !f.optedIn ? `${name} now takes free calls.` : `${name} no longer takes free calls.`,
      false,
    );
    if (res) onSaved();
  };

  const saveLimit = async () => {
    const trimmed = limit.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > max)) {
      setError(`Enter a whole number from 0 to ${max} per ${per}, or leave it blank for the default (${f.defaultLimit} per day).`);
      return;
    }
    setError(null);
    const res = await run(
      () => api.patch(path, value === null ? { dailyLimit: null } : { dailyLimit: value, period }),
      value === null ? `Limit set to the campaign default (${f.defaultLimit} per day).` : `Limit set to ${value} free calls per ${per}.`,
      false,
    );
    if (res) onSaved();
  };

  return (
    <Section title="Free calls (welcome campaign)">
      <div className="rounded-[14px] border border-line bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={f.optedIn}
            aria-label="Takes free calls"
            onClick={() => void toggle()}
            disabled={busy}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${f.optedIn ? "bg-emerald-600" : "bg-stone-300"}`}
          >
            <span
              className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${f.optedIn ? "left-[22px]" : "left-0.5"}`}
            />
          </button>
          <div className="min-w-0 flex-1">
            <b className="block text-[13.5px] text-ink">{f.optedIn ? "Takes free calls" : "Doesn't take free calls"}</b>
            <span className="block text-[12px] text-[#78716c]">
              Customers use their weekly free minutes ({f.weeklyMinutes} min a week; Voice calls of {f.lengths.join(", ")} min) with
              astrologers who take part, one at a time. The astrologer can also switch this and set their capacity in the portal.
            </span>
          </div>
        </div>
        {!f.campaignOn && (
          <p className="mt-2.5 mb-0 rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            The welcome campaign is switched off in Config, so no free calls start anywhere right now.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          <label className="min-w-0">
            <span className={EYEBROW}>Limit</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              value={limit}
              placeholder={`Default ${f.defaultLimit}/day`}
              onChange={(e) => {
                setLimit(e.target.value);
                setError(null);
              }}
              className="mt-1 block h-10 w-[150px] rounded-[10px] border border-line bg-white px-3 text-[13.5px] tabular-nums"
            />
          </label>
          <label className="min-w-0">
            <span className={EYEBROW}>Per</span>
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value === "WEEK" ? "WEEK" : "DAY");
                setError(null);
              }}
              disabled={limit.trim() === ""}
              className="mt-1 block h-10 rounded-[10px] border border-line bg-white px-3 text-[13.5px] disabled:opacity-60"
            >
              <option value="DAY">Day</option>
              <option value="WEEK">Week (Mon–Sun)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void saveLimit()}
            disabled={busy || (limit.trim() === savedLimit && (limit.trim() === "" || period === savedPeriod))}
            className="h-10 rounded-[10px] border-0 bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Save limit
          </button>
          <span className="pb-2.5 text-[12px] text-[#78716c]">
            {f.used} of {f.limit} used {f.period === "week" ? "this week" : "today"} (IST) · up to {f.maxPerDay}/day or {f.maxPerWeek}/week
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-2 mb-0 text-[12.5px] font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}

// ── Application ──

const APP_ACTIONS = ["Request info", "Schedule interview", "Reject", "Advance"] as const;

export function ApplicationDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { say } = useAdmin();
  const { run, busy } = useAction();
  const {
    data: app,
    error,
    load,
  } = useRecord<ApplicationDetail>(
    `/admin/applicants/${encodeURIComponent(id)}`,
    (r: { application: ApplicationDetail }) => r.application,
  );

  /**
   * Every action quotes the version shown here; the API refuses if someone changed the record
   * meanwhile. Either way the record is re-read, so what is on screen is the latest.
   */
  const act = async (action: string, done: string, reason?: string, extra?: Record<string, unknown>) => {
    if (!app) return null;
    const res = await run(
      () => api.post(`/admin/applicants/${app.id}/${action}`, { version: app.version, reason, ...extra }),
      done,
    );
    // Rejecting or activating takes the application out of the open queue; anything else re-reads it.
    if (!(res && (action === "reject" || action === "activate"))) await load();
    return res;
  };

  // Approve & activate: HR sets the astrologer's per-minute rate (portal applications at the last stage).
  const [activating, setActivating] = useState(false);
  const [rate, setRate] = useState("");
  const [rateError, setRateError] = useState<string | null>(null);
  const canActivate = !!app?.portal && app.state === "Training";
  const startActivate = () => {
    setRate(app?.portal?.requestedRate ? String(app.portal.requestedRate) : "");
    setRateError(null);
    setActivating(true);
  };
  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app?.portal) return;
    const { min, max } = app.portal.rateLimits;
    const text = rate.trim();
    if (!text) return setRateError("Enter the per-minute rate.");
    if (!/^\d+$/.test(text)) return setRateError("Use whole rupees — digits only.");
    const n = Number(text);
    if (n < min || n > max) return setRateError(`The rate must be between ₹${min} and ₹${max.toLocaleString("en-IN")} per minute.`);
    setRateError(null);
    const res = await act(
      "activate",
      `${app.name} is now active at ₹${n}/min and listed on the website. They can go online from their portal.`,
      undefined,
      { rate: n },
    );
    if (res) onClose();
  };

  const appAction = async (label: (typeof APP_ACTIONS)[number]) => {
    if (!app) return;
    if (label === "Request info") {
      const reason = window.prompt("What does the applicant need to send? (at least 10 characters)");
      if (reason === null) return;
      await act(
        "request-info",
        "Information requested — reason recorded. The applicant sees exactly what is needed.",
        reason.trim(),
      );
    } else if (label === "Schedule interview") {
      await act("interview", "Moved to the Interview stage. The applicant sees it in their portal.");
    } else if (label === "Reject") {
      const reason = window.prompt(`Reason for rejecting ${app.id}:`);
      if (reason === null) return;
      if (!reason.trim()) {
        say("A rejection needs a reason.");
        return;
      }
      const res = await act(
        "reject",
        "Rejected with reason. Reapply becomes available after the cooling period.",
        reason.trim(),
      );
      if (res) onClose();
    } else {
      await act("advance", "Advanced to the next stage. Recorded in the audit log.");
    }
  };

  const nego = app?.negotiation ?? null;
  const capReached = nego ? nego.round >= nego.maxRounds : false;
  const counterOffer = () => {
    if (!nego) return;
    const next = nego.round + 1;
    void act(
      "counter",
      next >= nego.maxRounds
        ? `Counter-offer sent · round ${nego.maxRounds} of ${nego.maxRounds}. This was the final round — accept or reject next.`
        : `Counter-offer sent · round ${next} of ${nego.maxRounds}. Notes audited.`,
    );
  };
  const [bg, fg] = app ? stateTone(app.state) : ["", ""];

  return (
    <AdminDialog
      title={`Application ${id}`}
      subtitle={app ? `${app.name} · ${app.skill}${app.portal ? " · sent from the astrologer portal" : ""}` : undefined}
      onClose={onClose}
      width={780}
      footer={
        app && (
          <div className="flex flex-wrap items-center gap-[9px]">
            {APP_ACTIONS.filter((label) => !(label === "Advance" && canActivate)).map((label) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => void appAction(label)}
                className="h-10 rounded-[11px] border px-4 text-[13px] font-bold disabled:opacity-60"
                style={{
                  background: label === "Advance" ? "#f59e0b" : "#fff",
                  color: label === "Reject" ? "#be123c" : "#1c1917",
                  borderColor: label === "Advance" ? "#f59e0b" : label === "Reject" ? "#fecdd3" : "#e7e0d6",
                }}
              >
                {label}
              </button>
            ))}
            {canActivate && (
              <button
                type="button"
                disabled={busy || activating}
                onClick={startActivate}
                className="h-10 rounded-[11px] border border-emerald-600 bg-emerald-600 px-4 text-[13px] font-bold text-white disabled:opacity-60"
              >
                Approve &amp; activate
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-[#57534e]"
            >
              Close
            </button>
          </div>
        )
      }
    >
      {!app ? (
        <LoadState error={error} onRetry={() => void load()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Fact label="Applicant">{app.name}</Fact>
            <Fact label="Primary skill">{app.skill}</Fact>
            <Fact label="Stage">
              <Pill bg={bg} fg={fg}>
                {app.state}
              </Pill>
            </Fact>
            <Fact label="Submitted">
              {app.submitted} <span className="font-medium text-[#78716c]">· {app.age} ago</span>
            </Fact>
            <Fact label="Review SLA">
              {app.breach ? (
                <span className="text-rose-700">Over the {app.slaDays}-day review SLA</span>
              ) : (
                <span className="text-emerald-700">Within the {app.slaDays}-day review SLA</span>
              )}
            </Fact>
            <Fact label="Record version">v{app.version}</Fact>
          </div>
          <p className="mt-3.5 mb-0 rounded-[12px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-[1.55] text-amber-900">
            If someone else changes this application while you have it open, your action is stopped and the latest
            version is loaded — nothing is ever overwritten silently.
          </p>

          {canActivate && activating && app.portal && (
            <Section title="Approve & activate">
              <form onSubmit={(e) => void activate(e)} noValidate className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-3.5">
                <p className="mt-0 mb-3 text-[12.5px] leading-[1.55] text-emerald-900">
                  The astrologer goes live on the website at this rate for calls and chat (video and Instant Call are
                  priced from it; they can set a separate chat price from their portal). They stay offline until they go online from their portal.
                </p>
                <label htmlFor="activate-rate" className={EYEBROW}>
                  Per-minute rate (₹)
                </label>
                <div className="mt-1 flex flex-wrap items-start gap-2.5">
                  <input
                    id="activate-rate"
                    inputMode="numeric"
                    autoFocus
                    value={rate}
                    onChange={(e) => {
                      setRate(e.target.value);
                      setRateError(null);
                    }}
                    aria-invalid={rateError ? true : undefined}
                    aria-describedby="activate-rate-hint"
                    className="h-10 w-[140px] rounded-[11px] border bg-white px-3 text-[14px] font-bold tabular-nums outline-none"
                    style={{ borderColor: rateError ? "#fda4af" : "#e7e0d6" }}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-10 rounded-[11px] border-0 bg-emerald-600 px-4 text-[13px] font-bold text-white disabled:opacity-60"
                  >
                    {busy ? "Activating…" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivating(false)}
                    className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold text-[#57534e]"
                  >
                    Cancel
                  </button>
                </div>
                <p id="activate-rate-hint" className="mt-1.5 mb-0 text-[12px]" style={{ color: rateError ? "#be123c" : "#57534e" }} role={rateError ? "alert" : undefined}>
                  {rateError ??
                    `Whole rupees, ₹${app.portal.rateLimits.min}–₹${app.portal.rateLimits.max.toLocaleString("en-IN")}. ${
                      app.portal.requestedRate ? `They asked for ₹${app.portal.requestedRate}/min.` : "They didn't request a rate."
                    }`}
                </p>
              </form>
            </Section>
          )}

          {app.portal && (
            <Section title="Submitted application">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5">
                {app.portal.answers.map((x) => (
                  <Fact key={x.label} label={x.label} wide={x.label === "Bio"}>
                    {x.value}
                  </Fact>
                ))}
              </div>
            </Section>
          )}

          {nego && (
            <Section title={`Rate negotiation · round ${nego.round} of ${nego.maxRounds}`}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className={`${TH_SM} text-left`}>Modality</th>
                      <th className={`${TH_SM} text-right`}>Requested</th>
                      <th className={`${TH_SM} text-right`}>Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nego.rows.map((n) => (
                      <tr key={n.mode}>
                        <td className={`${TD} p-2.5 font-semibold text-[#57534e]`}>{n.mode}</td>
                        <td className={`${TD} p-2.5 text-right text-[#78716c] tabular-nums`}>{n.requested}</td>
                        <td className={`${TD} p-2.5 text-right font-bold text-amber-700 tabular-nums`}>{n.proposed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {app.state === "Negotiation" && (
                <div className="mt-3 flex flex-wrap gap-[9px]">
                  {capReached ? (
                    <span className="inline-flex h-10 items-center rounded-[11px] border border-dashed border-stone-300 bg-stone-100 px-4 text-[13px] font-bold text-[#78716c]">
                      Counter-offer — round cap reached
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={counterOffer}
                      className="h-10 rounded-[11px] border border-line bg-white px-4 text-[13px] font-bold disabled:opacity-60"
                    >
                      Counter-offer
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act("accept-rates", "Rates accepted and sent to pricing approval.")}
                    className="h-10 rounded-[11px] border-0 bg-amber-500 px-4 text-[13px] font-bold text-ink disabled:opacity-60"
                  >
                    Accept &amp; send to pricing
                  </button>
                </div>
              )}
            </Section>
          )}

          <Section title="History">
            {app.history.length === 0 ? (
              <p className="m-0 text-[13px] text-[#78716c]">No actions yet — the application is as submitted.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {app.history.map((h, i) => (
                  <li key={`${h.when}-${i}`} className="flex items-start gap-3 border-b border-line-soft pb-2">
                    <span className="w-[120px] flex-none pt-px font-mono text-[11px] text-muted">{h.when}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[12.5px] text-ink">{h.action}</b>
                      <span className="block text-[12px] break-words text-[#57534e]">
                        {h.who} · {h.diff}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </>
      )}
    </AdminDialog>
  );
}
